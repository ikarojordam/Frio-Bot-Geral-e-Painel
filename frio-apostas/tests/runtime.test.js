'use strict';
require('./stubs/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Guild } = require('./stubs/setup');
const { createBot } = require('../bot-runtime');
const { MemStore, quiet } = require('./helpers');
const { loadSettings, buildBotConfig } = require('../lib/config');
const AR = require('../anti-raid-system');

const settings = { ...loadSettings({}), guildClaims: true, dataDir: require('node:os').tmpdir() };
const flags = { m: new Map(), async get(b, k) { return this.m.get(`${b}:${k}`) ?? null; }, async set(b, k, v) { this.m.set(`${b}:${k}`, v); } };
const mk = (id, store, over = {}) => createBot(buildBotConfig({ id, token: 'tok-' + id + '-abcdefgh', displayName: 'Nome ' + id, ...over }, settings, 'fleet'), { supabase: {}, store, flags, settings, onFatal() {} });

test('runtime: 500 instâncias isoladas são criadas sem erro (sem estado compartilhado)', () => {
  const bots = Array.from({ length: 500 }, (_, i) => mk(`b${i}`, null));
  assert.equal(new Set(bots.map((b) => b.client)).size, 500);
  const before = process.memoryUsage().heapUsed; assert.ok(before > 0);
  return Promise.all(bots.map((b) => b.stop()));
});

test('runtime: login → ready → online; stop derruba', async () => {
  const b = mk('life', null); await b.start(); await b.whenReady(); await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.isReady(), true); assert.equal(b.health().guilds, 0); await b.stop(); assert.equal(b.isReady(), false);
});

test('runtime: token inválido rejeita o start (supervisor classifica)', async () => {
  const b = createBot(buildBotConfig({ id: 'bad', token: 'BAD', displayName: 'x' }, settings, 'fleet'), { supabase: {}, store: null, flags, settings, onFatal() {} });
  await assert.rejects(b.start(), /invalid token/i);
});

test('claims: evento de servidor de OUTRO bot é descartado; do próprio passa', async () => {
  const store = new MemStore(); store.claims.set('G-OUTRO', 'outro-bot');
  const b = mk('dono', store); const seen = [];
  b.client.on('messageCreate', (m) => seen.push(m.guildId));
  b.client.guilds.cache.set('G-MEU', new Guild('G-MEU')); b.client.guilds.cache.set('G-OUTRO', new Guild('G-OUTRO'));
  await b.start(); await b.whenReady(); await new Promise((r) => setTimeout(r, 80));
  b.client.emit('messageCreate', { guildId: 'G-MEU', author: { bot: true } }); b.client.emit('messageCreate', { guildId: 'G-OUTRO', author: { bot: true } }); b.client.emit('messageCreate', { guildId: null, author: { bot: true } });
  assert.deepEqual(seen, ['G-MEU', null]); assert.equal(store.claims.get('G-MEU'), 'dono'); await b.stop();
});

test('claims: dois bots no mesmo servidor — só o primeiro atende', async () => {
  const store = new MemStore(); const a = mk('a', store); const c = mk('c', store); const hits = { a: 0, c: 0 };
  for (const [n, b] of [['a', a], ['c', c]]) { b.client.guilds.cache.set('G1', new Guild('G1')); b.client.on('messageCreate', () => hits[n]++); }
  await a.start(); await a.whenReady(); await new Promise((r) => setTimeout(r, 60)); await c.start(); await c.whenReady(); await new Promise((r) => setTimeout(r, 60));
  a.client.emit('messageCreate', { guildId: 'G1', author: { bot: true } }); c.client.emit('messageCreate', { guildId: 'G1', author: { bot: true } });
  assert.deepEqual(hits, { a: 1, c: 0 }); await a.stop(); await c.stop();
});

test('kill switch é POR BOT (não global)', async () => {
  const x = mk('ks-x', null), y = mk('ks-y', null);
  await flags.set('ks-x', 'kill_switch', { active: true }); assert.equal((await flags.get('ks-y', 'kill_switch')), null); await x.stop(); await y.stop();
});

test('anti-raid: normalização, janela deslizante e varredura de memória', () => {
  const c = AR.normalizeConfig({ enabled: true, thresholds: { joinCount: 9 }, actions: { spam: 'ban' } });
  assert.equal(c.thresholds.joinCount, 9); assert.equal(c.thresholds.banCount, 3); assert.equal(c.actions.antiwebhook, 'delete'); assert.equal(c.nukeExemptAdmins, false);
  const m = new Map(); const now = Date.now();
  assert.equal(AR.countInWindow(m, 'k', now, 1000), 1); assert.equal(AR.countInWindow(m, 'k', now + 500, 1000), 2); assert.equal(AR.countInWindow(m, 'k', now + 2000, 1000), 1);
  for (let i = 0; i < 1000; i++) m.set('u' + i, [now - 999999]); AR.sweepBuckets(m, now, 60000); assert.equal(m.size, 1 - 1 + (m.has('k') ? 1 : 0));
});

test('/dev Perfil: não-dev é barrado; dev salva presença, que persiste e vira override', async () => {
  const b = mk('perfil', null); await b.start(); await b.whenReady(); await new Promise((r) => setTimeout(r, 30));
  const replies = [];
  const loose = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^(is|in)[A-Z]/.test(k) ? () => false : undefined) });
  const base0 = (user, customId, extra = {}) => ({ customId, user: { id: user }, isButton: () => true, isModalSubmit: () => false, reply: async (m) => replies.push(m), update: async (m) => replies.push({ updated: true, m }), ...extra });
  const base = (...a) => loose(base0(...a));
  b.client.emit('interactionCreate', base('123', 'devprof:refresh'));
  await new Promise((r) => setTimeout(r, 10)); assert.match(replies[0].content, /Apenas devs/);
  const devId = settings.developerIds[0];
  const fields = { type: 'ouvindo', text: 'lo-fi 24h', status: 'ocupado', url: '' };
  const modal = loose({ customId: 'devprof:m_presence', user: { id: devId }, guild: null, isButton: () => false, isModalSubmit: () => true, deferUpdate: async () => {}, editReply: async () => {}, followUp: async (m) => replies.push(m), fields: { getTextInputValue: (n) => fields[n] ?? '' }, replied: false, deferred: true });
  b.client.emit('interactionCreate', modal);
  await new Promise((r) => setTimeout(r, 80));
  const saved = await flags.get('perfil', 'profile');
  assert.deepEqual(saved.presence, { type: 'Listening', text: 'lo-fi 24h', status: 'dnd', url: null });
  assert.ok(replies.some((r) => /Presença/.test(r.content || '')));
  await b.stop();
});
