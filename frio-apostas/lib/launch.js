'use strict';
// Inicialização compartilhada: modo "single" (1 bot via .env, compatível com v1.5.0) e modo "fleet" (registro no Supabase).
const { createLogger } = require('./logger');
const { loadSettings } = require('./config');
const { vaultFromEnv } = require('./crypto');
const { FleetStore, FlagStore } = require('./store');
const { EnvSource, DbSource } = require('./sources');
const { Supervisor } = require('./supervisor');
const { createHttpServer } = require('./http');

function createSupabase(url, key) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: { 'X-Client-Info': 'frio-fleet/2.0.0' },
      fetch: (u, opts = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        return fetch(u, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
      },
    },
    db: { schema: 'public' },
  });
}

async function launch(mode, { env = process.env, createBot, supabase } = {}) {
  const log = createLogger(mode === 'fleet' ? `fleet:w${env.WORKER_INDEX || 0}` : 'bot');
  const settings = loadSettings(env);
  if (!settings.supabaseUrl || !settings.supabaseKey) throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios.');
  const sb = supabase || createSupabase(settings.supabaseUrl, settings.supabaseKey);
  const store = new FleetStore(sb, log);
  const flags = new FlagStore(store, settings.dataDir, log);

  let source; let leaseMode;
  if (mode === 'fleet') {
    const vault = vaultFromEnv(env);
    if (!vault) throw new Error('FLEET_MASTER_KEY ausente (gere com: node scripts/fleet-cli.js gen-key).');
    source = new DbSource(store, vault, settings, log);
    leaseMode = settings.leaseMode || 'required';
    delete env.FLEET_MASTER_KEY; delete env.FLEET_MASTER_KEY_PREVIOUS; // não deixa a chave mestra no process.env
  } else {
    source = new EnvSource(settings, env);
    leaseMode = settings.leaseMode || 'auto';
  }

  const supervisor = new Supervisor({ settings, source, store, createBot: createBot || require('../bot-runtime').createBot, supabase: sb, flags, logger: log, leaseMode });
  const http = createHttpServer({ supervisor, settings, logger: log });
  await http.listen();
  await supervisor.start();

  let exiting = false;
  const exit = async (sig) => {
    if (exiting) return; exiting = true;
    await supervisor.shutdown(sig).catch(() => {});
    await http.close().catch(() => {});
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on('SIGTERM', () => exit('SIGTERM'));
  process.on('SIGINT', () => exit('SIGINT'));
  process.on('unhandledRejection', (r) => log.error('⚠️ unhandledRejection:', r?.stack || r?.message || r));
  const crashes = [];
  process.on('uncaughtException', (e) => {
    log.error('⚠️ uncaughtException:', e?.stack || e?.message || e);
    const now = Date.now(); crashes.push(now);
    while (crashes.length && now - crashes[0] > 60000) crashes.shift();
    if (crashes.length > 20) { log.error('exceções demais em 60s — saindo para o PM2 reiniciar.'); process.exit(1); }
  });
  return { supervisor, http, settings };
}

module.exports = { launch, createSupabase };
