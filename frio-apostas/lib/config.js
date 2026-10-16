'use strict';
// Leitura/validação de ambiente e montagem da configuração de cada bot.
const crypto = require('node:crypto');
const os = require('node:os');

// IDs de desenvolvedor padrão (mesmos do v1.5.0). Pode ser sobrescrito por DEVELOPER_IDS="id1,id2".
const DEFAULT_DEVELOPER_IDS = ['1535751259347222538', '1192230982250672158', '1545438919837880421'];

const PRESENCE_TYPES = ['Playing', 'Watching', 'Listening', 'Competing'];
const PRESENCE_STATUS = ['online', 'idle', 'dnd', 'invisible'];

// Recursos que podem ser ligados/desligados por bot. Defaults diferem entre modo único (legado) e frota.
const FEATURE_DEFAULTS = {
  single: { antiraid: true, auto_messages: true, message_content: true, guild_members: true, heartbeat_log: true, sync_username: false,
            dev_role: true, owner_is_developer: true, dev_sandbox: false },
  fleet:  { antiraid: true, auto_messages: true, message_content: true, guild_members: true, heartbeat_log: false, sync_username: false,
            dev_role: false, owner_is_developer: false, dev_sandbox: false },
};

function intEnv(env, name, def, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${name} precisa ser um inteiro (recebido: ${raw})`);
  if (n < min || n > max) throw new Error(`${name} fora do intervalo ${min}..${max} (recebido: ${n})`);
  return n;
}

function parseBool(raw, def) {
  if (raw === undefined || raw === null || raw === '') return def;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'sim'].includes(v)) return true;
  if (['0', 'false', 'off', 'no', 'nao', 'não'].includes(v)) return false;
  throw new Error(`valor booleano inválido: ${raw}`);
}

function listEnv(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function loadSettings(env = process.env) {
  const workerCount = intEnv(env, 'WORKER_COUNT', 1, { min: 1, max: 256 });
  const workerIndex = intEnv(env, 'WORKER_INDEX', 0, { min: 0, max: workerCount - 1 });
  const nodeId = (env.FLEET_NODE_ID || os.hostname()).replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 40);
  const leaseMode = String(env.LEASE_MODE || '').toLowerCase();
  if (leaseMode && !['required', 'auto', 'off'].includes(leaseMode)) throw new Error('LEASE_MODE deve ser required|auto|off');
  return {
    workerCount,
    workerIndex,
    holder: `${nodeId}:w${workerIndex}:${crypto.randomBytes(4).toString('hex')}`, // único por boot
    port: intEnv(env, 'PORT', intEnv(env, 'WEBHOOK_PORT', 3001, { min: 1, max: 65535 }), { min: 1, max: 65535 }),
    host: env.HOST || '0.0.0.0',
    trustProxy: parseBool(env.TRUST_PROXY, true),
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_KEY || '',
    leaseMode: leaseMode || null, // null => decidido pelo modo (frota: required; único: auto)
    leaseTtlSec: intEnv(env, 'LEASE_TTL_SEC', 60, { min: 15, max: 600 }),
    leaseRenewSec: intEnv(env, 'LEASE_RENEW_SEC', 20, { min: 5, max: 300 }),
    leaseFencing: parseBool(env.LEASE_FENCING, false),
    reconcileSec: intEnv(env, 'RECONCILE_SEC', 60, { min: 10, max: 3600 }),
    statusFlushSec: intEnv(env, 'STATUS_FLUSH_SEC', 30, { min: 5, max: 600 }),
    startConcurrency: intEnv(env, 'START_CONCURRENCY', 3, { min: 1, max: 20 }),
    startSpacingMs: intEnv(env, 'START_SPACING_MS', 1500, { min: 0, max: 60000 }),
    loginTimeoutMs: intEnv(env, 'LOGIN_TIMEOUT_MS', 60000, { min: 5000, max: 300000 }),
    maxBotsPerWorker: intEnv(env, 'MAX_BOTS_PER_WORKER', 100, { min: 1, max: 1000 }),
    readyMinRatio: Math.min(1, Math.max(0, Number(env.READY_MIN_RATIO ?? 0.8) || 0.8)),
    guildClaims: parseBool(env.FLEET_GUILD_CLAIMS, true),
    adminToken: env.FLEET_ADMIN_TOKEN || null,
    dataDir: env.DATA_DIR || './data',
    developerIds: listEnv(env.DEVELOPER_IDS).length ? listEnv(env.DEVELOPER_IDS) : DEFAULT_DEVELOPER_IDS,
    monitorUrl: String(env.MONITOR_URL || '').trim(),
  };
}

// Aceita features vindas do banco (jsonb) e aplica defaults; ignora chaves desconhecidas/tipos inválidos.
function normalizeFeatures(raw, mode) {
  const out = { ...FEATURE_DEFAULTS[mode] };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of Object.keys(out)) if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}

function sha(obj) {
  return crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 12);
}

// Monta a config de runtime de um bot a partir de campos já "planos" (decifrados).
function buildBotConfig(src, settings, mode) {
  const features = normalizeFeatures(src.features, mode);
  const brandName = String(src.displayName || src.id).slice(0, 80);
  const cfg = {
    id: src.id,
    enabled: src.enabled !== false,
    token: src.token,
    applicationId: src.applicationId || null,
    ownerId: src.ownerId ? String(src.ownerId) : null,
    panelApiToken: src.panelApiToken || null,
    logChannelId: src.logChannelId || null,
    brand: {
      botName: brandName,
      orgName: String(src.orgName || brandName).slice(0, 80),
      orgEmoji: String(src.orgEmoji || '🐦‍⬛').slice(0, 16),
      embedColor: /^#?[0-9a-fA-F]{6}$/.test(src.embedColor || '') ? `#${String(src.embedColor).replace('#', '')}` : null,
    },
    presence: {
      text: src.presenceText ? String(src.presenceText).slice(0, 120) : null,
      type: PRESENCE_TYPES.includes(src.presenceType) ? src.presenceType : 'Watching',
      status: PRESENCE_STATUS.includes(src.presenceStatus) ? src.presenceStatus : 'online',
    },
    features,
    developerIds: settings.developerIds,
    monitorUrl: settings.monitorUrl,
    mpAccessToken: src.mpAccessToken || null,
    workerGroup: Number.isInteger(src.workerGroup) ? src.workerGroup : null,
    commandsHash: src.commandsHash || null,
  };
  // Mudou "frio" => precisa reiniciar o bot. Mudou "quente" => aplica sem reconectar.
  cfg.coldRev = sha({ t: cfg.token, a: cfg.applicationId, f: cfg.features });
  cfg.hotRev = sha({ b: cfg.brand, p: cfg.presence, o: cfg.ownerId, l: cfg.logChannelId, pt: cfg.panelApiToken });
  return cfg;
}

function shardOf(cfg, workerCount) {
  if (cfg.workerGroup !== null && cfg.workerGroup !== undefined) return cfg.workerGroup % workerCount;
  const h = crypto.createHash('sha1').update(cfg.id).digest();
  return h.readUInt32BE(0) % workerCount;
}

module.exports = {
  DEFAULT_DEVELOPER_IDS, FEATURE_DEFAULTS, PRESENCE_TYPES, PRESENCE_STATUS,
  intEnv, parseBool, listEnv, loadSettings, normalizeFeatures, buildBotConfig, shardOf,
};
