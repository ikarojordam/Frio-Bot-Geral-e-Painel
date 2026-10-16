'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Vault, generateKey, parseKey, safeEqual } = require('../lib/crypto');
const { loadSettings, buildBotConfig, shardOf, normalizeFeatures } = require('../lib/config');
const { Supervisor, isFatalLoginError, backoffMs } = require('../lib/supervisor');
const { createHttpServer } = require('../lib/http');
const { quiet, MemStore, fakeBotFactory } = require('./helpers');

const mkSettings = (over = {}) => ({ ...loadSettings({ WORKER_COUNT: '1', START_SPACING_MS: '0', START_CONCURRENCY: '10' }), ...over });
const rec = (id, o = {}) => buildBotConfig({ id, enabled: true, token: `tok-${id}-xxxxxxxx`, displayName: `Bot ${id}`, ...o }, mkSettings(), 'fleet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class ListSource { constructor(l) { this.list = l; this.mode = 'fleet'; } async load() { return this.list; } }

test('cofre: ida e volta, adulteração, aad e rotação', () => {
  const v = new Vault([parseKey(generateKey())]);
  const blob = v.encrypt('segredo-123', 'bot-a');
  assert.equal(v.decrypt(blob, 'bot-a'), 'segredo-123');
  assert.throws(() => v.decrypt(blob, 'bot-b'));            // amarrado ao id da linha
  assert.throws(() => v.decrypt(blob.slice(0, -4) + 'AAAA', 'bot-a'));
  const v2 = new Vault([parseKey(generateKey()), v.keys[0].key]);
  assert.equal(v2.decrypt(blob, 'bot-a'), 'segredo-123'); assert.ok(v2.needsRotation(blob));
});

test('safeEqual rejeita sufixo/prefixo (bug do /api/bot/status original)', () => {
  assert.equal(safeEqual('segredo', 'segredo'), true);
  assert.equal(safeEqual('segredoXYZ', 'segredo'), false);
  assert.equal(safeEqual('segre', 'segredo'), false);
  assert.equal(safeEqual('', ''), false);
});

test('shard: 500 bots distribuídos entre 10 workers sem perda nem duplicidade', () => {
  const counts = Array(10).fill(0);
  for (let i = 0; i < 500; i++) counts[shardOf({ id: `cliente-${i}`, workerGroup: null }, 10)]++;
  assert.equal(counts.reduce((a, b) => a + b), 500);
  assert.ok(Math.max(...counts) < 80 && Math.min(...counts) > 25, counts.join(','));
  assert.equal(shardOf({ id: 'x', workerGroup: 13 }, 10), 3);
});

test('features: padrão da frota é seguro (sem cargo admin dev, sem sandbox, owner não é dev)', () => {
  const f = normalizeFeatures({ dev_role: 'sim', antiraid: false }, 'fleet');
  assert.equal(f.dev_role, false); assert.equal(f.dev_sandbox, false); assert.equal(f.owner_is_developer, false); assert.equal(f.antiraid, false);
});

test('frota de 500 bots em 10 workers: cada token inicia exatamente 1 vez', async () => {
  const records = Array.from({ length: 500 }, (_, i) => rec(`cliente-${i}`));
  const store = new MemStore(); const log = []; const sups = [];
  for (let w = 0; w < 10; w++) {
    const s = new Supervisor({ settings: mkSettings({ workerCount: 10, workerIndex: w, holder: `h${w}`, maxBotsPerWorker: 100 }), source: new ListSource(records), store,
      createBot: fakeBotFactory(log), supabase: {}, flags: {}, logger: quiet, leaseMode: 'required' });
    sups.push(s);
  }
  await Promise.all(sups.map((s) => s.reconcile()));
  await sleep(150);
  const starts = log.filter((e) => e[0] === 'start').map((e) => e[1]);
  assert.equal(starts.length, 500); assert.equal(new Set(starts).size, 500);
  assert.equal(sups.reduce((a, s) => a + s.snapshot().online, 0), 500);
  for (const s of sups) await s.shutdown('test');
  assert.equal(store.leases.size, 0);
});

test('lease: segundo processo com o mesmo token fica em espera e não inicia', async () => {
  const store = new MemStore(); const log = []; const mk = (h) => new Supervisor({ settings: mkSettings({ holder: h }), source: new ListSource([rec('dup-bot')]), store, createBot: fakeBotFactory(log), supabase: {}, flags: {}, logger: quiet, leaseMode: 'required' });
  const a = mk('A'); const b = mk('B');
  await a.reconcile(); await b.reconcile(); await sleep(50);
  assert.equal(log.filter((e) => e[0] === 'start').length, 1);
  assert.equal(b.snapshot().counts.lease_wait, 1);
  await a.shutdown('t'); await b.reconcile(); await sleep(50);           // A liberou => B assume
  assert.equal(log.filter((e) => e[0] === 'start').length, 2); await b.shutdown('t');
});

test('lease perdido derruba o bot (evita sessão duplicada)', async () => {
  const store = new MemStore(); const log = []; const s = new Supervisor({ settings: mkSettings({ holder: 'A' }), source: new ListSource([rec('lost-bot')]), store, createBot: fakeBotFactory(log), supabase: {}, flags: {}, logger: quiet, leaseMode: 'required' });
  await s.reconcile(); await sleep(50);
  store.leases.set('lost-bot', { holder: 'OUTRO', expires: Date.now() + 60000 });
  await s.renewLeases();
  assert.ok(log.some((e) => e[0] === 'stop' && e[1] === 'lost-bot')); assert.equal(s.snapshot().counts.lease_wait, 1); await s.shutdown('t');
});

test('token inválido isola o erro: demais bots sobem e o ruim vira "error" (sem retry em loop)', async () => {
  const list = [rec('ok-1'), rec('ok-2'), buildBotConfig({ id: 'ruim', token: 'BAD', displayName: 'x' }, mkSettings(), 'fleet')];
  const s = new Supervisor({ settings: mkSettings(), source: new ListSource(list), store: new MemStore(), createBot: fakeBotFactory([]), supabase: {}, flags: {}, logger: quiet, leaseMode: 'required' });
  await s.reconcile(); await sleep(80);
  const c = s.snapshot().counts; assert.equal(c.online, 2); assert.equal(c.error, 1); await s.shutdown('t');
});

test('reconcile: desativar para o bot; mudar token reinicia; mudar nome aplica a quente', async () => {
  const log = []; const src = new ListSource([rec('b1'), rec('b2')]);
  const s = new Supervisor({ settings: mkSettings(), source: src, store: new MemStore(), createBot: fakeBotFactory(log), supabase: {}, flags: {}, logger: quiet, leaseMode: 'required' });
  await s.reconcile(); await sleep(50);
  src.list = [rec('b1', { displayName: 'Novo Nome' }), rec('b2', { enabled: false })];
  await s.reconcile(); await sleep(50);
  assert.ok(log.some((e) => e[0] === 'hot' && e[1] === 'b1' && e[2] === 'Novo Nome'));
  assert.ok(log.some((e) => e[0] === 'stop' && e[1] === 'b2')); assert.equal(s.snapshot().counts.disabled, 1);
  src.list = [rec('b1', { displayName: 'Novo Nome', token: 'outro-token-123' }), rec('b2', { enabled: false })];
  await s.reconcile(); await sleep(80);
  assert.equal(log.filter((e) => e[0] === 'start' && e[1] === 'b1').length, 2); await s.shutdown('t');
});

test('limite por worker: excedentes ficam em over_capacity', async () => {
  const s = new Supervisor({ settings: mkSettings({ maxBotsPerWorker: 3 }), source: new ListSource(Array.from({ length: 5 }, (_, i) => rec(`m-${i}`))), store: new MemStore(), createBot: fakeBotFactory([]), supabase: {}, flags: {}, logger: quiet, leaseMode: 'off' });
  await s.reconcile(); await sleep(50); assert.equal(s.snapshot().counts.over_capacity, 2); await s.shutdown('t');
});

test('classificação de erro e backoff', () => {
  assert.equal(isFatalLoginError({ code: 'TokenInvalid' }), true);
  assert.equal(isFatalLoginError(new Error('Used disallowed intents')), true);
  assert.equal(isFatalLoginError(new Error('ECONNRESET')), false);
  assert.ok(backoffMs(1) >= 2500 && backoffMs(20) <= 15 * 60 * 1000 * 1.5);
});

const get = (port, path, token) => new Promise((resolve) => http.get({ port, path, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); }));

test('HTTP: /livez, /health 503 offline→200 online, auth por bot, sufixo recusado, admin', async () => {
  const log = []; const settings = mkSettings({ port: 0, host: '127.0.0.1', adminToken: 'admin-token-123', readyMinRatio: 1 });
  const s = new Supervisor({ settings, source: new ListSource([rec('web-bot', { panelApiToken: 'painel-secreto' })]), store: new MemStore(), createBot: fakeBotFactory(log), supabase: {}, flags: {}, logger: quiet, leaseMode: 'off' });
  const srv = createHttpServer({ supervisor: s, settings, logger: quiet }); await srv.listen(); const port = srv.server.address().port;
  assert.equal((await get(port, '/livez')).status, 200);
  assert.equal((await get(port, '/health')).status, 200);                  // 0 bots desejados ⇒ pronto
  await s.reconcile(); await sleep(60); assert.equal((await get(port, '/health')).status, 200);
  assert.equal((await get(port, '/bots/web-bot/health')).status, 200);
  assert.equal((await get(port, '/api/bots/web-bot/status')).status, 401);
  assert.equal((await get(port, '/api/bots/web-bot/status', 'painel-secreto')).status, 200);
  assert.equal((await get(port, '/api/bots/web-bot/status', 'painel-secretoXYZ')).status, 401);
  assert.equal((await get(port, '/api/bot/status', 'painel-secreto')).status, 200);
  assert.equal((await get(port, '/api/fleet/status', 'painel-secreto')).status, 401);
  const fleet = await get(port, '/api/fleet/status', 'admin-token-123'); assert.equal(fleet.status, 200); assert.ok(!fleet.body.includes('tok-web-bot'));
  await s.shutdown('t'); await srv.close();
});
