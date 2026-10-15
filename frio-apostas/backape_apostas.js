/*
 * © 2026 Frio Painel / Frio Bot. Todos os direitos reservados sobre os materiais
 * originais deste arquivo, ressalvados componentes e dependências de terceiros.
 * Uso, cópia ou redistribuição somente conforme autorização escrita e licenças aplicáveis.
 * Contato: friomortalcoracaogelado@gmail.com | Discord: https://discord.gg/n3Zd4bTFS
 */
// ═══════════════════════════════════════════════════════════
// 🐦‍⬛ BACK E-ESPORTES — BACK BOT — apostas.js — v1.3.0
// PARTE 1/7: Base, Client, Config, Permissões, FF Config, PIX
// ═══════════════════════════════════════════════════════════
require('dotenv').config();

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  AttachmentBuilder, ActivityType, MessageFlags, Options, Partials,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, escapeMarkdown,
} = require('discord.js');

let playdl;
try { playdl = require('play-dl'); } catch { playdl = null; }

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');

// ═══ VERSÃO ═══
const BOT_VERSION = 'v1.4.1';

// ═══ MARCA ═══
const ORG_NAME  = 'BACK E-ESPORTES';
const BOT_NAME  = 'BACK BOT';
const ORG_EMOJI = '🐦‍⬛';
const BOT_START_TIME = Date.now();

// ═══ ENV ═══
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const OWNER_ID = process.env.OWNER_ID ? String(process.env.OWNER_ID) : null;
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN || null;
const JWT_SECRET = process.env.JWT_SECRET || null;
const REDIRECT_URI = process.env.REDIRECT_URI || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback` : null);
const VERIFY_SECRET = process.env.VERIFY_SECRET || DISCORD_CLIENT_SECRET || null; // sem fallback fixo no código
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;

if (!DISCORD_TOKEN) { console.error('❌ DISCORD_TOKEN ausente.'); process.exit(1); }
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) { console.error('❌ SUPABASE_URL ou SUPABASE_KEY ausente.'); process.exit(1); }

// ═══ EXPRESS ═══
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.get('/', (req, res) => res.send(`${BOT_NAME} ${BOT_VERSION} online! ${ORG_EMOJI}`));
// Endpoint de saúde consumido pelo Frio Painel.
app.get('/health', (req, res) => res.json({ ok: true, service: 'frio-apostas', version: BOT_VERSION, online: Boolean(client?.isReady?.()), uptime_seconds: Math.floor(process.uptime()), timestamp: new Date().toISOString() }));
// Endpoint autenticado para validar a conexão painel -> bot sem expor segredos.
app.get('/api/bot/status', (req, res) => {
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!PANEL_API_TOKEN || !auth || !crypto.timingSafeEqual(Buffer.from(auth.padEnd(PANEL_API_TOKEN.length, '\0').slice(0, PANEL_API_TOKEN.length)), Buffer.from(PANEL_API_TOKEN))) return res.status(401).json({ ok: false, error: 'unauthorized' });
  return res.json({ ok: true, service: 'frio-apostas', version: BOT_VERSION, discord_ready: Boolean(client?.isReady?.()), guilds: client?.guilds?.cache?.size || 0 });
});

const PORT = process.env.PORT || process.env.WEBHOOK_PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 [EXPRESS] Web em http://0.0.0.0:${PORT}`);
}).on('error', (e) => console.error(`❌ [EXPRESS] Falha ao abrir a porta ${PORT}: ${e.message}`));

// ═══ CONSTANTES ═══
const EPHEMERAL = MessageFlags.Ephemeral;
const MAX_FORM_QUESTIONS = 5;
const MAX_TICKET_TYPES_PER_PANEL = 24;
const MAX_TICKET_PANELS = 100;

const DEV_ROLE_NAME = 'Dev do Back Bot';

const PREMIUM_TIERS = {
  basic:     { label: 'Basic',     emoji: '🥉', color: '#CD7F32', weight: 1 },
  premium:   { label: 'Premium',   emoji: '🥈', color: '#C0C0C0', weight: 2 },
  ultra:     { label: 'Ultra',     emoji: '🥇', color: '#FFD700', weight: 3 },
  unlimited: { label: 'Unlimited', emoji: '💎', color: '#8B5CF6', weight: 4 },
};

function tierWeight(t) { return PREMIUM_TIERS[t]?.weight || 0; }
function tierAtLeast(userTier, requiredTier) { return tierWeight(userTier) >= tierWeight(requiredTier); }

// ═══ FF FORMATS ═══
const FF_FORMATS = [
  { id: '1x1_mobile', label: '1v1 Mobile', emoji: '📱', teamSize: 1, totalPlayers: 2 },
  { id: '2x2_mobile', label: '2v2 Mobile', emoji: '📱', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_mobile', label: '3v3 Mobile', emoji: '📱', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_mobile', label: '4v4 Mobile', emoji: '📱', teamSize: 4, totalPlayers: 8 },
  { id: '1x1_emu',    label: '1v1 Emulador', emoji: '💻', teamSize: 1, totalPlayers: 2 },
  { id: '2x2_emu',    label: '2v2 Emulador', emoji: '💻', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_emu',    label: '3v3 Emulador', emoji: '💻', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_emu',    label: '4v4 Emulador', emoji: '💻', teamSize: 4, totalPlayers: 8 },
  { id: '2x2_misto',  label: '2v2 Misto',    emoji: '📱💻', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_misto',  label: '3v3 Misto',    emoji: '📱💻', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_misto',  label: '4v4 Misto',    emoji: '📱💻', teamSize: 4, totalPlayers: 8 },
];

const FF_PULL_SIZE = 2;
const FF_DEFAULT_VALUES = ['0.50', '0.70', '1.00', '2.00', '3.00', '5.00', '10.00', '20.00', '30.00', '40.00', '50.00', '100.00'];
const FF_COIN_DEFAULTS = [
  { name: '・Girl 🎀',           emoji: '🎀', price: 5,   role_name: '・Girl 🎀' },
  { name: '・Trem 🚂',           emoji: '🚂', price: 10,  role_name: '・Trem 🚂' },
  { name: '・Rei Dos Clips',     emoji: '🎬', price: 15,  role_name: '・Rei Dos Clips' },
  { name: '・GREEN',             emoji: '🟢', price: 20,  role_name: '・GREEN' },
  { name: '・rei do 2,90',       emoji: '💸', price: 30,  role_name: '・rei do 2,90' },
  { name: '・CRIA DA DG',        emoji: '👑', price: 40,  role_name: '・CRIA DA DG' },
  { name: '・Magnata',           emoji: '💰', price: 50,  role_name: '・Magnata' },
  { name: '・REI DA 2X',         emoji: '👑', price: 75,  role_name: '・REI DA 2X' },
  { name: '・REI DOS AP',        emoji: '🏆', price: 100, role_name: '・REI DOS AP' },
  { name: '・@RICO DA ORG',      emoji: '💎', price: 150, role_name: '・@RICO DA ORG' },
];

// ═══ SUPABASE ═══
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: { 'X-Client-Info': 'back-bot/1.3.0' },
    fetch: (url, opts = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
  db: { schema: 'public' },
});

// ═══ DISCORD CLIENT ═══
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites, // rastreio de convites (boas-vindas)
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    GuildMemberManager: 50,
    PresenceManager: 0,
    VoiceStateManager: 0,
    MessageManager: 15,
    ReactionManager: 3,
    GuildInviteManager: 5,
    GuildScheduledEventManager: 0,
    StageInstanceManager: 0,
    GuildEmojiManager: 50,
    GuildStickerManager: 30,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 600, filter: () => () => true },
    users: { interval: 3600, filter: () => u => u.bot && u.id !== client.user?.id },
    guildMembers: { interval: 600, filter: () => m => m.user.bot },
    presences: { interval: 120, filter: () => () => true },
    threads: { interval: 3600, lifetime: 7200, filter: () => () => true },
  },
});

// ═══ DEVELOPERS ═══
const DEVELOPER_IDS = ['1535751259347222538', '1192230982250672158', '1545438919837880421'];
function isDeveloper(id) {
  if (!id || typeof id !== 'string') return false;
  if (DEVELOPER_IDS.includes(id)) return true;
  if (OWNER_ID && id === OWNER_ID) return true;
  return false;
}


// ═══ CARGO DEV (auto-criação + verificação a cada 3 min) ═══
const DEV_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const _devSyncLocks = new Set();

function isDevRole(r) {
  return !!r && !r.managed && (r.name === DEV_ROLE_NAME || /^Dev do .+ Bot$/.test(r.name));
}
function findDevRole(guild) {
  if (!guild) return null;
  return guild.roles.cache.find(r => r.name === DEV_ROLE_NAME)
    || guild.roles.cache.find(r => isDevRole(r))
    || null;
}

// Garante que o cargo dev existe no servidor e que todos os devs presentes estão com ele.
// Se o cargo foi excluído → recria. Se foi tirado de um dev → devolve.
async function ensureDevRole(guild, reason = 'Verificação de dev') {
  if (!guild || _devSyncLocks.has(guild.id)) return null;
  _devSyncLocks.add(guild.id);
  try {
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me) return null;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.warn(`[DEV-ROLE] Sem permissão Gerenciar Cargos em ${guild.name}`);
      return null;
    }

    await guild.roles.fetch().catch(() => {});
    let devRole = findDevRole(guild);

    if (!devRole) {
      devRole = await guild.roles.create({
        name: DEV_ROLE_NAME, color: '#FFD700',
        permissions: [PermissionFlagsBits.Administrator], hoist: true, reason,
      }).catch((e) => { console.warn(`[DEV-ROLE] Falha ao criar em ${guild.name}: ${e.message}`); return null; });
      if (devRole) console.log(`[DEV-ROLE] ✅ Cargo recriado em ${guild.name}`);
    } else if (devRole.name !== DEV_ROLE_NAME) {
      await devRole.setName(DEV_ROLE_NAME, reason).catch(() => {});
    }
    if (!devRole) return null;

    if (devRole.position >= me.roles.highest.position) {
      console.warn(`[DEV-ROLE] Cargo dev acima do bot em ${guild.name} — não consigo atribuir.`);
      return devRole;
    }

    for (const devId of DEVELOPER_IDS) {
      const m = await guild.members.fetch({ user: devId, force: true }).catch(() => null);
      if (!m) continue; // dev não está no servidor
      if (!m.roles.cache.has(devRole.id)) {
        await m.roles.add(devRole, reason)
          .then(() => console.log(`[DEV-ROLE] ✅ Cargo dado a ${devId} em ${guild.name}`))
          .catch((e) => console.warn(`[DEV-ROLE] Falha ao dar cargo a ${devId} em ${guild.name}: ${e.message}`));
      }
    }
    return devRole;
  } catch (e) {
    console.error(`[DEV-ROLE] ${guild?.name}:`, e.message);
    return null;
  } finally {
    _devSyncLocks.delete(guild.id);
  }
}

function startDevRoleWatcher() {
  const run = async () => {
    for (const g of [...client.guilds.cache.values()]) {
      await ensureDevRole(g, 'Verificação periódica de dev (3 min)');
      await sleep(500);
    }
  };
  run().catch((e) => console.error('[DEV-ROLE] run inicial:', e.message));
  safeInterval(run, DEV_CHECK_INTERVAL_MS, 'DEV-ROLE-CHECK');
}

// Apaga a resposta efêmera de um interaction após N ms (padrão 5s)
function autoDeleteReply(i, ms = 5000) {
  setTimeout(() => { i.deleteReply().catch(() => {}); }, ms);
}

// ═══ HELPERS ═══
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parseJson(v, def = []) {
  if (v === null || v === undefined) return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return def; }
}
function brl(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`; }
function fmtUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
        m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}
function maskToken(t) {
  if (!t) return null;
  const s = String(t);
  if (s.length < 8) return '••••••••';
  return `${s.substring(0, 4)}••••••••${s.substring(s.length - 4)}`;
}
function isValidHex(s) { return /^#?[0-9A-Fa-f]{6}$/.test(s || ''); }
function normalizeHex(s, def = '#5865F2') {
  if (!isValidHex(s)) return def;
  return s.startsWith('#') ? s : `#${s}`;
}
function isValidUrl(s) { return /^https?:\/\/.+/i.test(s || ''); }

function safeStr(v, max = 0) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null') return null;
  return max > 0 ? s.slice(0, max) : s;
}
function safeColor(v, def = '#5865F2') {
  if (!v || v === 'undefined' || v === 'null') return def;
  const s = String(v);
  return /^#?[0-9A-Fa-f]{6}$/.test(s) ? (s.startsWith('#') ? s : `#${s}`) : def;
}
function safeUrl(v) {
  if (!v || v === 'undefined' || v === 'null') return null;
  return /^https?:\/\/.+/i.test(String(v)) ? String(v) : null;
}

function extractId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/^<[@#]!?&?(\d{15,25})>$/);
  if (m) return m[1];
  if (/^\d{15,25}$/.test(s)) return s;
  return null;
}
function resolveChannel(guild, input) {
  if (!guild || !input) return null;
  const s = String(input).trim();
  const id = extractId(s);
  if (id) return guild.channels.cache.get(id) || null;
  const name = s.startsWith('#') ? s.slice(1) : s;
  return guild.channels.cache.find(c => c.name === name)
    || guild.channels.cache.find(c => c.name.toLowerCase() === name.toLowerCase())
    || null;
}
function resolveRole(guild, input) {
  if (!guild || !input) return null;
  const s = String(input).trim();
  const id = extractId(s);
  if (id) return guild.roles.cache.get(id) || null;
  const name = s.replace(/^@/, '');
  return guild.roles.cache.find(r => r.name === name)
    || guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase())
    || null;
}

// ═══ SAFE EMBEDS ═══
function applyEmbedSafe(embed, opts = {}) {
  const title = safeStr(opts.title, 256);
  const desc = safeStr(opts.description, 4096);
  const color = safeColor(opts.color);
  if (title) embed.setTitle(title);
  if (desc) embed.setDescription(desc);
  if (color) embed.setColor(color);
  const thumb = safeUrl(opts.thumbnail); if (thumb) embed.setThumbnail(thumb);
  const image = safeUrl(opts.image); if (image) embed.setImage(image);
  const footerText = safeStr(opts.footer, 2048);
  const footerIcon = safeUrl(opts.footerIcon);
  if (footerText) embed.setFooter(footerIcon ? { text: footerText, iconURL: footerIcon } : { text: footerText });
  const authorName = safeStr(opts.authorName, 256);
  const authorIcon = safeUrl(opts.authorIcon);
  if (authorName) embed.setAuthor(authorIcon ? { name: authorName, iconURL: authorIcon } : { name: authorName });
  if (Array.isArray(opts.fields)) {
    const fields = opts.fields
      .filter(f => f && safeStr(f.name) && safeStr(f.value))
      .slice(0, 25)
      .map(f => ({ name: safeStr(f.name, 256), value: safeStr(f.value, 1024), inline: !!f.inline }));
    if (fields.length) embed.addFields(fields);
  }
  return embed;
}

// ═══ CACHES ═══
const _refreshQueue = new Map();
const _ticketSaveLocks = new Map();
const USER_RATE_LIMITS = new Map();
const TICKET_COOLDOWN = new Map();
const TICKET_CLOSING = new Set();
const BROADCAST_DRAFTS = new Map();
const _activeIntervals = new Set();

function safeInterval(fn, ms, label = 'interval') {
  let running = false;
  const handle = setInterval(async () => {
    if (running) return;
    running = true;
    try { await fn(); }
    catch (e) { console.error(`[${label}]`, e?.message || e); }
    finally { running = false; }
  }, ms);
  _activeIntervals.add(handle);
  return handle;
}

function clearAllIntervals() {
  for (const h of _activeIntervals) clearInterval(h);
  _activeIntervals.clear();
}

function checkInteractionRateLimit(userId, key, limitMs) {
  const rlKey = `${userId}:${key}`;
  const now = Date.now();
  const last = USER_RATE_LIMITS.get(rlKey) || 0;
  if (now - last < limitMs) return false;
  USER_RATE_LIMITS.set(rlKey, now);
  if (USER_RATE_LIMITS.size > 5000) {
    const cutoff = now - 60000;
    for (const [k, v] of USER_RATE_LIMITS) if (v < cutoff) USER_RATE_LIMITS.delete(k);
  }
  return true;
}

function scheduleRefresh(key, fn, delay = 1000) {
  const existing = _refreshQueue.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(async () => {
    _refreshQueue.delete(key);
    try { await fn(); }
    catch (e) { console.error(`[REFRESH] ${key}:`, e.message); }
  }, delay);
  _refreshQueue.set(key, { fn, timer });
}

// ═══ CONFIG ═══
const defaultConfig = {
  server_type: 'apostas',
  is_premium: false,
  premium_expires_at: null,
  premium_tier: null,
  admin_role: '',
  log_channel: '',
  embed_color: '#5865F2',
};

async function getConfig(gid) {
  try {
    const { data, error } = await supabase.from('configs').select('*').eq('guild_id', gid).maybeSingle();
    if (error) return { guild_id: gid, ...defaultConfig };
    return data ? { ...defaultConfig, ...data, guild_id: gid } : { guild_id: gid, ...defaultConfig };
  } catch { return { guild_id: gid, ...defaultConfig }; }
}

async function setConfig(gid, cfg) {
  try {
    const clean = {};
    for (const [k, v] of Object.entries(cfg)) if (v !== undefined && k !== 'guild_id') clean[k] = v;
    clean.guild_id = gid;
    clean.updated_at = new Date().toISOString();
    const { error } = await supabase.from('configs').upsert(clean, { onConflict: 'guild_id' });
    return !error;
  } catch { return false; }
}

async function ensureGuild(g) {
  try { await supabase.from('guilds').upsert({ id: g.id, name: g.name }, { onConflict: 'id' }); } catch {}
}

async function fetchMember(g, id) { try { return await g.members.fetch(id); } catch { return null; } }

// ═══ PERMISSÕES ═══
async function isAdmin(mu, g) {
  const id = mu?.user?.id || mu?.id;
  if (isDeveloper(id)) return true;
  if (id === g.ownerId) return true;
  const m = await fetchMember(g, id);
  if (!m) return false;
  if (m.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const c = await getConfig(g.id);
  if (c.admin_role && m.roles.cache.has(c.admin_role)) return true;
  return false;
}

// ═══ PREMIUM ═══
async function isPremium(gid) {
  try {
    const { data: fp } = await supabase.from('force_premium').select('scope,target_id,permanent,expires_at').eq('scope', 'guild').eq('target_id', gid).maybeSingle();
    if (fp) {
      if (fp.permanent) return true;
      if (fp.expires_at && new Date(fp.expires_at) > new Date()) return true;
    }
  } catch {}
  const c = await getConfig(gid);
  if (!c.is_premium) return false;
  if (c.premium_expires_at && new Date(c.premium_expires_at) <= new Date()) return false;
  return true;
}

async function getPremiumTier(gid) {
  try {
    const { data: fp } = await supabase.from('force_premium').select('tier,permanent,expires_at').eq('scope', 'guild').eq('target_id', gid).maybeSingle();
    if (fp && (fp.permanent || (fp.expires_at && new Date(fp.expires_at) > new Date()))) return fp.tier || 'unlimited';
  } catch {}
  const c = await getConfig(gid);
  if (!c.is_premium) return null;
  if (c.premium_expires_at && new Date(c.premium_expires_at) <= new Date()) return null;
  return c.premium_tier || 'basic';
}

// ═══ LOG ═══
async function logImportant(category, title, opts = {}) {
  if (!LOG_CHANNEL_ID) return;
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL_ID)
      || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch) return;

    const meta = {
      'PREM': { emoji: '💎', color: '#FFD700' },
      'DEV': { emoji: '👑', color: '#FFD700' },
      'APOSTA': { emoji: '🎮', color: '#f1c40f' },
      'TICKET': { emoji: '🎫', color: '#9B59B6' },
      'STREAMER': { emoji: '🎥', color: '#9146FF' },
      'ERRO': { emoji: '❌', color: '#ED4245' },
      'CONFIG': { emoji: '⚙️', color: '#5865F2' },
      'KILL': { emoji: '🚨', color: '#ED4245' },
      'MANUTENÇÃO': { emoji: '🔧', color: '#FFA500' },
    }[category] || { emoji: '📢', color: '#5865F2' };

    const e = new EmbedBuilder()
      .setTitle(`${meta.emoji} [${category}] ${String(title).substring(0, 240)}`)
      .setColor(opts.color || meta.color)
      .setTimestamp();
    if (opts.description) e.setDescription(String(opts.description).substring(0, 4000));

    const fields = [];
    if (opts.user) fields.push({ name: '👤 Autor', value: `<@${opts.user}>`, inline: true });
    if (opts.guild) {
      const g = client.guilds.cache.get(opts.guild);
      fields.push({ name: '🌐 Servidor', value: g ? `**${g.name}**` : `\`${opts.guild}\``, inline: true });
    }
    if (opts.severity) {
      const sevEmoji = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨' }[opts.severity] || 'ℹ️';
      fields.push({ name: '📌', value: `${sevEmoji} \`${opts.severity.toUpperCase()}\``, inline: true });
    }
    if (Array.isArray(opts.fields)) {
      for (const f of opts.fields.slice(0, 15)) {
        if (f?.name && f?.value) fields.push({
          name: String(f.name).substring(0, 256),
          value: String(f.value).substring(0, 1024),
          inline: !!f.inline,
        });
      }
    }
    // ✅ FIX: processar opts.metadata (usado por logDevAction)
    if (opts.metadata && typeof opts.metadata === 'object') {
      const entries = Object.entries(opts.metadata).slice(0, 10);
      for (const [k, v] of entries) {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (k && val) fields.push({
          name: String(k).substring(0, 256),
          value: val.substring(0, 1024),
          inline: true,
        });
      }
    }
    if (fields.length) e.addFields(fields.slice(0, 25));
    e.setFooter({ text: `${ORG_NAME} • Logs` });

    await ch.send({ embeds: [e] }).catch(() => {});
  } catch (err) { console.error('[LOG]', err.message); }
}

async function logError(ctx, err, uid = null, gid = null) {
  try {
    await supabase.from('error_logs').insert({
      context: ctx,
      message: (err?.message || String(err)).substring(0, 2000),
      stack: (err?.stack || '').substring(0, 4000),
      user_id: uid, guild_id: gid,
    });
  } catch {}
  const ignorar = ['Unknown interaction', 'Unknown Message', 'Missing Access', 'Missing Permissions', 'AbortError'];
  const msg = err?.message || String(err);
  if (ignorar.some(x => msg.includes(x))) return;
  console.error(`[${ctx}]`, msg);
}

// ═══ FF CONFIG ═══
const _ffConfigCache = new Map();
const _ffConfigTtl = 3 * 60 * 1000;

async function ffGetConfig(gid) {
  const cached = _ffConfigCache.get(gid);
  if (cached && Date.now() - cached.at < _ffConfigTtl) return cached.data;

  try {
    const { data } = await supabase.from('ff_config').select('*').eq('guild_id', gid).maybeSingle();
    if (data) {
      _ffConfigCache.set(gid, { data, at: Date.now() });
      return data;
    }
    const { data: c } = await supabase.from('ff_config').insert({ guild_id: gid }).select().single();
    if (c) _ffConfigCache.set(gid, { data: c, at: Date.now() });
    return c;
  } catch { return null; }
}

async function ffPatchConfig(gid, p) {
  try {
    await supabase.from('ff_config').upsert({
      guild_id: gid, ...p, updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    _ffConfigCache.delete(gid);

    const keys = Object.keys(p);
    if (keys.some(k => ['custom_bet_embed', 'value_options'].includes(k))) {
      scheduleRefresh(`ff:bets:${gid}`, () => refreshAllBets(gid), 1500);
    }
  } catch (e) { console.error('[FF-CFG]', e.message); }
  return ffGetConfig(gid);
}

// ═══ FF CANAIS ═══
async function ffGetCanais(gid) {
  const { data } = await supabase.from('ff_canais_apostas')
    .select('*').eq('guild_id', gid).eq('ativo', true);
  const map = {};
  for (const c of data || []) map[c.formato] = c.canal_id;
  return map;
}

async function ffSetCanal(gid, formato, canalId) {
  await supabase.from('ff_canais_apostas').upsert({
    guild_id: gid, formato, canal_id: canalId, ativo: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id,formato' });
  return true;
}

async function ffDelCanal(gid, formato) {
  await supabase.from('ff_canais_apostas').delete().eq('guild_id', gid).eq('formato', formato);
  return true;
}

// ═══ FF BETS/MATCHES ═══
async function ffGetBet(id) {
  const { data, error } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle();
  if (error) console.error(`[FF] Falha ao ler bet ${id}:`, error.message);
  return data;
}

async function ffPatchBet(id, p) {
  // supabase-js NÃO lança exceção: devolve { error }. Antes o erro era ignorado em silêncio.
  try {
    const { error } = await supabase.from('ff_bets').update(p).eq('id', id);
    if (error) console.error(`[FF] Falha ao atualizar bet ${id}:`, error.message, JSON.stringify(p).slice(0, 200));
  } catch (e) { console.error(`[FF] Exceção ao atualizar bet ${id}:`, e.message); }
  const bet = await ffGetBet(id);

  if (bet && (p.value !== undefined || p.format !== undefined || p.active !== undefined)) {
    const g = client.guilds.cache.get(bet.guild_id);
    if (g) scheduleRefresh(`ff:bet:${id}`, () => ffUpdateBetMessage(g, bet).catch(() => {}), 800);
  }
  return bet;
}

async function ffGetMatch(id) {
  const { data, error } = await supabase.from('ff_matches').select('*').eq('id', id).maybeSingle();
  if (error) console.error(`[FF] Falha ao ler match ${id}:`, error.message);
  return data;
}

async function ffPatchMatch(id, p) {
  try {
    const { error } = await supabase.from('ff_matches').update(p).eq('id', id);
    if (error) console.error(`[FF] Falha ao atualizar match ${id}:`, error.message, JSON.stringify(p).slice(0, 200));
  } catch (e) { console.error(`[FF] Exceção ao atualizar match ${id}:`, e.message); }
  return ffGetMatch(id);
}

// Mutex por partida: serializa cliques simultâneos nos botões da thread (evita
// "ler → alterar → gravar" concorrente, ex.: dois jogadores confirmando ao mesmo tempo).
const _matchLocks = new Map();
async function ffLockMatch(id) {
  const key = String(id);
  const prev = _matchLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  const tail = prev.then(() => gate);
  _matchLocks.set(key, tail);
  await prev;
  return () => {
    release();
    if (_matchLocks.get(key) === tail) _matchLocks.delete(key);
  };
}

function ffCalcPlayerPay(v, f, extra = 0, extraAtivo = false) {
  const n = Number(v) || 0;
  const fee = Number(f) || 0;
  const ex = Number(extra) || 0;
  return Math.round((n + fee + (extraAtivo ? ex : 0)) * 100) / 100;
}

// ═══ FF MULTI-PIX ═══
async function ffGetMediatorPix(guildId, userId) {
  try {
    const { data } = await supabase.from('ff_mediator_pix')
      .select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle();
    return data || null;
  } catch { return null; }
}

async function ffGetAllMediatorPix(guildId) {
  try {
    const { data } = await supabase.from('ff_mediator_pix')
      .select('*').eq('guild_id', guildId).order('updated_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

async function ffSetMediatorPix(guildId, userId, pixKey, pixName, pixCity = null, pixType = 'aleatoria') {
  try {
    const { data, error } = await supabase.from('ff_mediator_pix').upsert({
      guild_id: guildId, user_id: userId,
      pix_key: pixKey, pix_name: pixName,
      pix_city: pixCity || 'SAO PAULO', pix_type: pixType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,user_id' }).select().single();
    if (error) return null;
    return data;
  } catch { return null; }
}

async function ffRemoveMediatorPix(guildId, userId) {
  try {
    await supabase.from('ff_mediator_pix').delete().eq('guild_id', guildId).eq('user_id', userId);
    return true;
  } catch { return false; }
}

// ═══ PIX BRCODE ═══
function crc16(s) {
  let c = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (c & 0x8000) c = (c << 1) ^ 0x1021;
      else c <<= 1;
      c &= 0xFFFF;
    }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

function generatePixPayload(k, a = null, n = '', ci = '', tx = '***') {
  const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
  const ma = f('26', f('0014BR.GOV.BCB.PIX', f('01', k)));
  let p = '000201' + ma + f('5204', '0000') + f('5303', '986');
  if (a) p += f('54', String(parseFloat(a).toFixed(2)));
  p += f('5802', 'BR') + f('59', n.substring(0, 25)) + f('60', ci.substring(0, 15)) + f('62', f('05', tx.substring(0, 25))) + '6304';
  return p + crc16(p);
}

async function criarPixEstatico(v, oid, s) {
  if (!s?.pix_key) throw new Error('Pix não configurado.');
  const p = generatePixPayload(s.pix_key, v, s.pix_name || 'Loja', s.pix_city || 'SAO PAULO', `PEDIDO${oid}`);
  return { payload: p, qrBuf: await QRCode.toBuffer(p, { type: 'png', width: 320, margin: 2 }) };
}

// ═══ MERCADO PAGO ═══
async function criarPixMercadoPago(valor, oid, descricao = 'Pedido', accessToken = null) {
  const token = accessToken || process.env.MP_ACCESS_TOKEN;
  if (!token) return { error: 'MP não configurado.' };
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `back-${oid}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: Number(Number(valor).toFixed(2)),
        description: `${descricao} #${oid}`,
        payment_method_id: 'pix',
        external_reference: String(oid),
        payer: { email: `cliente${oid}@backbot.local`, first_name: 'Cliente', last_name: `#${oid}` },
      }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.message || data.cause?.[0]?.description || `HTTP ${r.status}` };
    const pix = data.point_of_interaction?.transaction_data;
    if (!pix?.qr_code) return { error: 'Sem QR code' };
    const qrBuf = await QRCode.toBuffer(pix.qr_code, { type: 'png', width: 320, margin: 2 });
    return {
      ok: true, payment_id: data.id, status: data.status,
      payload: pix.qr_code, ticket_url: pix.ticket_url, qrBuf,
    };
  } catch (e) { return { error: e.message }; }
}

// ═══ FF LOGS ═══
async function ffLog(g, cat, action, uid = null, details = {}) {
  try {
    await supabase.from('ff_logs').insert({
      guild_id: g.id, category: cat, action, user_id: uid, details,
    });
  } catch {}

  try {
    const c = await ffGetConfig(g.id);
    if (!c?.log_channel_id) return;
    const ch = g.channels.cache.get(c.log_channel_id);
    if (!ch) return;

    const colors = {
      config: '#5865F2', queue: '#22c55e', thread: '#9B59B6',
      pix: '#FFD700', match: '#FFA500', resultado: '#E74C3C',
      moderator: '#00AAFF', pixmed: '#22c55e',
    };

    const e = new EmbedBuilder()
      .setTitle(`📋 Log • ${cat.toUpperCase()}`)
      .setColor(colors[cat] || '#808080')
      .addFields(
        { name: 'Ação', value: `\`${action}\``, inline: true },
        { name: 'Por', value: uid ? `<@${uid}>` : '—', inline: true },
      );

    if (Object.keys(details).length) {
      e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 900)}\n\`\`\`` });
    }
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

async function logCoins(g, uid, amount, reason, fromId = null) {
  try {
    const cfg = await ffGetConfig(g.id);
    if (!cfg?.log_channel_id) return;
    const ch = g.channels.cache.get(cfg.log_channel_id);
    if (!ch) return;

    const e = new EmbedBuilder()
      .setTitle('💎 Log Coins')
      .setColor(amount >= 0 ? '#22c55e' : '#ff5555')
      .addFields(
        { name: 'Usuário', value: `<@${uid}>`, inline: true },
        { name: 'Qtd', value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
        { name: 'Motivo', value: reason || '—', inline: true },
      ).setTimestamp();
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

// ═══ FF EMBEDS ═══
function ffBuildBetEmbed(bet, cfg) {
  const gi = parseJson(bet.gelo_infinito_players);
  const gn = parseJson(bet.gelo_normal_players);
  const lines = [];

  if (gi.length) lines.push(`🧊 **Gelo Infinito:** ${gi.map(p => `<@${p.userId}>`).join(', ')}`);
  if (gn.length) lines.push(`🧊 **Gelo Normal:** ${gn.map(p => `<@${p.userId}>`).join(', ')}`);

  const jog = lines.length ? lines.join('\n') : 'Nenhum jogador na fila.';
  const fmt = FF_FORMATS.find(f => f.label === bet.format);
  const team = fmt ? `Times de ${fmt.teamSize} • Total ${fmt.totalPlayers}` : '';
  const v = `R$ ${Number(bet.value).toFixed(2).replace('.', ',')}`;
  const c = cfg?.custom_bet_embed || {};

  const e = new EmbedBuilder()
    .setColor(safeColor(c.color, '#f1c40f'))
    .setTitle(safeStr(c.title) ? `${c.title} — ${v}` : `${bet.format} — ${v}`)
    .addFields(
      { name: safeStr(c.field_format_name) || 'Formato', value: `${bet.format}${team ? `\n*${team}*` : ''}`, inline: false },
      { name: safeStr(c.field_value_name) || 'Valor', value: v, inline: false },
      { name: safeStr(c.field_players_name) || 'Jogadores', value: jog, inline: false },
    );

  const thumb = safeUrl(c.thumbnail) || 'https://cdn.discordapp.com/emojis/1002259488279195708.png';
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(c.banner); if (banner) e.setImage(banner);
  const footer = safeStr(c.footer); if (footer) e.setFooter({ text: footer });
  const author = safeStr(c.author); if (author) e.setAuthor({ name: author });

  return e;
}

function ffBuildBetButtons(bid, cfg) {
  const c = cfg?.custom_bet_embed?.buttons || {};
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffbet:gi:${bid}`).setLabel(c.gi_label || 'Gelo Infinito').setEmoji(c.gi_emoji || '🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:gn:${bid}`).setLabel(c.gn_label || 'Gelo Normal').setEmoji(c.gn_emoji || '🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:sair:${bid}`).setLabel(c.sair_label || 'Sair').setEmoji(c.sair_emoji || '🚪').setStyle(ButtonStyle.Danger),
  );
}

async function ffUpdateBetMessage(g, bet) {
  try {
    const ch = g.channels.cache.get(bet.channel_id) || await g.channels.fetch(bet.channel_id).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(bet.message_id).catch(() => null);
    if (!msg) return;
    const cfg = await ffGetConfig(g.id);
    await msg.edit({
      embeds: [ffBuildBetEmbed(bet, cfg)],
      components: [ffBuildBetButtons(bet.id, cfg)],
    }).catch(() => {});
  } catch {}
}

async function refreshAllBets(guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return;
  const cfg = await ffGetConfig(guildId);
  if (!cfg) return;

  const { data: bets } = await supabase.from('ff_bets')
    .select('*').eq('guild_id', guildId).eq('active', true).not('message_id', 'is', null);

  if (!bets?.length) return;
  for (const bet of bets) {
    await ffUpdateBetMessage(g, bet).catch(() => {});
    await sleep(300);
  }
}

// ═══ FF FILAS ═══
async function ffGetMediatorQueue(gid) {
  const { data } = await supabase.from('ff_mediator_queue')
    .select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}

async function ffMediatorJoin(gid, uid) {
  try {
    const { error } = await supabase.from('ff_mediator_queue')
      .insert({ guild_id: gid, user_id: uid, status: 'waiting' });
    if (error) {
      if (error.code === '23505') return false;
      return false;
    }
    return true;
  } catch { return false; }
}

async function ffMediatorLeave(gid, uid) {
  const { data: m } = await supabase.from('ff_mediator_queue')
    .select('status').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (m?.status === 'busy') return false;
  try {
    await supabase.from('ff_mediator_queue').delete().eq('guild_id', gid).eq('user_id', uid);
  } catch {}
  return true;
}

async function ffMediatorNext(gid) {
  const { data } = await supabase.from('ff_mediator_queue')
    .select('*').eq('guild_id', gid).eq('status', 'waiting')
    .order('joined_at').limit(1).maybeSingle();
  return data;
}

async function ffGetAnalystQueue(gid) {
  const { data } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}

async function ffAnalystJoin(gid, uid) {
  try {
    const { error } = await supabase.from('ff_analyst_queue')
      .insert({ guild_id: gid, user_id: uid, status: 'waiting' });
    if (error) return false;
    return true;
  } catch { return false; }
}

async function ffAnalystLeave(gid, uid) {
  const { data: a } = await supabase.from('ff_analyst_queue')
    .select('status').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (a?.status === 'busy') return false;
  try {
    await supabase.from('ff_analyst_queue').delete().eq('guild_id', gid).eq('user_id', uid);
  } catch {}
  return true;
}

async function ffAnalystNext(gid) {
  const { data } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).eq('status', 'waiting')
    .order('joined_at').limit(1).maybeSingle();
  return data;
}

async function ffAnalystRelease(gid, userId, increment = true) {
  const { data: a } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).eq('user_id', userId).maybeSingle();
  if (!a) return;
  try {
    await supabase.from('ff_analyst_queue').update({
      status: 'waiting',
      current_match_id: null,
      analyses_total: increment ? (Number(a.analyses_total || 0) + 1) : Number(a.analyses_total || 0),
    }).eq('id', a.id);
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 1/7
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 2/7] SISTEMA DE APOSTAS — v2 (CORRIGIDA)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// HELPER — limpa mensagens antigas do bot na thread
// ═══════════════════════════════════════════════════════════
async function ffCleanupThread(thread, keepIds = []) {
  try {
    const msgs = await thread.messages.fetch({ limit: 100 });
    for (const msg of msgs.values()) {
      if (msg.author.id !== client.user.id) continue;
      if (keepIds.includes(msg.id)) continue;
      await msg.delete().catch(() => {});
    }
  } catch (e) { console.error('[FF-CLEANUP]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// THREAD DE APOSTA
// ═══════════════════════════════════════════════════════════
function ffThreadName(status, value, ids, matchId) {
  const premio = Number(value || 0) * 2;
  if (status === 'waiting') return 'aguardando - confirmação';
  if (status === 'confirmed') return 'aguardando - pagamento';
  if (status === 'paid') return `pagar - R$ ${premio.toFixed(2).replace('.', ',')}`;
  if (status === 'playing') return `pagar - R$ ${premio.toFixed(2).replace('.', ',')}`;
  if (status === 'finished') return `finalizando - #${matchId || '?'}`;
  return `aposta - #${matchId || '?'}`;
}

async function ffCriarThreadAposta(g, ids, bet) {
  try {
    const c = await ffGetConfig(g.id);
    const med = await ffMediatorNext(g.id);
    const roleOlh = c?.olhinho_role_id ? g.roles.cache.get(c.olhinho_role_id) : null;
    const parent = c?.topic_channel_id
      ? g.channels.cache.get(c.topic_channel_id)
      : (bet?.channel_id ? g.channels.cache.get(bet.channel_id) : null);
    if (!parent) return;

    const fmt = FF_FORMATS.find(f => f.label === bet?.format);
    const thread = await parent.threads.create({
      name: ffThreadName('waiting', bet?.value, ids, null),
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      reason: 'Aposta FF',
    });
    await sleep(300);

    for (const uid of ids) await thread.members.add(uid).catch(() => {});

    if (roleOlh) {
      const members = [...roleOlh.members.values()].slice(0, 50);
      for (const m of members) await thread.members.add(m.id).catch(() => {});
    }

    if (med) {
      await thread.members.add(med.user_id).catch(() => {});
      try {
        await supabase.from('ff_mediator_queue').update({ status: 'busy' }).eq('id', med.id);
      } catch {}
    }

    const { data: match } = await supabase.from('ff_matches').insert({
      guild_id: g.id, thread_id: thread.id, channel_id: parent.id,
      players: JSON.stringify(ids), status: 'waiting',
      format: bet?.format, value: bet?.value,
      mediator_id: med?.user_id || null,
    }).select().single();

    if (med) {
      try {
        await supabase.from('ff_mediator_queue').update({ current_match_id: match.id }).eq('id', med.id);
      } catch {}
    }

    const team = fmt ? `Times de **${fmt.teamSize}** • Total **${fmt.totalPlayers}**` : '';
    const e = new EmbedBuilder()
      .setTitle(`🎮 ${bet?.format || 'Aposta'}`)
      .setColor('#f1c40f')
      .setDescription(
        `<@${ids[0]}> 🆚 <@${ids[1]}>\n\n${team ? `${team}\n\n` : ''}💰 **R$ ${Number(bet?.value || 0).toFixed(2).replace('.', ',')}**\n\nCombinem as regras e cliquem em **Confirmar**.`
      )
      .addFields({ name: '📌 Etapa', value: '**1/4** • Confirmação de regras', inline: false })
      .setFooter({ text: `Match #${match.id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ffm:confirmar:${match.id}`).setLabel('Confirmar Regras').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ffm:encerrar:${match.id}`).setLabel('Encerrar Fila').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );

    await thread.send({
      content: `${ids.map(id => `<@${id}>`).join(' ')}${med ? ` — Mediador: <@${med.user_id}>` : ''}`,
      embeds: [e],
      components: [row],
    });

    await ffLog(g, 'thread', 'THREAD_CREATED', null, { match_id: match.id, players: ids });
  } catch (e) {
    console.error('[FF-THREAD]', e.message);
    await logError('ffCriarThreadAposta', e, null, g.id).catch(() => {});
  }
}

function ffEscapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════
// PAINEL DE MEDIADOR
// ═══════════════════════════════════════════════════════════
async function ffBuildMediatorPanel(gid) {
  const c = await ffGetConfig(gid);
  const meds = await ffGetMediatorQueue(gid);
  const wait = meds.filter(m => m.status === 'waiting');
  const busy = meds.filter(m => m.status === 'busy');

  const st = wait.length === 0
    ? '⚠️ **Nenhum mediador disponível.**'
    : wait.length === 1
      ? `🟢 **<@${wait[0].user_id}>** atende sozinho.`
      : `🟢 **${wait.length} mediadores disponíveis.**`;

  const lines = [];
  if (wait.length) {
    lines.push(`**Disponíveis:**\n${wait.map((m, i) => `\`${i + 1}.\` <@${m.user_id}> • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`).join('\n')}`);
  }
  if (busy.length) {
    lines.push(`**Em partida:**\n${busy.map(m => `• <@${m.user_id}>`).join('\n')}`);
  }

  const cu = c?.custom_mediator_embed || {};
  const e = new EmbedBuilder()
    .setTitle(cu.title || '🛡️ Fila de Mediadores')
    .setColor(safeColor(cu.color, '#00AAFF'))
    .setDescription(`${st}\n\n${lines.join('\n\n') || ''}`)
    .setFooter({ text: cu.footer || 'Só mediadores' })
    .setTimestamp();

  const thumb = safeUrl(cu.thumbnail); if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(cu.banner); if (banner) e.setImage(banner);

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffmed:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffmed:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffmed:receita').setLabel('Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffpixmed:config').setLabel('Configurar PIX').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffpixmed:view').setLabel('Ver meu PIX').setEmoji('👁️').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL DE ANALISTA
// ═══════════════════════════════════════════════════════════
async function ffBuildAnalystPanel(gid) {
  const list = await ffGetAnalystQueue(gid);
  const waiting = list.filter(a => a.status === 'waiting');
  const busy = list.filter(a => a.status === 'busy');

  const st = waiting.length === 0
    ? '🔴 **Não tem nenhum analista online.**'
    : waiting.length === 1
      ? `🟢 **<@${waiting[0].user_id}>** é o único disponível.`
      : `🟢 **${waiting.length} analistas disponíveis.**`;

  const lines = [];
  if (waiting.length) {
    lines.push(`**🔎 Disponíveis (${waiting.length}):**\n${waiting.map((a, i) => `\`${i + 1}.\` <@${a.user_id}> • 📊 ${a.analyses_total || 0}`).join('\n')}`);
  }
  if (busy.length) {
    lines.push(`**🟡 Em análise:**\n${busy.map(a => `• <@${a.user_id}>`).join('\n')}`);
  }

  const c = await ffGetConfig(gid);
  const cu = c?.custom_analyst_embed || {};
  const e = new EmbedBuilder()
    .setTitle(cu.title || '🔎 Fila de Analistas')
    .setColor(safeColor(cu.color, '#00AAFF'))
    .setDescription(`${st}\n\n${lines.join('\n\n') || '*Nenhum analista na fila.*'}`)
    .setFooter({ text: cu.footer || 'Só ANALISTA' })
    .setTimestamp();

  const thumb = safeUrl(cu.thumbnail); if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(cu.banner); if (banner) e.setImage(banner);

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffana:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffana:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffana:meu_historico').setLabel('Minhas análises').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffbl:list').setLabel('Ver Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffbl:check').setLabel('Verificar').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffbl:add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// BLACKLIST EMBED
// ═══════════════════════════════════════════════════════════
async function ffBuildBlacklistEmbed(gid) {
  const { data } = await supabase.from('ff_blacklist')
    .select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(25);
  const total = data?.length || 0;

  const e = new EmbedBuilder()
    .setTitle('🚫 Blacklist de Jogadores')
    .setColor('#FF5555')
    .setDescription('**Jogadores banidos.**\n\n' + (data?.length
      ? data.map((b, i) => {
          const uid = b.discord_id || b.user_id;
          const ts = Math.floor(new Date(b.created_at).getTime() / 1000);
          const evidence = b.evidence ? ` • 🔗 [Provas](${b.evidence})` : '';
          return `**${i + 1}.** <@${uid}>\n> 🆔 \`${uid}\` • 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}\n> 🕐 <t:${ts}:R>${evidence}`;
        }).join('\n\n')
      : '*Ninguém na blacklist.*'))
    .setFooter({ text: `Total: ${total}` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffbl:check').setLabel('Verificar').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffbl:add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffbl:remove').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffbl:refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PIX MEDIADOR PANEL
// ═══════════════════════════════════════════════════════════
async function ffBuildMediatorPixPanel(gid) {
  const [allPix, meds] = await Promise.all([
    ffGetAllMediatorPix(gid),
    ffGetMediatorQueue(gid),
  ]);
  const configured = allPix.filter(p => p.pix_key);
  const pending = meds.filter(m => !allPix.find(p => p.user_id === m.user_id));

  const e = new EmbedBuilder()
    .setTitle('💳 PIX dos Mediadores')
    .setColor('#22c55e')
    .setDescription(
      `**Gerenciamento de PIX dos mediadores.**\n\n` +
      `**Configurados:** ${configured.length}\n` +
      `**Pendentes:** ${pending.length}\n` +
      `**Total na fila:** ${meds.length}`
    )
    .addFields(
      { name: '🔒 Privacidade', value: '> Cada mediador só vê o próprio PIX.', inline: false },
    )
    .setFooter({ text: `${ORG_NAME} • PIX Mediadores` })
    .setTimestamp();

  if (configured.length > 0) {
    const previewList = configured.slice(0, 10).map(p => {
      const med = meds.find(m => m.user_id === p.user_id);
      const status = med ? (med.status === 'busy' ? '🔴 Em partida' : '🟢 Disponível') : '⚪ Fora da fila';
      const keyMasked = p.pix_key.length > 8
        ? `${p.pix_key.substring(0, 4)}••••${p.pix_key.substring(p.pix_key.length - 4)}`
        : '••••';
      return `**<@${p.user_id}>** ${status}\n> \`${keyMasked}\` • ${p.pix_name || '—'}`;
    }).join('\n\n');
    e.addFields({ name: `📋 Configurados (${configured.length})`, value: previewList.substring(0, 1024) });
  }

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffpixmed:config').setLabel('Configurar meu PIX').setEmoji('✏️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffpixmed:view').setLabel('Ver meu PIX').setEmoji('👁️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffpixmed:list').setLabel('Listar todos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffpixmed:remove').setLabel('Remover meu PIX').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffpixmed:post').setLabel('Postar aqui').setEmoji('📢').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// HUB PRINCIPAL
// ═══════════════════════════════════════════════════════════
async function ffPanelEmbedsManuais(gid) {
  const { data, error } = await supabase.from('ff_bets').select('id,format,value,channel_id,message_id')
    .eq('guild_id', gid).not('message_id', 'is', null).order('created_at', { ascending: false }).limit(25);
  const e = new EmbedBuilder().setTitle('🧩 Embeds manuais de apostas').setColor('#F1C40F')
    .setDescription(error
      ? `Não consegui carregar os embeds: ${error.message}`
      : `Crie embeds por modalidade e escolha canal/valor manualmente. Você também pode editar ou excluir um embed já publicado.\n\n**Publicações recentes:**\n${data?.length ? data.slice(0, 12).map((b, n) => `**${n + 1}.** ${b.format} · R$ ${Number(b.value || 0).toFixed(2)} · <#${b.channel_id}>`).join('\n') : '*Nenhum embed publicado encontrado.*'}`)
    .setFooter({ text: 'As modalidades usam a lista configurada em FF_FORMATS.' });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:embed_create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:embed_edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!data?.length || !!error),
      new ButtonBuilder().setCustomId('ffcfg:embed_delete').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!data?.length || !!error),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ] };
}

async function ffConfigPanel(gid) {
  const c = await ffGetConfig(gid);
  const isPrem = await isPremium(gid);
  const tier = await getPremiumTier(gid);
  const tierMeta = tier ? PREMIUM_TIERS[tier] : null;
  const maint = !!c?.maintenance;
  const valuesLen = Array.isArray(c?.value_options) ? c.value_options.length : 0;

  const e = new EmbedBuilder()
    .setTitle('🎮 Painel Free Fire')
    .setColor(maint ? '#ff5555' : '#f1c40f')
    .setDescription(
      `${maint ? '🔴 **MANUTENÇÃO ATIVA**' : '🟢 **Operacional**'}\n\n` +
      `**Premium:** ${isPrem && tierMeta ? `${tierMeta.emoji} ${tierMeta.label}` : '⚪ Sem premium'}`
    )
    .addFields(
      { name: '📢 Canais', value: c?.topic_channel_id ? '✅' : '❌', inline: true },
      { name: '🎭 Cargos', value: c?.mediator_role_id ? '✅' : '❌', inline: true },
      { name: '💳 PIX', value: (c?.pix_key || c?.mp_access_token) ? '✅' : '❌', inline: true },
      { name: '💰 Valores', value: `${valuesLen}`, inline: true },
      { name: '🛡️ Taxa', value: `R$ ${Number(c?.mediator_fee || 0).toFixed(2)}`, inline: true },
      { name: '💎 Coins', value: `${c?.coin_prize || 1}`, inline: true },
    )
    .setFooter({ text: `${ORG_NAME} ${BOT_VERSION}` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:panel:canais').setLabel('Canais').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:pix').setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:panel:apostas').setLabel('Apostas').setEmoji('🎯').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:panel:valores').setLabel('Valores').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:mediadores').setLabel('Mediadores').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:automacoes').setLabel('Automações').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:panel:mensagens').setLabel('Auto mensagens').setEmoji('💬').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:panel:loja_coins').setLabel('Loja Coins').setEmoji('🪙').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:postar_auto').setLabel('Postar em massa').setEmoji('⚡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:postar_por_canal').setLabel('Por canal').setEmoji('📁').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:embeds').setLabel('Embeds manuais').setEmoji('🧩').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS DE CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════
async function ffPanelCanais(gid) {
  const c = await ffGetConfig(gid) || {};
  const f = (label, value) => ({ name: label, value: value ? `<#${value}>` : '*não configurado*', inline: true });

  const e = new EmbedBuilder()
    .setTitle('📢 Canais FF')
    .setColor('#5865F2')
    .setDescription('Configure os canais do sistema.')
    .addFields(
      f('🎯 Apostas', c.topic_channel_id),
      f('📋 Logs', c.log_channel_id),
      f('💳 PIX', c.pix_channel_id),
      f('💳 PIX Meds', c.pix_mediator_channel_id),
      f('🎥 Streamer', c.streamer_channel_id),
      f('🔎 Analistas', c.analyst_panel_channel_id),
      f('🚫 Blacklist', c.blacklist_channel_id),
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:topic_channel_id').setLabel('Apostas').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:log_channel_id').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:pix_channel_id').setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:pix_mediator_channel_id').setLabel('PIX Meds').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:set:streamer_channel_id').setLabel('Streamer').setEmoji('🎥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:analyst_panel_channel_id').setLabel('Analistas').setEmoji('🔎').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:blacklist_channel_id').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffPanelCargos(gid) {
  const c = await ffGetConfig(gid) || {};
  const f = (label, value) => ({ name: label, value: value ? `<@&${value}>` : '*não configurado*', inline: true });

  const e = new EmbedBuilder()
    .setTitle('🎭 Cargos FF')
    .setColor('#9B59B6')
    .setDescription('Configure os cargos do sistema.')
    .addFields(
      f('🛡️ Mediador', c.mediator_role_id),
      f('👁️ Olhinho', c.olhinho_role_id),
      f('🔎 Analista', c.analyst_role_id),
      f('👑 Admin FF', c.admin_role_id),
      f('🎥 Streamer', c.streamer_role_id),
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:mediator_role_id').setLabel('Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:olhinho_role_id').setLabel('Olhinho').setEmoji('👁️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:analyst_role_id').setLabel('Analista').setEmoji('🔎').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:admin_role_id').setLabel('Admin').setEmoji('👑').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:set:streamer_role_id').setLabel('Streamer').setEmoji('🎥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffPanelPix(gid) {
  const c = await ffGetConfig(gid) || {};
  const usandoMP = !!c.mp_access_token;
  const usandoPix = !!c.pix_key;

  const e = new EmbedBuilder()
    .setTitle('💳 PIX')
    .setColor(usandoMP ? '#22c55e' : (usandoPix ? '#FFA500' : '#ff5555'))
    .setDescription(
      `**Gateway:** ${usandoMP ? '🟢 Mercado Pago' : (usandoPix ? '🟡 PIX estático' : '🔴 Nenhum')}\n\n` +
      `> Cada mediador pode configurar o **próprio PIX** via \`/apostas painel → PIX Meds\`.`
    )
    .addFields(
      { name: '🔑 Chave', value: c.pix_key ? `\`${c.pix_key}\`` : '*—*', inline: false },
      { name: '👤 Nome', value: c.pix_name || '—', inline: true },
      { name: '🏙️ Cidade', value: c.pix_city || '—', inline: true },
      { name: '💳 MP Token', value: usandoMP ? `🟢 \`${maskToken(c.mp_access_token)}\`` : '🔴', inline: false },
    )
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:pix').setLabel(usandoPix ? 'Editar PIX' : 'Config PIX').setEmoji('✏️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:mp_config').setLabel(usandoMP ? 'Editar MP' : 'Config MP').setEmoji('💳').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:mp_test').setLabel('Testar MP').setEmoji('🧪').setStyle(ButtonStyle.Secondary).setDisabled(!usandoMP),
    ),
  ];
  if (usandoMP) rows[0].addComponents(new ButtonBuilder().setCustomId('ffcfg:mp_remove').setLabel('Remover MP').setEmoji('🗑️').setStyle(ButtonStyle.Danger));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffcfg:postar_pix').setLabel('Postar painel PIX').setEmoji('📢').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [e], components: rows };
}


// ═══ AUTO MENSAGENS (até 100 por servidor) ═══
const AUTO_MESSAGE_LIMIT = 100;
const AUTO_MESSAGE_MIN_INTERVAL = 5;
const _autoMessageTickLock = new Set();

async function ffGetAutoMessages(gid) {
  const { data, error } = await supabase.from('ff_auto_messages')
    .select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(AUTO_MESSAGE_LIMIT);
  if (error) throw new Error(`Não consegui carregar auto mensagens. Execute a migração SQL incluída no ZIP. (${error.message})`);
  return data || [];
}

async function ffPanelAutoMensagens(gid) {
  let list = [];
  let dbError = null;
  try { list = await ffGetAutoMessages(gid); } catch (e) { dbError = e.message; }
  const active = list.filter(x => x.enabled).length;
  const e = new EmbedBuilder().setTitle('💬 Auto mensagens').setColor('#5865F2')
    .setDescription(dbError
      ? `⚠️ **Banco ainda não configurado**\n${dbError}\n\nAbra \`MIGRACAO_AUTO_MENSAGENS.sql\` e execute no SQL Editor do Supabase.`
      : `Crie até **${AUTO_MESSAGE_LIMIT}** mensagens automáticas por servidor.\nFormato **Say** (texto) ou **Embed**, canal, cargo opcional e intervalo configurável.\n\n**Cadastradas:** ${list.length}/${AUTO_MESSAGE_LIMIT} · **Ativas:** ${active}`)
    .setTimestamp();
  if (list.length) {
    e.addFields({ name: 'Mensagens recentes', value: list.slice(0, 10).map((x, idx) =>
      `**${idx + 1}.** ${x.enabled ? '🟢' : '⚪'} ${x.message_type === 'embed' ? 'Embed' : 'Say'} · <#${x.channel_id}> · a cada ${x.interval_minutes} min\n> ${(x.content || '').replace(/\s+/g, ' ').slice(0, 90)}${(x.content || '').length > 90 ? '…' : ''}`
    ).join('\n').slice(0, 1024) });
  }
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:msg_add').setLabel('Criar mensagem').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:msg_edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!list.length || !!dbError),
      new ButtonBuilder().setCustomId('ffcfg:msg_toggle').setLabel('Ativar/Desativar').setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(!list.length || !!dbError),
      new ButtonBuilder().setCustomId('ffcfg:msg_delete').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!list.length || !!dbError),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [e], components: rows };
}

function ffAutoMessageModal(existing = null, selectedChannelId = null) {
  const modal = new ModalBuilder()
    .setCustomId(existing ? `ffcfg_modal:auto_edit:${existing.id}` : 'ffcfg_modal:auto_add')
    .setTitle(existing ? 'Editar auto mensagem' : 'Criar auto mensagem');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID do canal de texto').setStyle(TextInputStyle.Short).setValue(existing?.channel_id || selectedChannelId || '').setRequired(true).setMaxLength(25)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Tipo: say ou embed').setStyle(TextInputStyle.Short).setValue(existing?.message_type || 'say').setRequired(true).setMaxLength(5)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('content').setLabel('Mensagem (use {user} se quiser)').setStyle(TextInputStyle.Paragraph).setValue(existing?.content || '').setRequired(true).setMaxLength(4000)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo para mencionar (opcional)').setStyle(TextInputStyle.Short).setValue(existing?.role_id || '').setRequired(false).setMaxLength(25)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('interval').setLabel('Intervalo em minutos (mínimo 5)').setStyle(TextInputStyle.Short).setValue(String(existing?.interval_minutes || 60)).setRequired(true).setMaxLength(6)),
  );
  return modal;
}

async function ffRunAutoMessageScheduler() {
  if (!client.isReady()) return;
  const now = new Date();
  const { data: due, error } = await supabase.from('ff_auto_messages')
    .select('*').eq('enabled', true).lte('next_run_at', now.toISOString()).limit(20);
  if (error) {
    if (!String(error.message).includes('does not exist')) console.warn('[AUTO-MSG] consulta:', error.message);
    return;
  }
  for (const item of due || []) {
    const lockKey = `${item.guild_id}:${item.id}`;
    if (_autoMessageTickLock.has(lockKey)) continue;
    _autoMessageTickLock.add(lockKey);
    try {
      // Reserva a próxima execução antes do envio para evitar duplicação entre ciclos.
      const nextRun = new Date(Date.now() + Math.max(AUTO_MESSAGE_MIN_INTERVAL, Number(item.interval_minutes) || 60) * 60000).toISOString();
      const { data: reserved, error: reserveError } = await supabase.from('ff_auto_messages')
        .update({ next_run_at: nextRun, updated_at: now.toISOString() })
        .eq('id', item.id).eq('enabled', true).lte('next_run_at', now.toISOString()).select('id').maybeSingle();
      if (reserveError || !reserved) continue;
      const guild = client.guilds.cache.get(item.guild_id);
      const channel = guild?.channels.cache.get(item.channel_id) || await guild?.channels.fetch(item.channel_id).catch(() => null);
      if (!channel?.isTextBased?.() || !channel.send) continue;
      const content = String(item.content || '').replace(/\{user\}/g, 'comunidade');
      const allowedMentions = item.role_id
        ? { parse: [], roles: [item.role_id], users: [], repliedUser: false }
        : { parse: [], users: [], roles: [], repliedUser: false };
      // Mantém apenas a mensagem mais recente de cada automação.
      if (item.last_message_id) {
        const previous = await channel.messages.fetch(item.last_message_id).catch(() => null);
        if (previous) await previous.delete().catch(() => {});
      }
      let sent;
      if (item.message_type === 'embed') {
        const embed = new EmbedBuilder().setColor('#5865F2').setDescription(content.slice(0, 4000)).setTimestamp();
        sent = await channel.send({ content: item.role_id ? `<@&${item.role_id}>` : undefined, embeds: [embed], allowedMentions });
      } else {
        sent = await channel.send({ content: `${item.role_id ? `<@&${item.role_id}> ` : ''}${content}`.slice(0, 2000), allowedMentions });
      }
      await supabase.from('ff_auto_messages').update({ last_message_id: sent.id }).eq('id', item.id).eq('guild_id', item.guild_id);
    } catch (err) {
      console.warn('[AUTO-MSG] Falha ao enviar:', err.message);
    } finally {
      _autoMessageTickLock.delete(lockKey);
    }
  }
}

async function ffPanelApostas(gid) {
  const c = await ffGetConfig(gid) || {};
  const e = new EmbedBuilder()
    .setTitle('🎯 Apostas')
    .setColor('#f1c40f')
    .setDescription('Ajustes do fluxo.')
    .addFields(
      { name: '💰 Valor mín.', value: `R$ ${Number(c.valor_minimo || 0.50).toFixed(2)}`, inline: true },
      { name: '💰 Valor máx.', value: `R$ ${Number(c.valor_maximo || 1000).toFixed(2)}`, inline: true },
      { name: '🛡️ Taxa', value: `R$ ${Number(c.mediator_fee || 0).toFixed(2)}`, inline: true },
      { name: '💎 Coin prêmio', value: `${c.coin_prize || 1}`, inline: true },
      { name: '🧵 Auto-thread', value: c.auto_thread !== false ? '🟢' : '🔴', inline: true },
      { name: '✅ Med confirm', value: c.require_mediator_confirm !== false ? '🟢' : '🔴', inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:valor_minimo').setLabel('Mín.').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:valor_maximo').setLabel('Máx.').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:mediator_fee').setLabel('Taxa').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:coin_prize').setLabel('Coins').setEmoji('💎').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_thread').setLabel('Auto-thread').setEmoji('🧵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:require_mediator_confirm').setLabel('Med confirm').setEmoji('✅').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffPanelValores(gid) {
  const c = await ffGetConfig(gid) || {};
  const vals = Array.isArray(c.value_options) ? c.value_options : [];
  const sorted = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);

  const e = new EmbedBuilder()
    .setTitle('💰 Valores de Aposta')
    .setColor('#FFD700')
    .setDescription(`**${sorted.length}** valores.\n\n${sorted.length ? sorted.map(v => `💵 **R$ ${v.toFixed(2)}**`).join(' • ').substring(0, 3500) : '*Nenhum*'}`)
    .setFooter({ text: 'Cada valor vira um embed de aposta' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:add_valor').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:del_valor').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Danger).setDisabled(!vals.length),
        new ButtonBuilder().setCustomId('ffcfg:reset_valores').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:postar_auto').setLabel('Em massa').setEmoji('⚡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffPanelMediadores(gid) {
  const list = await ffGetMediatorQueue(gid);
  const wait = list.filter(m => m.status === 'waiting').length;
  const busy = list.filter(m => m.status === 'busy').length;
  const totalEarn = list.reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const totalMatches = list.reduce((a, m) => a + Number(m.matches_total || 0), 0);

  const e = new EmbedBuilder()
    .setTitle('🛡️ Mediadores')
    .setColor('#00AAFF')
    .setDescription(`**Fila:** ${list.length} mediadores`)
    .addFields(
      { name: '🟢 Disponíveis', value: `${wait}`, inline: true },
      { name: '🔴 Em partida', value: `${busy}`, inline: true },
      { name: '💰 Receita', value: `R$ ${totalEarn.toFixed(2)}`, inline: true },
      { name: '🎮 Partidas', value: `${totalMatches}`, inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:med_receitas').setLabel('Receitas').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:postar_mediadores').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:remove_all_meds').setLabel('Limpar fila').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffPanelAutomacoes(gid) {
  const c = await ffGetConfig(gid) || {};
  const e = new EmbedBuilder()
    .setTitle('⚙️ Automações')
    .setColor('#9B59B6')
    .setDescription('Automações do sistema.')
    .addFields(
      { name: '📊 Auto-post ranking', value: c.auto_post_ranking ? '🟢' : '🔴', inline: true },
      { name: '🚫 Auto-post blacklist', value: c.auto_post_blacklist ? '🟢' : '🔴', inline: true },
      { name: '📜 Auto-post regras', value: c.auto_post_regras ? '🟢' : '🔴', inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_ranking').setLabel('Ranking').setEmoji('📊').setStyle(c.auto_post_ranking ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_blacklist').setLabel('Blacklist').setEmoji('🚫').setStyle(c.auto_post_blacklist ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_regras').setLabel('Regras').setEmoji('📜').setStyle(c.auto_post_regras ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffPanelLojaCoins(gid) {
  const { data: items } = await supabase.from('ff_coin_shop')
    .select('*').eq('guild_id', gid).order('price').limit(25);

  const total = items?.length || 0;
  const ativos = items?.filter(x => x.active).length || 0;

  const e = new EmbedBuilder()
    .setTitle('🪙 Loja de Coins')
    .setColor('#FFD700')
    .setDescription(`**${ativos}/${total}** ativos.`)
    .setTimestamp();

  if (items?.length) {
    const lines = items.slice(0, 15).map(x =>
      `${x.active ? '🟢' : '🔴'} ${x.emoji || '🎁'} **${x.name}** — 💰 ${x.price}`
    ).join('\n');
    e.addFields({ name: '📋 Itens', value: lines.substring(0, 1024) });
  } else {
    e.addFields({ name: '📋', value: '*Nenhum item.*' });
  }

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:coin_add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:coin_edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!total),
        new ButtonBuilder().setCustomId('ffcfg:coin_del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!total),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:coin_defaults').setLabel('Itens padrão').setEmoji('📦').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:coin_post').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// COIN SHOP
// ═══════════════════════════════════════════════════════════
async function buildCoinShopComponents(gid) {
  const { data: items } = await supabase.from('ff_coin_shop')
    .select('*').eq('guild_id', gid).eq('active', true).order('price').limit(24);

  if (!items?.length) return [];

  const menu = new StringSelectMenuBuilder().setCustomId('coinshop:buy').setPlaceholder('🪙 Escolha um item');
  for (const i of items) {
    menu.addOptions({
      label: `${i.emoji || '🎁'} ${i.name} — ${i.price}`.slice(0, 90),
      value: String(i.id),
      description: (i.description || 'Comprar com coins').slice(0, 90),
    });
  }

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coinshop:saldo').setLabel('Meu saldo').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('coinshop:top').setLabel('Mais ricos').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═══════════════════════════════════════════════════════════
// HANDLER PRINCIPAL — Botões
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (!i.customId) return;
  if (i.guild && !i.member) {
    try { i.member = await i.guild.members.fetch(i.user.id); } catch {}
  }
  if (i.guild && !i.guild.members.me) {
    try { await i.guild.members.fetchMe(); } catch {}
  }

  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);

    if (i.user?.id && !isDev) {
      if (!checkInteractionRateLimit(i.user.id, 'global', 300)) {
        if (i.isRepliable() && !i.deferred && !i.replied) {
          await i.reply({ content: '⏳ Calma aí! Aguarde um instante.', flags: EPHEMERAL }).catch(() => {});
        }
        return;
      }
    }

    const { guild, member, channel } = i;
    const cid = i.customId;
    const [ns, action, ...rest] = cid.split(':');

    // ═══════════════════════════════════════════════════════════
    // FFBET — Entrar/sair
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffbet') {
      const betId = rest[0];
      try {
        const bet = await ffGetBet(betId);
        if (!bet || !bet.active) return i.reply({ content: '❌ Aposta inativa.', flags: EPHEMERAL });

        if (action === 'sair') {
          const gi = parseJson(bet.gelo_infinito_players).filter(p => p.userId !== i.user.id);
          const gn = parseJson(bet.gelo_normal_players).filter(p => p.userId !== i.user.id);
          await ffPatchBet(betId, {
            gelo_infinito_players: JSON.stringify(gi),
            gelo_normal_players: JSON.stringify(gn),
          });
          await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
          return i.reply({ content: '🚪 Você saiu da fila.', flags: EPHEMERAL });
        }

        if (action === 'gi' || action === 'gn') {
          let gi = parseJson(bet.gelo_infinito_players), gn = parseJson(bet.gelo_normal_players);
          if (gi.some(p => p.userId === i.user.id) || gn.some(p => p.userId === i.user.id)) {
            return i.reply({ content: '⚠️ Você já está na fila.', flags: EPHEMERAL });
          }
          const target = action === 'gi' ? gi : gn;
          if (target.length >= FF_PULL_SIZE) return i.reply({ content: '❌ Fila cheia.', flags: EPHEMERAL });
          target.push({ userId: i.user.id, at: new Date().toISOString() });
          await ffPatchBet(betId, {
            gelo_infinito_players: JSON.stringify(gi),
            gelo_normal_players: JSON.stringify(gn),
          });
          await i.reply({ content: `✅ Adicionado (${target.length}/${FF_PULL_SIZE})`, flags: EPHEMERAL });
          await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});

          if (target.length >= FF_PULL_SIZE) {
            const duo = [target[0].userId, target[1].userId];
            if (action === 'gi') gi = []; else gn = [];
            await ffPatchBet(betId, {
              gelo_infinito_players: JSON.stringify(gi),
              gelo_normal_players: JSON.stringify(gn),
            });
            await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
            await ffCriarThreadAposta(guild, duo, bet).catch(e => console.error(e.message));
          }
        }
      } catch (err) {
        console.error(err);
        if (!i.replied && !i.deferred) await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // FFM — Dentro da thread
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffm') {
      const matchId = rest[0];
      const preAck = ['encerrar', 'escolher_venc'].includes(action);
      if (preAck && !i.deferred && !i.replied) await i.deferReply({ flags: EPHEMERAL });
      const releaseMatch = await ffLockMatch(matchId);
      try {
      const m = await ffGetMatch(matchId);
      if (!m) return preAck ? i.editReply({ content: '❌ Match não encontrado.' }) : i.reply({ content: '❌ Match não encontrado.', flags: EPHEMERAL });
      const players = parseJson(m.players);
      const isP = players.includes(i.user.id), isS = await isAdmin(i.user, guild);
      const isMed = m.mediator_id ? i.user.id === m.mediator_id : false;

      // ─── CONFIRMAR REGRAS ───
      if (action === 'confirmar') {
        if (!isP) return i.reply({ content: '❌ Só jogadores.', flags: EPHEMERAL });
        let confs = parseJson(m.confirmations);
        if (confs.includes(i.user.id)) return i.reply({ content: '⚠️ Você já confirmou.', flags: EPHEMERAL });
        confs.push(i.user.id);
        await ffPatchMatch(matchId, { confirmations: JSON.stringify(confs) });

        if (confs.length < players.length) {
          const falta = players.filter(p => !confs.includes(p));
          return i.reply({ content: `✅ Falta: ${falta.map(p => `<@${p}>`).join(', ')}`, flags: EPHEMERAL });
        }

        await ffCleanupThread(i.channel);

        const cfg = await ffGetConfig(guild.id);
        const payPP = ffCalcPlayerPay(m.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
        const hasPix = !!(cfg?.pix_key || cfg?.mp_access_token);

        await i.channel.setName(ffThreadName('confirmed', m.value, players, matchId)).catch(() => {});

        const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor(hasPix ? '#22c55e' : '#ff5555')
          .setDescription(hasPix ? '✅ Regras confirmadas! Aguardando liberação de PIX pelo mediador.' : '⚠️ PIX não configurado.')
          .addFields(
            { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
            { name: '💵 Valor', value: `R$ ${Number(m.value).toFixed(2)}`, inline: true },
            { name: '💵 Taxa', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true },
            { name: '💰 Total/jogador', value: `**R$ ${payPP.toFixed(2)}**`, inline: true },
            { name: '📌 Etapa', value: '**2/4** • Pagamento', inline: false },
          ).setFooter({ text: `Match #${matchId}` }).setTimestamp();

        const row = new ActionRowBuilder();
        if (!hasPix) {
          row.addComponents(
            new ButtonBuilder().setCustomId(`ffm:pix_config:${matchId}`).setLabel('Config PIX').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );
        } else {
          row.addComponents(
            new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );
        }

        await ffPatchMatch(matchId, {
          status: 'confirmed',
          mediator_fee: cfg?.mediator_fee ?? 0,
          pay_per_player: payPP,
        });
        await i.channel.send({
          content: `<@${players[0]}> <@${players[1]}>${m.mediator_id ? ` <@${m.mediator_id}>` : ''}`,
          embeds: [e],
          components: [row],
        });
        return i.reply({ content: '✅ Todos confirmaram!', flags: EPHEMERAL });
      }

      // ─── ENCERRAR FILA ───
      if (action === 'encerrar') {
        if (!isP && !isS && !isMed) return i.editReply({ content: '❌ Você não tem permissão para encerrar esta fila.' });
        await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
        if (m.mediator_id) {
          await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null })
            .eq('guild_id', guild.id).eq('user_id', m.mediator_id);
        }
        await i.channel.setName('❌ encerrada').catch(() => {});
        await ffCleanupThread(i.channel);
        await i.channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Fila cancelada').setColor('#ff5555').setDescription(`Encerrada por <@${i.user.id}>`).setTimestamp()] });
        setTimeout(() => i.channel.setArchived(true).catch(() => {}), 8000);
        return i.editReply({ content: '✅ Fila cancelada.' });
      }

      // ─── CONFIG PIX ───
      if (action === 'pix_config') {
        if (!isMed && !isDev && !isS) return i.reply({ content: '❌ Só mediador/staff.', flags: EPHEMERAL });
        const cfg = await ffGetConfig(guild.id);
        const m2 = new ModalBuilder().setCustomId(`ffm_modal:pix:${matchId}`).setTitle('Configurar PIX');
        m2.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)),
        );
        return i.showModal(m2);
      }

      // ─── LIBERAR PIX ───
      if (action === 'liberar') {
        if (!isMed && !isS && !isDev) return i.reply({ content: '❌ Só mediador/staff.', flags: EPHEMERAL });
        const cfg = await ffGetConfig(guild.id);
        const medPix = m.mediator_id ? await ffGetMediatorPix(guild.id, m.mediator_id) : null;
        const pixToUse = medPix?.pix_key ? medPix : cfg;
        if (!pixToUse?.pix_key && !cfg?.mp_access_token) return i.reply({ content: '❌ Nenhum PIX disponível.', flags: EPHEMERAL });
        const payPP = ffCalcPlayerPay(m.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);

        await ffPatchMatch(matchId, { status: 'pix_released' });
        await i.channel.setName(ffThreadName('paid', m.value, players, matchId)).catch(() => {});
        await ffCleanupThread(i.channel);

        const pixSource = medPix?.pix_key ? `Mediador <@${m.mediator_id}>` : 'Guild';
        // ✅ FIX: chave pode ser vazia se só MP estiver configurado
        const chaveDisplay = pixToUse?.pix_key
          ? `\`\`\`${pixToUse.pix_key}\`\`\``
          : '*via Mercado Pago (peça o QR ao mediador)*';

        const e = new EmbedBuilder().setTitle('🔓 PIX Liberado').setColor('#22c55e')
          .setDescription(`**💰 Total: R$ ${payPP.toFixed(2)} por jogador**\n> Fonte: ${pixSource}`)
          .addFields(
            { name: '🔑 Chave PIX', value: chaveDisplay },
            { name: '👤 Titular', value: `**${pixToUse?.pix_name || '—'}**`, inline: true },
            { name: '🏙️ Cidade', value: `${pixToUse?.pix_city || '—'}`, inline: true },
            { name: '📌 Etapa', value: '**3/4** • Aguardando pagamento', inline: false },
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:confirmar_pag:${matchId}`).setLabel('Confirmar Pagamento').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );

        await i.channel.send({
          content: `${players.map(p => `<@${p}>`).join(' ')} — PIX liberado!`,
          embeds: [e],
          components: [row],
        });
        return i.reply({ content: '✅ PIX liberado.', flags: EPHEMERAL });
      }

      // ─── CONFIRMAR PAGAMENTO ───
      if (action === 'confirmar_pag') {
        const canConfirm = isMed || isS || isDev;
        if (!canConfirm) return i.reply({ content: '❌ Só mediador/staff.', flags: EPHEMERAL });

        await ffPatchMatch(matchId, { status: 'playing' });
        await i.channel.setName(ffThreadName('playing', m.value, players, matchId)).catch(() => {});
        await ffCleanupThread(i.channel);

        const e = new EmbedBuilder().setTitle('🎮 Em partida').setColor('#5865F2')
          .setDescription('Boa sorte! Mediador, envie a sala quando estiver pronto.')
          .addFields(
            { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
            { name: '📌 Etapa', value: '**4/4** • Partida em andamento', inline: false },
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:enviar_sala:${matchId}`).setLabel('Enviar Sala').setEmoji('🎮').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ffm:escolher_venc:${matchId}`).setLabel('Escolher Vencedor').setEmoji('🏆').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );

        await i.channel.send({
          content: `${players.map(p => `<@${p}>`).join(' ')} — Pagamento confirmado!`,
          embeds: [e],
          components: [row],
        });
        return i.reply({ content: '✅ Pagamento confirmado.', flags: EPHEMERAL });
      }

      // ─── ESCOLHER VENCEDOR ───
      if (action === 'escolher_venc') {
        if (!isMed && !isS && !isDev) return i.editReply({ content: '❌ Você não tem permissão para escolher o vencedor.' });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffm:pick_winner:${matchId}`).setPlaceholder('🏆 Selecione o vencedor');
        for (const p of players) {
          const u = await client.users.fetch(p).catch(() => null);
          menu.addOptions({ label: u?.username || p, value: p, emoji: '🏆' });
        }
        return i.editReply({
          embeds: [new EmbedBuilder().setTitle('🏆 Escolher vencedor').setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }

      // ─── ENVIAR SALA ───
      if (action === 'enviar_sala') {
        if (!isMed && !isDev && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
        const mo = new ModalBuilder().setCustomId(`ffm_modal:sala:${matchId}`).setTitle('Enviar sala');
        mo.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_id').setLabel('ID da sala').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_pass').setLabel('Senha').setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(mo);
      }

      // ─── CANCELAR ───
      if (action === 'cancelar') {
        if (!isMed && !isDev && !isS && !isP) return i.reply({ content: '❌', flags: EPHEMERAL });
        const e = new EmbedBuilder().setTitle('⚠️ Confirmar cancelamento?').setColor('#ff5555')
          .setDescription('O match será cancelado e o mediador voltará pra fila.');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:cancelar_confirm:${matchId}`).setLabel('Sim, cancelar').setEmoji('✅').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`ffm:cancelar_abort:${matchId}`).setLabel('Não').setEmoji('❌').setStyle(ButtonStyle.Secondary),
        );
        return i.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
      }

      if (action === 'cancelar_confirm') {
        await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
        if (m.mediator_id) {
          await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null })
            .eq('guild_id', guild.id).eq('user_id', m.mediator_id);
        }
        await i.channel.setName('❌ cancelado').catch(() => {});
        await ffCleanupThread(i.channel);
        await i.channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Match cancelado').setColor('#ff5555').setTimestamp()] });
        setTimeout(() => i.channel.setArchived(true).catch(() => {}), 8000);
        return i.reply({ content: '✅ Cancelado.', flags: EPHEMERAL });
      }

      if (action === 'cancelar_abort') return i.reply({ content: '✅ Cancelamento abortado.', flags: EPHEMERAL });

      // ─── CHAMAR ANALISTA ───
      if (action === 'chamar_analista') {
        const cfgChk = await ffGetConfig(guild.id);
        const isMedChk = cfgChk?.mediator_role_id && i.member.roles.cache.has(cfgChk.mediator_role_id);
        const isOlhChk = cfgChk?.olhinho_role_id && i.member.roles.cache.has(cfgChk.olhinho_role_id);
        if (!isMedChk && !isOlhChk && !isS && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
        const next = await ffAnalystNext(guild.id);
        if (next) {
          await supabase.from('ff_analyst_queue').update({ status: 'busy', current_match_id: m.id }).eq('id', next.id);
        }
        const temAnalista = !!next;
        const e = new EmbedBuilder().setTitle('🔎 Análise Solicitada').setColor(temAnalista ? '#22c55e' : '#FF5555')
          .setDescription(temAnalista ? `**Analista:** <@${next.user_id}>\n\nEnvie replay, prints e motivos.` : '⚠️ Nenhum analista disponível.')
          .setTimestamp();
        if (temAnalista) {
          await i.channel.members.add(next.user_id).catch(() => {});
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffana:concluir:${m.id}`).setLabel('Análise Concluída').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ffana:wo:${m.id}`).setLabel('Aplicar W.O.').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
          );
          await i.channel.send({ content: `<@${next.user_id}>`, embeds: [e], components: [row] });
        } else await i.channel.send({ embeds: [e] });
        return i.reply({ content: temAnalista ? '✅ Analista chamado.' : '⚠️ Nenhum disponível.', flags: EPHEMERAL });
      }
      } finally { releaseMatch(); }
    }

    // ═══════════════════════════════════════════════════════════
    // FFPIXMED
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffpixmed') {
      if (action === 'thread_view') {
        const matchId = rest[0];
        const m = await ffGetMatch(matchId);
        if (!m) return i.reply({ content: '❌ Match não encontrado.', flags: EPHEMERAL });
        if (!m.mediator_id) return i.reply({ content: '⚠️ Sem mediador.', flags: EPHEMERAL });
        const pix = await ffGetMediatorPix(guild.id, m.mediator_id);
        if (!pix || !pix.pix_key) return i.reply({ content: `⚠️ Mediador <@${m.mediator_id}> não configurou PIX.`, flags: EPHEMERAL });
        const isS = await isAdmin(i.user, guild);
        const isMediator = i.user.id === m.mediator_id;
        const isPlayer = parseJson(m.players).includes(i.user.id);
        if (!isS && !isMediator && !isPlayer) return i.reply({ content: '❌ Só jogadores, mediador ou staff.', flags: EPHEMERAL });
        const e = new EmbedBuilder().setTitle('💳 PIX do Mediador').setColor('#22c55e')
          .setDescription(`**Match #${matchId}** — Mediador: <@${m.mediator_id}>`)
          .addFields(
            { name: '🔑 Chave', value: `\`\`\`\n${pix.pix_key}\n\`\`\`` },
            { name: '👤 Nome', value: pix.pix_name || '—', inline: true },
          ).setTimestamp();
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (action === 'config') {
        const cfg = await ffGetConfig(guild.id);
        const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
        const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        if (!hasMed && !hasOlh && !isO && !isS) return i.reply({ content: '❌ Só mediadores.', flags: EPHEMERAL });
        const existing = await ffGetMediatorPix(guild.id, i.user.id);
        const m = new ModalBuilder().setCustomId('ffpixmed_modal:set').setTitle(existing ? 'Editar meu PIX' : 'Configurar meu PIX');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setValue(existing?.pix_key || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome do titular').setStyle(TextInputStyle.Short).setValue(existing?.pix_name || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(existing?.pix_city || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Tipo (cpf/email/tel/aleatoria)').setStyle(TextInputStyle.Short).setValue(existing?.pix_type || 'aleatoria').setRequired(false)),
        );
        return i.showModal(m);
      }

      if (action === 'view') {
        const pix = await ffGetMediatorPix(guild.id, i.user.id);
        if (!pix) return i.reply({ content: '⚠️ Você ainda não configurou seu PIX.', flags: EPHEMERAL });
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('👁️ Meu PIX').setColor('#22c55e')
            .setDescription(`🔑 \`${pix.pix_key}\`\n\n👤 ${pix.pix_name}\n🏙️ ${pix.pix_city || '—'}`)
            .setTimestamp()],
          flags: EPHEMERAL,
        });
      }

      if (action === 'list') {
        const isS = await isAdmin(i.user, guild);
        if (!isS && !isDev) return i.reply({ content: '❌ Só staff.', flags: EPHEMERAL });
        const allPix = await ffGetAllMediatorPix(guild.id);
        if (!allPix.length) return i.reply({ content: '❌ Nenhum PIX cadastrado.', flags: EPHEMERAL });
        const e = new EmbedBuilder().setTitle('📋 PIX dos Mediadores').setColor('#22c55e')
          .setDescription(allPix.slice(0, 15).map(p => `**<@${p.user_id}>**\n> 🔑 \`${p.pix_key}\``).join('\n\n').substring(0, 4000))
          .setFooter({ text: `Total: ${allPix.length}` });
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (action === 'remove') {
        const pix = await ffGetMediatorPix(guild.id, i.user.id);
        if (!pix) return i.reply({ content: '⚠️ Sem PIX cadastrado.', flags: EPHEMERAL });
        await ffRemoveMediatorPix(guild.id, i.user.id);
        return i.reply({ content: '🗑️ PIX removido.', flags: EPHEMERAL });
      }

      if (action === 'post') {
        const isS = await isAdmin(i.user, guild);
        if (!isS && !isDev) return i.reply({ content: '❌ Só admin.', flags: EPHEMERAL });
        const p = await ffBuildMediatorPixPanel(guild.id);
        await channel.send(p).catch(() => {});
        await ffPatchConfig(guild.id, { pix_mediator_channel_id: channel.id });
        return i.reply({ content: `✅ Painel postado em ${channel}.`, flags: EPHEMERAL });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FFMED
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffmed') {
      const cfg = await ffGetConfig(guild.id);
      const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
      const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
      if (!hasMed && !isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });

      if (action === 'entrar') {
        const ok = await ffMediatorJoin(guild.id, i.user.id);
        if (!ok) return i.reply({ content: '⚠️ Você já está na fila.', flags: EPHEMERAL });
        await i.reply({ content: '✅ Você entrou na fila.', flags: EPHEMERAL });
        await i.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
        return;
      }
      if (action === 'sair') {
        const ok = await ffMediatorLeave(guild.id, i.user.id);
        if (!ok) return i.reply({ content: '⚠️ Você está em partida.', flags: EPHEMERAL });
        await i.reply({ content: '🚪 Você saiu da fila.', flags: EPHEMERAL });
        await i.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
        return;
      }
      if (action === 'receita') {
        const { data: all } = await supabase.from('ff_mediator_earnings')
          .select('*').eq('guild_id', guild.id).eq('mediator_id', i.user.id);
        const now = Date.now(), day = 86400000;
        const sum = (a) => a.reduce((x, y) => x + Number(y.amount || 0), 0);
        const hoje = (all || []).filter(e => now - new Date(e.created_at).getTime() < day);
        const sem = (all || []).filter(e => now - new Date(e.created_at).getTime() < 7 * day);
        const mes = (all || []).filter(e => now - new Date(e.created_at).getTime() < 30 * day);
        const e = new EmbedBuilder().setTitle('💰 Minha Receita').setColor('#22c55e')
          .setThumbnail(i.user.displayAvatarURL())
          .addFields(
            { name: '📅 Hoje', value: `R$ ${sum(hoje).toFixed(2)} • ${hoje.length}`, inline: true },
            { name: '📆 Semana', value: `R$ ${sum(sem).toFixed(2)} • ${sem.length}`, inline: true },
            { name: '🗓️ Mês', value: `R$ ${sum(mes).toFixed(2)} • ${mes.length}`, inline: true },
            { name: '💰 Total', value: `R$ ${sum(all).toFixed(2)} • ${(all || []).length}`, inline: true },
          ).setTimestamp();
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FFANA
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffana') {
      const cfg = await ffGetConfig(guild.id);
      const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
      const hasAna = cfg?.analyst_role_id && i.member.roles.cache.has(cfg.analyst_role_id);
      const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
      if (!hasAna && !hasOlh && !isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });

      if (action === 'entrar') {
        const ok = await ffAnalystJoin(guild.id, i.user.id);
        if (!ok) return i.reply({ content: '⚠️ Você já está na fila.', flags: EPHEMERAL });
        await i.reply({ content: '✅ Você entrou na fila.', flags: EPHEMERAL });
        await i.message.edit(await ffBuildAnalystPanel(guild.id)).catch(() => {});
        return;
      }
      if (action === 'sair') {
        const ok = await ffAnalystLeave(guild.id, i.user.id);
        if (!ok) return i.reply({ content: '⚠️ Você está em análise.', flags: EPHEMERAL });
        await i.reply({ content: '🚪 Você saiu.', flags: EPHEMERAL });
        await i.message.edit(await ffBuildAnalystPanel(guild.id)).catch(() => {});
        return;
      }
      if (action === 'meu_historico') {
        const { data: a } = await supabase.from('ff_analyst_queue')
          .select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        const e = new EmbedBuilder().setTitle('📊 Minhas Análises').setColor('#00AAFF')
          .setThumbnail(i.user.displayAvatarURL())
          .addFields(
            { name: '🔎 Total', value: `${a?.analyses_total || 0}`, inline: true },
            { name: '📌 Status', value: a?.status === 'busy' ? 'Em análise' : a ? 'Disponível' : 'Fora', inline: true },
          );
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }
      if (action === 'concluir') {
        const matchId = rest[0];
        await ffAnalystRelease(guild.id, i.user.id, true);
        return i.update({ content: `✅ Análise #${matchId} concluída.`, embeds: [], components: [] });
      }
      if (action === 'wo') {
        const matchId = rest[0];
        await ffAnalystRelease(guild.id, i.user.id, true);
        return i.update({ content: `⚠️ W.O. aplicado em #${matchId}.`, embeds: [], components: [] });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FFBL
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffbl') {
      const cfg = await ffGetConfig(guild.id);
      const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
      const hasAna = cfg?.analyst_role_id && i.member.roles.cache.has(cfg.analyst_role_id);
      const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
      if (!hasAna && !hasMed && !isO && !isS) return i.reply({ content: '❌ Só staff.', flags: EPHEMERAL });

      if (action === 'list') return i.reply(await ffBuildBlacklistEmbed(guild.id));
      if (action === 'refresh') return i.update(await ffBuildBlacklistEmbed(guild.id));
      if (action === 'check') {
        const m = new ModalBuilder().setCustomId('ffbl_modal:check').setTitle('Verificar BL');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('query').setLabel('Discord ID ou FF ID').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'add') {
        const m = new ModalBuilder().setCustomId('ffbl_modal:add').setTitle('Adicionar à Blacklist');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ff_id').setLabel('ID Free Fire').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence').setLabel('Link de provas (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
        );
        return i.showModal(m);
      }
      if (action === 'remove') {
        const { data } = await supabase.from('ff_blacklist')
          .select('*').eq('guild_id', guild.id).order('created_at', { ascending: false });
        if (!data?.length) return i.reply({ content: '📋 Blacklist vazia.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId('ffbl:remove_pick').setPlaceholder('Remover');
        for (const b of data.slice(0, 25)) {
          menu.addOptions({ label: `<@${b.discord_id || b.user_id}> • FF: ${b.ff_id || '—'}`.slice(0, 90), value: String(b.id) });
        }
        return i.reply({ embeds: [new EmbedBuilder().setTitle('➖ Remover da BL')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // COINSHOP
    // ═══════════════════════════════════════════════════════════
    if (ns === 'coinshop') {
      if (action === 'cancel') return i.update({ content: '❌ Cancelado.', embeds: [], components: [] });
      if (action === 'saldo') {
        const { data: p } = await supabase.from('ff_players')
          .select('coins, wins, losses').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        const { count: compras } = await supabase.from('ff_coin_purchases')
          .select('*', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('user_id', i.user.id);
        const e = new EmbedBuilder().setTitle('💰 Meu Saldo').setColor('#FFD700')
          .setThumbnail(i.user.displayAvatarURL())
          .addFields(
            { name: '🪙 Coins', value: `**${Number(p?.coins || 0)}**`, inline: true },
            { name: '🏆 Wins', value: `${p?.wins || 0}`, inline: true },
            { name: '❌ Losses', value: `${p?.losses || 0}`, inline: true },
            { name: '🛒 Compras', value: `${compras || 0}`, inline: true },
          ).setTimestamp();
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }
      if (action === 'top') {
        const { data: top } = await supabase.from('ff_players')
          .select('user_id, coins').eq('guild_id', guild.id).order('coins', { ascending: false }).limit(10);
        const e = new EmbedBuilder().setTitle('🏆 Top 10 Mais Ricos').setColor('#FFD700')
          .setDescription(top?.length ? top.map((p, idx) => `${['🥇', '🥈', '🥉'][idx] || `**${idx + 1}º**`} <@${p.user_id}> — 🪙 **${Number(p.coins || 0)}**`).join('\n') : 'Sem dados.');
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }
      if (action === 'confirm') {
        const itemId = rest[0];
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', itemId).maybeSingle();
        if (!item || !item.active) return i.reply({ content: '❌ Item indisponível.', flags: EPHEMERAL });
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        const saldo = Number(p?.coins || 0);
        if (saldo < item.price) return i.reply({ content: '❌ Saldo insuficiente.', flags: EPHEMERAL });

        if (item.type === 'role' && item.role_id) {
          const mem = await guild.members.fetch(i.user.id).catch(() => null);
          if (!mem) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (mem.roles.cache.has(item.role_id)) return i.reply({ content: '⚠️ Você já tem este cargo.', flags: EPHEMERAL });
          const r = guild.roles.cache.get(item.role_id);
          if (!r) return i.reply({ content: '❌ Cargo não existe mais.', flags: EPHEMERAL });
          const bh = guild.members.me.roles.highest;
          if (r.position >= bh.position) return i.reply({ content: '❌ Não consigo dar este cargo.', flags: EPHEMERAL });
          try { await mem.roles.add(r, 'Compra na loja de coins'); }
          catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
        }

        const novoSaldo = saldo - item.price;
        await supabase.from('ff_players').update({ coins: novoSaldo }).eq('guild_id', guild.id).eq('user_id', i.user.id);
        try { await supabase.from('ff_coin_purchases').insert({ guild_id: guild.id, user_id: i.user.id, shop_id: item.id, item_name: item.name, price: item.price }); } catch {}
        await logCoins(guild, i.user.id, -item.price, `Compra: ${item.name}`, null);
        try { const u = await client.users.fetch(i.user.id); await u.send(`🪙 Compra realizada!\n> **${item.emoji || '🎁'} ${item.name}**\n> 💰 Novo saldo: **${novoSaldo}**`).catch(() => {}); } catch {}
        return i.update({
          embeds: [new EmbedBuilder().setTitle('✅ Compra realizada!').setColor('#22c55e').setDescription(`**${item.emoji || '🎁'} ${item.name}**\n\n💰 Saldo: **${novoSaldo}** coins`)],
          components: [],
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FFCFG — painel de config
    // ═══════════════════════════════════════════════════════════
    if (ns === 'ffcfg') {
      const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
      if (!isO && !isS && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });

      if (action === 'back') return i.update(await ffConfigPanel(guild.id));
      if (action === 'embeds') return i.update(await ffPanelEmbedsManuais(guild.id));

      if (action === 'panel') {
        const tt = rest[0];
        if (tt === 'canais') return i.update(await ffPanelCanais(guild.id));
        if (tt === 'cargos') return i.update(await ffPanelCargos(guild.id));
        if (tt === 'pix') return i.update(await ffPanelPix(guild.id));
        if (tt === 'apostas') return i.update(await ffPanelApostas(guild.id));
        if (tt === 'valores') return i.update(await ffPanelValores(guild.id));
        if (tt === 'mediadores') return i.update(await ffPanelMediadores(guild.id));
        if (tt === 'automacoes') return i.update(await ffPanelAutomacoes(guild.id));
        if (tt === 'mensagens') return i.update(await ffPanelAutoMensagens(guild.id));
        if (tt === 'loja_coins') return i.update(await ffPanelLojaCoins(guild.id));
        if (tt === 'embeds') return i.update(await ffPanelEmbedsManuais(guild.id));
      }

      if (action === 'toggle') {
        const f = rest[0];
        const cfg = await ffGetConfig(guild.id);
        const nv = !cfg?.[f];
        await ffPatchConfig(guild.id, { [f]: nv });
        if (['auto_post_ranking', 'auto_post_blacklist', 'auto_post_regras'].includes(f)) return i.update(await ffPanelAutomacoes(guild.id));
        if (['auto_thread', 'require_mediator_confirm', 'taxa_extra_ativo'].includes(f)) return i.update(await ffPanelApostas(guild.id));
      }

      if (action === 'set') {
        const f = rest[0];
        if (f === 'pix') {
          const cfg = await ffGetConfig(guild.id);
          const m = new ModalBuilder().setCustomId('ffcfg_modal:pix').setTitle('Pix FF');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (f.endsWith('_channel_id')) {
          const m = new ModalBuilder().setCustomId(`ffcfg_modal:channel:${f}`).setTitle('Canal');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('ID ou #nome do canal').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (f.endsWith('_role_id')) {
          const m = new ModalBuilder().setCustomId(`ffcfg_modal:role:${f}`).setTitle('Cargo');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('ID ou @nome do cargo').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (['valor_minimo', 'valor_maximo', 'mediator_fee', 'coin_prize', 'taxa_extra'].includes(f)) {
          const cfg = await ffGetConfig(guild.id);
          const m = new ModalBuilder().setCustomId(`ffcfg_modal:number:${f}`).setTitle('Valor');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('Valor numérico').setStyle(TextInputStyle.Short).setValue(String(cfg?.[f] ?? 0)).setRequired(true)
          ));
          return i.showModal(m);
        }
      }


      if (action === 'msg_add') {
        const list = await ffGetAutoMessages(guild.id);
        if (list.length >= AUTO_MESSAGE_LIMIT) return i.reply({ content: `❌ Limite de ${AUTO_MESSAGE_LIMIT} auto mensagens atingido.`, flags: EPHEMERAL });
        const channels = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages)).values()].slice(0, 25);
        if (!channels.length) return i.reply({ content: '❌ Não encontrei canais de texto em que o bot possa enviar mensagens.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:msg_add_channel').setPlaceholder('Escolha o canal da auto mensagem');
        for (const channel of channels) menu.addOptions({ label: `#${channel.name}`.slice(0, 100), value: channel.id, description: `Canal ID: ${channel.id}`.slice(0, 100) });
        return i.reply({ content: 'Escolha o canal onde a auto mensagem será enviada:', components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
      if (['msg_edit', 'msg_toggle', 'msg_delete'].includes(action)) {
        const list = await ffGetAutoMessages(guild.id);
        if (!list.length) return i.reply({ content: 'Não há auto mensagens cadastradas.', flags: EPHEMERAL });
        const page = Math.max(0, Math.min(Math.ceil(list.length / 25) - 1, Number(rest[0] || 0) || 0));
        const menu = new StringSelectMenuBuilder()
          .setCustomId(`ffcfg:${action}_pick:${page}`)
          .setPlaceholder(action === 'msg_edit' ? 'Escolha para editar' : action === 'msg_toggle' ? 'Escolha para ativar/desativar' : 'Escolha para excluir');
        for (const item of list.slice(page * 25, page * 25 + 25)) {
          menu.addOptions({
            label: `${item.enabled ? 'Ativa' : 'Pausada'} · ${item.message_type === 'embed' ? 'Embed' : 'Say'} · ${String(item.content || '').replace(/\s+/g, ' ').slice(0, 45)}`.slice(0, 100),
            description: `Canal ${item.channel_id} · ${item.interval_minutes} min`,
            value: String(item.id),
          });
        }
        const rows = [new ActionRowBuilder().addComponents(menu)];
        if (list.length > 25) rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffcfg:${action}:${Math.max(0, page - 1)}`).setLabel('Página anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`ffcfg:${action}:${Math.min(Math.ceil(list.length / 25) - 1, page + 1)}`).setLabel('Próxima página').setStyle(ButtonStyle.Secondary).setDisabled(page >= Math.ceil(list.length / 25) - 1),
        ));
        return i.reply({ embeds: [new EmbedBuilder().setTitle(`💬 Gerenciar auto mensagens (${page + 1}/${Math.ceil(list.length / 25)})`).setColor('#5865F2')], components: rows, flags: EPHEMERAL });
      }
      if (action === 'add_valor') {
        const m = new ModalBuilder().setCustomId('ffcfg_modal:add_valor').setTitle('Adicionar valor');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('v').setLabel('Ex: 1.50').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'del_valor') {
        const cfg = await ffGetConfig(guild.id);
        const vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) return i.reply({ content: '❌ Nenhum valor cadastrado.', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId('ffcfg_modal:delete_valor').setTitle('Remover valor de aposta');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('v').setLabel('Valor exato (ex.: 1,50)').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'reset_valores') {
        await ffPatchConfig(guild.id, { value_options: FF_DEFAULT_VALUES });
        return i.update(await ffPanelValores(guild.id));
      }

      if (action === 'embed_create') {
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_pick_format').setPlaceholder('📢 Escolha a modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.reply({ embeds: [new EmbedBuilder().setTitle('➕ Criar embed manual').setColor('#f1c40f').setDescription('Escolha a modalidade; depois selecione o canal e o valor.')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
      if (action === 'embed_edit' || action === 'embed_delete') {
        const { data: bets, error } = await supabase.from('ff_bets')
          .select('id,format,value,channel_id,message_id').eq('guild_id', guild.id).not('message_id', 'is', null)
          .order('created_at', { ascending: false }).limit(25);
        if (error) return i.reply({ content: `Falha ao carregar embeds: ${error.message}`, flags: EPHEMERAL });
        if (!bets?.length) return i.reply({ content: 'Nenhum embed publicado para gerenciar.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:${action}_pick`).setPlaceholder(action === 'embed_edit' ? 'Escolha o embed para editar' : 'Escolha o embed para excluir');
        for (const b of bets) menu.addOptions({ label: `${b.format} · R$ ${Number(b.value || 0).toFixed(2)}`.slice(0, 100), description: `Canal ${b.channel_id}`.slice(0, 100), value: String(b.id) });
        return i.reply({ embeds: [new EmbedBuilder().setTitle(action === 'embed_edit' ? '✏️ Editar embed' : '🗑️ Excluir embed').setColor('#f1c40f')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
      if (action === 'postar') {
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_pick_format').setPlaceholder('📢 Modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('📢 Postar embed').setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: EPHEMERAL,
        });
      }
      if (action === 'postar_auto') {
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_auto_pick_channel').setPlaceholder('📁 Canal');
        const chs = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)).values()].slice(0, 25);
        for (const ch of chs) menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id });
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('⚡ Postar em massa').setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: EPHEMERAL,
        });
      }
      if (action === 'postar_por_canal') {
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:porcanal_pick_canal').setPlaceholder('📁 Canal');
        const chs = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)).values()].slice(0, 25);
        for (const ch of chs) menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id });
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('📁 Postar por canal').setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: EPHEMERAL,
        });
      }

      if (action === 'postar_pix') {
        const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_pix').setTitle('Postar PIX');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cid').setLabel('ID/#canal').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'postar_mediadores') {
        const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_med').setTitle('Postar painel mediadores');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cid').setLabel('ID/#canal').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }

      if (action === 'remove_all_meds') {
        await supabase.from('ff_mediator_queue').delete().eq('guild_id', guild.id);
        return i.reply({ content: '🗑️ Fila limpa.', flags: EPHEMERAL });
      }
      if (action === 'med_receitas') {
        const meds = await ffGetMediatorQueue(guild.id);
        meds.sort((a, b) => Number(b.earnings_total || 0) - Number(a.earnings_total || 0));
        const e = new EmbedBuilder().setTitle('💰 Receitas').setColor('#FFD700');
        for (const m of meds.slice(0, 20)) e.addFields({ name: `<@${m.user_id}>`, value: `R$ ${Number(m.earnings_total || 0).toFixed(2)} • ${m.matches_total || 0} partidas`, inline: true });
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (action === 'mp_config') {
        const cfg = await ffGetConfig(guild.id);
        const m = new ModalBuilder().setCustomId('ffcfg_modal:mp_token').setTitle('Configurar Mercado Pago');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mp_token').setLabel('Access Token').setStyle(TextInputStyle.Short).setPlaceholder('APP_USR-...').setValue(cfg?.mp_access_token || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mp_public_key').setLabel('Public Key (opcional)').setStyle(TextInputStyle.Short).setValue(cfg?.mp_public_key || '').setRequired(false)),
        );
        return i.showModal(m);
      }
      if (action === 'mp_test') {
        await i.deferReply({ flags: EPHEMERAL });
        const cfg = await ffGetConfig(guild.id);
        if (!cfg?.mp_access_token) return i.editReply({ content: '❌ Sem token.' });
        const test = await criarPixMercadoPago(0.01, `T${Date.now()}`, 'Teste', cfg.mp_access_token);
        if (test?.ok) return i.editReply({ content: `✅ MP OK!\n> 🆔 \`${test.payment_id}\`` });
        return i.editReply({ content: `❌ ${test?.error || 'erro'}` });
      }
      if (action === 'mp_remove') {
        await ffPatchConfig(guild.id, { mp_access_token: null, mp_public_key: null });
        return i.update(await ffPanelPix(guild.id));
      }

      if (action === 'coin_add') {
        const m = new ModalBuilder().setCustomId('ffcfg_modal:coin_add').setTitle('Adicionar item');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço em coins').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue('🎁').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
        );
        return i.showModal(m);
      }
      if (action === 'coin_edit') {
        const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id);
        if (!items?.length) return i.reply({ content: '❌ Nenhum item.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_edit_pick').setPlaceholder('Editar');
        for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name} — ${x.price}`.slice(0, 90), value: String(x.id) });
        return i.reply({ embeds: [new EmbedBuilder().setTitle('✏️ Editar')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
      if (action === 'coin_del') {
        const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id);
        if (!items?.length) return i.reply({ content: '❌ Nenhum item.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_del_pick').setPlaceholder('Remover');
        for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name}`.slice(0, 90), value: String(x.id) });
        return i.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Remover')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
      if (action === 'coin_defaults') {
        let added = 0;
        for (const d of FF_COIN_DEFAULTS) {
          const r = guild.roles.cache.find(x => x.name === d.role_name);
          if (!r) continue;
          const { data: ex } = await supabase.from('ff_coin_shop').select('id').eq('guild_id', guild.id).eq('name', d.name).maybeSingle();
          if (ex) continue;
          try {
            await supabase.from('ff_coin_shop').insert({ guild_id: guild.id, name: d.name, emoji: d.emoji, price: d.price, type: 'role', role_id: r.id, description: `${d.price} coins` });
            added++;
          } catch {}
        }
        return i.reply({ content: `✅ ${added} itens adicionados.`, flags: EPHEMERAL });
      }
      if (action === 'coin_post') {
        const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id).eq('active', true).order('price');
        if (!items?.length) return i.reply({ content: '❌ Nenhum item.', flags: EPHEMERAL });
        const e = new EmbedBuilder().setTitle('🪙 Loja de Coins').setColor('#FFD700').setDescription('Compre cargos com suas coins!').setTimestamp();
        for (const x of items) e.addFields({ name: `${x.emoji || '🎁'} ${x.name}`, value: `💰 **${x.price}**`, inline: true });
        await channel.send({ embeds: [e], components: await buildCoinShopComponents(guild.id) });
        return i.reply({ content: '✅ Painel postado.', flags: EPHEMERAL });
      }
    }

  } catch (err) {
    console.error('❌ [APOSTAS-HANDLER]', err);
    try { await logError('apostasInteraction', err, i.user?.id, i.guild?.id); } catch {}
    try {
      if (i.isRepliable() && !i.replied && !i.deferred) {
        await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
      } else if (i.isRepliable() && i.deferred && !i.replied) {
        await i.editReply({ content: `❌ A ação falhou: ${String(err.message || err).slice(0, 500)}` }).catch(() => {});
      }
    } catch {}
  }
});

// ═══════════════════════════════════════════════════════════
// HANDLER DE MODAIS
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (!i.isModalSubmit()) return;
  if (!i.customId) return;
  try {
    const cid = i.customId;
    const guild = i.guild;
    const [ns, action, ...rest] = cid.split(':');

    // ─── FFPIXMED MODAL ───
    if (ns === 'ffpixmed_modal' && action === 'set') {
      const key = i.fields.getTextInputValue('key').trim();
      const name = i.fields.getTextInputValue('name').trim();
      const city = i.fields.getTextInputValue('city').trim() || null;
      const type = i.fields.getTextInputValue('type').trim() || 'aleatoria';
      const result = await ffSetMediatorPix(guild.id, i.user.id, key, name, city, type);
      if (!result) return i.reply({ content: '❌ Falha ao salvar.', flags: EPHEMERAL });
      return i.reply({
        embeds: [new EmbedBuilder().setTitle('✅ PIX salvo!').setColor('#22c55e')
          .setDescription(`Seu PIX foi configurado com sucesso.\n\n> 🔑 \`${key}\`\n> 👤 ${name}`)
          .setTimestamp()],
        flags: EPHEMERAL,
      });
    }

    // ─── FFM PIX MODAL ───
    if (ns === 'ffm_modal' && action === 'pix') {
      const matchId = rest[0];
      const key = i.fields.getTextInputValue('key').trim();
      const name = i.fields.getTextInputValue('name').trim();
      const city = i.fields.getTextInputValue('city').trim();
      await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
      await i.reply({ content: '✅ PIX salvo.', flags: EPHEMERAL });

      const m = await ffGetMatch(matchId);
      if (m) {
        await ffCleanupThread(i.channel);
        const players = parseJson(m.players);
        const cfg = await ffGetConfig(guild.id);
        const payPP = ffCalcPlayerPay(m.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
        const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor('#22c55e').setDescription('Regras confirmadas!')
          .addFields(
            { name: '🎮', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
            { name: '💵 Valor', value: `R$ ${Number(m.value || 0).toFixed(2)}`, inline: true },
            { name: '💵 Taxa', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true },
            { name: '💰 Total', value: `**R$ ${payPP.toFixed(2)}**`, inline: true },
            { name: '📌 Etapa', value: '**2/4** • Pagamento', inline: false },
          );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );
        await i.channel.send({
          content: `${players.map(p => `<@${p}>`).join(' ')}${m.mediator_id ? ` <@${m.mediator_id}>` : ''}`,
          embeds: [e],
          components: [row],
        });
      }
      return;
    }

    // ─── FFM SALA MODAL ───
    if (ns === 'ffm_modal' && action === 'sala') {
      const matchId = rest[0];
      const roomId = i.fields.getTextInputValue('room_id').trim();
      const roomPass = i.fields.getTextInputValue('room_pass').trim();
      const m = await ffGetMatch(matchId);
      const players = parseJson(m?.players);
      const e = new EmbedBuilder().setTitle('🎮 SALA CRIADA').setColor('#22c55e')
        .addFields(
          { name: '🏠 ID da sala', value: `\`\`\`${roomId}\`\`\`` },
          { name: '🔑 Senha', value: `\`\`\`${roomPass}\`\`\`` },
          { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
        ).setTimestamp();
      await i.reply({ content: players.map(p => `<@${p}>`).join(' '), embeds: [e] });
      return;
    }

    // ─── FFBL CHECK ───
    if (ns === 'ffbl_modal' && action === 'check') {
      const q = i.fields.getTextInputValue('query').trim().replace(/[<@!>]/g, '');
      await i.deferReply({ flags: EPHEMERAL });
      const { data } = await supabase.from('ff_blacklist').select('*')
        .eq('guild_id', guild.id)
        .or(`discord_id.eq.${q},user_id.eq.${q},ff_id.eq.${q}`);
      if (!data?.length) {
        return i.editReply({
          embeds: [new EmbedBuilder().setTitle('✅ Não está na BL').setColor('#22c55e').setDescription(`Consulta: \`${q}\``)],
        });
      }
      const b = data[0];
      return i.editReply({
        embeds: [new EmbedBuilder().setTitle('🚫 NA BLACKLIST').setColor('#FF5555')
          .setDescription(`> 👤 <@${b.discord_id || b.user_id}>\n> 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}`)
          .setTimestamp()],
      });
    }

    // ─── FFBL ADD ───
    if (ns === 'ffbl_modal' && action === 'add') {
      const discordId = i.fields.getTextInputValue('discord_id').trim().replace(/[<@!>]/g, '');
      const ffId = i.fields.getTextInputValue('ff_id').trim();
      const reason = i.fields.getTextInputValue('reason').trim();
      const evidence = i.fields.getTextInputValue('evidence').trim() || null;
      if (!/^\d+$/.test(discordId)) return i.reply({ content: '❌ ID Discord inválido.', flags: EPHEMERAL });
      await supabase.from('ff_blacklist').insert({
        guild_id: guild.id, user_id: discordId, discord_id: discordId,
        ff_id: ffId, reason, evidence, added_by: i.user.id,
      });
      return i.reply({ content: `🚫 <@${discordId}> adicionado à blacklist.`, flags: EPHEMERAL });
    }

    // ─── FFCFG MODAIS ───
    if (ns === 'ffcfg_modal') {
      const type = action, field = rest[0];


      if (action === 'embed_edit') {
        const betId = rest[0];
        const rawFormat = i.fields.getTextInputValue('format').trim();
        const fmt = FF_FORMATS.find(f => f.id.toLowerCase() === rawFormat.toLowerCase() || f.label.toLowerCase() === rawFormat.toLowerCase());
        const value = Number(i.fields.getTextInputValue('value').trim().replace(',', '.'));
        if (!fmt) return i.reply({ content: 'Modalidade inválida. Use o ID ou nome exibido na lista de modalidades.', flags: EPHEMERAL });
        if (!Number.isFinite(value) || value <= 0 || value > 1000000) return i.reply({ content: 'Valor inválido. Informe um número maior que zero.', flags: EPHEMERAL });
        const { data: bet, error: loadError } = await supabase.from('ff_bets').select('*').eq('id', betId).eq('guild_id', guild.id).maybeSingle();
        if (loadError || !bet) return i.reply({ content: 'Não consegui localizar esse embed.', flags: EPHEMERAL });
        const { error: updateError } = await supabase.from('ff_bets').update({ format: fmt.label, value }).eq('id', betId).eq('guild_id', guild.id);
        if (updateError) return i.reply({ content: `Falha ao salvar: ${updateError.message}`, flags: EPHEMERAL });
        const cfg = await ffGetConfig(guild.id);
        const channel = guild.channels.cache.get(bet.channel_id) || await guild.channels.fetch(bet.channel_id).catch(() => null);
        const message = channel && bet.message_id ? await channel.messages.fetch(bet.message_id).catch(() => null) : null;
        if (message) {
          const updatedBet = { ...bet, format: fmt.label, value };
          await message.edit({ embeds: [ffBuildBetEmbed(updatedBet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] }).catch(e => console.warn('[EMBED-EDIT] mensagem:', e.message));
        }
        return i.reply({ content: `Embed atualizado para **${fmt.label} — R$ ${value.toFixed(2)}**.`, flags: EPHEMERAL });
      }
      if (action === 'auto_add' || action === 'auto_edit') {
        const channelId = i.fields.getTextInputValue('channel_id').trim().replace(/[<#>]/g, '');
        const messageType = i.fields.getTextInputValue('type').trim().toLowerCase();
        const content = i.fields.getTextInputValue('content').trim();
        const roleRaw = i.fields.getTextInputValue('role_id').trim().replace(/[<@&>]/g, '');
        const interval = Number(i.fields.getTextInputValue('interval').trim());
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased?.() || !channel.send) return i.reply({ content: '❌ Canal inválido. Use o ID de um canal de texto deste servidor.', flags: EPHEMERAL });
        if (!['say', 'embed'].includes(messageType)) return i.reply({ content: '❌ Tipo inválido. Use exatamente `say` ou `embed`.', flags: EPHEMERAL });
        if (!content || content.length > (messageType === 'say' ? 2000 : 4000)) return i.reply({ content: '❌ Mensagem vazia ou longa demais.', flags: EPHEMERAL });
        if (!Number.isInteger(interval) || interval < AUTO_MESSAGE_MIN_INTERVAL || interval > 525600) return i.reply({ content: `❌ Intervalo deve ser um número inteiro entre ${AUTO_MESSAGE_MIN_INTERVAL} e 525600 minutos.`, flags: EPHEMERAL });
        let roleId = null;
        if (roleRaw) {
          roleId = roleRaw;
          if (!guild.roles.cache.has(roleId)) return i.reply({ content: '❌ Cargo não encontrado neste servidor.', flags: EPHEMERAL });
        }
        const botMember = guild.members.me;
        if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages)) {
          return i.reply({ content: '❌ O bot precisa de permissões para ver e enviar mensagens nesse canal.', flags: EPHEMERAL });
        }
        const patch = {
          guild_id: guild.id, channel_id: channel.id, message_type: messageType,
          content, role_id: roleId, interval_minutes: interval, enabled: true,
          next_run_at: new Date(Date.now() + interval * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        };
        let result;
        if (action === 'auto_edit') {
          const itemId = rest[0];
          result = await supabase.from('ff_auto_messages').update(patch).eq('id', itemId).eq('guild_id', guild.id).select('id').maybeSingle();
        } else {
          const current = await ffGetAutoMessages(guild.id);
          if (current.length >= AUTO_MESSAGE_LIMIT) return i.reply({ content: `❌ Limite de ${AUTO_MESSAGE_LIMIT} auto mensagens atingido.`, flags: EPHEMERAL });
          result = await supabase.from('ff_auto_messages').insert(patch).select('id').single();
        }
        if (result.error) return i.reply({ content: `❌ Não consegui salvar. Verifique a migração SQL. ${result.error.message}`, flags: EPHEMERAL });
        return i.reply({ ...(await ffPanelAutoMensagens(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'channel') {
        const v = i.fields.getTextInputValue('v').trim();
        const ch = resolveChannel(guild, v);
        if (!ch) return i.reply({ content: `❌ Canal não encontrado: \`${v}\``, flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { [field]: ch.id });
        return i.reply({ ...(await ffPanelCanais(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'role') {
        const v = i.fields.getTextInputValue('v').trim();
        const r = resolveRole(guild, v);
        if (!r) return i.reply({ content: `❌ Cargo não encontrado: \`${v}\``, flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { [field]: r.id });
        return i.reply({ ...(await ffPanelCargos(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'number') {
        const raw = i.fields.getTextInputValue('v').trim().replace(',', '.');
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0 || v > 1000000) return i.reply({ content: '❌ Informe um número válido entre 0 e 1.000.000.', flags: EPHEMERAL });
        if (field === 'valor_minimo' && v <= 0) return i.reply({ content: '❌ O valor mínimo precisa ser maior que zero.', flags: EPHEMERAL });
        const current = await ffGetConfig(guild.id);
        if (field === 'valor_minimo' && v > Number(current?.valor_maximo ?? 1000)) return i.reply({ content: '❌ O valor mínimo não pode ser maior que o máximo atual.', flags: EPHEMERAL });
        if (field === 'valor_maximo' && v < Number(current?.valor_minimo ?? 0.50)) return i.reply({ content: '❌ O valor máximo não pode ser menor que o mínimo atual.', flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { [field]: v });
        return i.reply({ ...(await ffPanelApostas(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'pix') {
        const key = i.fields.getTextInputValue('key').trim();
        const name = i.fields.getTextInputValue('name').trim();
        const city = i.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        return i.reply({ ...(await ffPanelPix(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'mp_token') {
        const tk = i.fields.getTextInputValue('mp_token').trim();
        const pk = i.fields.getTextInputValue('mp_public_key')?.trim() || null;
        if (!tk.startsWith('APP_USR-') && !tk.startsWith('TEST-')) return i.reply({ content: '❌ Token inválido.', flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { mp_access_token: tk, mp_public_key: pk });
        return i.reply({ content: `✅ MP configurado!\n> 🔑 \`${maskToken(tk)}\``, flags: EPHEMERAL });
      }

      if (type === 'delete_valor') {
        const raw = i.fields.getTextInputValue('v').trim().replace(',', '.');
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0) return i.reply({ content: '❌ Valor inválido.', flags: EPHEMERAL });
        const cfg = await ffGetConfig(guild.id);
        const vals = Array.isArray(cfg?.value_options) ? [...cfg.value_options] : [];
        const target = num.toFixed(2);
        const next = vals.filter(x => Number(x).toFixed(2) !== target);
        if (next.length === vals.length) return i.reply({ content: `❌ O valor R$ ${target} não está cadastrado.`, flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { value_options: next });
        return i.reply({ ...(await ffPanelValores(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'add_valor') {
        const v = i.fields.getTextInputValue('v').replace(',', '.').trim();
        const num = Number(v);
        if (!Number.isFinite(num) || num <= 0 || num > 1000000) return i.reply({ content: '❌ Valor inválido. Informe um valor entre R$ 0,01 e R$ 1.000.000,00.', flags: EPHEMERAL });
        const cfg = await ffGetConfig(guild.id);
        const vals = Array.isArray(cfg?.value_options) ? [...cfg.value_options] : [];
        const fmtd = num.toFixed(2);
        if (vals.some(x => Number(x).toFixed(2) === fmtd)) return i.reply({ content: '❌ Esse valor já está cadastrado.', flags: EPHEMERAL });
        if (vals.length >= 100) return i.reply({ content: '❌ Limite de 100 valores de aposta atingido. Remova um valor antes de adicionar outro.', flags: EPHEMERAL });
        vals.push(fmtd);
        vals.sort((a, b) => Number(a) - Number(b));
        await ffPatchConfig(guild.id, { value_options: vals });
        return i.reply({ ...(await ffPanelValores(guild.id)), flags: EPHEMERAL });
      }
      if (type === 'postar_pix') {
        const ch = guild.channels.cache.get(i.fields.getTextInputValue('cid').trim());
        if (!ch) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { pix_channel_id: ch.id });
        const cfg = await ffGetConfig(guild.id);
        const e = new EmbedBuilder().setTitle('💳 Pagamento PIX').setColor('#22c55e')
          .addFields(
            { name: '🔑 Chave', value: cfg?.pix_key ? `\`${cfg.pix_key}\`` : '*não configurado*' },
            { name: '👤 Nome', value: cfg?.pix_name || '—', inline: true },
            { name: '🏙️ Cidade', value: cfg?.pix_city || '—', inline: true },
          ).setTimestamp();
        await ch.send({ embeds: [e] }).catch(() => {});
        return i.reply({ content: `✅ PIX postado em ${ch}.`, flags: EPHEMERAL });
      }
      if (type === 'postar_med') {
        const ch = guild.channels.cache.get(i.fields.getTextInputValue('cid').trim());
        if (!ch) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
        await ch.send(await ffBuildMediatorPanel(guild.id));
        return i.reply({ content: `✅ Postado em ${ch}.`, flags: EPHEMERAL });
      }
      if (type === 'coin_add') {
        const name = i.fields.getTextInputValue('name').trim();
        const price = parseInt(i.fields.getTextInputValue('price'));
        const emoji = i.fields.getTextInputValue('emoji').trim() || '🎁';
        const description = i.fields.getTextInputValue('description').trim() || null;
        const role_id = i.fields.getTextInputValue('role_id').trim() || null;
        if (isNaN(price) || price <= 0) return i.reply({ content: '❌ Preço inválido.', flags: EPHEMERAL });
        await supabase.from('ff_coin_shop').insert({
          guild_id: guild.id, name, price, emoji, description, role_id,
          type: role_id ? 'role' : 'custom', stock: -1, active: true,
        });
        return i.reply({ ...(await ffPanelLojaCoins(guild.id)), flags: EPHEMERAL });
      }
      // ✅ FIX: handler para coin_edit (estava faltando)
      if (type === 'coin_edit') {
        const itemId = field;
        const name = i.fields.getTextInputValue('name').trim();
        const price = parseInt(i.fields.getTextInputValue('price'));
        const emoji = i.fields.getTextInputValue('emoji').trim() || '🎁';
        const description = i.fields.getTextInputValue('description').trim() || null;
        const role_id = i.fields.getTextInputValue('role_id').trim() || null;
        if (isNaN(price) || price <= 0) return i.reply({ content: '❌ Preço inválido.', flags: EPHEMERAL });
        await supabase.from('ff_coin_shop').update({
          name, price, emoji, description, role_id,
          type: role_id ? 'role' : 'custom',
        }).eq('id', itemId);
        return i.reply({ ...(await ffPanelLojaCoins(guild.id)), flags: EPHEMERAL });
      }
    }
  } catch (err) {
    console.error('[MODAL-HANDLER]', err);
  }
});

// ═══════════════════════════════════════════════════════════
// HANDLER DE SELECTS
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (!i.isStringSelectMenu()) return;
  if (!i.customId) return;
  try {
    const cid = i.customId, value = i.values[0];
    const guild = i.guild;
    const [ns, action] = cid.split(':');

    // ─── WINNER PICK ───
    if (ns === 'ffm' && action === 'pick_winner') {
      // Acknowledge immediately: DB queries and profile updates can exceed Discord's 3s deadline.
      await i.deferUpdate();
      const matchId = cid.split(':')[2];
      const m = await ffGetMatch(matchId);
      if (!m) return i.followUp({ content: '❌ Não foi possível localizar a partida.', flags: EPHEMERAL });
      const isS = await isAdmin(i.user, guild);
      const isMed = m.mediator_id ? i.user.id === m.mediator_id : false;
      const isDev = isDeveloper(i.user.id);
      if (!isMed && !isS && !isDev) return i.followUp({ content: '❌ Você não tem permissão para escolher o vencedor.', flags: EPHEMERAL });

      if (m.status === 'finished') return i.followUp({ content: 'Esta partida já foi finalizada; o prêmio não será creditado novamente.', flags: EPHEMERAL });
      const winner = value, players = parseJson(m.players);
      if (!Array.isArray(players) || !players.includes(winner)) return i.followUp({ content: 'O usuário escolhido não pertence a esta partida.', flags: EPHEMERAL });
      const prize = Number(m.value || 0) * 2;
      const cfg = await ffGetConfig(guild.id);
      const fee = (Number(cfg?.mediator_fee) || 0) * players.length;
      let coins = Number(cfg?.coin_prize) || 1;

      await ffPatchMatch(matchId, {
        status: 'finished', winner, prize_amount: prize,
        mediator_earnings: fee, finished_at: new Date().toISOString(),
      });

      try {
        const { data: p } = await supabase.from('ff_players')
          .select('coins, wins').eq('guild_id', guild.id).eq('user_id', winner).maybeSingle();
        if (p) await supabase.from('ff_players').update({
          coins: Number(p.coins || 0) + coins,
          wins: Number(p.wins || 0) + 1,
        }).eq('guild_id', guild.id).eq('user_id', winner);
        else await supabase.from('ff_players').insert({
          guild_id: guild.id, user_id: winner, coins, wins: 1, losses: 0,
        });
        await logCoins(guild, winner, coins, `Vitória #${matchId}`, m.mediator_id);
      } catch (e) { console.error(e.message); }

      // Registra derrota para os demais participantes, para que .p reflita estatísticas completas.
      try {
        for (const loser of players.filter(p => p !== winner)) {
          const { data: lp } = await supabase.from('ff_players').select('losses')
            .eq('guild_id', guild.id).eq('user_id', loser).maybeSingle();
          if (lp) {
            await supabase.from('ff_players').update({ losses: Number(lp.losses || 0) + 1 })
              .eq('guild_id', guild.id).eq('user_id', loser);
          } else {
            await supabase.from('ff_players').insert({ guild_id: guild.id, user_id: loser, coins: 0, wins: 0, losses: 1 });
          }
        }
      } catch (e) { console.error('[WINNER-LOSSES]', e.message); }

      try {
        if (m.mediator_id) {
          await supabase.from('ff_mediator_earnings').insert({
            guild_id: guild.id, mediator_id: m.mediator_id, match_id: matchId, amount: fee,
          });
          const { data: med } = await supabase.from('ff_mediator_queue')
            .select('*').eq('guild_id', guild.id).eq('user_id', m.mediator_id).maybeSingle();
          if (med) await supabase.from('ff_mediator_queue').update({
            status: 'waiting', current_match_id: null,
            earnings_total: Number(med.earnings_total || 0) + fee,
            matches_total: Number(med.matches_total || 0) + 1,
          }).eq('id', med.id);
        }
      } catch (e) { console.error(e.message); }

      try { await i.channel.setName(ffThreadName('finished', m.value, players, matchId)).catch(() => {}); } catch {}

      await ffCleanupThread(i.channel);

      const e = new EmbedBuilder().setTitle('🏆 FINALIZADO').setColor('#f1c40f')
        .setDescription(`**Vencedor:** <@${winner}>\n**Prêmio:** R$ ${prize.toFixed(2)}`)
        .addFields(
          { name: '💰', value: `R$ ${prize.toFixed(2)}`, inline: true },
          { name: '💎', value: `${coins}`, inline: true },
          { name: '💵 Taxa', value: `R$ ${fee.toFixed(2)}`, inline: true },
        ).setTimestamp();

      await i.channel.send({ embeds: [e] });
      await i.followUp({ content: '✅ Vencedor registrado!', flags: EPHEMERAL });
      setTimeout(() => i.channel.setArchived(true).catch(() => {}), 15000);
      return;
    }

    // ─── COINSHOP BUY ───
    if (ns === 'coinshop' && action === 'buy') {
      const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
      if (!item || !item.active) return i.reply({ content: '❌', flags: EPHEMERAL });
      if (item.stock === 0) return i.reply({ content: '❌ Esgotado.', flags: EPHEMERAL });
      const { data: p } = await supabase.from('ff_players')
        .select('coins').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
      const saldo = Number(p?.coins || 0);
      if (saldo < item.price) return i.reply({ content: `❌ Você tem ${saldo}, precisa ${item.price}.`, flags: EPHEMERAL });
      const e = new EmbedBuilder().setTitle('🪙 Confirmar').setColor('#FFD700')
        .setDescription(`Comprar **${item.emoji || '🎁'} ${item.name}** por **${item.price} coins**?\n\nSaldo após: **${saldo - item.price}**`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`coinshop:confirm:${item.id}`).setLabel('Confirmar').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('coinshop:cancel').setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      );
      return i.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
    }

    // ─── FFBL REMOVE PICK ───
    if (ns === 'ffbl' && action === 'remove_pick') {
      await supabase.from('ff_blacklist').delete().eq('id', value);
      return i.update(await ffBuildBlacklistEmbed(guild.id));
    }

    // ─── FFCFG SELECTS ───
    if (ns === 'ffcfg') {

      if (action === 'msg_add_channel') {
        const channel = guild.channels.cache.get(value);
        if (!channel || channel.type !== ChannelType.GuildText) return i.update({ content: 'Canal inválido.', components: [], embeds: [] });
        return i.showModal(ffAutoMessageModal(null, channel.id));
      }
      if (['msg_edit_pick', 'msg_toggle_pick', 'msg_delete_pick'].includes(action)) {
        const { data: item, error } = await supabase.from('ff_auto_messages').select('*')
          .eq('id', value).eq('guild_id', guild.id).maybeSingle();
        if (error || !item) return i.update({ content: 'Auto mensagem não encontrada. Confira se a migração SQL foi executada.', embeds: [], components: [] });
        if (action === 'msg_edit_pick') return i.showModal(ffAutoMessageModal(item));
        if (action === 'msg_toggle_pick') {
          const { error: updateError } = await supabase.from('ff_auto_messages')
            .update({ enabled: !item.enabled, next_run_at: new Date(Date.now() + 60000).toISOString(), updated_at: new Date().toISOString() })
            .eq('id', item.id).eq('guild_id', guild.id);
          if (updateError) return i.update({ content: `Falha ao atualizar: ${updateError.message}`, embeds: [], components: [] });
          return i.update(await ffPanelAutoMensagens(guild.id));
        }
        const { error: deleteError } = await supabase.from('ff_auto_messages').delete().eq('id', item.id).eq('guild_id', guild.id);
        if (deleteError) return i.update({ content: `Falha ao excluir: ${deleteError.message}`, embeds: [], components: [] });
        return i.update(await ffPanelAutoMensagens(guild.id));
      }
      if (action === 'pick_del_valor') {
        const cfg = await ffGetConfig(guild.id);
        const vals = (Array.isArray(cfg?.value_options) ? cfg.value_options : []).filter(x => x !== value);
        await ffPatchConfig(guild.id, { value_options: vals });
        return i.update(await ffPanelValores(guild.id));
      }

      if (action === 'postar_pick_format') {
        const fmt = FF_FORMATS.find(f => f.id === value);
        if (!fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_channel:${value}`).setPlaceholder('📁 Canal');
        const chs = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)).values()].slice(0, 24);
        for (const ch of chs) menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📢 ${fmt.label}`).setColor('#f1c40f').setDescription('Escolha o canal:')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (action === 'postar_pick_channel') {
        const fmtId = cid.split(':')[2];
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        const ch = guild.channels.cache.get(value);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_value:${fmtId}:${value}`).setPlaceholder('💰 Valor');
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        const sorted = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        for (const v of sorted.slice(0, 25)) menu.addOptions({ label: `R$ ${v.toFixed(2)}`, value: v.toFixed(2), emoji: '💰' });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📢 ${fmt.label} → ${ch.name}`).setColor('#f1c40f').setDescription('Escolha o valor:')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (action === 'postar_pick_value') {
        const parts = cid.split(':');
        const fmtId = parts[2], channelId = parts[3];
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        const ch = guild.channels.cache.get(channelId);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const valor = parseFloat(value);
        const cfgFF = await ffGetConfig(guild.id);
        try {
          const { data: bet } = await supabase.from('ff_bets').insert({
            guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: valor,
          }).select().single();
          const msg = await ch.send({
            embeds: [ffBuildBetEmbed(bet, cfgFF)],
            components: [ffBuildBetButtons(bet.id, cfgFF)],
          });
          await ffPatchBet(bet.id, { message_id: msg.id });
          return i.update({
            embeds: [new EmbedBuilder().setTitle('✅ Postado').setColor('#22c55e').setDescription(`**${fmt.label}** — R$ ${valor.toFixed(2)} em ${ch}`)],
            components: [],
          });
        } catch (e) { return i.update({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
      }

      if (action === 'postar_auto_pick_channel') {
        const ch = guild.channels.cache.get(value);
        if (!ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_auto_pick_format:${value}`).setPlaceholder('🎮 Modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`⚡ ${ch.name}`).setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (action === 'postar_auto_pick_format') {
        const channelId = cid.split(':')[2], fmtId = value;
        const ch = guild.channels.cache.get(channelId);
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!ch || !fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        const ordered = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        await i.update({ content: `⚡ Postando ${ordered.length}...`, embeds: [], components: [] });
        let n = 0;
        for (const valor of ordered) {
          try {
            const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: valor }).select().single();
            const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] });
            await ffPatchBet(bet.id, { message_id: msg.id });
            n++;
            await sleep(500);
          } catch (e) { console.error(`Erro ${valor}:`, e.message); }
        }
        try { return await i.editReply({ content: `✅ **${n}** embeds postados em ${ch}.` }); }
        catch { return i.followUp({ content: `✅ **${n}** embeds postados em ${ch}.`, flags: EPHEMERAL }).catch(() => {}); }
      }

      if (action === 'porcanal_pick_canal') {
        const ch = guild.channels.cache.get(value);
        if (!ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:porcanal_pick_format:${value}`).setPlaceholder('🎮 Modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📁 ${ch.name}`).setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (action === 'porcanal_pick_format') {
        const channelId = cid.split(':')[2], fmtId = value;
        const ch = guild.channels.cache.get(channelId);
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!ch || !fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:porcanal_pick_value:${fmtId}:${channelId}`).setPlaceholder('💰 Valor');
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        const sorted = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        for (const v of sorted.slice(0, 25)) menu.addOptions({ label: `R$ ${v.toFixed(2)}`, value: v.toFixed(2), emoji: '💰' });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📁 ${ch.name} → ${fmt.label}`).setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (action === 'porcanal_pick_value') {
        const parts = cid.split(':');
        const fmtId = parts[2], channelId = parts[3];
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        const ch = guild.channels.cache.get(channelId);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const valor = parseFloat(value);
        const cfg = await ffGetConfig(guild.id);
        try {
          const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: valor }).select().single();
          const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] });
          await ffPatchBet(bet.id, { message_id: msg.id });
          return i.update({ content: `✅ Em ${ch}`, embeds: [], components: [] });
        } catch (e) { return i.update({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
      }

      if (action === 'embed_edit_pick') {
        const { data: bet, error } = await supabase.from('ff_bets').select('*').eq('id', value).eq('guild_id', guild.id).maybeSingle();
        if (error || !bet) return i.update({ content: 'Embed não encontrado.', embeds: [], components: [] });
        const fmt = FF_FORMATS.find(f => f.label === bet.format || f.id === bet.format);
        const modal = new ModalBuilder().setCustomId(`ffcfg_modal:embed_edit:${bet.id}`).setTitle('Editar embed de aposta');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('format').setLabel('ID ou nome da modalidade').setStyle(TextInputStyle.Short).setValue(fmt?.id || String(bet.format || '')).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Valor da aposta (ex.: 5,00)').setStyle(TextInputStyle.Short).setValue(String(bet.value ?? 0)).setRequired(true)),
        );
        return i.showModal(modal);
      }
      if (action === 'embed_delete_pick') {
        const { data: bet, error } = await supabase.from('ff_bets').select('id,channel_id,message_id').eq('id', value).eq('guild_id', guild.id).maybeSingle();
        if (error || !bet) return i.update({ content: 'Embed não encontrado.', embeds: [], components: [] });
        const channel = guild.channels.cache.get(bet.channel_id) || await guild.channels.fetch(bet.channel_id).catch(() => null);
        if (channel && bet.message_id) {
          const msg = await channel.messages.fetch(bet.message_id).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }
        await supabase.from('ff_bets').update({ message_id: null }).eq('id', bet.id).eq('guild_id', guild.id);
        return i.update({ content: 'Embed removido do canal.', embeds: [], components: [] });
      }

      if (action === 'coin_edit_pick') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        if (!item) return i.reply({ content: '❌', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId(`ffcfg_modal:coin_edit:${item.id}`).setTitle('Editar item');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(item.name).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(item.price)).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(item.emoji || '🎁').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(item.description || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID cargo').setStyle(TextInputStyle.Short).setValue(item.role_id || '').setRequired(false)),
        );
        return i.showModal(m);
      }
      if (action === 'coin_del_pick') {
        await supabase.from('ff_coin_shop').delete().eq('id', value);
        return i.update(await ffPanelLojaCoins(guild.id));
      }
    }
  } catch (err) {
    console.error('[SELECT-HANDLER]', err);
    if (i?.isRepliable?.()) {
      if (i.deferred || i.replied) await i.followUp({ content: `❌ Não consegui concluir essa seleção: ${String(err.message || err).slice(0, 400)}`, flags: EPHEMERAL }).catch(() => {});
      else await i.reply({ content: `❌ Não consegui concluir essa seleção: ${String(err.message || err).slice(0, 400)}`, flags: EPHEMERAL }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 2/7
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 3/7] SISTEMA DE STREAMERS (CORRIGIDA)
// ═══════════════════════════════════════════════════════════

async function getStreamers(guildId, onlyActive = true) {
  let q = supabase.from('streamers').select('*').eq('guild_id', guildId);
  if (onlyActive) q = q.eq('ativo', true);
  const { data } = await q.order('panel_id', { ascending: true });
  return data || [];
}

async function getStreamer(guildId, userId) {
  const { data } = await supabase.from('streamers')
    .select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle();
  return data;
}

async function createStreamer(guildId, userId, opts = {}) {
  const streamers = await getStreamers(guildId, false);
  if (streamers.length >= 50) throw new Error('Limite de 50 streamers por servidor atingido.');

  const ids = streamers.map(s => Number(s.panel_id)).filter(Number.isFinite);
  const panelId = ids.length ? Math.max(...ids) + 1 : 1;

  const { data, error } = await supabase.from('streamers').insert({
    guild_id: guildId,
    user_id: userId,
    panel_id: panelId,
    titulo: opts.titulo || '🎥 Streamer ao Vivo',
    descricao: opts.descricao || 'Assista a live e participe!',
    cor: opts.cor || '#9146FF',
    valor_fixo: Number(opts.valor_fixo) || 0,
    status: 'offline',
    ativo: true,
  }).select().single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateStreamer(guildId, userId, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('streamers')
    .update(clean).eq('guild_id', guildId).eq('user_id', userId).select().single();
  if (error) return { ok: false, error: error.message };
  scheduleRefresh(`str:${guildId}:${userId}`, () => refreshStreamerEmbeds(guildId, userId), 500);
  return { ok: true, streamer: data };
}

async function deleteStreamer(guildId, userId) {
  const { error } = await supabase.from('streamers')
    .delete().eq('guild_id', guildId).eq('user_id', userId);
  return !error;
}

async function getStreamerQueue(guildId, streamerId) {
  const { data } = await supabase.from('streamer_queue')
    .select('*').eq('guild_id', guildId).eq('streamer_id', streamerId)
    .in('status', ['waiting', 'in_thread'])
    .order('position', { ascending: true }).order('joined_at', { ascending: true });
  return data || [];
}

async function getStreamerPanel(guildId) {
  const { data } = await supabase.from('streamer_panel')
    .select('*').eq('guild_id', guildId).maybeSingle();
  return data;
}

async function saveStreamerPanel(guildId, canalId, msgId) {
  await supabase.from('streamer_panel').upsert({
    guild_id: guildId, canal_id: canalId, msg_id: msgId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id' });
}

// ═══════════════════════════════════════════════════════════
// EMBED — PAINEL PRINCIPAL
// ═══════════════════════════════════════════════════════════
async function buildStreamerMainEmbed(guildId) {
  const streamers = await getStreamers(guildId);
  const online = streamers.filter(s => s.status === 'online');
  const offline = streamers.filter(s => s.status === 'offline');

  const linhas = streamers.length
    ? streamers.map(s => {
        const statusEmoji = s.status === 'online' ? '🟢' : '⚪';
        const linkLinha = s.status === 'online' && s.live_url ? ` — [▶️ Assistir](${s.live_url})` : '';
        const mediador = s.mediador_id ? `\n> 🛡️ Mediador: <@${s.mediador_id}>` : '\n> 🛡️ Sem mediador';
        const valor = Number(s.valor_fixo || 0) > 0 ? `R$ ${Number(s.valor_fixo).toFixed(2)}` : 'à combinar';
        return `${statusEmoji} **<@${s.user_id}>**${linkLinha}${mediador}\n> 💰 Valor fixo: **${valor}**`;
      }).join('\n\n')
    : '*Nenhum streamer cadastrado ainda.*';

  const e = new EmbedBuilder()
    .setTitle('🎥 Filas Streamer')
    .setColor('#9146FF')
    .setDescription(
      `**Streamers da organização.**\n\n` +
      `> 🟢 Online: **${online.length}**\n` +
      `> ⚪ Offline: **${offline.length}**\n\n` +
      `${linhas}`
    )
    .setFooter({ text: `${ORG_NAME} • Streamers` })
    .setTimestamp();

  return e;
}

function buildStreamerMainButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('str:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('str:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('str:receita').setLabel('Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('str:meus_canais').setLabel('Meus canais').setEmoji('📺').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('str:refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═══════════════════════════════════════════════════════════
// EMBED PÚBLICO (por streamer)
// ═══════════════════════════════════════════════════════════
async function buildStreamerPublicEmbed(guildId, streamer) {
  const queue = await getStreamerQueue(guildId, streamer.user_id);
  const esperando = queue.filter(q => q.status === 'waiting');
  const emThread = queue.filter(q => q.status === 'in_thread');

  const statusTxt = streamer.status === 'online' ? '🟢 **Online**' : '⚪ **Offline**';
  const linkTxt = streamer.live_url
    ? `[${streamer.status === 'online' ? '▶️ Assistir agora' : '🔗 Link da live'}](${streamer.live_url})`
    : '*Live não configurada*';
  const mediadorTxt = streamer.mediador_id ? `<@${streamer.mediador_id}>` : '*não definido*';
  const valorTxt = Number(streamer.valor_fixo || 0) > 0
    ? `**R$ ${Number(streamer.valor_fixo).toFixed(2)}**`
    : '*à combinar*';

  const descricao = streamer.descricao || 'Assista a live e participe da fila de espera!';

  const e = new EmbedBuilder()
    .setTitle(streamer.titulo || '🎥 Streamer ao Vivo')
    .setColor(safeColor(streamer.cor, '#9146FF'))
    .setDescription(
      `${descricao}\n\n` +
      `> 🎙️ Streamer: **<@${streamer.user_id}>**\n` +
      `> 📡 Status: ${statusTxt}\n` +
      `> 🎬 Live: ${linkTxt}\n` +
      `> 🛡️ Mediador: ${mediadorTxt}\n` +
      `> 💰 Valor fixo: ${valorTxt}\n` +
      `> ⏳ Fila de espera: **${esperando.length}** na fila • **${emThread.length}** em atendimento`
    );

  if (streamer.regras) {
    e.addFields({ name: '📜 Regras', value: String(streamer.regras).slice(0, 1024), inline: false });
  }

  const thumb = safeUrl(streamer.thumbnail); if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(streamer.banner); if (banner) e.setImage(banner);
  e.setFooter({ text: `Streamer #${streamer.panel_id}` });
  e.setTimestamp();

  return e;
}

// ✅ FIX: botão Link não pode ter customId, e Secondary não aceita setURL
function buildStreamerPublicButtons(streamer) {
  const isOnline = streamer.status === 'online';
  const temLive = !!safeUrl(streamer.live_url);

  // Botão de live: Link quando online+URL, senão Secondary desabilitado
  const liveButton = (isOnline && temLive)
    ? new ButtonBuilder()
        .setLabel('Assistir live')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Link)
        .setURL(streamer.live_url)
    : new ButtonBuilder()
        .setCustomId(`strap:live_placeholder:${streamer.user_id}`)
        .setLabel(isOnline ? 'Live sem link' : 'Live offline')
        .setEmoji('⚫')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

  const row1 = new ActionRowBuilder().addComponents(
    liveButton,
    new ButtonBuilder()
      .setCustomId(`strq:join:${streamer.user_id}`)
      .setLabel('Entrar na fila de espera')
      .setEmoji('⏳')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!isOnline),
    new ButtonBuilder()
      .setCustomId(`strq:leave:${streamer.user_id}`)
      .setLabel('Sair da fila')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`strq:list:${streamer.user_id}`)
      .setLabel('Ver fila')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`strap:apostar:${streamer.user_id}`)
      .setLabel('Apostar com streamer')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isOnline),
  );

  return [row1, row2];
}

// ═══════════════════════════════════════════════════════════
// EMBED PRIVADO (config do streamer)
// ═══════════════════════════════════════════════════════════
async function buildStreamerPrivateEmbed(guildId, streamer) {
  const queue = await getStreamerQueue(guildId, streamer.user_id);
  const esperando = queue.filter(q => q.status === 'waiting');

  const cfg = [
    `> 🎙️ **Dono:** <@${streamer.user_id}>`,
    `> 📡 **Status:** ${streamer.status === 'online' ? '🟢 Online' : '⚪ Offline'}`,
    `> 📺 **Canal público:** <#${streamer.canal_publico_id || '0'}>`,
    `> 🎬 **Live URL:** ${streamer.live_url ? `\`${streamer.live_url.substring(0, 60)}\`` : '*não configurada*'}`,
    `> 🛡️ **Mediador:** ${streamer.mediador_id ? `<@${streamer.mediador_id}>` : '*não definido*'}`,
    `> 💰 **Valor fixo:** ${Number(streamer.valor_fixo || 0) > 0 ? `R$ ${Number(streamer.valor_fixo).toFixed(2)}` : '*à combinar*'}`,
    `> ⏳ **Na fila agora:** ${esperando.length}`,
  ].join('\n');

  const e = new EmbedBuilder()
    .setTitle('⚙️ Configuração do Streamer')
    .setColor(safeColor(streamer.cor, '#9146FF'))
    .setDescription(
      `**Este é seu painel privado de configuração.**\n\n${cfg}\n\n` +
      `**Use os botões abaixo para editar seu embed público.**\n` +
      `As alterações são aplicadas **imediatamente** no canal público.`
    );

  if (streamer.thumbnail || streamer.banner) {
    const thumb = safeUrl(streamer.thumbnail); if (thumb) e.setThumbnail(thumb);
    const banner = safeUrl(streamer.banner); if (banner) e.setImage(banner);
  }

  e.setFooter({ text: `Streamer #${streamer.panel_id}` });
  e.setTimestamp();
  return e;
}

function buildStreamerPrivateButtons(streamer) {
  const isOnline = streamer.status === 'online';

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`strcfg:live_url:${streamer.user_id}`).setLabel('Link da live').setEmoji('🎬').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strcfg:regras:${streamer.user_id}`).setLabel('Regras').setEmoji('📜').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strcfg:mediador:${streamer.user_id}`).setLabel('Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strcfg:valor:${streamer.user_id}`).setLabel('Valor fixo').setEmoji('💰').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`strcfg:titulo:${streamer.user_id}`).setLabel('Título').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strcfg:descricao:${streamer.user_id}`).setLabel('Descrição').setEmoji('📝').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strcfg:cor:${streamer.user_id}`).setLabel('Cor').setEmoji('🎨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strcfg:imagens:${streamer.user_id}`).setLabel('Imagens').setEmoji('🖼️').setStyle(ButtonStyle.Primary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`strcfg:status:${streamer.user_id}`)
      .setLabel(isOnline ? 'Ficar Offline' : 'Ficar Online')
      .setEmoji(isOnline ? '⚪' : '🟢')
      .setStyle(isOnline ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`strcfg:queue:${streamer.user_id}`).setLabel('Gerenciar Fila').setEmoji('⏳').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`strcfg:refresh:${streamer.user_id}`).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, row3];
}

// ═══════════════════════════════════════════════════════════
// POSTAR / REFRESH
// ═══════════════════════════════════════════════════════════
async function postStreamerPublicEmbed(guild, streamer) {
  try {
    if (!streamer.canal_publico_id) return false;
    const ch = guild.channels.cache.get(streamer.canal_publico_id)
      || await guild.channels.fetch(streamer.canal_publico_id).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return false;

    const embed = await buildStreamerPublicEmbed(guild.id, streamer);
    const components = buildStreamerPublicButtons(streamer);

    let msg = streamer.msg_publica_id
      ? await ch.messages.fetch(streamer.msg_publica_id).catch(() => null)
      : null;

    if (msg) {
      await msg.edit({ embeds: [embed], components }).catch(() => {});
    } else {
      const novas = await ch.send({ embeds: [embed], components });
      await supabase.from('streamers')
        .update({ msg_publica_id: novas.id }).eq('id', streamer.id);
    }
    return true;
  } catch (e) { console.error('[STR/PUB]', e.message); return false; }
}

async function postStreamerPrivateEmbed(guild, streamer) {
  try {
    if (!streamer.canal_privado_id) return false;
    const ch = guild.channels.cache.get(streamer.canal_privado_id)
      || await guild.channels.fetch(streamer.canal_privado_id).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return false;

    const embed = await buildStreamerPrivateEmbed(guild.id, streamer);
    const components = buildStreamerPrivateButtons(streamer);

    let msg = streamer.msg_privada_id
      ? await ch.messages.fetch(streamer.msg_privada_id).catch(() => null)
      : null;

    if (msg) {
      await msg.edit({ embeds: [embed], components }).catch(() => {});
    } else {
      const novas = await ch.send({ embeds: [embed], components });
      await supabase.from('streamers')
        .update({ msg_privada_id: novas.id }).eq('id', streamer.id);
    }
    return true;
  } catch (e) { console.error('[STR/PRIV]', e.message); return false; }
}

async function refreshStreamerEmbeds(guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const streamer = await getStreamer(guildId, userId);
  if (!streamer) return;
  await Promise.allSettled([
    postStreamerPublicEmbed(guild, streamer),
    postStreamerPrivateEmbed(guild, streamer),
  ]);
}

async function refreshStreamerMainPanel(guildId) {
  try {
    const panel = await getStreamerPanel(guildId);
    if (!panel?.canal_id || !panel?.msg_id) return false;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    const ch = guild.channels.cache.get(panel.canal_id)
      || await guild.channels.fetch(panel.canal_id).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(panel.msg_id).catch(() => null);
    if (!msg) return false;
    const embed = await buildStreamerMainEmbed(guildId);
    await msg.edit({ embeds: [embed], components: buildStreamerMainButtons() }).catch(() => {});
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════
// FILA DE ESPERA
// ═══════════════════════════════════════════════════════════
async function joinStreamerQueue(guildId, streamerId, userId) {
  const streamer = await getStreamer(guildId, streamerId);
  if (!streamer) return { ok: false, error: 'Streamer não encontrado.' };
  if (streamer.status !== 'online') return { ok: false, error: 'Streamer está offline.' };
  if (userId === streamerId) return { ok: false, error: 'Você não pode entrar na sua própria fila.' };

  const existing = await supabase.from('streamer_queue')
    .select('id, status').eq('guild_id', guildId)
    .eq('streamer_id', streamerId).eq('user_id', userId).maybeSingle();
  if (existing.data && ['waiting', 'in_thread'].includes(existing.data.status)) {
    return { ok: false, error: 'Você já está na fila.' };
  }

  const { count } = await supabase.from('streamer_queue')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId).eq('streamer_id', streamerId)
    .in('status', ['waiting', 'in_thread']);

  const position = (count || 0) + 1;

  const { data, error } = await supabase.from('streamer_queue').insert({
    guild_id: guildId, streamer_id: streamerId, user_id: userId,
    position, status: 'waiting',
  }).select().single();

  if (error) {
    if (error.code === '23505') {
      await supabase.from('streamer_queue').update({
        status: 'waiting', position, joined_at: new Date().toISOString(),
      }).eq('guild_id', guildId).eq('streamer_id', streamerId).eq('user_id', userId);
      return { ok: true, position };
    }
    return { ok: false, error: error.message };
  }

  scheduleRefresh(`str:${guildId}:${streamerId}`, () => refreshStreamerEmbeds(guildId, streamerId), 400);
  await callNextStreamerQueue(guildId, streamerId);

  return { ok: true, position, id: data.id };
}

async function leaveStreamerQueue(guildId, streamerId, userId) {
  const { error } = await supabase.from('streamer_queue')
    .delete().eq('guild_id', guildId).eq('streamer_id', streamerId).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  scheduleRefresh(`str:${guildId}:${streamerId}`, () => refreshStreamerEmbeds(guildId, streamerId), 400);
  return { ok: true };
}

async function callNextStreamerQueue(guildId, streamerId) {
  try {
    const { data: inThread } = await supabase.from('streamer_queue')
      .select('id').eq('guild_id', guildId).eq('streamer_id', streamerId)
      .eq('status', 'in_thread').limit(1);
    if (inThread?.length) return null;

    const { data: next } = await supabase.from('streamer_queue')
      .select('*').eq('guild_id', guildId).eq('streamer_id', streamerId)
      .eq('status', 'waiting').order('position').order('joined_at').limit(1).maybeSingle();
    if (!next) return null;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const streamer = await getStreamer(guildId, streamerId);
    if (!streamer?.canal_publico_id) return null;

    const parent = guild.channels.cache.get(streamer.canal_publico_id)
      || await guild.channels.fetch(streamer.canal_publico_id).catch(() => null);
    if (!parent || !parent.isTextBased?.()) return null;

    // ✅ FIX: garante que o canal suporta threads
    if (!parent.threads?.create) return null;

    const user = await client.users.fetch(next.user_id).catch(() => null);
    const safeUser = user ? user.username.replace(/[^a-z0-9]/gi, '').slice(0, 20) : 'user';

    const thread = await parent.threads.create({
      name: `fila de streamer - ${safeUser}`.slice(0, 90),
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      reason: 'Fila de espera do streamer',
    });
    await sleep(300);

    await thread.members.add(next.user_id).catch(() => {});
    if (streamer.mediador_id) await thread.members.add(streamer.mediador_id).catch(() => {});
    await thread.members.add(streamerId).catch(() => {});

    await supabase.from('streamer_queue').update({
      status: 'in_thread', thread_id: thread.id, called_at: new Date().toISOString(),
    }).eq('id', next.id);

    const e = new EmbedBuilder()
      .setTitle('🎮 Sua vez chegou!')
      .setColor('#9146FF')
      .setDescription(
        `<@${next.user_id}> é a sua vez na fila de **<@${streamerId}>**!\n\n` +
        `> 🛡️ Mediador: ${streamer.mediador_id ? `<@${streamer.mediador_id}>` : '*não definido*'}\n` +
        `> 💰 Valor fixo: ${Number(streamer.valor_fixo || 0) > 0 ? `R$ ${Number(streamer.valor_fixo).toFixed(2)}` : '*à combinar*'}\n` +
        `> 🎬 Live: ${streamer.live_url ? `[Assistir](${streamer.live_url})` : '*não configurada*'}`
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`strq:done:${next.id}`).setLabel('Finalizar').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`strq:skip:${next.id}`).setLabel('Pular').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    );

    await thread.send({
      content: `<@${next.user_id}> ${streamer.mediador_id ? `<@${streamer.mediador_id}>` : ''} <@${streamerId}>`,
      embeds: [e],
      components: [row],
    });

    scheduleRefresh(`str:${guildId}:${streamerId}`, () => refreshStreamerEmbeds(guildId, streamerId), 400);
    return thread;
  } catch (e) { console.error('[STRQ/NEXT]', e.message); return null; }
}

async function finishStreamerQueueEntry(entryId, skip = false) {
  const { data: entry } = await supabase.from('streamer_queue')
    .select('*').eq('id', entryId).maybeSingle();
  if (!entry) return { ok: false, error: 'Entrada não encontrada.' };

  await supabase.from('streamer_queue').delete().eq('id', entryId);

  if (entry.thread_id) {
    const guild = client.guilds.cache.get(entry.guild_id);
    const th = guild?.channels.cache.get(entry.thread_id)
      || await guild?.channels.fetch(entry.thread_id).catch(() => null);
    if (th) {
      await th.send({
        content: skip ? '⏭️ Pulado pelo streamer. Fechando...' : '✅ Finalizado! Obrigado.',
      }).catch(() => {});
      setTimeout(() => th.setArchived(true).catch(() => {}), 5000);
    }
  }

  await callNextStreamerQueue(entry.guild_id, entry.streamer_id);
  scheduleRefresh(`str:${entry.guild_id}:${entry.streamer_id}`,
    () => refreshStreamerEmbeds(entry.guild_id, entry.streamer_id), 500);

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
// MENU ADMIN — /config streamer
// ═══════════════════════════════════════════════════════════
async function buildConfigStreamerMenu(guildId) {
  const streamers = await getStreamers(guildId);
  const online = streamers.filter(s => s.status === 'online');
  const panel = await getStreamerPanel(guildId);

  const e = new EmbedBuilder()
    .setTitle('🎥 Configuração — Sistema de Streamers')
    .setColor('#9146FF')
    .setDescription(
      `**Central de configuração.**\n\n` +
      `> 🎙️ **Streamers cadastrados:** \`${streamers.length}\`\n` +
      `> 🟢 **Online agora:** \`${online.length}\`\n` +
      `> 📢 **Painel principal:** ${panel?.canal_id ? `<#${panel.canal_id}>` : '*não postado*'}\n\n` +
      `⚡ **Auto-refresh ativo:** qualquer edição é aplicada imediatamente.`
    )
    .setFooter({ text: `${ORG_NAME} • Config Streamer` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfgstr:create').setLabel('Cadastrar Streamer').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cfgstr:list').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('cfgstr:post_panel').setLabel('Postar Painel').setEmoji('📢').setStyle(ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfgstr:refresh_panel').setLabel('Refresh Painel').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfgstr:refresh_all').setLabel('Refresh Todos').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfgstr:stats').setLabel('Estatísticas').setEmoji('📊').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [e], components: [row1, row2] };
}

async function buildStreamerListForAdmin(guildId) {
  const streamers = await getStreamers(guildId, false);
  if (!streamers.length) {
    return {
      embeds: [new EmbedBuilder().setTitle('📋 Streamers').setColor('#9146FF')
        .setDescription('*Nenhum streamer cadastrado ainda.*')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfgstr:create').setLabel('Cadastrar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfgstr:menu').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      )],
    };
  }

  const desc = streamers.slice(0, 10).map(s => {
    const st = s.status === 'online' ? '🟢' : '⚪';
    const ativo = s.ativo ? '' : ' *(inativo)*';
    return `**#${s.panel_id}** ${st} <@${s.user_id}>${ativo}\n> 📺 <#${s.canal_publico_id || '0'}> • ⚙️ <#${s.canal_privado_id || '0'}>`;
  }).join('\n\n');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('cfgstr:pick')
    .setPlaceholder('🎙️ Escolher streamer')
    .setMinValues(1).setMaxValues(1);
  for (const s of streamers.slice(0, 25)) {
    menu.addOptions({
      label: `#${s.panel_id} — ${s.user_id.slice(0, 12)}`.slice(0, 90),
      value: s.user_id,
      description: `${s.status === 'online' ? '🟢 Online' : '⚪ Offline'} • ${s.ativo ? 'Ativo' : 'Inativo'}`,
    });
  }

  return {
    embeds: [new EmbedBuilder().setTitle('📋 Streamers cadastrados').setColor('#9146FF')
      .setDescription(desc).setFooter({ text: `${streamers.length}/50` })],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfgstr:create').setLabel('Cadastrar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfgstr:menu').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function buildStreamerAdminDetail(guildId, userId) {
  const s = await getStreamer(guildId, userId);
  if (!s) return {
    embeds: [new EmbedBuilder().setTitle('❌').setColor('#FF5555').setDescription('Streamer não encontrado.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cfgstr:list').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };

  const queue = await getStreamerQueue(guildId, userId);
  const e = new EmbedBuilder()
    .setTitle(`🎙️ Streamer #${s.panel_id}`)
    .setColor(safeColor(s.cor, '#9146FF'))
    .addFields(
      { name: '👤 Dono', value: `<@${s.user_id}>`, inline: true },
      { name: '📡 Status', value: s.status === 'online' ? '🟢 Online' : '⚪ Offline', inline: true },
      { name: '✅ Ativo', value: s.ativo ? 'Sim' : 'Não', inline: true },
      { name: '📺 Canal público', value: s.canal_publico_id ? `<#${s.canal_publico_id}>` : '*—*', inline: true },
      { name: '⚙️ Canal privado', value: s.canal_privado_id ? `<#${s.canal_privado_id}>` : '*—*', inline: true },
      { name: '⏳ Na fila', value: `${queue.length}`, inline: true },
      { name: '🎬 Live URL', value: s.live_url ? `\`${s.live_url.substring(0, 60)}\`` : '*—*', inline: false },
      { name: '🛡️ Mediador', value: s.mediador_id ? `<@${s.mediador_id}>` : '*—*', inline: true },
      { name: '💰 Valor fixo', value: Number(s.valor_fixo || 0) > 0 ? `R$ ${Number(s.valor_fixo).toFixed(2)}` : '*à combinar*', inline: true },
    )
    .setFooter({ text: `User ID: ${s.user_id}` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cfgstr:post:${s.user_id}`).setLabel('Repostar Embeds').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cfgstr:toggle:${s.user_id}`).setLabel(s.ativo ? 'Desativar' : 'Ativar').setEmoji(s.ativo ? '🔴' : '🟢').setStyle(s.ativo ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cfgstr:clear_queue:${s.user_id}`).setLabel('Limpar Fila').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cfgstr:delete:${s.user_id}`).setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cfgstr:list').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// HANDLER — Botões/Slash/Modais de STREAMERS
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (i.replied || i.deferred) return;
  if (!i.customId && !i.isChatInputCommand()) return;
  try {
    // ═══ /config streamer ═══
    if (i.isChatInputCommand() && i.commandName === 'config') {
      const sub = i.options.getSubcommand();
      if (sub === 'streamer') {
        if (!await isAdmin(i.user, i.guild)) {
          return i.reply({ content: '❌ Apenas administradores.', flags: EPHEMERAL });
        }
        return i.reply({ ...(await buildConfigStreamerMenu(i.guild.id)), flags: EPHEMERAL });
      }
    }

    // ═══ /solicitar painel streamer ═══
    if (i.isChatInputCommand() && i.commandName === 'solicitar') {
      const grp = i.options.getSubcommandGroup(false);
      const sub = i.options.getSubcommand();
      if (grp === 'painel' && sub === 'streamer') {
        if (!await isAdmin(i.user, i.guild)) {
          return i.reply({ content: '❌ Apenas administradores.', flags: EPHEMERAL });
        }
        await i.deferReply({ flags: EPHEMERAL });
        const canal = i.options.getChannel('canal') || i.channel;
        if (!canal?.isTextBased?.()) return i.editReply({ content: '❌ Canal inválido.' });

        try {
          const embed = await buildStreamerMainEmbed(i.guild.id);
          const msg = await canal.send({
            embeds: [embed],
            components: buildStreamerMainButtons(),
          });
          await saveStreamerPanel(i.guild.id, canal.id, msg.id);
          return i.editReply({ content: `✅ Painel de streamers postado em <#${canal.id}>.` });
        } catch (e) {
          return i.editReply({ content: `❌ ${e.message}` });
        }
      }
    }

    // ═══ cfgstr: (admin) ═══
    if (i.customId?.startsWith('cfgstr:')) {
      if (!i.guild) return;
      // ✅ FIX: modal `do_create` precisa bypassar o gate de botão (isAdmin é chamado igual)
      const isModalDoCreate = i.isModalSubmit?.() && i.customId === 'cfgstr:do_create';
      if (!await isAdmin(i.user, i.guild)) {
        return i.reply({ content: '❌ Apenas administradores.', flags: EPHEMERAL }).catch(() => {});
      }

      const [_, action, extra] = i.customId.split(':');

      if (action === 'menu') return i.update(await buildConfigStreamerMenu(i.guild.id)).catch(() => {});
      if (action === 'list') return i.update(await buildStreamerListForAdmin(i.guild.id)).catch(() => {});
      if (action === 'pick') {
        const uid = i.values?.[0];
        if (!uid) return;
        return i.update(await buildStreamerAdminDetail(i.guild.id, uid)).catch(() => {});
      }

      if (action === 'create') {
        const m = new ModalBuilder().setCustomId('cfgstr:do_create').setTitle('🎥 Cadastrar Streamer');
        m.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('user_id')
              .setLabel('ID do usuário (Discord)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 123456789012345678')
              .setRequired(true).setMaxLength(25)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('canal_publico_id')
              .setLabel('ID do canal público (apostas)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 123456789012345678')
              .setRequired(true).setMaxLength(25)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('canal_privado_id')
              .setLabel('ID do canal privado (config)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 123456789012345678')
              .setRequired(true).setMaxLength(25)
          ),
        );
        return i.showModal(m);
      }

      if (action === 'do_create' && i.isModalSubmit()) {
        const uid = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
        const pubId = i.fields.getTextInputValue('canal_publico_id').trim().replace(/[<#>]/g, '');
        const privId = i.fields.getTextInputValue('canal_privado_id').trim().replace(/[<#>]/g, '');

        if (!/^\d{15,25}$/.test(uid)) return i.reply({ content: '❌ ID de usuário inválido.', flags: EPHEMERAL });
        if (!/^\d{15,25}$/.test(pubId)) return i.reply({ content: '❌ ID do canal público inválido.', flags: EPHEMERAL });
        if (!/^\d{15,25}$/.test(privId)) return i.reply({ content: '❌ ID do canal privado inválido.', flags: EPHEMERAL });

        const pubCh = i.guild.channels.cache.get(pubId);
        const privCh = i.guild.channels.cache.get(privId);
        if (!pubCh || !pubCh.isTextBased?.()) return i.reply({ content: '❌ Canal público não encontrado.', flags: EPHEMERAL });
        if (!privCh || !privCh.isTextBased?.()) return i.reply({ content: '❌ Canal privado não encontrado.', flags: EPHEMERAL });

        const member = await i.guild.members.fetch(uid).catch(() => null);
        if (!member) return i.reply({ content: '❌ Usuário não está no servidor.', flags: EPHEMERAL });

        try {
          let s = await getStreamer(i.guild.id, uid);
          if (s) return i.reply({ content: '⚠️ Esse usuário já está cadastrado como streamer.', flags: EPHEMERAL });

          s = await createStreamer(i.guild.id, uid, {});
          await supabase.from('streamers').update({
            canal_publico_id: pubId, canal_privado_id: privId,
          }).eq('id', s.id);

          const fresh = await getStreamer(i.guild.id, uid);
          const g = client.guilds.cache.get(i.guild.id);

          if (privCh.permissionOverwrites) {
            await privCh.permissionOverwrites.edit(i.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
            await privCh.permissionOverwrites.edit(uid, {
              ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
            }).catch(() => {});
            await privCh.permissionOverwrites.edit(client.user.id, {
              ViewChannel: true, SendMessages: true, ManageChannels: true,
            }).catch(() => {});
          }

          await postStreamerPublicEmbed(g, fresh);
          await postStreamerPrivateEmbed(g, fresh);
          await refreshStreamerMainPanel(i.guild.id);

          return i.reply({
            content: `✅ Streamer **<@${uid}>** cadastrado!\n> 📺 Público: <#${pubId}>\n> ⚙️ Privado: <#${privId}>\n> 🎯 Painel #${fresh.panel_id}`,
            flags: EPHEMERAL,
          });
        } catch (e) {
          return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL });
        }
      }

      if (action === 'post_panel') {
        const ch = i.channel;
        try {
          const embed = await buildStreamerMainEmbed(i.guild.id);
          const msg = await ch.send({ embeds: [embed], components: buildStreamerMainButtons() });
          await saveStreamerPanel(i.guild.id, ch.id, msg.id);
          return i.reply({ content: `✅ Painel postado em <#${ch.id}>.`, flags: EPHEMERAL });
        } catch (e) {
          return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL });
        }
      }

      if (action === 'refresh_panel') {
        const ok = await refreshStreamerMainPanel(i.guild.id);
        return i.reply({ content: ok ? '✅ Painel atualizado.' : '⚠️ Painel não está postado.', flags: EPHEMERAL });
      }

      if (action === 'refresh_all') {
        await i.deferReply({ flags: EPHEMERAL });
        const streamers = await getStreamers(i.guild.id);
        let ok = 0, fail = 0;
        for (const s of streamers) {
          try { await refreshStreamerEmbeds(i.guild.id, s.user_id); ok++; }
          catch { fail++; }
        }
        await refreshStreamerMainPanel(i.guild.id);
        return i.editReply({ content: `🔄 **Refresh completo**\n> ✅ ${ok} streamers • ❌ ${fail} falhas` });
      }

      if (action === 'stats') {
        const streamers = await getStreamers(i.guild.id);
        const totalQueue = await supabase.from('streamer_queue')
          .select('id', { count: 'exact', head: true })
          .eq('guild_id', i.guild.id).in('status', ['waiting', 'in_thread']);
        const e = new EmbedBuilder()
          .setTitle('📊 Estatísticas de Streamers')
          .setColor('#9146FF')
          .addFields(
            { name: '🎙️ Total cadastrados', value: `${streamers.length}`, inline: true },
            { name: '🟢 Online', value: `${streamers.filter(s => s.status === 'online').length}`, inline: true },
            { name: '⚪ Offline', value: `${streamers.filter(s => s.status === 'offline').length}`, inline: true },
            { name: '⏳ Na fila agora', value: `${totalQueue.count || 0}`, inline: true },
          );
        return i.update({
          embeds: [e],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cfgstr:menu').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          )],
        }).catch(() => {});
      }

      if (action === 'post' && extra) {
        const s = await getStreamer(i.guild.id, extra);
        if (!s) return i.reply({ content: '❌ Streamer não encontrado.', flags: EPHEMERAL });
        const g = client.guilds.cache.get(i.guild.id);
        await Promise.allSettled([
          postStreamerPublicEmbed(g, s),
          postStreamerPrivateEmbed(g, s),
        ]);
        return i.reply({ content: '✅ Embeds repostados.', flags: EPHEMERAL });
      }

      if (action === 'toggle' && extra) {
        const s = await getStreamer(i.guild.id, extra);
        if (!s) return i.reply({ content: '❌ Streamer não encontrado.', flags: EPHEMERAL });
        await updateStreamer(i.guild.id, extra, { ativo: !s.ativo });
        return i.update(await buildStreamerAdminDetail(i.guild.id, extra)).catch(() => {});
      }

      if (action === 'clear_queue' && extra) {
        await supabase.from('streamer_queue').delete()
          .eq('guild_id', i.guild.id).eq('streamer_id', extra)
          .in('status', ['waiting', 'in_thread']);
        await refreshStreamerEmbeds(i.guild.id, extra);
        return i.reply({ content: '🧹 Fila limpa.', flags: EPHEMERAL });
      }

      if (action === 'delete' && extra) {
        const s = await getStreamer(i.guild.id, extra);
        if (!s) return i.reply({ content: '❌ Streamer não encontrado.', flags: EPHEMERAL });
        await supabase.from('streamer_queue').delete()
          .eq('guild_id', i.guild.id).eq('streamer_id', extra);
        await deleteStreamer(i.guild.id, extra);
        await refreshStreamerMainPanel(i.guild.id);
        return i.update(await buildStreamerListForAdmin(i.guild.id)).catch(() => {});
      }
    }

    // ═══ str: (painel principal) ═══
    if (i.customId?.startsWith('str:')) {
      if (!i.guild) return;
      const [_, action] = i.customId.split(':');

      if (action === 'entrar') {
        const s = await getStreamer(i.guild.id, i.user.id);
        if (s) return i.reply({ content: '⚠️ Você já está cadastrado como streamer.', flags: EPHEMERAL });
        return i.reply({
          content: '⚠️ Fale com um administrador para te cadastrar como streamer.',
          flags: EPHEMERAL,
        });
      }

      if (action === 'sair') {
        const s = await getStreamer(i.guild.id, i.user.id);
        if (!s) return i.reply({ content: '⚠️ Você não é um streamer.', flags: EPHEMERAL });
        if (s.status === 'offline') return i.reply({ content: '⚠️ Você já está offline.', flags: EPHEMERAL });
        await updateStreamer(i.guild.id, i.user.id, { status: 'offline' });
        await refreshStreamerMainPanel(i.guild.id);
        return i.reply({ content: '⚪ Você ficou offline. Fila pausada.', flags: EPHEMERAL });
      }

      if (action === 'receita') {
        const s = await getStreamer(i.guild.id, i.user.id);
        if (!s) return i.reply({ content: '⚠️ Você não é um streamer.', flags: EPHEMERAL });
        const { data: entries } = await supabase.from('streamer_queue')
          .select('id').eq('guild_id', i.guild.id).eq('streamer_id', i.user.id)
          .eq('status', 'finished');

        const total = (entries || []).length;
        const receita = total * Number(s.valor_fixo || 0);

        const e = new EmbedBuilder()
          .setTitle('💰 Minha Receita')
          .setColor('#22c55e')
          .addFields(
            { name: '🎙️ Streamer', value: `<@${i.user.id}>`, inline: true },
            { name: '💰 Valor fixo', value: Number(s.valor_fixo || 0) > 0 ? `R$ ${Number(s.valor_fixo).toFixed(2)}` : '*à combinar*', inline: true },
            { name: '⏳ Atendimentos', value: `${total}`, inline: true },
            { name: '💵 Total estimado', value: `R$ ${receita.toFixed(2)}`, inline: true },
          )
          .setTimestamp();

        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (action === 'meus_canais') {
        const s = await getStreamer(i.guild.id, i.user.id);
        if (!s) return i.reply({ content: '⚠️ Você não é um streamer.', flags: EPHEMERAL });
        return i.reply({
          content:
            `📺 **Seus canais:**\n` +
            `> 📢 Público: <#${s.canal_publico_id || '0'}>\n` +
            `> ⚙️ Privado: <#${s.canal_privado_id || '0'}>\n\n` +
            `Use o painel privado para configurar seu embed.`,
          flags: EPHEMERAL,
        });
      }

      if (action === 'refresh') {
        const embed = await buildStreamerMainEmbed(i.guild.id);
        return i.update({ embeds: [embed], components: buildStreamerMainButtons() }).catch(() => {});
      }
    }

    // ═══ strcfg: (config privada do streamer) ═══
    if (i.customId?.startsWith('strcfg:')) {
      if (!i.guild) return;
      // Só processa se NÃO for submit de modal (modais são tratados mais abaixo)
      if (i.isModalSubmit?.()) {
        // deixa cair fora pra chegar no handler de modal
      } else {
        const [_, action, uid] = i.customId.split(':');
        if (!uid) return;

        const isOwner = i.user.id === uid;
        const isAdminUser = await isAdmin(i.user, i.guild);
        if (!isOwner && !isAdminUser) {
          return i.reply({ content: '❌ Sem permissão.', flags: EPHEMERAL });
        }

        const s = await getStreamer(i.guild.id, uid);
        if (!s) return i.reply({ content: '❌ Streamer não encontrado.', flags: EPHEMERAL });

        if (action === 'status') {
          const nv = s.status === 'online' ? 'offline' : 'online';
          await updateStreamer(i.guild.id, uid, { status: nv });
          await refreshStreamerEmbeds(i.guild.id, uid);
          await refreshStreamerMainPanel(i.guild.id);
          return i.reply({ content: nv === 'online' ? '🟢 Você está online agora!' : '⚪ Você está offline.', flags: EPHEMERAL });
        }

        if (action === 'refresh') {
          await refreshStreamerEmbeds(i.guild.id, uid);
          return i.reply({ content: '🔄 Embeds atualizados.', flags: EPHEMERAL });
        }

        if (action === 'queue') {
          const queue = await getStreamerQueue(i.guild.id, uid);
          const desc = queue.length
            ? queue.map((q, idx) =>
                `**${idx + 1}.** ${q.status === 'in_thread' ? '🟢' : '⏳'} <@${q.user_id}> ${q.status === 'in_thread' ? '*(em atendimento)*' : ''}`
              ).join('\n')
            : '*Fila vazia.*';
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('⏳ Fila de Espera').setColor('#9146FF').setDescription(desc)],
            flags: EPHEMERAL,
          });
        }

        const modalMap = {
          live_url: { title: '🎬 Link da Live', id: 'live_url', label: 'URL da live', value: s.live_url || '', style: TextInputStyle.Short, req: false },
          regras: { title: '📜 Regras', id: 'regras', label: 'Regras (texto livre)', value: s.regras || '', style: TextInputStyle.Paragraph, req: false },
          mediador: { title: '🛡️ Mediador', id: 'mediador_id', label: 'ID do mediador', value: s.mediador_id || '', style: TextInputStyle.Short, req: false },
          valor: { title: '💰 Valor Fixo', id: 'valor_fixo', label: 'Valor em R$ (0 = à combinar)', value: String(s.valor_fixo || 0), style: TextInputStyle.Short, req: true },
          titulo: { title: '✏️ Título', id: 'titulo', label: 'Título do embed', value: s.titulo || '', style: TextInputStyle.Short, req: true },
          descricao: { title: '📝 Descrição', id: 'descricao', label: 'Descrição', value: s.descricao || '', style: TextInputStyle.Paragraph, req: false },
          cor: { title: '🎨 Cor', id: 'cor', label: 'Cor hex (#9146FF)', value: s.cor || '#9146FF', style: TextInputStyle.Short, req: true },
        };

        if (modalMap[action]) {
          const cfg = modalMap[action];
          const m = new ModalBuilder().setCustomId(`strcfg:do_edit:${uid}:${action}`).setTitle(cfg.title);
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(cfg.id)
              .setLabel(cfg.label).setStyle(cfg.style)
              .setValue(String(cfg.value)).setRequired(cfg.req).setMaxLength(1000)
          ));
          return i.showModal(m);
        }

        if (action === 'imagens') {
          const m = new ModalBuilder().setCustomId(`strcfg:do_imagens:${uid}`).setTitle('🖼️ Imagens');
          m.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('thumbnail')
                .setLabel('URL da thumbnail (opcional)').setStyle(TextInputStyle.Short)
                .setValue(s.thumbnail || '').setRequired(false).setMaxLength(500)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('banner')
                .setLabel('URL do banner (opcional)').setStyle(TextInputStyle.Short)
                .setValue(s.banner || '').setRequired(false).setMaxLength(500)
            ),
          );
          return i.showModal(m);
        }
      }
    }

    // ═══ Modais strcfg ═══
    if (i.isModalSubmit() && i.customId?.startsWith('strcfg:do_edit:')) {
      const [_, __, uid, field] = i.customId.split(':');
      const s = await getStreamer(i.guild.id, uid);
      if (!s) return i.reply({ content: '❌', flags: EPHEMERAL });
      // ✅ FIX: valida permissão também no submit
      const isOwner = i.user.id === uid;
      const isAdminUser = await isAdmin(i.user, i.guild);
      if (!isOwner && !isAdminUser) return i.reply({ content: '❌ Sem permissão.', flags: EPHEMERAL });

      const patch = {};
      const inputId = field === 'valor' ? 'valor_fixo' : field === 'mediador' ? 'mediador_id' : field;
      const val = i.fields.getTextInputValue(inputId).trim();

      if (field === 'valor') {
        const n = parseFloat(val.replace(',', '.')) || 0;
        patch.valor_fixo = n;
      } else if (field === 'cor') {
        patch.cor = normalizeHex(val, '#9146FF');
      } else if (field === 'mediador') {
        const clean = val.replace(/[<@!>]/g, '');
        patch.mediador_id = /^\d{15,25}$/.test(clean) ? clean : null;
      } else if (field === 'live_url') {
        patch.live_url = isValidUrl(val) ? val : null;
      } else {
        patch[field] = val || null;
      }

      const r = await updateStreamer(i.guild.id, uid, patch);
      if (!r.ok) return i.reply({ content: `❌ ${r.error}`, flags: EPHEMERAL });
      await refreshStreamerEmbeds(i.guild.id, uid);
      return i.reply({ content: `✅ Atualizado!`, flags: EPHEMERAL });
    }

    if (i.isModalSubmit() && i.customId?.startsWith('strcfg:do_imagens:')) {
      const uid = i.customId.split(':')[2];
      // ✅ FIX: valida permissão
      const isOwner = i.user.id === uid;
      const isAdminUser = await isAdmin(i.user, i.guild);
      if (!isOwner && !isAdminUser) return i.reply({ content: '❌ Sem permissão.', flags: EPHEMERAL });

      const thumb = i.fields.getTextInputValue('thumbnail').trim();
      const banner = i.fields.getTextInputValue('banner').trim();
      const patch = {
        thumbnail: thumb && isValidUrl(thumb) ? thumb : null,
        banner: banner && isValidUrl(banner) ? banner : null,
      };
      const r = await updateStreamer(i.guild.id, uid, patch);
      if (!r.ok) return i.reply({ content: `❌ ${r.error}`, flags: EPHEMERAL });
      await refreshStreamerEmbeds(i.guild.id, uid);
      return i.reply({ content: `✅ Imagens atualizadas!`, flags: EPHEMERAL });
    }

    // ═══ strq: (fila) ═══
    if (i.customId?.startsWith('strq:')) {
      if (!i.guild) return;
      const [_, action, extra] = i.customId.split(':');

      if (action === 'join' && extra) {
        const r = await joinStreamerQueue(i.guild.id, extra, i.user.id);
        if (!r.ok) return i.reply({ content: `❌ ${r.error}`, flags: EPHEMERAL });
        return i.reply({ content: `✅ Você entrou na fila! Posição: **${r.position}**`, flags: EPHEMERAL });
      }

      if (action === 'leave' && extra) {
        const r = await leaveStreamerQueue(i.guild.id, extra, i.user.id);
        if (!r.ok) return i.reply({ content: `❌ ${r.error}`, flags: EPHEMERAL });
        return i.reply({ content: '🚪 Você saiu da fila.', flags: EPHEMERAL });
      }

      if (action === 'list' && extra) {
        const queue = await getStreamerQueue(i.guild.id, extra);
        const desc = queue.length
          ? queue.map((q, idx) =>
              `**${idx + 1}.** ${q.status === 'in_thread' ? '🟢' : '⏳'} <@${q.user_id}>`
            ).join('\n')
          : '*Fila vazia.*';
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('⏳ Fila de Espera').setColor('#9146FF').setDescription(desc)],
          flags: EPHEMERAL,
        });
      }

      if ((action === 'done' || action === 'skip') && extra) {
        const entryId = Number(extra);
        const { data: entry } = await supabase.from('streamer_queue')
          .select('*').eq('id', entryId).maybeSingle();
        if (!entry) return i.reply({ content: '❌ Entrada não encontrada.', flags: EPHEMERAL });
        const isOwnerStreamer = i.user.id === entry.streamer_id;
        const st = await getStreamer(i.guild.id, entry.streamer_id);
        const isMediator = st?.mediador_id === i.user.id;
        const isAdminUser = await isAdmin(i.user, i.guild);
        if (!isOwnerStreamer && !isMediator && !isAdminUser) {
          return i.reply({ content: '❌ Apenas o streamer ou mediador pode finalizar.', flags: EPHEMERAL });
        }
        await finishStreamerQueueEntry(entryId, action === 'skip');
        return i.reply({ content: action === 'skip' ? '⏭️ Pulado.' : '✅ Finalizado.', flags: EPHEMERAL });
      }
    }

    // ═══ strap: (apostas com streamer) ═══
    if (i.customId?.startsWith('strap:')) {
      if (!i.guild) return;
      const [_, action, extra] = i.customId.split(':');

      // Botão placeholder de live — sempre efêmero informativo
      if (action === 'live_placeholder') {
        return i.reply({ content: '⚫ Live não disponível no momento.', flags: EPHEMERAL }).catch(() => {});
      }

      if (action === 'apostar' && extra) {
        const s = await getStreamer(i.guild.id, extra);
        if (!s) return i.reply({ content: '❌ Streamer não encontrado.', flags: EPHEMERAL });
        if (s.status !== 'online') return i.reply({ content: '⚠️ Streamer está offline.', flags: EPHEMERAL });

        const m = new ModalBuilder().setCustomId(`strap:do_apostar:${extra}`).setTitle('🎮 Apostar com Streamer');
        m.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('valor')
              .setLabel('Valor da aposta (R$)').setStyle(TextInputStyle.Short)
              .setValue(String(s.valor_fixo || 0)).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('formato')
              .setLabel('Formato (1v1, 2v2...)').setStyle(TextInputStyle.Short)
              .setPlaceholder('1v1 mobile').setRequired(true)
          ),
        );
        return i.showModal(m);
      }
    }

    if (i.isModalSubmit() && i.customId?.startsWith('strap:do_apostar:')) {
      const streamerId = i.customId.split(':')[2];
      const valor = parseFloat(i.fields.getTextInputValue('valor').replace(',', '.')) || 0;
      const formato = i.fields.getTextInputValue('formato').trim();

      const s = await getStreamer(i.guild.id, streamerId);
      if (!s) return i.reply({ content: '❌', flags: EPHEMERAL });
      if (!s.canal_publico_id) return i.reply({ content: '❌ Streamer sem canal público configurado.', flags: EPHEMERAL });

      const parent = i.guild.channels.cache.get(s.canal_publico_id)
        || await i.guild.channels.fetch(s.canal_publico_id).catch(() => null);
      // ✅ FIX: validação de canal antes de tentar criar thread
      if (!parent || !parent.isTextBased?.()) return i.reply({ content: '❌ Canal público não encontrado.', flags: EPHEMERAL });
      if (!parent.threads?.create) return i.reply({ content: '❌ Canal não suporta threads.', flags: EPHEMERAL });

      try {
        const th = await parent.threads.create({
          name: `streamer-${i.user.username}`.slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          reason: 'Aposta com streamer',
        });
        await sleep(300);
        await th.members.add(i.user.id).catch(() => {});
        await th.members.add(streamerId).catch(() => {});
        if (s.mediador_id) await th.members.add(s.mediador_id).catch(() => {});

        const { data: match } = await supabase.from('ff_matches').insert({
          guild_id: i.guild.id, thread_id: th.id, channel_id: parent.id,
          players: JSON.stringify([i.user.id, streamerId]),
          status: 'waiting', format: formato, value: valor,
          mediator_id: s.mediador_id || null,
        }).select().single();

        const e = new EmbedBuilder()
          .setTitle(`🎮 ${formato}`)
          .setColor('#9146FF')
          .setDescription(
            `<@${i.user.id}> 🆚 <@${streamerId}>\n\n` +
            `💰 **R$ ${valor.toFixed(2)}**\n\n` +
            `Streamer vs espectador. Combinem regras.`
          )
          .setFooter({ text: `Match #${match.id} • Streamer` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:confirmar:${match.id}`).setLabel('Confirmar Regras').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ffm:encerrar:${match.id}`).setLabel('Encerrar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );

        // ✅ FIX: usava s.mediator_id (EN) — agora é s.mediador_id (PT)
        await th.send({
          content: `<@${i.user.id}> <@${streamerId}>${s.mediador_id ? ` <@${s.mediador_id}>` : ''}`,
          embeds: [e],
          components: [row],
        });

        return i.reply({ content: `✅ Thread criada: <#${th.id}>`, flags: EPHEMERAL });
      } catch (e) {
        return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL });
      }
    }
  } catch (err) {
    console.error('[STREAMER-HANDLER]', err);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      i.reply({ content: `❌ Erro: ${err.message}`, flags: EPHEMERAL }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 3/7 — Streamers
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 4/7] SISTEMA DE TICKETS (CORRIGIDA)
// ═══════════════════════════════════════════════════════════

const TICKET_STATUS = {
  aberto:      { emoji: '🟢', label: 'Aberto',             color: '#22c55e' },
  atendimento: { emoji: '🟡', label: 'Em atendimento',     color: '#f1c40f' },
  aguardando:  { emoji: '🟠', label: 'Aguardando cliente', color: '#FFA500' },
  resolvido:   { emoji: '🔵', label: 'Resolvido',          color: '#00AAFF' },
  fechado:     { emoji: '🔴', label: 'Fechado',            color: '#ff5555' },
  excluido:    { emoji: '⚫', label: 'Excluído',           color: '#808080' },
};

const _ticketPanelsCache = new Map();
const _ticketCacheTtl = 60 * 1000;

// ═══════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════
async function getTicketPanels(gid) {
  const cached = _ticketPanelsCache.get(gid);
  if (cached && Date.now() - cached.at < _ticketCacheTtl) return cached.data;

  try {
    const { data } = await supabase.from('configs').select('ticket_panels').eq('guild_id', gid).maybeSingle();
    let raw = data?.ticket_panels;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
    const arr = Array.isArray(raw) ? raw : [];
    _ticketPanelsCache.set(gid, { data: arr, at: Date.now() });
    return arr;
  } catch { return []; }
}

async function saveTicketPanels(gid, panels) {
  let waited = 0;
  while (_ticketSaveLocks.get(gid)) {
    await sleep(50);
    waited += 50;
    if (waited > 5000) break;
  }
  _ticketSaveLocks.set(gid, true);

  try {
    try {
      const { data } = await supabase.from('configs').select('guild_id').eq('guild_id', gid).maybeSingle();
      if (!data) await supabase.from('configs').insert({ guild_id: gid });
    } catch {}

    _ticketPanelsCache.delete(gid);

    const payload = { ticket_panels: panels, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('configs').upsert(
      { guild_id: gid, ...payload }, { onConflict: 'guild_id' }
    );
    if (error) return { ok: false, error: error.message };

    _ticketPanelsCache.set(gid, { data: panels, at: Date.now() });

    for (const p of panels) {
      if (p?.canal_id && p?.mensagem_id) {
        scheduleRefresh(`ticket:${gid}:${p.id}`, () => refreshTicketPanelMessage(gid, p.id), 800);
      }
    }
    return { ok: true };
  } finally { _ticketSaveLocks.delete(gid); }
}

async function createTicketPanel(gid, data) {
  _ticketPanelsCache.delete(gid);
  const panels = await getTicketPanels(gid);
  if (panels.length >= MAX_TICKET_PANELS) throw new Error(`Limite ${MAX_TICKET_PANELS} painéis.`);
  const ids = panels.map(p => Number(p.id)).filter(Number.isFinite);
  const newId = ids.length ? Math.max(...ids) + 1 : 1;
  const panel = newTicketPanel(newId, data);
  panels.push(panel);
  const res = await saveTicketPanels(gid, panels);
  if (!res.ok) throw new Error(`Falha ao salvar: ${res.error}`);
  return panel;
}

async function updateTicketPanel(gid, panelId, patch) {
  const pid = Number(panelId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'ID inválido.' };
  _ticketPanelsCache.delete(gid);
  const panels = await getTicketPanels(gid);
  const idx = panels.findIndex(p => Number(p.id) === pid);
  if (idx === -1) return { ok: false, error: `Painel #${panelId} não encontrado.` };
  panels[idx] = { ...panels[idx], ...patch, updated_at: new Date().toISOString() };
  const res = await saveTicketPanels(gid, panels);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, panel: panels[idx] };
}

async function deleteTicketPanel(gid, panelId) {
  const pid = Number(panelId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'ID inválido.' };
  _ticketPanelsCache.delete(gid);
  const panels = await getTicketPanels(gid);
  const filtered = panels.filter(p => Number(p.id) !== pid);
  if (filtered.length === panels.length) return { ok: false, error: 'Painel não encontrado.' };
  const res = await saveTicketPanels(gid, filtered);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

async function getTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => Number(p.id) === Number(panelId)) || null;
}

function newTicketPanel(id, data = {}) {
  return {
    id,
    nome: safeStr(data.nome, 80) || `Painel ${id}`,
    titulo: safeStr(data.titulo, 256) || 'Central de Suporte',
    descricao: safeStr(data.descricao, 4000) || 'Clique abaixo para abrir um ticket.',
    cor: safeColor(data.cor, '#9B59B6'),
    banner: safeUrl(data.banner),
    thumbnail: safeUrl(data.thumbnail),
    footer: safeStr(data.footer, 2048) || null,
    botao_label: safeStr(data.botao_label, 80) || 'Abrir Ticket',
    botao_emoji: safeStr(data.botao_emoji, 8) || '🎫',
    cargo_id: safeStr(data.cargo_id) || null,
    log_channel_id: safeStr(data.log_channel_id) || null,
    canal_id: null,
    mensagem_id: null,
    categoria_padrao_id: safeStr(data.categoria_padrao_id) || null,
    limite_tickets_usuario: Number.isFinite(Number(data.limite_tickets_usuario)) ? Number(data.limite_tickets_usuario) : 1,
    auto_close_horas: Number.isFinite(Number(data.auto_close_horas)) ? Number(data.auto_close_horas) : 48,
    fechar_ao_sair: !!data.fechar_ao_sair,
    horario_atendimento: safeStr(data.horario_atendimento, 100) || null,
    mensagem_boas_vindas: safeStr(data.mensagem_boas_vindas, 1000) || null,
    avaliacao_ativa: data.avaliacao_ativa !== false,
    formulario: {
      habilitado: !!data?.formulario?.habilitado,
      perguntas: Array.isArray(data?.formulario?.perguntas) ? data.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS) : [],
    },
    tipos: Array.isArray(data.tipos) ? data.tipos : [],
    bloqueio_usuarios_ids: Array.isArray(data.bloqueio_usuarios_ids) ? data.bloqueio_usuarios_ids : [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════
// EMBED PÚBLICO
// ═══════════════════════════════════════════════════════════
function buildTicketPanelEmbed(panel) {
  const e = new EmbedBuilder();
  applyEmbedSafe(e, {
    title: panel.titulo,
    description: panel.descricao,
    color: panel.cor,
    thumbnail: panel.thumbnail,
    image: panel.banner,
    footer: panel.footer || `Painel #${panel.id} • ${panel.nome}`,
  });

  if (Array.isArray(panel.tipos) && panel.tipos.length > 1) {
    const lines = panel.tipos
      .filter(t => safeStr(t?.label))
      .slice(0, 20)
      .map(t => `${safeStr(t.emoji) || '🎫'} **${safeStr(t.label)}**${safeStr(t.descricao) ? `\n> ${safeStr(t.descricao).slice(0, 80)}` : ''}`)
      .join('\n');
    if (lines) e.addFields({ name: '📋 Tipos disponíveis', value: lines.slice(0, 1024), inline: false });
  }

  if (!e.data.footer) e.setFooter({ text: `Painel #${panel.id}` });
  e.setTimestamp();
  return e;
}

function buildTicketPanelComponents(panel) {
  const tipos = Array.isArray(panel.tipos) ? panel.tipos.filter(t => safeStr(t?.label)) : [];
  const panelId = panel.id;

  if (!tipos.length) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panelId}:sem_tipo`)
        .setLabel(safeStr(panel.botao_label, 80) || 'Abrir Ticket')
        .setEmoji(safeStr(panel.botao_emoji, 8) || '🎫')
        .setStyle(ButtonStyle.Primary),
    )];
  }

  if (tipos.length === 1) {
    const t = tipos[0];
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panelId}:${t.id}`)
        .setLabel(safeStr(t.label, 80) || panel.botao_label || 'Abrir Ticket')
        .setEmoji(safeStr(t.emoji, 8) || panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary),
    )];
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_pick_type:${panelId}`)
    .setPlaceholder('🎫 Selecione o tipo')
    .setMinValues(1).setMaxValues(1);

  for (const t of tipos.slice(0, MAX_TICKET_TYPES_PER_PANEL)) {
    menu.addOptions({
      label: safeStr(t.label, 90) || 'Tipo',
      value: String(t.id),
      emoji: safeStr(t.emoji, 8) || '🎫',
      description: safeStr(t.descricao, 100) || undefined,
    });
  }

  return [new ActionRowBuilder().addComponents(menu)];
}

async function refreshTicketPanelMessage(guildId, panelId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const panel = await getTicketPanel(guildId, panelId);
    if (!panel?.canal_id || !panel?.mensagem_id) return false;
    const ch = g.channels.cache.get(panel.canal_id) || await g.channels.fetch(panel.canal_id).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(panel.mensagem_id).catch(() => null);
    if (!msg) return false;
    await msg.edit({
      embeds: [buildTicketPanelEmbed(panel)],
      components: buildTicketPanelComponents(panel),
    });
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════
// BOTÕES INTERNOS DA THREAD
// ═══════════════════════════════════════════════════════════
function buildTicketInnerButtons(threadId, opts = {}) {
  const assumed = !!opts.assumedBy;
  const priority = !!opts.isPriority;
  const locked = !!opts.locked;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkt:claim:${threadId}`).setLabel(assumed ? 'Assumido' : 'Assumir').setEmoji('🙋').setStyle(assumed ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(assumed),
      new ButtonBuilder().setCustomId(`tkt:unclaim:${threadId}`).setLabel('Devolver').setEmoji('↩️').setStyle(ButtonStyle.Secondary).setDisabled(!assumed),
      new ButtonBuilder().setCustomId(`tkt:lock:${threadId}`).setLabel(locked ? 'Desbloquear' : 'Bloquear').setEmoji(locked ? '🔓' : '🔒').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tkt:priority:${threadId}`).setLabel(priority ? 'Prioridade ON' : 'Prioridade').setEmoji(priority ? '🔴' : '⚪').setStyle(priority ? ButtonStyle.Danger : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkt:add:${threadId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tkt:rename:${threadId}`).setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tkt:transfer:${threadId}`).setLabel('Transferir').setEmoji('↪️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkt:close:${threadId}`).setLabel('Fechar').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tkt:delete:${threadId}`).setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function refreshTicketButtons(thread, td) {
  try {
    if (!thread?.isThread?.()) return;
    const msgs = await thread.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs) return;
    const botMsg = msgs.find(m =>
      m.author.id === client.user.id &&
      m.components?.[0]?.components?.[0]?.customId?.startsWith(`tkt:claim:${thread.id}`)
    );
    if (!botMsg) return;
    await botMsg.edit({
      components: buildTicketInnerButtons(thread.id, {
        assumedBy: td?.assumed_by, isPriority: td?.is_priority, locked: td?.locked,
      }),
    }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// EMBED DE BOAS-VINDAS
// ═══════════════════════════════════════════════════════════
function buildTicketWelcomeEmbed(panel, tipo, authorId, formAnswers, cfg = null) {
  const meta = TICKET_STATUS.aberto;
  const tipoEmoji = safeStr(tipo?.emoji) || '🎫';
  const tipoLabel = safeStr(tipo?.label) || 'Suporte';

  const e = new EmbedBuilder().setColor(meta.color).setTitle(`${tipoEmoji} ${tipoLabel}`);
  const desc = safeStr(tipo?.descricao)
    || safeStr(panel?.mensagem_boas_vindas)
    || 'Um atendente virá em breve.';

  const parts = [desc, ''];
  parts.push(`**Aberto por:** <@${authorId}>`);
  if (safeStr(panel?.horario_atendimento)) parts.push(`**Horário:** ${panel.horario_atendimento}`);
  parts.push(`**Atendido por:** *aguardando...*`);
  e.setDescription(parts.join('\n'));

  e.addFields(
    { name: '📌 Status', value: `${meta.emoji} ${meta.label}`, inline: true },
    { name: '🎫 Tipo', value: tipoLabel, inline: true },
  );

  if (Array.isArray(formAnswers) && formAnswers.length) {
    const answersText = formAnswers.slice(0, 5).map(a => `**${a.label}:** ${a.value}`).join('\n');
    if (safeStr(answersText)) e.addFields({ name: '📝 Respostas', value: answersText.slice(0, 1024) });
  }

  if (safeStr(panel?.horario_atendimento)) e.setFooter({ text: `Atendimento: ${panel.horario_atendimento}` });
  e.setTimestamp();
  return e;
}

// ═══════════════════════════════════════════════════════════
// VALIDAÇÕES
// ═══════════════════════════════════════════════════════════
async function canUserOpenTicket(guild, member, panel) {
  if (!member) return { ok: false, reason: '❌ Não consegui te identificar.' };

  if (Array.isArray(panel.bloqueio_usuarios_ids) && panel.bloqueio_usuarios_ids.includes(member.id)) {
    return { ok: false, reason: '🚫 Você está bloqueado de abrir tickets neste painel.' };
  }

  const lim = Number(panel.limite_tickets_usuario) || 0;
  if (lim > 0) {
    const { count } = await supabase.from('ticket_data')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guild.id).eq('user_id', member.id).eq('panel_id', panel.id)
      .is('closed_at', null);
    if ((count || 0) >= lim) {
      return { ok: false, reason: `🚫 Você já tem **${count}** ticket(s) aberto(s). Limite: **${lim}**.` };
    }
  }
  return { ok: true };
}

function ticketCooldownCheck(userId, ms = 5000) {
  const now = Date.now();
  const last = TICKET_COOLDOWN.get(userId) || 0;
  if (now - last < ms) return false;
  TICKET_COOLDOWN.set(userId, now);
  if (TICKET_COOLDOWN.size > 500) TICKET_COOLDOWN.clear();
  return true;
}

// ═══════════════════════════════════════════════════════════
// LOG DE TICKET
// ═══════════════════════════════════════════════════════════
async function logTicketAction(guild, panel, action, opts = {}) {
  if (!panel?.log_channel_id) return;
  try {
    const ch = guild.channels.cache.get(panel.log_channel_id)
      || await guild.channels.fetch(panel.log_channel_id).catch(() => null);
    if (!ch) return;

    const colors = {
      aberto: '#22c55e', assumido: '#00AAFF', fechado: '#ff5555',
      transferido: '#9B59B6', prioridade: '#FFA500', excluido: '#808080',
    };

    const e = new EmbedBuilder()
      .setTitle(`🎫 Log • ${action.toUpperCase()}`)
      .setColor(colors[action] || '#5865F2')
      .setTimestamp();

    const fields = [];
    if (opts.threadName) fields.push({ name: '🧵 Thread', value: opts.threadName, inline: true });
    if (opts.userId) fields.push({ name: '👤 Autor', value: `<@${opts.userId}>`, inline: true });
    if (opts.staffId) fields.push({ name: '🛡️ Staff', value: `<@${opts.staffId}>`, inline: true });
    if (opts.tipoLabel) fields.push({ name: '🎯 Tipo', value: opts.tipoLabel, inline: true });
    if (opts.reason) fields.push({ name: '📝 Motivo', value: opts.reason, inline: false });
    if (fields.length) e.addFields(fields.slice(0, 25));

    await ch.send({ embeds: [e] }).catch(() => {});
  } catch (err) { console.error('[TKT-LOG]', err.message); }
}

// ═══════════════════════════════════════════════════════════
// OPEN TICKET
// ═══════════════════════════════════════════════════════════
async function openTicket(i, panel, tipo, formAnswers = []) {
  const guild = i.guild;
  const cfg = await getConfig(guild.id);

  if (!guild.members.me) { try { await guild.members.fetchMe(); } catch {} }
  if (!guild.members.me) throw new Error('Bot não conseguiu se identificar.');

  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.CreatePrivateThreads)) {
    throw new Error('Bot sem permissão **Criar Tópicos Privados**.');
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageThreads)) {
    throw new Error('Bot sem permissão **Gerenciar Tópicos**.');
  }

  const resolveParent = (id) => {
    if (!id) return null;
    const ch = guild.channels.cache.get(id);
    if (!ch) return null;
    if (ch.type !== ChannelType.GuildText) return null;
    if (ch.isThread?.()) return null;
    return ch;
  };

  let parentCh = resolveParent(tipo?.topic_channel_id) || resolveParent(tipo?.canal_id) || resolveParent(panel?.canal_id);
  if (!parentCh && i.channel?.isTextBased?.() && !i.channel.isThread?.()) parentCh = i.channel;

  if (!parentCh && safeStr(panel?.categoria_padrao_id)) {
    const cat = guild.channels.cache.get(panel.categoria_padrao_id);
    if (cat?.type === ChannelType.GuildCategory) {
      parentCh = await guild.channels.create({
        name: '🎟・tickets', type: ChannelType.GuildText, parent: cat.id,
      }).catch(() => null);
    }
  }

  if (!parentCh) throw new Error('Não encontrei canal de TEXTO válido.');

  const tipoSlug = (safeStr(tipo?.label) || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const nomeThread = `${safeStr(tipo?.emoji) || '🎫'}${tipoSlug}-${i.user.username}`.slice(0, 90);

  const th = await parentCh.threads.create({
    name: nomeThread,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    reason: `Ticket ${safeStr(tipo?.label) || 'geral'}`,
  });
  await sleep(300);
  await th.members.add(i.user.id).catch(() => {});

  const roleId = safeStr(tipo?.cargo_responsavel_id) || safeStr(panel?.cargo_id) || safeStr(cfg.ticket_cargo);
  if (roleId) {
    const r = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (r) await Promise.allSettled([...r.members.values()].slice(0, 50).map(m => th.members.add(m.id).catch(() => {})));
  }

  try {
    await supabase.from('ticket_data').upsert({
      thread_id: th.id, guild_id: guild.id, user_id: i.user.id,
      panel_id: panel.id, type_id: tipo?.id || null, status: 'aberto',
      form_answers: Array.isArray(formAnswers) && formAnswers.length ? formAnswers : null,
      opened_at: new Date().toISOString(),
      locked: false, is_priority: false, assumed_by: null,
    }, { onConflict: 'thread_id' });
  } catch {}

  const e = buildTicketWelcomeEmbed(panel, tipo, i.user.id, formAnswers, cfg);
  const ping = roleId ? `<@&${roleId}>` : '';
  await th.send({ content: ping || null, embeds: [e], components: buildTicketInnerButtons(th.id, {}) });

  // ✅ FIX: logar abertura do ticket
  await logTicketAction(guild, panel, 'aberto', {
    threadName: th.name,
    userId: i.user.id,
    tipoLabel: safeStr(tipo?.label) || 'Geral',
  });

  return th;
}

// ═══════════════════════════════════════════════════════════
// AÇÕES DA THREAD
// ═══════════════════════════════════════════════════════════
async function ensureMember(i) {
  if (i.member) return i.member;
  if (!i.guild) return null;
  try { i.member = await i.guild.members.fetch(i.user.id); } catch {}
  return i.member;
}

async function ticketActionClaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (td?.assumed_by) return i.reply({ content: `⚠️ Já assumido por <@${td.assumed_by}>.`, flags: EPHEMERAL });
  await supabase.from('ticket_data').upsert({
    thread_id: th.id, guild_id: i.guild.id, user_id: td?.user_id || i.user.id,
    assumed_by: i.user.id, assumed_at: new Date().toISOString(), status: 'atendimento',
  }, { onConflict: 'thread_id' });
  await th.send({ content: `🙋 <@${i.user.id}> assumiu.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);

  const panel = await getTicketPanel(i.guild.id, td?.panel_id);
  await logTicketAction(i.guild, panel, 'assumido', {
    threadName: th.name, staffId: i.user.id, userId: td?.user_id,
  });

  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionUnclaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td?.assumed_by) return i.reply({ content: '⚠️ Ninguém assumiu.', flags: EPHEMERAL });

  // ✅ FIX: guard i.member
  const mem = await ensureMember(i);
  const isOwner = td.assumed_by === i.user.id;
  const isStaff = isDeveloper(i.user.id)
    || i.user.id === i.guild.ownerId
    || (mem?.permissions?.has(PermissionFlagsBits.Administrator) ?? false);
  if (!isOwner && !isStaff) return i.reply({ content: '❌', flags: EPHEMERAL });

  await supabase.from('ticket_data').update({ assumed_by: null, assumed_at: null, status: 'aberto' }).eq('thread_id', th.id);
  await th.send({ content: `↩️ <@${i.user.id}> devolveu.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);
  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionLock(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });
  const wasLocked = !!td.locked;
  await supabase.from('ticket_data').update({ locked: !wasLocked }).eq('thread_id', th.id);
  if (!wasLocked) {
    await th.members.remove(td.user_id).catch(() => {});
    await th.send({ content: `🔒 Bloqueado por <@${i.user.id}>.` });
  } else {
    await th.members.add(td.user_id).catch(() => {});
    await th.send({ content: `🔓 Desbloqueado.` });
  }
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);
  return i.reply({ content: wasLocked ? '🔓' : '🔒', flags: EPHEMERAL });
}

async function ticketActionPriority(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const nv = !td?.is_priority;
  await supabase.from('ticket_data').update({ is_priority: nv, priority_set_by: i.user.id }).eq('thread_id', th.id);
  const base = th.name.replace(/^🔴\s*/, '');
  await th.setName(nv ? `🔴 ${base}`.slice(0, 100) : base).catch(() => {});
  await th.send({ content: nv ? `🔴 **ALTA** por <@${i.user.id}>` : `⚪ Removida.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);

  const panel = await getTicketPanel(i.guild.id, td?.panel_id);
  if (nv) await logTicketAction(i.guild, panel, 'prioridade', { threadName: th.name, staffId: i.user.id });

  return i.reply({ content: nv ? '🔴' : '⚪', flags: EPHEMERAL });
}

// ═══════════════════════════════════════════════════════════
// TRANSCRIPT DE TICKET (log + DM de quem abriu)
// ═══════════════════════════════════════════════════════════
const TRANSCRIPT_MAX_MESSAGES = 3000;

async function fetchAllThreadMessages(thread, max = TRANSCRIPT_MAX_MESSAGES) {
  const all = [];
  let before;
  while (all.length < max) {
    const batch = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || !batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function transcriptDate(ts) {
  try { return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return new Date(ts).toISOString(); }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function transcriptEmbedLines(e) {
  const d = e?.data || e || {};
  const lines = [];
  if (d.author?.name) lines.push(d.author.name);
  if (d.title) lines.push(d.title);
  if (d.description) lines.push(d.description);
  for (const f of d.fields || []) lines.push(`${f.name}: ${f.value}`);
  if (d.footer?.text) lines.push(d.footer.text);
  return lines;
}

async function buildTicketTranscript(thread, td, meta = {}) {
  const msgs = await fetchAllThreadMessages(thread);
  const truncated = msgs.length >= TRANSCRIPT_MAX_MESSAGES;
  const guildName = thread.guild?.name || '';
  const slug = String(thread.name || 'ticket').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ticket';

  const header = [
    `${ORG_NAME} — Transcript de ticket`,
    `Servidor: ${guildName}`,
    `Ticket: ${thread.name} (${thread.id})`,
    td?.user_id ? `Aberto por: ${td.user_id}` : null,
    td?.opened_at ? `Aberto em: ${transcriptDate(td.opened_at)}` : null,
    `Fechado em: ${transcriptDate(Date.now())}`,
    meta.closedBy ? `Fechado por: ${meta.closedBy}` : null,
    meta.reason ? `Motivo: ${meta.reason}` : null,
    `Mensagens: ${msgs.length}${truncated ? ' (limite atingido — mensagens mais antigas omitidas)' : ''}`,
  ].filter(Boolean);

  // ── TXT ──
  const txt = [header.join('\n'), '='.repeat(60), ''];
  // ── HTML ──
  const rows = [];

  for (const m of msgs) {
    const author = m.author?.tag || m.author?.username || 'Desconhecido';
    const ts = transcriptDate(m.createdTimestamp);
    const content = m.cleanContent || m.content || '';
    const atts = [...(m.attachments?.values?.() || [])];
    const embeds = (m.embeds || []).map(transcriptEmbedLines).filter(l => l.length);

    txt.push(`[${ts}] ${author}${m.author?.bot ? ' [BOT]' : ''}: ${content}`.trimEnd());
    for (const a of atts) txt.push(`    📎 ${a.name || 'arquivo'}: ${a.url}`);
    for (const lines of embeds) txt.push(...lines.map(l => `    ┃ ${String(l).replace(/\n/g, '\n    ┃ ')}`));

    rows.push(
      `<div class="msg"><div class="meta"><span class="author${m.author?.bot ? ' bot' : ''}">${escapeHtml(author)}</span>` +
      `<span class="time">${escapeHtml(ts)}</span></div>` +
      (content ? `<div class="content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>` : '') +
      atts.map(a => `<div class="att">📎 <a href="${escapeHtml(a.url)}">${escapeHtml(a.name || 'arquivo')}</a></div>`).join('') +
      embeds.map(lines => `<div class="embed">${lines.map(l => escapeHtml(l).replace(/\n/g, '<br>')).join('<br>')}</div>`).join('') +
      `</div>`
    );
  }

  const html =
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Transcript — ${escapeHtml(thread.name)}</title><style>` +
    `body{background:#1e1f22;color:#dbdee1;font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:16px}` +
    `.head{background:#2b2d31;border-left:4px solid #5865f2;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:14px;line-height:1.5}` +
    `.head h1{margin:0 0 6px;font-size:18px}.msg{padding:8px 12px;border-bottom:1px solid #2b2d31}` +
    `.meta{font-size:12px;margin-bottom:2px}.author{font-weight:600;color:#fff;margin-right:8px}.author.bot{color:#5865f2}` +
    `.time{color:#949ba4}.content{white-space:normal;word-break:break-word;font-size:14px}` +
    `.att{font-size:13px;margin-top:4px}.att a{color:#00a8fc}.embed{background:#2b2d31;border-left:4px solid #4f545c;border-radius:4px;padding:8px 10px;margin-top:6px;font-size:13px}` +
    `</style></head><body><div class="head"><h1>${ORG_EMOJI} ${escapeHtml(ORG_NAME)} — Transcript</h1>` +
    header.slice(1).map(h => escapeHtml(h)).join('<br>') + `</div>` + rows.join('') + `</body></html>`;

  return {
    count: msgs.length,
    truncated,
    files: [
      { name: `transcript-${slug}.html`, buffer: Buffer.from(html, 'utf8') },
      { name: `transcript-${slug}.txt`,  buffer: Buffer.from(txt.join('\n'), 'utf8') },
    ],
  };
}

// Gera o transcript e envia: (1) no canal de log do ticket, (2) na DM de quem abriu.
async function deliverTicketTranscript(guild, thread, td, panel, opts = {}) {
  const result = { logged: false, dm: false, count: 0 };
  try {
    const tr = await buildTicketTranscript(thread, td, opts);
    result.count = tr.count;
    const mkFiles = () => tr.files.map(f => new AttachmentBuilder(f.buffer, { name: f.name }));

    const infoLines = [
      `🧵 **Ticket:** ${thread.name}`,
      td?.user_id ? `👤 **Autor:** <@${td.user_id}>` : null,
      opts.closedBy ? `🛡️ **Fechado por:** <@${opts.closedBy}>` : null,
      opts.reason ? `📝 **Motivo:** ${opts.reason}` : null,
      `💬 **Mensagens:** ${tr.count}${tr.truncated ? ' (limite atingido)' : ''}`,
    ].filter(Boolean).join('\n');

    // 1. LOG
    try {
      const cfg = await getConfig(guild.id);
      const logId = panel?.log_channel_id || cfg?.ticket_log_channel;
      const logCh = logId ? (guild.channels.cache.get(logId) || await guild.channels.fetch(logId).catch(() => null)) : null;
      if (logCh) {
        const e = new EmbedBuilder().setTitle('📄 Transcript do ticket').setColor('#5865F2')
          .setDescription(infoLines).setFooter({ text: `${ORG_NAME} ${ORG_EMOJI}` }).setTimestamp();
        await logCh.send({ embeds: [e], files: mkFiles() });
        result.logged = true;
      }
    } catch (err) { console.error('[TRANSCRIPT-LOG]', err.message); }

    // 2. DM de quem abriu o ticket
    if (td?.user_id) {
      try {
        const user = await client.users.fetch(td.user_id).catch(() => null);
        if (user) {
          const e = new EmbedBuilder().setTitle('📄 Transcript do seu ticket').setColor('#5865F2')
            .setDescription(`Seu ticket em **${guild.name}** foi encerrado. Segue o histórico da conversa em anexo.\n\n${infoLines}`)
            .setFooter({ text: `${ORG_NAME} ${ORG_EMOJI}` }).setTimestamp();
          await user.send({ embeds: [e], files: mkFiles() });
          result.dm = true;
        }
      } catch (err) {
        console.warn(`[TRANSCRIPT-DM] não consegui enviar para ${td.user_id}: ${err.message}`);
      }
      if (!result.dm) {
        // avisa a staff no log que a DM do autor estava fechada
        try {
          const cfg = await getConfig(guild.id);
          const logId = panel?.log_channel_id || cfg?.ticket_log_channel;
          const logCh = logId ? (guild.channels.cache.get(logId) || null) : null;
          if (logCh) await logCh.send({ content: `⚠️ Não consegui enviar o transcript na DM de <@${td.user_id}> (DM fechada ou usuário fora do servidor).` }).catch(() => {});
        } catch {}
      }
    }
  } catch (err) {
    console.error('[TRANSCRIPT]', err);
  }
  return result;
}

async function ticketActionClose(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  if (TICKET_CLOSING.has(th.id)) return i.reply({ content: '⏳ Fechando...', flags: EPHEMERAL });
  TICKET_CLOSING.add(th.id);
  await i.deferReply({ flags: EPHEMERAL }).catch(() => {});
  try {
    const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
    await supabase.from('ticket_data').update({
      closed_at: new Date().toISOString(), closed_by: i.user.id, status: 'fechado', closed_reason: 'manual',
    }).eq('thread_id', th.id);

    await th.send({ content: `✅ Fechado por <@${i.user.id}>.` }).catch(() => {});

    const panel = await getTicketPanel(i.guild.id, td?.panel_id);

    // transcript ANTES de trancar/arquivar (log + DM de quem abriu)
    const tr = await deliverTicketTranscript(i.guild, th, td, panel, { closedBy: i.user.id, reason: 'Fechado manualmente' });

    if (td?.user_id) setTimeout(() => sendTicketRatingDM(td.user_id, th.id, th.name).catch(() => {}), 3000);

    await th.setLocked(true).catch(() => {});
    await th.setArchived(true).catch(() => {});

    await logTicketAction(i.guild, panel, 'fechado', {
      threadName: th.name, staffId: i.user.id, userId: td?.user_id,
    });

    const msg = tr.dm ? '🔒 Fechado. Transcript enviado no log e na DM de quem abriu.'
      : tr.logged ? '🔒 Fechado. Transcript enviado no log (a DM de quem abriu está fechada).'
      : '🔒 Fechado. ⚠️ Não consegui enviar o transcript.';
    return i.editReply({ content: msg }).catch(() => {});
  } finally {
    setTimeout(() => TICKET_CLOSING.delete(th.id), 60000);
  }
}

async function ticketActionDelete(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  await i.deferReply({ flags: EPHEMERAL }).catch(() => {});
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await supabase.from('ticket_data').update({
    closed_at: new Date().toISOString(), status: 'excluido',
  }).eq('thread_id', th.id);

  const panel = await getTicketPanel(i.guild.id, td?.panel_id);

  // salva o transcript antes de apagar a thread
  await deliverTicketTranscript(i.guild, th, td, panel, { closedBy: i.user.id, reason: 'Ticket excluído' });

  await logTicketAction(i.guild, panel, 'excluido', {
    threadName: th.name, staffId: i.user.id, userId: td?.user_id,
  });

  await i.editReply({ content: '🗑️ Transcript enviado. Excluindo...' }).catch(() => {});
  setTimeout(() => th.delete().catch(() => {}), 3000);
}

async function ticketActionTransfer(i, tipoId) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });
  const panel = await getTicketPanel(i.guild.id, td.panel_id);
  if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
  const novoTipo = (panel.tipos || []).find(t => String(t.id) === String(tipoId));
  if (!novoTipo) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
  await supabase.from('ticket_data').update({ type_id: tipoId }).eq('thread_id', th.id);
  await th.send({ content: `↪️ Transferido para **${novoTipo.emoji || '🎫'} ${novoTipo.label}** por <@${i.user.id}>.` });

  await logTicketAction(i.guild, panel, 'transferido', {
    threadName: th.name, staffId: i.user.id,
    reason: `→ ${novoTipo.label}`,
  });

  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionRate(i, stars) {
  try {
    const parts = i.customId.split(':');
    const thId = parts[2];
    const n = parseInt(stars, 10) || parseInt(parts[3], 10) || 0;
    if (!thId || n < 1 || n > 5) return i.reply({ content: '❌ Nota inválida.', flags: EPHEMERAL });

    const { data: td } = await supabase.from('ticket_data').select('assumed_by').eq('thread_id', thId).maybeSingle();
    try {
      // ✅ FIX: i.guild pode ser null em DM
      await supabase.from('ticket_ratings').insert({
        guild_id: i.guild?.id || null,
        thread_id: thId,
        user_id: i.user.id,
        staff_id: td?.assumed_by || null,
        rating: n,
      });
    } catch {}

    await i.update({
      embeds: [new EmbedBuilder().setTitle('⭐ Obrigado!').setColor('#FFD700')
        .setDescription(`Você avaliou com **${'⭐'.repeat(n)}** (${n}/5).`)],
      components: [],
    }).catch(() => {});
  } catch (e) { console.error('[RATE]', e); }
}

async function sendTicketRatingDM(userId, threadId, threadName) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const e = new EmbedBuilder().setTitle('⭐ Avalie seu atendimento').setColor('#FFD700')
      .setDescription(`Seu ticket **${threadName}** foi fechado.\n\nComo você avalia?`)
      .setFooter({ text: 'Clique em uma estrela' });
    const row = new ActionRowBuilder().addComponents(
      ...[1, 2, 3, 4, 5].map(n =>
        new ButtonBuilder().setCustomId(`tkt:rate:${threadId}:${n}`).setLabel(String(n)).setEmoji('⭐')
          .setStyle(n === 5 ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
    );
    await user.send({ embeds: [e], components: [row] }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// EDITOR PANELS
// ═══════════════════════════════════════════════════════════
async function ticketEditorPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌ Painel não encontrado.', embeds: [], components: [] };

  const tipos = Array.isArray(panel.tipos) ? panel.tipos : [];
  const e = new EmbedBuilder()
    .setTitle(`🎨 Editando Painel #${panel.id}`)
    .setColor(panel.cor)
    .setDescription(`**${panel.nome}**`)
    .addFields(
      { name: '📝 Título', value: safeStr(panel.titulo, 80) || '—', inline: false },
      { name: '📄 Descrição', value: safeStr(panel.descricao, 100) || '—', inline: false },
      { name: '🎨 Cor', value: `\`${panel.cor}\``, inline: true },
      { name: '🎫 Botão', value: `${panel.botao_emoji || '🎫'} ${panel.botao_label || '—'}`, inline: true },
      { name: '🎯 Tipos', value: `${tipos.length}`, inline: true },
      { name: '🛡️ Cargo', value: panel.cargo_id ? `<@&${panel.cargo_id}>` : '*—*', inline: true },
      { name: '📋 Logs', value: panel.log_channel_id ? `<#${panel.log_channel_id}>` : '*—*', inline: true },
      { name: '👤 Limite', value: `${panel.limite_tickets_usuario} por user`, inline: true },
      { name: '⏰ Auto-close', value: panel.auto_close_horas ? `${panel.auto_close_horas}h` : 'Off', inline: true },
      { name: '🚪 Fechar ao sair', value: panel.fechar_ao_sair ? '✅' : '❌', inline: true },
      { name: '⭐ Avaliação', value: panel.avaliacao_ativa !== false ? '✅' : '❌', inline: true },
      { name: '📝 Formulário', value: panel.formulario?.habilitado ? `✅ ${panel.formulario.perguntas.length}p` : '❌', inline: true },
      { name: '🚫 Bloqueados', value: `${panel.bloqueio_usuarios_ids.length}`, inline: true },
      { name: '📢 Postado', value: panel.canal_id ? `<#${panel.canal_id}>` : '*não*', inline: true },
    );

  const banner = safeUrl(panel.banner); if (banner) e.setImage(banner);
  const thumb = safeUrl(panel.thumbnail); if (thumb) e.setThumbnail(thumb);
  e.setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktedit:embed:${panelId}`).setLabel('Embed').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:button:${panelId}`).setLabel('Botão').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:types:${panelId}`).setLabel('Tipos').setEmoji('🎯').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tktedit:staff:${panelId}`).setLabel('Staff & Logs').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktedit:config:${panelId}`).setLabel('Config').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:form:${panelId}`).setLabel('Formulário').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:blocks:${panelId}`).setLabel('Bloqueios').setEmoji('🚫').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktedit:preview:${panelId}`).setLabel('Preview').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tktedit:post:${panelId}`).setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tktedit:delete:${panelId}`).setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cfgtkt:menu').setLabel('Menu').setEmoji('🏠').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ticketTypesPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const tipos = Array.isArray(panel.tipos) ? panel.tipos : [];

  const desc = tipos.length
    ? tipos.map((t, idx) => {
        const canal = t.canal_id ? `<#${t.canal_id}>` : '*canal do painel*';
        const cargo = t.cargo_responsavel_id ? `<@&${t.cargo_responsavel_id}>` : '*cargo do painel*';
        const topic = t.topic_channel_id ? `<#${t.topic_channel_id}>` : '*canal do ticket/painel*';
        return `**${idx + 1}.** ${t.emoji || '🎫'} **${t.label}** — \`${t.id}\`\n> 📁 ${canal}\n> 🧵 Tópico: ${topic}\n> 🎭 ${cargo}`;
      }).join('\n\n')
    : '*Nenhum tipo ainda.*';

  const e = new EmbedBuilder()
    .setTitle(`🎯 Tipos do Painel #${panelId}`)
    .setColor(panel.cor)
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `${tipos.length}/${MAX_TICKET_TYPES_PER_PANEL} tipos` });

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkttype:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(tipos.length >= MAX_TICKET_TYPES_PER_PANEL),
      new ButtonBuilder().setCustomId(`tkttype:edit:${panelId}`).setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!tipos.length),
      new ButtonBuilder().setCustomId(`tkttype:del:${panelId}`).setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!tipos.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function ticketConfigPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const e = new EmbedBuilder()
    .setTitle(`⚙️ Config do Painel #${panelId}`)
    .setColor(panel.cor)
    .addFields(
      { name: '👤 Limite/user', value: `${panel.limite_tickets_usuario}`, inline: true },
      { name: '⏰ Auto-close', value: panel.auto_close_horas ? `${panel.auto_close_horas}h` : 'Off', inline: true },
      { name: '🚪 Fechar ao sair', value: panel.fechar_ao_sair ? '✅' : '❌', inline: true },
      { name: '🕐 Horário', value: safeStr(panel.horario_atendimento) || '*—*', inline: false },
      { name: '⭐ Avaliação', value: panel.avaliacao_ativa !== false ? '✅' : '❌', inline: true },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktcfg:limite:${panelId}`).setLabel('Limite').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:autoclose:${panelId}`).setLabel('Auto-close').setEmoji('⏰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:sair:${panelId}`).setLabel(panel.fechar_ao_sair ? 'Desativar sair' : 'Fechar ao sair').setEmoji('🚪').setStyle(panel.fechar_ao_sair ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tktcfg:horario:${panelId}`).setLabel('Horário').setEmoji('🕐').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktcfg:aval:${panelId}`).setLabel(panel.avaliacao_ativa !== false ? 'Desativar aval' : 'Ativar aval').setEmoji('⭐').setStyle(panel.avaliacao_ativa !== false ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ticketFormPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const form = panel.formulario || { habilitado: false, perguntas: [] };

  const desc = form.perguntas.length
    ? form.perguntas.map((p, idx) => `**${idx + 1}.** ${p.label}${p.obrigatorio ? ' *(obrigatório)*' : ''}`).join('\n\n')
    : '*Nenhuma pergunta.*';

  const e = new EmbedBuilder()
    .setTitle(`📝 Formulário #${panelId}`)
    .setColor(form.habilitado ? '#22c55e' : '#808080')
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `${form.perguntas.length}/${MAX_FORM_QUESTIONS} • ${form.habilitado ? 'ATIVO' : 'INATIVO'}` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tktform:toggle:${panelId}`).setLabel(form.habilitado ? 'Desativar' : 'Ativar').setEmoji(form.habilitado ? '🔴' : '🟢').setStyle(form.habilitado ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tktform:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(form.perguntas.length >= MAX_FORM_QUESTIONS),
      new ButtonBuilder().setCustomId(`tktform:clear:${panelId}`).setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger).setDisabled(!form.perguntas.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (form.perguntas.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(`tktform:del_pick:${panelId}`).setPlaceholder('🗑️ Remover');
    form.perguntas.forEach((p, idx) => menu.addOptions({ label: `${idx + 1}. ${p.label}`.slice(0, 90), value: String(idx) }));
    rows.unshift(new ActionRowBuilder().addComponents(menu));
  }
  return { embeds: [e], components: rows };
}

async function ticketBlocksPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const blocked = Array.isArray(panel.bloqueio_usuarios_ids) ? panel.bloqueio_usuarios_ids : [];

  const e = new EmbedBuilder()
    .setTitle(`🚫 Bloqueios #${panelId}`)
    .setColor('#FF5555')
    .setDescription(blocked.length
      ? blocked.map(id => `• <@${id}>`).join('\n')
      : '*Ninguém bloqueado.*')
    .setFooter({ text: `${blocked.length} bloqueado(s)` });

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tktblk:add:${panelId}`).setLabel('Bloquear').setEmoji('🚫').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tktblk:remove:${panelId}`).setLabel('Desbloquear').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!blocked.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// MENUS CONFIG — TICKET
// ═══════════════════════════════════════════════════════════
async function buildConfigTicketMenu(guildId) {
  const panels = await getTicketPanels(guildId);
  const postados = panels.filter(p => p.canal_id && p.mensagem_id).length;
  const totalTipos = panels.reduce((a, p) => a + (p.tipos?.length || 0), 0);

  let abertos = 0;
  try {
    const { count } = await supabase.from('ticket_data')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId).is('closed_at', null);
    abertos = count || 0;
  } catch {}

  const e = new EmbedBuilder()
    .setTitle('⚙️ Configuração — Tickets')
    .setColor('#9B59B6')
    .setDescription(
      `**Central de configuração.**\n\n` +
      `> 🎫 **Painéis:** \`${panels.length}/${MAX_TICKET_PANELS}\`\n` +
      `> 📢 **Postados:** \`${postados}\`\n` +
      `> 🎯 **Tipos totais:** \`${totalTipos}\`\n` +
      `> 📬 **Abertos agora:** \`${abertos}\`\n\n` +
      `⚡ **Auto-refresh ativo.**`
    )
    .setFooter({ text: `${ORG_NAME} • Config Ticket` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfgtkt:panels').setLabel('Gerenciar Painéis').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfgtkt:create').setLabel('Criar Novo').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfgtkt:stats').setLabel('Estatísticas').setEmoji('📊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfgtkt:refresh').setLabel('Force Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function buildConfigTicketPanelsList(guildId) {
  const panels = await getTicketPanels(guildId);
  const desc = panels.length
    ? panels.slice(0, 10).map(p =>
        `**#${p.id} — ${p.nome}**\n` +
        `> 🎯 Tipos: \`${p.tipos?.length || 0}\` • 📢 ${p.canal_id ? `<#${p.canal_id}>` : '*não postado*'}`
      ).join('\n\n')
    : '*Nenhum painel criado ainda.*';

  const e = new EmbedBuilder()
    .setTitle('📋 Painéis de Ticket')
    .setColor('#9B59B6')
    .setDescription(desc)
    .setFooter({ text: `${panels.length}/${MAX_TICKET_PANELS}` })
    .setTimestamp();

  const rows = [];
  if (panels.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('cfgtkt:pick_panel').setPlaceholder('🎫 Escolher painel');
    for (const p of panels.slice(0, 25)) {
      menu.addOptions({
        label: `#${p.id} — ${p.nome}`.slice(0, 90),
        value: String(p.id),
        description: `${p.tipos?.length || 0} tipos • ${p.canal_id ? '✅ postado' : '❌ não postado'}`,
      });
    }
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfgtkt:create').setLabel('Criar Novo').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cfgtkt:menu').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [e], components: rows };
}

async function buildTicketStats(guildId) {
  const [open, closed, total, ratings] = await Promise.allSettled([
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).is('closed_at', null),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).not('closed_at', 'is', null),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guildId),
    supabase.from('ticket_ratings').select('rating').eq('guild_id', guildId).limit(500),
  ]);
  const openN = open.status === 'fulfilled' ? (open.value.count || 0) : 0;
  const closedN = closed.status === 'fulfilled' ? (closed.value.count || 0) : 0;
  const totalN = total.status === 'fulfilled' ? (total.value.count || 0) : 0;
  const ratingsData = ratings.status === 'fulfilled' ? (ratings.value.data || []) : [];
  const avg = ratingsData.length
    ? (ratingsData.reduce((a, r) => a + Number(r.rating || 0), 0) / ratingsData.length).toFixed(2)
    : '—';

  const e = new EmbedBuilder()
    .setTitle('📊 Estatísticas de Tickets')
    .setColor('#9B59B6')
    .addFields(
      { name: '🟢 Abertos', value: `\`${openN}\``, inline: true },
      { name: '🔴 Fechados', value: `\`${closedN}\``, inline: true },
      { name: '📋 Total', value: `\`${totalN}\``, inline: true },
      { name: '⭐ Média', value: `\`${avg}\` (${ratingsData.length})`, inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cfgtkt:menu').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// AUTOMAÇÕES
// ═══════════════════════════════════════════════════════════
async function checkTicketsAutoClose() {
  try {
    const { data: abertos } = await supabase.from('ticket_data')
      .select('thread_id,guild_id,panel_id,opened_at,user_id')
      .is('closed_at', null).not('opened_at', 'is', null).limit(100);
    if (!abertos?.length) return;

    const agora = Date.now();
    let processed = 0;

    for (const td of abertos) {
      if (processed >= 30) break;
      if (TICKET_CLOSING.has(td.thread_id)) continue;
      const guild = client.guilds.cache.get(td.guild_id);
      if (!guild) continue;
      const panel = await getTicketPanel(guild.id, td.panel_id);
      if (!panel) continue;
      const horas = Number(panel.auto_close_horas) || 0;
      if (horas <= 0) continue;
      const th = guild.channels.cache.get(td.thread_id);
      if (!th?.isThread?.()) continue;

      const lastTs = th.lastMessageId
        ? (await th.messages.fetch(th.lastMessageId).catch(() => null))?.createdTimestamp
        : new Date(td.opened_at).getTime();
      const horasInativo = (agora - (lastTs || new Date(td.opened_at).getTime())) / 3600000;

      if (horasInativo >= horas) {
        TICKET_CLOSING.add(td.thread_id);
        try {
          await supabase.from('ticket_data').update({
            closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'auto_close',
          }).eq('thread_id', td.thread_id);
          await th.send({ content: `🔒 Fechado por inatividade (${horas}h).` }).catch(() => {});
          await deliverTicketTranscript(guild, th, td, panel, { reason: `Auto-close após ${horas}h inativo` });
          if (td.user_id) setTimeout(() => sendTicketRatingDM(td.user_id, th.id, th.name).catch(() => {}), 3000);
          await th.setLocked(true).catch(() => {});
          await th.setArchived(true).catch(() => {});

          await logTicketAction(guild, panel, 'fechado', {
            threadName: th.name, reason: `Auto-close após ${horas}h inativo`,
          });
        } finally {
          setTimeout(() => TICKET_CLOSING.delete(td.thread_id), 60000);
        }
      }
      processed++;
    }
  } catch (e) { console.error('[AUTO-CLOSE]', e.message); }
}

async function checkTicketsMemberLeave(guild, member) {
  try {
    const { data: abertos } = await supabase.from('ticket_data')
      .select('thread_id,panel_id,user_id')
      .eq('guild_id', guild.id).eq('user_id', member.id).is('closed_at', null);
    if (!abertos?.length) return;
    for (const td of abertos) {
      if (TICKET_CLOSING.has(td.thread_id)) continue;
      const panel = await getTicketPanel(guild.id, td.panel_id);
      if (!panel?.fechar_ao_sair) continue;
      const th = await guild.channels.fetch(td.thread_id).catch(() => null);
      if (!th) continue;
      TICKET_CLOSING.add(td.thread_id);
      try {
        await supabase.from('ticket_data').update({
          closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'saiu_servidor',
        }).eq('thread_id', td.thread_id);
        await th.send({ content: `🔒 Autor saiu.` }).catch(() => {});
        await deliverTicketTranscript(guild, th, td, panel, { reason: 'Autor saiu do servidor' });
        await th.setArchived(true).catch(() => {});

        await logTicketAction(guild, panel, 'fechado', {
          threadName: th.name, userId: td.user_id, reason: 'Autor saiu do servidor',
        });
      } finally {
        setTimeout(() => TICKET_CLOSING.delete(td.thread_id), 60000);
      }
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// HANDLER — Tickets
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (i.replied || i.deferred) return;
  try {
    // ═══ /config ticket ═══
    if (i.isChatInputCommand() && i.commandName === 'config') {
      const sub = i.options.getSubcommand();
      if (sub === 'ticket') {
        if (!await isAdmin(i.user, i.guild)) {
          return i.reply({ content: '❌ Apenas administradores.', flags: EPHEMERAL });
        }
        return i.reply({ ...(await buildConfigTicketMenu(i.guild.id)), flags: EPHEMERAL });
      }
    }

    // ═══ /solicitar painel ticket ═══
    if (i.isChatInputCommand() && i.commandName === 'solicitar') {
      const grp = i.options.getSubcommandGroup(false);
      const sub = i.options.getSubcommand();
      if (grp === 'painel' && sub === 'ticket') {
        if (!await isAdmin(i.user, i.guild)) {
          return i.reply({ content: '❌ Apenas administradores.', flags: EPHEMERAL });
        }
        await i.deferReply({ flags: EPHEMERAL });
        const canal = i.options.getChannel('canal') || i.channel;
        const painelId = i.options.getInteger('painel_id');
        if (!canal?.isTextBased?.()) return i.editReply({ content: '❌ Canal inválido.' });

        let panel = null;
        if (painelId) {
          panel = await getTicketPanel(i.guild.id, painelId);
          if (!panel) return i.editReply({ content: `❌ Painel #${painelId} não encontrado.` });
        } else {
          const panels = await getTicketPanels(i.guild.id);
          if (!panels.length) return i.editReply({ content: '❌ Use `/config ticket` primeiro.' });
          panel = panels.sort((a, b) => Number(b.id) - Number(a.id))[0];
        }

        try {
          const msg = await canal.send({
            embeds: [buildTicketPanelEmbed(panel)],
            components: buildTicketPanelComponents(panel),
          });
          await updateTicketPanel(i.guild.id, panel.id, { canal_id: canal.id, mensagem_id: msg.id });
          return i.editReply({ content: `✅ Painel **#${panel.id}** postado em <#${canal.id}>.` });
        } catch (e) {
          return i.editReply({ content: `❌ ${e.message}` });
        }
      }
    }

    // ═══ cfgtkt: ═══
    if (i.customId?.startsWith('cfgtkt:')) {
      if (!i.guild) return;
      if (!await isAdmin(i.user, i.guild)) {
        return i.reply({ content: '❌ Apenas admins.', flags: EPHEMERAL }).catch(() => {});
      }
      const [_, action] = i.customId.split(':');

      if (action === 'menu') return i.update(await buildConfigTicketMenu(i.guild.id)).catch(() => {});
      if (action === 'panels') return i.update(await buildConfigTicketPanelsList(i.guild.id)).catch(() => {});
      if (action === 'pick_panel') {
        const panelId = i.values?.[0];
        if (!panelId) return;
        return i.update(await ticketEditorPanel(i.guild.id, panelId)).catch(() => {});
      }
      if (action === 'create') {
        const m = new ModalBuilder().setCustomId('cfgtkt:do_create').setTitle('🎫 Criar Painel');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#9B59B6').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji do botão').setStyle(TextInputStyle.Short).setValue('🎫').setRequired(false)),
        );
        return i.showModal(m);
      }
      if (action === 'do_create' && i.isModalSubmit()) {
        const nome = i.fields.getTextInputValue('nome').trim();
        const titulo = i.fields.getTextInputValue('titulo').trim();
        const descricao = i.fields.getTextInputValue('descricao').trim();
        const cor = normalizeHex(i.fields.getTextInputValue('cor')?.trim() || '#9B59B6');
        const emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
        try {
          const panel = await createTicketPanel(i.guild.id, {
            nome, titulo, descricao, cor,
            botao_label: 'Abrir Ticket', botao_emoji: emoji, tipos: [],
          });
          return i.reply({ content: `✅ Painel #${panel.id} criado.`, ...(await ticketEditorPanel(i.guild.id, panel.id)), flags: EPHEMERAL });
        } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }
      if (action === 'stats') return i.update(await buildTicketStats(i.guild.id)).catch(() => {});
      if (action === 'refresh') {
        const panels = await getTicketPanels(i.guild.id);
        const postados = panels.filter(p => p.canal_id && p.mensagem_id);
        let ok = 0, fail = 0;
        for (const p of postados) {
          try { const r = await refreshTicketPanelMessage(i.guild.id, p.id); if (r) ok++; else fail++; }
          catch { fail++; }
        }
        return i.reply({ content: `🔄 **Refresh:** ✅ ${ok} • ❌ ${fail}`, flags: EPHEMERAL });
      }
    }

    // ═══ tktedit: ═══
    if (i.customId?.startsWith('tktedit:')) {
      if (!i.guild || !await isAdmin(i.user, i.guild)) return;
      const [_, action, panelId] = i.customId.split(':');
      if (action === 'open') return i.update(await ticketEditorPanel(i.guild.id, panelId)).catch(() => {});
      if (action === 'embed' || action === 'button' || action === 'staff') {
        const p = await getTicketPanel(i.guild.id, panelId);
        if (!p) return;
        const m = new ModalBuilder().setCustomId(`tktedit_modal:${action}:${panelId}`).setTitle(action);
        if (action === 'embed') m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setValue(p.titulo || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.descricao || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue(p.cor || '#9B59B6').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setStyle(TextInputStyle.Short).setValue(p.banner || '').setRequired(false)),
        );
        if (action === 'button') m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setValue(p.botao_label || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(p.botao_emoji || '🎫').setRequired(false)),
        );
        if (action === 'staff') m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cargo_id').setLabel('ID/@cargo').setStyle(TextInputStyle.Short).setValue(p.cargo_id || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('log_id').setLabel('ID/#log').setStyle(TextInputStyle.Short).setValue(p.log_channel_id || '').setRequired(false)),
        );
        return i.showModal(m);
      }
      if (action === 'types') return i.update(await ticketTypesPanel(i.guild.id, panelId)).catch(() => {});
      if (action === 'config') return i.update(await ticketConfigPanel(i.guild.id, panelId)).catch(() => {});
      if (action === 'form') return i.update(await ticketFormPanel(i.guild.id, panelId)).catch(() => {});
      if (action === 'blocks') return i.update(await ticketBlocksPanel(i.guild.id, panelId)).catch(() => {});
      if (action === 'preview') {
        const p = await getTicketPanel(i.guild.id, panelId);
        if (!p) return;
        return i.reply({ content: '👁️', embeds: [buildTicketPanelEmbed(p)], components: buildTicketPanelComponents(p), flags: EPHEMERAL });
      }
      if (action === 'post') {
        const p = await getTicketPanel(i.guild.id, panelId);
        if (!p) return;
        const alvo = p.canal_id ? i.guild.channels.cache.get(p.canal_id) : i.channel;
        if (!alvo?.isTextBased?.()) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
        try {
          const msg = await alvo.send({ embeds: [buildTicketPanelEmbed(p)], components: buildTicketPanelComponents(p) });
          await updateTicketPanel(i.guild.id, p.id, { canal_id: alvo.id, mensagem_id: msg.id });
          return i.reply({ content: `✅ Postado em <#${alvo.id}>.`, flags: EPHEMERAL });
        } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }
      if (action === 'delete') {
        await deleteTicketPanel(i.guild.id, panelId);
        return i.update(await buildConfigTicketPanelsList(i.guild.id)).catch(() => {});
      }
    }

    // ═══ tkttype: ═══
    if (i.customId?.startsWith('tkttype:')) {
      if (!i.guild || !await isAdmin(i.user, i.guild)) return;
      const [_, action, panelId] = i.customId.split(':');
      const p = await getTicketPanel(i.guild.id, panelId);
      if (!p) return;
      if (action === 'edit') {
        if (!p.tipos?.length) return i.reply({ content: 'Nenhum tipo cadastrado.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId(`tkttype:editpick:${panelId}`).setPlaceholder('Escolha o tipo para editar');
        for (const t of p.tipos.slice(0, 25)) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 100), value: String(t.id) });
        return i.update({ embeds: [new EmbedBuilder().setTitle('✏️ Editar tipo de ticket')], components: [new ActionRowBuilder().addComponents(menu)] });
      }
      if (action === 'add') {
        const m = new ModalBuilder().setCustomId(`tkttype_modal:add:${panelId}`).setTitle('Adicionar tipo');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue('🎫').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('topic_channel_id').setLabel('ID do canal para o tópico (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(25)),
        );
        return i.showModal(m);
      }
      if (action === 'editpick') {
        const typeId = i.values[0];
        const t = p.tipos.find(x => String(x.id) === String(typeId));
        if (!t) return i.update({ content: 'Tipo não encontrado.', embeds: [], components: [] });
        const m = new ModalBuilder().setCustomId(`tkttype_modal:edit:${panelId}:${typeId}`).setTitle('Editar tipo');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(String(t.label || '').slice(0, 45)).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(String(t.emoji || '🎫').slice(0, 100)).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Short).setValue(String(t.descricao || '').slice(0, 100)).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('topic_channel_id').setLabel('ID do canal do tópico (opcional)').setStyle(TextInputStyle.Short).setValue(String(t.topic_channel_id || '')).setRequired(false).setMaxLength(25)),
        );
        return i.showModal(m);
      }
      if (action === 'del') {
        const menu = new StringSelectMenuBuilder().setCustomId(`tkttype:delpick:${panelId}`).setPlaceholder('Remover');
        for (const t of p.tipos) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 90), value: String(t.id) });
        return i.update({ embeds: [new EmbedBuilder().setTitle('🗑️ Remover tipo')], components: [new ActionRowBuilder().addComponents(menu)] });
      }
    }

    if (i.customId?.startsWith('tkttype:delpick:')) {
      const panelId = i.customId.split(':')[2];
      const panel = await getTicketPanel(i.guild.id, panelId);
      if (!panel) return;
      panel.tipos = panel.tipos.filter(t => String(t.id) !== String(i.values[0]));
      await updateTicketPanel(i.guild.id, panelId, { tipos: panel.tipos });
      return i.update(await ticketTypesPanel(i.guild.id, panelId)).catch(() => {});
    }

    // ═══ tktcfg: ═══
    if (i.customId?.startsWith('tktcfg:')) {
      if (!i.guild || !await isAdmin(i.user, i.guild)) return;
      const [_, action, panelId] = i.customId.split(':');
      if (action === 'sair') {
        const p = await getTicketPanel(i.guild.id, panelId);
        if (!p) return;
        await updateTicketPanel(i.guild.id, panelId, { fechar_ao_sair: !p.fechar_ao_sair });
        return i.update(await ticketConfigPanel(i.guild.id, panelId)).catch(() => {});
      }
      if (action === 'aval') {
        const p = await getTicketPanel(i.guild.id, panelId);
        if (!p) return;
        await updateTicketPanel(i.guild.id, panelId, { avaliacao_ativa: !(p.avaliacao_ativa !== false) });
        return i.update(await ticketConfigPanel(i.guild.id, panelId)).catch(() => {});
      }
      if (['limite', 'autoclose', 'horario'].includes(action)) {
        const p = await getTicketPanel(i.guild.id, panelId);
        if (!p) return;
        const m = new ModalBuilder().setCustomId(`tktcfg_modal:${action}:${panelId}`).setTitle(action);
        if (action === 'limite') m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('v').setLabel('Limite/user').setStyle(TextInputStyle.Short).setValue(String(p.limite_tickets_usuario || 1)).setRequired(true)
        ));
        if (action === 'autoclose') m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('v').setLabel('Horas (0=off)').setStyle(TextInputStyle.Short).setValue(String(p.auto_close_horas || 48)).setRequired(true)
        ));
        if (action === 'horario') m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('v').setLabel('Ex: 9h-18h').setStyle(TextInputStyle.Short).setValue(p.horario_atendimento || '').setRequired(false)
        ));
        return i.showModal(m);
      }
    }

    // ═══ tktform: ═══
    if (i.customId?.startsWith('tktform:')) {
      if (!i.guild || !await isAdmin(i.user, i.guild)) return;
      const [_, action, panelId] = i.customId.split(':');
      const p = await getTicketPanel(i.guild.id, panelId);
      if (!p) return;
      if (action === 'toggle') {
        p.formulario.habilitado = !p.formulario.habilitado;
        await updateTicketPanel(i.guild.id, panelId, { formulario: p.formulario });
        return i.update(await ticketFormPanel(i.guild.id, panelId)).catch(() => {});
      }
      if (action === 'add') {
        const m = new ModalBuilder().setCustomId(`tktform_modal:add:${panelId}`).setTitle('Adicionar pergunta');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Pergunta').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('placeholder').setLabel('Placeholder').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('obrigatorio').setLabel('Obrigatório (sim/nao)').setStyle(TextInputStyle.Short).setValue('sim').setRequired(true)),
        );
        return i.showModal(m);
      }
      if (action === 'clear') {
        p.formulario.perguntas = [];
        await updateTicketPanel(i.guild.id, panelId, { formulario: p.formulario });
        return i.update(await ticketFormPanel(i.guild.id, panelId)).catch(() => {});
      }
    }

    // ═══ tktblk: ═══
    if (i.customId?.startsWith('tktblk:')) {
      if (!i.guild || !await isAdmin(i.user, i.guild)) return;
      const [_, action, panelId] = i.customId.split(':');
      if (action === 'add') {
        const m = new ModalBuilder().setCustomId(`tktblk_modal:add:${panelId}`).setTitle('Bloquear');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'remove') {
        const p = await getTicketPanel(i.guild.id, panelId);
        const menu = new StringSelectMenuBuilder().setCustomId(`tktblk:removepick:${panelId}`).setPlaceholder('Desbloquear');
        for (const uid of p?.bloqueio_usuarios_ids || []) menu.addOptions({ label: `User ${uid}`, value: uid });
        return i.update({ embeds: [new EmbedBuilder().setTitle('✅ Desbloquear')], components: [new ActionRowBuilder().addComponents(menu)] });
      }
    }

    if (i.customId?.startsWith('tktblk:removepick:')) {
      const panelId = i.customId.split(':')[2];
      const panel = await getTicketPanel(i.guild.id, panelId);
      if (!panel) return;
      panel.bloqueio_usuarios_ids = panel.bloqueio_usuarios_ids.filter(u => u !== i.values[0]);
      await updateTicketPanel(i.guild.id, panelId, { bloqueio_usuarios_ids: panel.bloqueio_usuarios_ids });
      return i.update(await ticketBlocksPanel(i.guild.id, panelId)).catch(() => {});
    }

    // ═══ Abrir ticket ═══
    if (i.customId?.startsWith('ticket_open:')) {
      const parts = i.customId.split(':');
      const panelId = parts[1], typeId = parts[2];
      const panel = await getTicketPanel(i.guild.id, panelId);
      if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
      if (!ticketCooldownCheck(i.user.id, 3000)) return i.reply({ content: '⏳', flags: EPHEMERAL });
      await ensureMember(i);
      const lim = await canUserOpenTicket(i.guild, i.member, panel);
      if (!lim.ok) return i.reply({ content: lim.reason, flags: EPHEMERAL });
      let tipo = panel.tipos.find(t => String(t.id) === String(typeId));
      if (!tipo && panel.tipos?.length) tipo = panel.tipos[0];
      if (!tipo) tipo = { id: 'sem_tipo', label: panel.titulo || 'Suporte', emoji: '🎫' };
      if (panel.formulario?.habilitado && panel.formulario.perguntas?.length) {
        const m = new ModalBuilder().setCustomId(`tkt_form:${panelId}:${tipo.id}`).setTitle('Formulário');
        for (const q of panel.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS)) {
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(`q_${q.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`)
              .setLabel(q.label.slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(!!q.obrigatorio)
          ));
        }
        return i.showModal(m);
      }
      await i.deferReply({ flags: EPHEMERAL });
      try {
        const th = await openTicket(i, panel, tipo, []);
        await i.editReply({ content: `✅ Ticket em <#${th.id}>` });
        autoDeleteReply(i, 5000);
        return;
      } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
    }

    if (i.customId?.startsWith('ticket_pick_type:')) {
      const panelId = i.customId.split(':')[1];
      const panel = await getTicketPanel(i.guild.id, panelId);
      if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
      const tipo = panel.tipos.find(t => String(t.id) === String(i.values[0]));
      if (!tipo) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
      if (!ticketCooldownCheck(i.user.id, 3000)) return i.reply({ content: '⏳', flags: EPHEMERAL });
      await ensureMember(i);
      const lim = await canUserOpenTicket(i.guild, i.member, panel);
      if (!lim.ok) return i.reply({ content: lim.reason, flags: EPHEMERAL });
      if (panel.formulario?.habilitado && panel.formulario.perguntas?.length) {
        const m = new ModalBuilder().setCustomId(`tkt_form:${panelId}:${tipo.id}`).setTitle('Formulário');
        for (const q of panel.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS)) {
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(`q_${q.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`)
              .setLabel(q.label.slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(!!q.obrigatorio)
          ));
        }
        return i.showModal(m);
      }
      await i.deferReply({ flags: EPHEMERAL });
      try {
        const th = await openTicket(i, panel, tipo, []);
        await i.editReply({ content: `✅ Ticket em <#${th.id}>` });
        autoDeleteReply(i, 5000);
        return;
      } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
    }

    // ═══ tkt: ações internas ═══
    if (i.customId?.startsWith('tkt:')) {
      const [_, action] = i.customId.split(':');
      if (action === 'claim') return ticketActionClaim(i);
      if (action === 'unclaim') return ticketActionUnclaim(i);
      if (action === 'lock') return ticketActionLock(i);
      if (action === 'priority') return ticketActionPriority(i);
      if (action === 'close') return ticketActionClose(i);
      if (action === 'delete') return ticketActionDelete(i);
      if (action === 'rate') {
        const parts = i.customId.split(':');
        const n = parseInt(parts[3], 10) || 0;
        return ticketActionRate(i, n);
      }
      if (action === 'rename') {
        const m = new ModalBuilder().setCustomId(`tkt_modal:rename:${i.channel.id}`).setTitle('Renomear');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Novo nome').setStyle(TextInputStyle.Short).setValue(i.channel.name.slice(0, 90)).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'add') {
        const m = new ModalBuilder().setCustomId(`tkt_modal:add:${i.channel.id}`).setTitle('Adicionar');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('uid').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (action === 'transfer') {
        const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', i.channel.id).maybeSingle();
        const panel = await getTicketPanel(i.guild.id, td?.panel_id);
        if (!panel?.tipos?.length) return i.reply({ content: '❌ Sem tipos.', flags: EPHEMERAL });
        const menu = new StringSelectMenuBuilder().setCustomId(`tkt:transfer_pick:${i.channel.id}`).setPlaceholder('Transferir');
        for (const t of panel.tipos) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 90), value: String(t.id) });
        return i.reply({ embeds: [new EmbedBuilder().setTitle('↪️')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
      }
    }

    // ✅ FIX: select transfer — sem fakeI, usa interaction real
    if (i.isStringSelectMenu?.() && i.customId?.startsWith('tkt:transfer_pick:')) {
      const thId = i.customId.split(':')[2];
      const th = i.guild?.channels.cache.get(thId)
        || await i.guild?.channels.fetch(thId).catch(() => null);
      if (!th) return i.reply({ content: '❌ Thread não encontrada.', flags: EPHEMERAL });
      // Chama a ação passando a interação real (i.channel já é a thread de origem quando o usuário abriu o menu aqui)
      return ticketActionTransfer(i, i.values[0]);
    }

    // ═══ MODAIS Tickets ═══
    if (i.isModalSubmit()) {
      const cid = i.customId;

      if (cid.startsWith('tktedit_modal:')) {
        const [_, w, panelId] = cid.split(':');
        if (w === 'embed') {
          await updateTicketPanel(i.guild.id, panelId, {
            titulo: i.fields.getTextInputValue('titulo').trim(),
            descricao: i.fields.getTextInputValue('descricao').trim(),
            cor: normalizeHex(i.fields.getTextInputValue('cor')?.trim() || '#9B59B6'),
            banner: i.fields.getTextInputValue('banner')?.trim() || null,
          });
        } else if (w === 'button') {
          await updateTicketPanel(i.guild.id, panelId, {
            botao_label: i.fields.getTextInputValue('label').trim(),
            botao_emoji: i.fields.getTextInputValue('emoji')?.trim() || '🎫',
          });
        } else if (w === 'staff') {
          const cargoRaw = i.fields.getTextInputValue('cargo_id')?.trim() || null;
          const logRaw = i.fields.getTextInputValue('log_id')?.trim() || null;
          let cargo_id = null, log_channel_id = null;
          if (cargoRaw) { const r = resolveRole(i.guild, cargoRaw); cargo_id = r?.id || null; }
          if (logRaw) { const c = resolveChannel(i.guild, logRaw); log_channel_id = c?.id || null; }
          await updateTicketPanel(i.guild.id, panelId, { cargo_id, log_channel_id });
        }
        return i.reply({ ...(await ticketEditorPanel(i.guild.id, panelId)), flags: EPHEMERAL });
      }

      if (cid.startsWith('tkttype_modal:edit:')) {
        const [, , panelId, typeId] = cid.split(':');
        const panel = await getTicketPanel(i.guild.id, panelId);
        if (!panel) return i.reply({ content: 'Painel não encontrado.', flags: EPHEMERAL });
        const t = panel.tipos.find(x => String(x.id) === String(typeId));
        if (!t) return i.reply({ content: 'Tipo não encontrado.', flags: EPHEMERAL });
        const label = i.fields.getTextInputValue('label').trim();
        const emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
        const descricao = i.fields.getTextInputValue('descricao')?.trim() || '';
        const topicRaw = (i.fields.getTextInputValue('topic_channel_id') || '').trim().replace(/[<#>]/g, '');
        let topic_channel_id = null;
        if (topicRaw) {
          const target = i.guild.channels.cache.get(topicRaw);
          if (!/^\d{15,25}$/.test(topicRaw) || !target || target.type !== ChannelType.GuildText) {
            return i.reply({ content: 'ID de canal inválido. Deixe vazio para usar o canal do ticket/painel.', flags: EPHEMERAL });
          }
          topic_channel_id = target.id;
        }
        t.label = label;
        t.emoji = emoji;
        t.descricao = descricao;
        t.topic_channel_id = topic_channel_id;
        await updateTicketPanel(i.guild.id, panelId, { tipos: panel.tipos });
        return i.reply({ ...(await ticketTypesPanel(i.guild.id, panelId)), flags: EPHEMERAL });
      }
      if (cid.startsWith('tkttype_modal:add:')) {
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(i.guild.id, panelId);
        if (!panel) return;
        const label = i.fields.getTextInputValue('label').trim();
        const emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
        const descricao = i.fields.getTextInputValue('descricao')?.trim() || '';
        const topicRaw = (i.fields.getTextInputValue('topic_channel_id') || '').trim().replace(/[<#>]/g, '');
        let topic_channel_id = null;
        if (topicRaw) {
          const target = i.guild.channels.cache.get(topicRaw);
          if (!/^\d{15,25}$/.test(topicRaw) || !target || target.type !== ChannelType.GuildText) {
            return i.reply({ content: '❌ ID de canal inválido. Informe um canal de texto existente ou deixe vazio para usar o canal do ticket.', flags: EPHEMERAL });
          }
          topic_channel_id = target.id;
        }
        const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        if (panel.tipos.some(t => t.id === id)) return i.reply({ content: '❌ ID duplicado.', flags: EPHEMERAL });
        panel.tipos.push({ id, label, emoji, descricao, topic_channel_id });
        await updateTicketPanel(i.guild.id, panelId, { tipos: panel.tipos });
        return i.reply({ ...(await ticketTypesPanel(i.guild.id, panelId)), flags: EPHEMERAL });
      }

      if (cid.startsWith('tktcfg_modal:')) {
        const [_, w, panelId] = cid.split(':');
        const v = i.fields.getTextInputValue('v').trim();
        if (w === 'limite') await updateTicketPanel(i.guild.id, panelId, { limite_tickets_usuario: parseInt(v) || 1 });
        if (w === 'autoclose') await updateTicketPanel(i.guild.id, panelId, { auto_close_horas: parseInt(v) || 0 });
        if (w === 'horario') await updateTicketPanel(i.guild.id, panelId, { horario_atendimento: v || null });
        return i.reply({ ...(await ticketConfigPanel(i.guild.id, panelId)), flags: EPHEMERAL });
      }

      if (cid.startsWith('tktform_modal:add:')) {
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(i.guild.id, panelId);
        if (!panel) return;
        const label = i.fields.getTextInputValue('label').trim();
        const placeholder = i.fields.getTextInputValue('placeholder')?.trim() || '';
        const obrig = i.fields.getTextInputValue('obrigatorio').trim().toLowerCase() === 'sim';
        panel.formulario.perguntas.push({ label, placeholder, obrigatorio: obrig });
        await updateTicketPanel(i.guild.id, panelId, { formulario: panel.formulario });
        return i.reply({ ...(await ticketFormPanel(i.guild.id, panelId)), flags: EPHEMERAL });
      }

      if (cid.startsWith('tktblk_modal:add:')) {
        const panelId = cid.split(':')[2];
        const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, '');
        const panel = await getTicketPanel(i.guild.id, panelId);
        if (!panel) return;
        if (!panel.bloqueio_usuarios_ids.includes(uid)) panel.bloqueio_usuarios_ids.push(uid);
        await updateTicketPanel(i.guild.id, panelId, { bloqueio_usuarios_ids: panel.bloqueio_usuarios_ids });
        return i.reply({ ...(await ticketBlocksPanel(i.guild.id, panelId)), flags: EPHEMERAL });
      }

      if (cid.startsWith('tkt_modal:')) {
        const [_, action, thId] = cid.split(':');
        const th = i.guild.channels.cache.get(thId)
          || await i.guild.channels.fetch(thId).catch(() => null);
        if (!th) return i.reply({ content: '❌ Thread não encontrada.', flags: EPHEMERAL });
        if (action === 'rename') {
          await th.setName(i.fields.getTextInputValue('name').trim().slice(0, 100)).catch(() => {});
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
        if (action === 'add') {
          const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, '');
          if (!/^\d{15,25}$/.test(uid)) return i.reply({ content: '❌ ID inválido.', flags: EPHEMERAL });
          await th.members.add(uid).catch(() => {});
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
      }

      if (cid.startsWith('tkt_form:')) {
        const [_, panelId, typeId] = cid.split(':');
        const panel = await getTicketPanel(i.guild.id, panelId);
        if (!panel) return;
        const tipo = panel.tipos?.find(t => String(t.id) === String(typeId)) || { id: typeId, label: 'Suporte', emoji: '🎫' };
        const formAnswers = [];
        for (const q of panel.formulario.perguntas) {
          const key = `q_${q.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;
          let v = '';
          try { v = i.fields.getTextInputValue(key) || ''; } catch {}
          formAnswers.push({ label: q.label, value: v || '(vazio)' });
        }
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const th = await openTicket(i, panel, tipo, formAnswers);
          await i.editReply({ content: `✅ Ticket criado em <#${th.id}>` });
          autoDeleteReply(i, 5000);
          return;
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }
    }
  } catch (err) {
    console.error('[TICKET-HANDLER]', err);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 4/7 — Tickets
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 5/7] DEV SYSTEM COMPLETO (CORRIGIDA)
// Servidor · Gerenciamento · Apostas (+Streamer) · Moderação · Sistema
// ═══════════════════════════════════════════════════════════

const DEVELOPER_IDS_SET = new Set(DEVELOPER_IDS);

// ═══════════════════════════════════════════════════════════
// KILL SWITCH + MANUTENÇÃO
// ═══════════════════════════════════════════════════════════
let _ks = { active: false, checked: 0 };
async function isKillSwitchActive() {
  if (Date.now() - _ks.checked < 60000) return _ks.active;
  try {
    const { data } = await supabase.from('kill_switch').select('active').eq('id', 1).maybeSingle();
    _ks = { active: !!data?.active, checked: Date.now() };
    return _ks.active;
  } catch { return _ks.active; }
}
async function setKillSwitch(active, reason, userId) {
  _ks = { active, checked: Date.now() };
  try {
    await supabase.from('kill_switch').upsert({
      id: 1, active, reason, enabled_by: userId,
      enabled_at: active ? new Date().toISOString() : null,
    });
  } catch {}
  await logImportant('KILL', active ? '🚨 KILL SWITCH ATIVADO' : '🟢 Kill Switch DESATIVADO', {
    description: reason || '—', user: userId, severity: active ? 'danger' : 'success',
  }).catch(() => {});
}

let _mm = { active: false, checked: 0 };
async function isMaintenanceMode() {
  if (Date.now() - _mm.checked < 30000) return _mm.active;
  try {
    const { data } = await supabase.from('maintenance_mode').select('active').eq('id', 1).maybeSingle();
    _mm = { active: !!data?.active, checked: Date.now() };
    return _mm.active;
  } catch { return _mm.active; }
}
async function setMaintenanceMode(a, by = null, reason = null) {
  _mm = { active: a, checked: Date.now() };
  try {
    await supabase.from('maintenance_mode').upsert({
      id: 1, active: a, by, reason,
      started_at: a ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  } catch {}
  await logImportant('MANUTENÇÃO', a ? '🔴 Manutenção ATIVADA' : '🟢 Manutenção DESATIVADA', {
    description: reason || '—', severity: a ? 'warning' : 'success',
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// DEV AUDIT
// ═══════════════════════════════════════════════════════════
async function logDevAction(userId, action, guildId = null, details = {}) {
  try { await supabase.from('dev_audit').insert({ user_id: userId, action, guild_id: guildId, details }); } catch {}
  await logImportant('DEV', `👑 \`${action}\``, {
    user: userId, guild: guildId, severity: 'info',
    metadata: Object.keys(details).length ? details : undefined,
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// DEV HUB
// ═══════════════════════════════════════════════════════════
function devHub() {
  const e = new EmbedBuilder().setTitle('👑 Painel Dev').setColor('#FFD700')
    .setDescription(
      `**Categorias:**\n\n` +
      `🏗️ **Servidor** — setups, backup, rejoin\n` +
      `🎯 **Gerenciamento** — premium, injetar, ranking\n` +
      `🎮 **Apostas** — config FF + streamers\n` +
      `⚠️ **Moderação** — blacklist, kill switch\n` +
      `🖥️ **Sistema** — dashboard, sandbox, audit`
    )
    .setFooter({ text: `${ORG_NAME} ${BOT_VERSION}` })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder().setCustomId('dev_cat_pick').setPlaceholder('📂 Categoria')
    .addOptions(
      { label: 'Servidor', value: 'servidor', emoji: '🏗️' },
      { label: 'Gerenciamento', value: 'gerenciamento', emoji: '🎯' },
      { label: 'Apostas', value: 'apostas', emoji: '🎮' },
      { label: 'Moderação', value: 'moderacao', emoji: '⚠️' },
      { label: 'Sistema', value: 'sistema', emoji: '🖥️' },
    );

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV CATEGORIAS
// ═══════════════════════════════════════════════════════════
async function devCatServidor() {
  return {
    embeds: [new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#5865F2')
      .setDescription('> 🛒 Loja\n> 👥 Comunidade\n> 🏛️ Organização\n> 🎮 Apostas Base\n> 🔗 Entrar via convite\n> 💾 Backup\n> ✏️ Renomear\n> 💥 Explosão\n> 🚪 Sair')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_organizacao').setLabel('Organização').setEmoji('🏛️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_apostas').setLabel('Apostas').setEmoji('🎮').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_entrar_invite').setLabel('Convite').setEmoji('🔗').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_renomear').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_servidores').setLabel('Listar').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_explosao').setLabel('Explosão').setEmoji('💥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_sair').setLabel('Sair').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devCatGerenciamento() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFA500')
      .setDescription('> 💎 Premium\n> 👥 Verificados\n> 🎁 Injetar\n> 🔍 Inspetor\n> 👥 Staff Global\n> 🏆 Ranking\n> 💀 Mortos')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject').setLabel('Injetar').setEmoji('🎁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Inspetor').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_staff_global').setLabel('Staff').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ranking').setLabel('Ranking').setEmoji('🏆').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_dead_servers').setLabel('Mortos').setEmoji('💀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devCatApostas() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎮 Apostas + Streamers').setColor('#f1c40f')
      .setDescription(
        `> 🎮 Config FF\n` +
        `> 📢 Postar apostas\n` +
        `> 📁 Canais por formato\n` +
        `> ⚡ Manutenção FF\n` +
        `> 💳 PIX\n` +
        `> 🎥 **Streamers** *(fila + painéis)*\n` +
        `> 🎬 Simulador`
      )],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_panel').setLabel('Config FF').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_ff_postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_canais').setLabel('Canais').setEmoji('📁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_pix').setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_streamer').setLabel('Streamers').setEmoji('🎥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_maint').setLabel('Manut FF').setEmoji('⚡').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_simulator').setLabel('Simulador').setEmoji('🎬').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devCatModeracao() {
  return {
    embeds: [new EmbedBuilder().setTitle('⚠️ Moderação').setColor('#FF5555')
      .setDescription('> 🚫 Blacklist global\n> 👥 Staff BL\n> 🚨 Kill Switch\n> 🔧 Manutenção\n> ⚠️ Alertas\n> 🐛 Bugs')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_bl_add').setLabel('BL Add').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_bl_del').setLabel('BL Remover').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_bl_list').setLabel('BL Listar').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_staff_blacklist').setLabel('BL Staff').setEmoji('👥').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_kill_switch').setLabel('Kill Switch').setEmoji('🚨').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_alerts').setLabel('Alertas').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devCatSistema() {
  return {
    embeds: [new EmbedBuilder().setTitle('🖥️ Sistema').setColor('#8E44AD')
      .setDescription('> 📊 Dashboard\n> 🤖 Bot\n> 📡 Monitor\n> 🕵️ Audit\n> 🧪 Sandbox\n> 📢 Broadcast')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_bot').setLabel('Bot').setEmoji('🤖').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_monitor').setLabel('Monitor').setEmoji('📡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_audit').setLabel('Audit').setEmoji('🕵️').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Sandbox').setEmoji('🧪').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS
// ═══════════════════════════════════════════════════════════
async function devPanelDashboard() {
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const mem = process.memoryUsage();

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [guilds, bets24h, tickets24h, errs] = await Promise.allSettled([
    supabase.from('bot_guilds').select('id', { count: 'exact', head: true }).eq('in_guild', true),
    supabase.from('ff_matches').select('value').gte('created_at', since24h),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).gte('opened_at', since24h),
    supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
  ]);

  const bets = bets24h.status === 'fulfilled' ? (bets24h.value.data || []) : [];
  const volume = bets.reduce((a, b) => a + Number(b.value || 0), 0);

  const e1 = new EmbedBuilder().setTitle('📊 Dashboard').setColor('#57F287')
    .addFields(
      { name: '🌐 Servidores', value: `**${guilds.status === 'fulfilled' ? guilds.value.count || 0 : 0}**`, inline: true },
      { name: '📡 Ping', value: `**${client.ws.ping}ms**`, inline: true },
      { name: '⏱️ Uptime', value: `**${fmtUptime(up)}**`, inline: true },
      { name: '🎮 Apostas 24h', value: `**${bets.length}** (R$ ${volume.toFixed(2)})`, inline: true },
      { name: '🎫 Tickets 24h', value: `**${tickets24h.status === 'fulfilled' ? tickets24h.value.count || 0 : 0}**`, inline: true },
      { name: '❌ Erros 24h', value: `**${errs.status === 'fulfilled' ? errs.value.count || 0 : 0}**`, inline: true },
      { name: '🧠 Heap', value: `${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB`, inline: true },
      { name: '🔷 RSS', value: `${(mem.rss / 1024 / 1024).toFixed(0)} MB`, inline: true },
    ).setTimestamp();

  return {
    embeds: [e1],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelBot() {
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e = new EmbedBuilder().setTitle('🤖 Bot').setColor('#00FF00')
    .addFields(
      { name: '🏷️', value: `\`${client.user.tag}\``, inline: true },
      { name: '📡', value: `\`${client.ws.ping}ms\``, inline: true },
      { name: '⏱️', value: `\`${fmtUptime(up)}\``, inline: true },
      { name: '🌐', value: `\`${client.guilds.cache.size}\``, inline: true },
      { name: '👥', value: `\`${client.users.cache.size}\``, inline: true },
      { name: '📦', value: `\`${BOT_VERSION}\``, inline: true },
    ).setTimestamp();
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelPremium(guild) {
  const c = await getConfig(guild.id);
  const { data: fp } = await supabase.from('force_premium').select('*').eq('scope', 'guild').eq('target_id', guild.id).maybeSingle();
  const tier = await getPremiumTier(guild.id);
  const tierMeta = tier ? PREMIUM_TIERS[tier] : null;
  const expira = c.premium_expires_at ? `<t:${Math.floor(new Date(c.premium_expires_at).getTime() / 1000)}:R>` : '♾️ Permanente';

  const e = new EmbedBuilder().setTitle('💎 Premium').setColor(c.is_premium ? '#22c55e' : '#FF5555')
    .setDescription(`**${guild.name}**`)
    .addFields(
      { name: '📌 Status', value: c.is_premium ? '🟢 ATIVO' : '🔴 Inativo', inline: true },
      { name: '🎚️ Tier', value: tierMeta ? `${tierMeta.emoji} ${tierMeta.label}` : '—', inline: true },
      { name: '📅 Expira', value: expira, inline: true },
      { name: '🎯 Force', value: fp ? '🟢' : '⚪', inline: true },
    );

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Permanente').setEmoji('♾️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_prem_temp').setLabel('Por Tempo').setEmoji('⏳').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        ...[
          ['basic', 'Basic', '🥉'],
          ['premium', 'Premium', '🥈'],
          ['ultra', 'Ultra', '🥇'],
          ['unlimited', 'Unlimited', '💎'],
        ].map(([t, l, em]) =>
          new ButtonBuilder().setCustomId(`dev_prem_tier_${t}`).setLabel(l).setEmoji(em)
            .setStyle(tier === t ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_forcepremium_guild').setLabel('FP Guild').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_forcepremium_list').setLabel('Ativos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelInject() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎁 Injetar').setColor('#9B59B6')
      .setDescription('Envie itens em servidores sem entrar.')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inject_coins').setLabel('Coins').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_inject_role').setLabel('Cargo').setEmoji('🎭').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelStaffGlobal() {
  const { data: meds } = await supabase.from('ff_mediator_queue').select('user_id,earnings_total,matches_total').limit(500);
  const { data: anas } = await supabase.from('ff_analyst_queue').select('user_id,analyses_total').limit(500);

  const map = {};
  for (const m of meds || []) {
    if (!map[m.user_id]) map[m.user_id] = { uid: m.user_id, meds: 0, anas: 0, earn: 0, matches: 0, ana: 0 };
    map[m.user_id].meds++;
    map[m.user_id].earn += Number(m.earnings_total || 0);
    map[m.user_id].matches += Number(m.matches_total || 0);
  }
  for (const a of anas || []) {
    if (!map[a.user_id]) map[a.user_id] = { uid: a.user_id, meds: 0, anas: 0, earn: 0, matches: 0, ana: 0 };
    map[a.user_id].anas++;
    map[a.user_id].ana += Number(a.analyses_total || 0);
  }

  const staff = Object.values(map).sort((a, b) => b.earn - a.earn).slice(0, 15);

  const e = new EmbedBuilder().setTitle('👥 Staff Global').setColor('#5865F2')
    .setDescription(staff.length
      ? staff.map((s, i) => {
          const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;
          return `${medal} <@${s.uid}>\n> 🛡️ ${s.meds} • 🔎 ${s.anas} • 💰 R$ ${s.earn.toFixed(2)}`;
        }).join('\n\n')
      : '*Sem dados*');

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelRanking() {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: matches } = await supabase.from('ff_matches').select('guild_id').gte('created_at', since7d);
  const { data: guilds } = await supabase.from('bot_guilds').select('guild_id,name,member_count').eq('in_guild', true);

  const counts = {};
  for (const m of matches || []) counts[m.guild_id] = (counts[m.guild_id] || 0) + 1;

  const arr = (guilds || []).map(g => ({ ...g, matches: counts[g.guild_id] || 0 }))
    .sort((a, b) => b.matches - a.matches).slice(0, 10);

  const e = new EmbedBuilder().setTitle('🏆 Top Servidores (7d)').setColor('#FFD700')
    .setDescription(arr.length
      ? arr.map((s, i) => `${['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``} **${s.name}** — **${s.matches}** apostas`).join('\n')
      : '*Sem dados*');

  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelDeadServers() {
  const { data: all } = await supabase.from('bot_guilds')
    .select('guild_id,name,member_count').eq('in_guild', true).lt('member_count', 15).limit(30);

  const e = new EmbedBuilder().setTitle('💀 Mortos').setColor('#808080')
    .setDescription(all?.length
      ? all.map(s => `**${s.name}** \`${s.guild_id}\`\n> 👥 ${s.member_count}`).join('\n\n').substring(0, 4000)
      : '🎉 Nenhum!');

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_dead_cleanup').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelManutencao() {
  const globalOn = await isMaintenanceMode();
  const { data: gd } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();

  const e = new EmbedBuilder().setTitle('⚙️ Manutenção Global').setColor(globalOn ? '#ff0000' : '#22c55e')
    .setDescription(globalOn ? '🔴 ATIVA — todos comandos bloqueados' : '🟢 OPERACIONAL')
    .addFields(
      { name: '👤 Por', value: gd?.by ? `<@${gd.by}>` : '—', inline: true },
      { name: '📝 Motivo', value: gd?.reason || '*—*' },
    );

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_maint_toggle').setLabel(globalOn ? 'Restaurar' : 'Iniciar').setEmoji(globalOn ? '🟢' : '🔴').setStyle(globalOn ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelKillSwitch() {
  const active = await isKillSwitchActive();
  const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle();

  const e = new EmbedBuilder().setTitle('🚨 Kill Switch').setColor(active ? '#ff0000' : '#22c55e')
    .setDescription(active ? '🔴 ATIVO' : '🟢 Normal')
    .addFields(
      { name: '📝 Motivo', value: data?.reason || '*—*' },
      { name: '👤 Por', value: data?.enabled_by ? `<@${data.enabled_by}>` : '—', inline: true },
    );

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_kill_toggle').setLabel(active ? 'DESATIVAR' : 'ATIVAR').setEmoji(active ? '🟢' : '🚨').setStyle(active ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_kill_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelAudit() {
  const { data } = await supabase.from('dev_audit')
    .select('user_id,action,created_at').order('created_at', { ascending: false }).limit(20);

  const e = new EmbedBuilder().setTitle('🕵️ Audit').setColor('#5865F2')
    .setDescription(data?.length
      ? data.map(a => `<t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:T> <@${a.user_id}> → \`${a.action}\``).join('\n')
      : '*Sem registros*');

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_audit_clear').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelMonitor() {
  const mem = process.memoryUsage();
  const e1 = new EmbedBuilder().setTitle('📡 Monitor').setColor('#00AAFF')
    .addFields(
      { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
      { name: '🔌 Shards', value: `${client.ws.shards?.size || 1}`, inline: true },
      { name: '🌐 Guilds', value: `${client.guilds.cache.size}`, inline: true },
    );
  const e2 = new EmbedBuilder().setTitle('💻 Recursos').setColor('#FEE75C')
    .addFields(
      { name: '🧠 Heap', value: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} / ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '🔷 RSS', value: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '⏱️', value: fmtUptime(process.uptime()), inline: true },
    );

  return {
    embeds: [e1, e2],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_monitor_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelSandbox() {
  return {
    embeds: [new EmbedBuilder().setTitle('🧪 Sandbox').setColor('#808080')
      .setDescription('Execute JS em ambiente controlado.')
      .addFields({ name: '🔒 Vars', value: '```js\nclient, guild, supabase,\nEmbedBuilder, ActionRowBuilder,\nButtonBuilder, ButtonStyle, sleep```' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_sandbox_run').setLabel('Rodar').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelBroadcast() {
  return {
    embeds: [new EmbedBuilder().setTitle('📢 Broadcast').setColor('#00AAFF')
      .setDescription('Envie uma atualização pra rede toda ou um servidor específico.')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_broadcast_compose').setLabel('Criar').setEmoji('✍️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast_test').setLabel('Teste').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// CANAIS FF (mapeamento)
// ═══════════════════════════════════════════════════════════
async function devPanelFFCanais(guild) {
  const canais = await ffGetCanais(guild.id);
  const list = FF_FORMATS.map(f => {
    const cid = canais[f.id];
    const ch = cid ? guild.channels.cache.get(cid) : null;
    return `**${f.emoji} ${f.label}** — ${ch ? `<#${ch.id}>` : '*não configurado*'}`;
  }).join('\n');

  const e = new EmbedBuilder().setTitle('📁 Canais por formato').setColor('#f1c40f')
    .setDescription(list)
    .setFooter({ text: 'Use /apostas painel pra configurar' });

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ff_canais_setup').setLabel('Configurar').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// MANUTENÇÃO FF (por guild)
// ═══════════════════════════════════════════════════════════
async function devPanelFFMaint(guild) {
  const cfg = await ffGetConfig(guild.id);
  const at = !!cfg?.maintenance;

  return {
    embeds: [new EmbedBuilder().setTitle('🔧 Manutenção FF').setColor(at ? '#ff5555' : '#22c55e')
      .setDescription(at ? '⚠️ **ATIVA**' : '🟢 **DESATIVADA**')
      .addFields({ name: 'Motivo', value: cfg?.maintenance_reason || '*—*' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ff_maint_toggle').setLabel(at ? 'Desativar' : 'Ativar').setEmoji(at ? '🟢' : '🔴').setStyle(at ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// HANDLER DEV
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (i.replied || i.deferred) return;
  if (!i.customId?.startsWith('dev_') && !i.customId?.startsWith('dev_cat_pick')) return;

  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);
    if (!isDev) {
      if (i.isRepliable()) i.reply({ content: '❌ Apenas devs.', flags: EPHEMERAL }).catch(() => {});
      return;
    }

    const cid = i.customId;
    const guild = i.guild;

    // ═══ SELECT CATEGORIA ═══
    if (cid === 'dev_cat_pick') {
      const v = i.values[0];
      if (v === 'servidor') return i.update(await devCatServidor());
      if (v === 'gerenciamento') return i.update(await devCatGerenciamento());
      if (v === 'apostas') return i.update(await devCatApostas());
      if (v === 'moderacao') return i.update(await devCatModeracao());
      if (v === 'sistema') return i.update(await devCatSistema());
    }

    // ═══ BOTÕES DEV ═══
    if (cid === 'dev_back') return i.update(devHub());
    if (cid === 'dev_dashboard') return i.update(await devPanelDashboard());
    if (cid === 'dev_bot') return i.update(await devPanelBot());
    if (cid === 'dev_premium') return i.update(await devPanelPremium(guild));
    if (cid === 'dev_inject') return i.update(await devPanelInject());
    if (cid === 'dev_staff_global') return i.update(await devPanelStaffGlobal());
    if (cid === 'dev_ranking') return i.update(await devPanelRanking());
    if (cid === 'dev_dead_servers') return i.update(await devPanelDeadServers());
    if (cid === 'dev_manutencao') return i.update(await devPanelManutencao());
    if (cid === 'dev_kill_switch') return i.update(await devPanelKillSwitch());
    if (cid === 'dev_audit') return i.update(await devPanelAudit());
    if (cid === 'dev_monitor') return i.update(await devPanelMonitor());
    if (cid === 'dev_monitor_refresh') return i.update(await devPanelMonitor());
    if (cid === 'dev_sandbox') return i.update(await devPanelSandbox());
    if (cid === 'dev_broadcast') return i.update(await devPanelBroadcast());
    if (cid === 'dev_ff_panel') return i.update(await ffConfigPanel(guild.id));
    if (cid === 'dev_ff_canais') return i.update(await devPanelFFCanais(guild));
    if (cid === 'dev_ff_maint') return i.update(await devPanelFFMaint(guild));
    if (cid === 'dev_ff_streamer') return i.update(await buildConfigStreamerMenu(guild.id));

    // ═══ TOGGLES ═══
    if (cid === 'dev_maint_toggle') {
      const at = await isMaintenanceMode();
      await setMaintenanceMode(!at, i.user.id, null);
      return i.update(await devPanelManutencao());
    }

    // ✅ FIX: preserva o reason existente ao ligar/desligar kill switch
    if (cid === 'dev_kill_toggle') {
      const active = await isKillSwitchActive();
      const { data: existing } = await supabase.from('kill_switch').select('reason').eq('id', 1).maybeSingle();
      await setKillSwitch(!active, existing?.reason || null, i.user.id);
      return i.update(await devPanelKillSwitch());
    }

    if (cid === 'dev_ff_maint_toggle') {
      const cfg = await ffGetConfig(guild.id);
      const nv = !cfg?.maintenance;
      await ffPatchConfig(guild.id, { maintenance: nv, maintenance_reason: nv ? 'Ativado pelo dev' : null });
      return i.update(await devPanelFFMaint(guild));
    }

    // ═══ PREMIUM ═══
    if (cid === 'dev_prem_on') {
      const c = await getConfig(guild.id);
      c.is_premium = true; c.premium_expires_at = null;
      await setConfig(guild.id, c);
      return i.update(await devPanelPremium(guild));
    }
    if (cid === 'dev_prem_off') {
      const c = await getConfig(guild.id);
      c.is_premium = false; c.premium_expires_at = null; c.premium_tier = null;
      await setConfig(guild.id, c);
      await supabase.from('force_premium').delete().eq('scope', 'guild').eq('target_id', guild.id);
      return i.update(await devPanelPremium(guild));
    }
    if (cid === 'dev_prem_temp') {
      const m = new ModalBuilder().setCustomId('modal_prem_temp').setTitle('Premium temporário');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('dias').setLabel('Dias').setStyle(TextInputStyle.Short).setValue('30').setRequired(true)
      ));
      return i.showModal(m);
    }

    // ✅ FIX: valida o tier antes de aplicar
    if (cid.startsWith('dev_prem_tier_')) {
      const tier = cid.replace('dev_prem_tier_', '');
      if (!PREMIUM_TIERS[tier]) {
        return i.reply({ content: `❌ Tier inválido: \`${tier}\``, flags: EPHEMERAL });
      }
      const c = await getConfig(guild.id);
      c.is_premium = true; c.premium_tier = tier;
      await setConfig(guild.id, c);
      return i.update(await devPanelPremium(guild));
    }

    if (cid === 'dev_forcepremium_guild') {
      const m = new ModalBuilder().setCustomId('modal_forcepremium_guild').setTitle('Force Premium');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID da guild').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=perm)').setStyle(TextInputStyle.Short).setValue('0').setRequired(true)),
      );
      return i.showModal(m);
    }
    if (cid === 'dev_forcepremium_list') {
      const { data } = await supabase.from('force_premium').select('*').order('granted_at', { ascending: false }).limit(30);
      const list = data?.length
        ? data.map(f => `**${f.scope === 'guild' ? '🌐' : '👤'}** \`${f.target_id}\` — ${f.permanent ? '♾️' : `<t:${Math.floor(new Date(f.expires_at).getTime() / 1000)}:R>`}`).join('\n')
        : '*Nenhum*';
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🎯 Force Premium').setDescription(list)], flags: EPHEMERAL });
    }

    // ═══ INJECT ═══
    if (cid === 'dev_inject_coins') {
      const m = new ModalBuilder().setCustomId('modal_inject_coins').setTitle('Injetar Coins');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Qtd').setStyle(TextInputStyle.Short).setValue('100').setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
      );
      return i.showModal(m);
    }
    if (cid === 'dev_inject_role') {
      const m = new ModalBuilder().setCustomId('modal_inject_role').setTitle('Injetar Cargo');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID cargo').setStyle(TextInputStyle.Short).setRequired(true)),
      );
      return i.showModal(m);
    }
    if (cid === 'dev_inject_premium') {
      const m = new ModalBuilder().setCustomId('modal_inject_premium').setTitle('Injetar Premium');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=perm)').setStyle(TextInputStyle.Short).setValue('30').setRequired(true)),
      );
      return i.showModal(m);
    }

    // ═══ INSPECTOR ═══
    if (cid === 'dev_inspector') {
      const m = new ModalBuilder().setCustomId('modal_inspector').setTitle('🔍 Inspetor');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }

    // ═══ BLACKLIST ═══
    if (cid === 'dev_bl_add') {
      const m = new ModalBuilder().setCustomId('modal_bl_add').setTitle('Blacklist Global');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }
    if (cid === 'dev_bl_del') {
      const m = new ModalBuilder().setCustomId('modal_bl_del').setTitle('Remover BL');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }
    if (cid === 'dev_bl_list') {
      const { data } = await supabase.from('blacklist_users').select('*').limit(30);
      return i.reply({
        embeds: [new EmbedBuilder().setTitle('🚫 BL Global').setColor('#FF5555')
          .setDescription(data?.length ? data.map(b => `<@${b.user_id}>`).join('\n') : '*Vazia*')],
        flags: EPHEMERAL,
      });
    }

    // ═══ REASON MODALS ═══
    if (cid === 'dev_maint_reason') {
      const m = new ModalBuilder().setCustomId('modal_maint_reason').setTitle('Motivo');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ));
      return i.showModal(m);
    }
    if (cid === 'dev_kill_reason') {
      const m = new ModalBuilder().setCustomId('modal_kill_reason').setTitle('Motivo');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ));
      return i.showModal(m);
    }

    // ═══ AUDIT CLEAR ═══
    if (cid === 'dev_audit_clear') {
      await supabase.from('dev_audit').delete().lt('created_at', new Date(Date.now() - 7 * 86400 * 1000).toISOString());
      return i.reply({ content: '✅ Audit limpo.', flags: EPHEMERAL });
    }

    // ═══ DEAD CLEANUP ═══
    if (cid === 'dev_dead_cleanup') {
      const { data } = await supabase.from('bot_guilds')
        .select('guild_id').eq('in_guild', true).lt('member_count', 15).limit(30);
      let ok = 0;
      for (const s of data || []) {
        const g = client.guilds.cache.get(s.guild_id);
        if (g) { await g.leave().catch(() => {}); ok++; await sleep(500); }
      }
      return i.reply({ content: `✅ Saí de **${ok}** servidores.`, flags: EPHEMERAL });
    }

    // ═══ SANDBOX ═══
    if (cid === 'dev_sandbox_run') {
      const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('Sandbox');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3000)
      ));
      return i.showModal(m);
    }

    // ═══ BROADCAST ═══
    if (cid === 'dev_broadcast_compose') {
      const m = new ModalBuilder().setCustomId('modal_broadcast_compose').setTitle('📢 Criar');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mudancas').setLabel('O que atualizou (1 por linha)').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      );
      return i.showModal(m);
    }
    if (cid === 'dev_broadcast_test') {
      const m = new ModalBuilder().setCustomId('modal_broadcast_test').setTitle('🧪 Teste');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setValue('🧪 Teste').setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue('Este é um teste.').setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mudancas').setLabel('O que atualizou').setStyle(TextInputStyle.Paragraph).setValue('• Item 1\n• Item 2').setRequired(true)),
      );
      return i.showModal(m);
    }

    // ═══ CRIAR SETUPS (stub) ═══
    if (['dev_criar_loja', 'dev_criar_comunidade', 'dev_criar_organizacao', 'dev_criar_apostas'].includes(cid)) {
      const tt = cid.replace('dev_criar_', '');
      return i.reply({ content: `🏗️ Criando **${tt}**... (função de setup não implementada nesta versão)`, flags: EPHEMERAL });
    }

    // ═══ SIMULADOR ═══
    if (cid === 'dev_simulator') {
      await i.deferReply({ flags: EPHEMERAL });
      const etapas = [];
      const t0 = Date.now();
      try {
        const cfg = await ffGetConfig(guild.id);
        etapas.push({ ok: !!cfg, msg: 'Config FF' });
        etapas.push({ ok: !!cfg?.topic_channel_id, msg: 'Canal apostas' });
        etapas.push({ ok: !!(cfg?.pix_key || cfg?.mp_access_token), msg: 'PIX' });
        etapas.push({ ok: !!cfg?.mediator_role_id, msg: 'Cargo mediador' });
      } catch (e) { etapas.push({ ok: false, msg: e.message }); }
      const e = new EmbedBuilder().setTitle('🎬 Simulador').setColor(etapas.every(x => x.ok) ? '#22c55e' : '#FFA500')
        .setDescription(etapas.map(x => `${x.ok ? '✅' : '❌'} ${x.msg}`).join('\n'))
        .addFields({ name: '⏱️', value: `${Date.now() - t0}ms`, inline: true });
      return i.editReply({ embeds: [e] });
    }

    // ═══ OUTROS ═══
    if (cid === 'dev_entrar_invite') {
      const m = new ModalBuilder().setCustomId('modal_entrar_invite').setTitle('Entrar via convite');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('invite').setLabel('Link/Code').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }
    if (cid === 'dev_renomear') {
      const m = new ModalBuilder().setCustomId('modal_renomear').setTitle('Renomear servidor');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('nome').setLabel('Novo nome').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }
    if (cid === 'dev_backup') {
      const data = { name: guild.name, roles: guild.roles.cache.map(r => ({ name: r.name })), channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })) };
      try { await supabase.from('guild_backups').insert({ guild_id: guild.id, data }); } catch {}
      return i.reply({ content: '💾 Backup salvo.', flags: EPHEMERAL });
    }
    if (cid === 'dev_sair') {
      await i.reply({ content: '🚪 Saindo...', flags: EPHEMERAL });
      setTimeout(() => guild.leave().catch(() => {}), 2000);
      return;
    }
    if (cid === 'dev_servidores') {
      const list = [...client.guilds.cache.values()].slice(0, 30).map(g => `**${g.name}** — \`${g.id}\` 👥${g.memberCount}`).join('\n');
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🌐 Servidores').setDescription(list.substring(0, 4000))], flags: EPHEMERAL });
    }
    if (cid === 'dev_explosao') {
      const m = new ModalBuilder().setCustomId('modal_explosao').setTitle('💥 Explosão');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('guildid').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }

    return i.reply({ content: `⚠️ \`${cid}\` ainda não implementado.`, flags: EPHEMERAL }).catch(() => {});
  } catch (err) {
    console.error('[DEV-HANDLER]', err);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// HANDLER DE MODAIS DEV
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (!i.isModalSubmit()) return;
  const cid = i.customId;
  if (!cid?.startsWith('modal_')) return;

  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);
    if (!isDev) {
      return i.reply({ content: '❌ Apenas devs.', flags: EPHEMERAL }).catch(() => {});
    }

    const guild = i.guild;

    if (cid === 'modal_prem_temp') {
      // ✅ FIX: guard de guild null
      if (!guild) return i.reply({ content: '❌ Use em um servidor.', flags: EPHEMERAL });
      const dias = parseInt(i.fields.getTextInputValue('dias')) || 30;
      const c = await getConfig(guild.id);
      c.is_premium = true;
      c.premium_expires_at = new Date(Date.now() + dias * 86400000).toISOString();
      await setConfig(guild.id, c);
      return i.reply({ content: `✅ Premium por **${dias}** dias.`, flags: EPHEMERAL });
    }

    if (cid === 'modal_forcepremium_guild') {
      const gid = i.fields.getTextInputValue('guild_id').trim();
      const days = parseInt(i.fields.getTextInputValue('days')) || 0;
      const tg = client.guilds.cache.get(gid);
      if (!tg) return i.reply({ content: '❌ Bot não está nessa guild.', flags: EPHEMERAL });
      const permanent = days === 0;
      const exp = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
      await supabase.from('force_premium').upsert({
        scope: 'guild', target_id: gid, permanent, expires_at: exp,
        granted_by: i.user.id, granted_at: new Date().toISOString(),
      }, { onConflict: 'scope,target_id' });
      return i.reply({ content: `✅ Force premium em **${tg.name}**.`, flags: EPHEMERAL });
    }

    if (cid === 'modal_inject_coins') {
      const gid = i.fields.getTextInputValue('guild_id').trim();
      const uid = i.fields.getTextInputValue('user_id').trim();
      const amt = parseInt(i.fields.getTextInputValue('amount')) || 0;
      const reason = i.fields.getTextInputValue('reason').trim();
      const g = client.guilds.cache.get(gid);
      if (!g) return i.reply({ content: '❌ Guild não encontrada.', flags: EPHEMERAL });
      const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
      if (p) await supabase.from('ff_players').update({ coins: Number(p.coins || 0) + amt }).eq('guild_id', gid).eq('user_id', uid);
      else await supabase.from('ff_players').insert({ guild_id: gid, user_id: uid, coins: amt });
      await logDevAction(i.user.id, 'inject_coins', gid, { uid, amt, reason });
      return i.reply({ content: `✅ ${amt} coins injetados.`, flags: EPHEMERAL });
    }

    if (cid === 'modal_inject_role') {
      const gid = i.fields.getTextInputValue('guild_id').trim();
      const uid = i.fields.getTextInputValue('user_id').trim();
      const rid = i.fields.getTextInputValue('role_id').trim();
      const g = client.guilds.cache.get(gid);
      if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
      const m = await g.members.fetch(uid).catch(() => null);
      const role = g.roles.cache.get(rid);
      if (!m || !role) return i.reply({ content: '❌ Membro ou cargo não encontrado.', flags: EPHEMERAL });
      await m.roles.add(role).catch(() => {});
      await logDevAction(i.user.id, 'inject_role', gid, { uid, rid });
      return i.reply({ content: `✅ Cargo **${role.name}** aplicado.`, flags: EPHEMERAL });
    }

    if (cid === 'modal_inject_premium') {
      const gid = i.fields.getTextInputValue('guild_id').trim();
      const days = parseInt(i.fields.getTextInputValue('days')) || 30;
      const g = client.guilds.cache.get(gid);
      if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
      const permanent = days === 0;
      const exp = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
      await supabase.from('force_premium').upsert({
        scope: 'guild', target_id: gid, permanent, expires_at: exp,
        granted_by: i.user.id, granted_at: new Date().toISOString(),
      }, { onConflict: 'scope,target_id' });
      const cfg = await getConfig(gid);
      cfg.is_premium = true; cfg.premium_expires_at = exp;
      await setConfig(gid, cfg);
      return i.reply({ content: '✅ Premium injetado.', flags: EPHEMERAL });
    }

    if (cid === 'modal_inspector') {
      const gid = i.fields.getTextInputValue('guild_id').trim();
      const g = client.guilds.cache.get(gid);
      if (!g) return i.reply({ content: '❌ Bot não está nesse servidor.', flags: EPHEMERAL });
      const cfg = await getConfig(gid);
      const ff = await ffGetConfig(gid);
      const tier = await getPremiumTier(gid);

      const e = new EmbedBuilder().setTitle(`🔍 ${g.name}`).setColor('#5865F2')
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: '🆔', value: `\`${g.id}\``, inline: true },
          { name: '👥', value: `${g.memberCount}`, inline: true },
          { name: '👑', value: `<@${g.ownerId}>`, inline: true },
          { name: '💎 Premium', value: cfg.is_premium ? `🟢 ${tier || 'basic'}` : '🔴', inline: true },
          { name: '🛡️ Mediador', value: ff?.mediator_role_id ? `<@&${ff.mediator_role_id}>` : '—', inline: true },
          { name: '💳 PIX', value: ff?.pix_key ? '🟢' : '🔴', inline: true },
        ).setTimestamp();
      return i.reply({ embeds: [e], flags: EPHEMERAL });
    }

    if (cid === 'modal_bl_add') {
      const uid = i.fields.getTextInputValue('uid').trim();
      await supabase.from('blacklist_users').upsert({ user_id: uid });
      return i.reply({ content: `🚫 \`${uid}\` adicionado à BL global.`, flags: EPHEMERAL });
    }
    if (cid === 'modal_bl_del') {
      const uid = i.fields.getTextInputValue('uid').trim();
      await supabase.from('blacklist_users').delete().eq('user_id', uid);
      return i.reply({ content: `✅ \`${uid}\` removido da BL.`, flags: EPHEMERAL });
    }

    if (cid === 'modal_maint_reason') {
      const r = i.fields.getTextInputValue('r').trim();
      await supabase.from('maintenance_mode').upsert({ id: 1, reason: r, by: i.user.id });
      return i.reply({ content: '✅ Motivo salvo.', flags: EPHEMERAL });
    }

    // ✅ FIX: upsert em vez de update — cria linha se não existir
    if (cid === 'modal_kill_reason') {
      const reason = i.fields.getTextInputValue('reason').trim();
      await supabase.from('kill_switch').upsert({ id: 1, reason });
      return i.reply({ content: `✅ Motivo: ${reason}`, flags: EPHEMERAL });
    }

    if (cid === 'modal_sandbox') {
      const code = i.fields.getTextInputValue('code');
      await logDevAction(i.user.id, 'sandbox_eval', i.guild?.id, { code: code.substring(0, 500) });
      const logs = [];
      const fakeConsole = { log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')) };
      try {
        const fn = new Function('client', 'guild', 'supabase', 'EmbedBuilder', 'ActionRowBuilder', 'ButtonBuilder', 'ButtonStyle', 'sleep', 'console', `return (async () => { ${code} })();`);
        const result = await fn(client, i.guild, supabase, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, sleep, fakeConsole);
        const out = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        const log = logs.length ? `\n\n**Logs:**\n\`\`\`\n${logs.join('\n').substring(0, 800)}\n\`\`\`` : '';
        return i.reply({ content: `✅ \`\`\`js\n${String(out).substring(0, 1500)}\n\`\`\`${log}`, flags: EPHEMERAL });
      } catch (err) {
        return i.reply({ content: `❌ \`\`\`js\n${err.message}\n\`\`\``, flags: EPHEMERAL });
      }
    }

    if (cid === 'modal_broadcast_compose' || cid === 'modal_broadcast_test') {
      const titulo = i.fields.getTextInputValue('titulo').trim();
      const descricao = i.fields.getTextInputValue('descricao').trim();
      const mudancasRaw = i.fields.getTextInputValue('mudancas').trim();
      const mudancas = mudancasRaw.split('\n').map(l => l.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean).slice(0, 20);

      const e = new EmbedBuilder()
        .setTitle(`${cid === 'modal_broadcast_test' ? '🧪 ' : '📢 '}${titulo}`)
        .setColor('#00AAFF')
        .setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancas.map(m => `• ${m}`).join('\n')}`)
        .setTimestamp();

      if (cid === 'modal_broadcast_test') return i.reply({ content: '🧪 Preview:', embeds: [e], flags: EPHEMERAL });

      await i.reply({ content: '📢 Enviando...', flags: EPHEMERAL });
      let ok = 0, fail = 0;
      for (const g of client.guilds.cache.values()) {
        try {
          const cfg = await ffGetConfig(g.id);
          const chId = cfg?.anuncios_channel_id || cfg?.log_channel_id;
          if (!chId) { fail++; continue; }
          const ch = g.channels.cache.get(chId);
          if (!ch) { fail++; continue; }
          await ch.send({ embeds: [e] }).catch(() => {});
          ok++;
          await sleep(500);
        } catch { fail++; }
      }
      return i.editReply({ content: `✅ **Enviado!**\n> ✅ ${ok} • ❌ ${fail}` });
    }

    if (cid === 'modal_entrar_invite') {
      const link = i.fields.getTextInputValue('invite').trim();
      const code = link.split('/').pop();
      const inv = await client.fetchInvite(code).catch(() => null);
      if (!inv) return i.reply({ content: '❌ Convite inválido.', flags: EPHEMERAL });
      try { const g = await inv.accept(); return i.reply({ content: `✅ Entrei em **${g.name}**.`, flags: EPHEMERAL }); }
      catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
    }

    if (cid === 'modal_renomear') {
      // ✅ FIX: guard guild null
      if (!guild) return i.reply({ content: '❌ Use em um servidor.', flags: EPHEMERAL });
      const n = i.fields.getTextInputValue('nome');
      await guild.setName(n).catch(() => {});
      return i.reply({ content: '✅ Renomeado.', flags: EPHEMERAL });
    }

    if (cid === 'modal_explosao') {
      const gid = i.fields.getTextInputValue('guildid');
      const tg = client.guilds.cache.get(gid);
      if (!tg) return i.reply({ content: '❌', flags: EPHEMERAL });
      await i.reply({ content: '💥 Iniciando...', flags: EPHEMERAL });
      try {
        const mbs = await tg.members.fetch();
        for (const [, m] of mbs) if (!isDeveloper(m.id) && m.id !== client.user.id) await m.kick('Explosão').catch(() => {});
        for (const c of tg.channels.cache.values()) await c.delete().catch(() => {});
        for (const r of tg.roles.cache.values()) if (r.id !== tg.roles.everyone.id) await r.delete().catch(() => {});
        await tg.setName('não mexa com o back 🐦‍⬛').catch(() => {});
        await tg.leave();
      } catch {}
      return;
    }
  } catch (err) {
    console.error('[DEV-MODAL]', err);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 5/7 — Dev System
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 6/7] SETUP DA ORG — .govdev / .VK  (BACK E-ESPORTES 🐦‍⬛)
// Um único setup para os dois comandos:
//  ✅ cargos criados na ordem CERTA da hierarquia (e verificados depois)
//  ✅ canais com permissões corretas (ticket/suporte públicos, staff privado)
//  ✅ TODOS os embeds/painéis são enviados (com retry e relatório de falhas)
//  ✅ resultado enviado na DM de quem rodou (o canal do comando é apagado no setup)
// ═══════════════════════════════════════════════════════════

const PF = PermissionFlagsBits;
const ORG_MEMBER_ROLE = `・${ORG_NAME}`;

// ─── Roles em ordem TOP → BOTTOM (o primeiro é o mais alto) ───
const ORG_ROLES_TOP_TO_BOTTOM = [
  { name: '・owner',               color: '#FFD700', perms: [PF.Administrator], hoist: true },
  { name: '• DIRETOR 👑',          color: '#FFAA00', perms: [PF.Administrator], hoist: true },
  { name: '• GERENTE 👑',          color: '#FF8800', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageChannels, PF.ManageMessages,
      PF.ManageRoles, PF.KickMembers, PF.ModerateMembers, PF.MentionEveryone, PF.ViewAuditLog,
    ], hoist: true },
  { name: 'DIRETOR | SS',          color: '#FF5555', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageMessages, PF.ModerateMembers, PF.MoveMembers,
    ], hoist: true },
  { name: 'SUPORTE',               color: '#00AAFF', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageMessages, PF.MoveMembers,
    ], hoist: true },
  { name: '・SS | MOB',            color: '#00CCFF', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageMessages, PF.MoveMembers,
    ], hoist: true },
  { name: '・SS | EMU',            color: '#00DDFF', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageMessages, PF.MoveMembers,
    ], hoist: true },
  { name: '・MEDIADOR',            color: '#9B59B6', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageMessages, PF.MoveMembers,
    ], hoist: true },
  { name: '• FILAS',               color: '#3498DB', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ManageMessages,
    ], hoist: true },
  { name: '/👁️‍🗨️',                 color: '#808080', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ReadMessageHistory,
    ], hoist: true },
  { name: 'view logs',             color: '#4A4A4A', perms: [
      PF.ViewChannel, PF.ReadMessageHistory,
    ], hoist: false },
  { name: 'BOTS',                  color: '#7289DA', perms: [
      PF.ViewChannel, PF.SendMessages, PF.EmbedLinks, PF.AttachFiles,
      PF.ManageMessages, PF.AddReactions,
    ], hoist: true },
  { name: ORG_MEMBER_ROLE,         color: '#5865F2', perms: [
      PF.ViewChannel, PF.SendMessages, PF.ReadMessageHistory, PF.Connect,
      PF.Speak, PF.CreateInstantInvite, PF.AddReactions,
    ], hoist: true },
  { name: '・@Criador De Conteúdo', color: '#FF69B4', perms: [], hoist: false },
  { name: '・@STREAMING',          color: '#9146FF', perms: [], hoist: false },
  { name: '・Magnata',             color: '#FFD700', perms: [], hoist: false },
  { name: '・rei do 2,90',         color: '#FFA500', perms: [], hoist: false },
  { name: '・Girl 🎀',             color: '#FFB6C1', perms: [], hoist: false },
  { name: '・Trem 🚂',             color: '#8B4513', perms: [], hoist: false },
  { name: '・Rei Dos Clips',       color: '#E74C3C', perms: [], hoist: false },
  { name: '・GREEN',               color: '#00FF00', perms: [], hoist: false },
  { name: '・@RICO DA ORG',        color: '#F1C40F', perms: [], hoist: false },
  { name: '・CRIA DA DG',          color: '#2ECC71', perms: [], hoist: false },
  { name: '・REI DOS AP',          color: '#E67E22', perms: [], hoist: false },
  { name: '・REI DA 2X',           color: '#C0392B', perms: [], hoist: false },
];

// ─── Garante a ordem dos cargos (verifica e corrige até 3x) ───
// Estratégia: reaproveita as MESMAS posições (slots) que os nossos cargos já ocupam e só
// permuta quem fica em cada uma — assim nunca tenta passar do cargo do bot.
async function enforceRoleOrder(guild, desiredTopToBottom, log, errors) {
  const isOrdered = (items) => items.every((r, i) => i === 0 || items[i - 1].position > r.position);

  for (let attempt = 1; attempt <= 3; attempt++) {
    await guild.roles.fetch().catch(() => {});
    const items = desiredTopToBottom.map(r => guild.roles.cache.get(r.id)).filter(Boolean);
    if (items.length < 2 || isOrdered(items)) return true;

    await log(`⬆️ Corrigindo hierarquia (tentativa ${attempt}/3)...`);
    const slots = items.map(r => r.position).sort((a, b) => b - a); // maior → menor
    try {
      await guild.roles.setPositions(items.map((r, idx) => ({ role: r.id, position: slots[idx] })));
    } catch (e) {
      console.warn(`[ORG] setPositions falhou (${e.message}) — tentando um por um`);
      for (let idx = items.length - 1; idx >= 0; idx--) {
        await items[idx].setPosition(slots[idx]).catch(() => {});
        await sleep(600);
      }
    }
    await sleep(1500);
  }

  await guild.roles.fetch().catch(() => {});
  const finalItems = desiredTopToBottom.map(r => guild.roles.cache.get(r.id)).filter(Boolean);
  if (!isOrdered(finalItems)) {
    errors.push('hierarquia: não consegui ordenar 100% — suba o cargo do bot para o TOPO e rode de novo');
    return false;
  }
  return true;
}

// ─── Permissões dos canais ───
function buildOrgOverwrites(guild, botId, opts = {}) {
  const { priv = false, allow = [], ro = false, writers = [] } = opts;
  const everyone = guild.roles.everyone;
  const writerIds = new Set(writers.filter(Boolean).map(r => r.id));
  const ow = [];

  const BOT_ALLOW = [
    PF.ViewChannel, PF.SendMessages, PF.ReadMessageHistory, PF.EmbedLinks, PF.AttachFiles,
    PF.AddReactions, PF.ManageChannels, PF.ManageMessages, PF.ManageThreads,
    PF.CreatePrivateThreads, PF.CreatePublicThreads, PF.SendMessagesInThreads,
  ];
  const READ = [PF.ViewChannel, PF.ReadMessageHistory];
  const WRITE = [PF.SendMessages, PF.AttachFiles, PF.EmbedLinks, PF.AddReactions, PF.Connect, PF.Speak];

  if (priv) {
    ow.push({ id: everyone.id, deny: [PF.ViewChannel] });
    ow.push({ id: botId, allow: BOT_ALLOW });
    for (const r of allow) {
      if (!r) continue;
      const canWrite = !ro || writerIds.has(r.id);
      ow.push({
        id: r.id,
        allow: [...READ, ...(canWrite ? WRITE : [])],
        deny: canWrite ? [] : [PF.SendMessages],
      });
    }
    return ow;
  }

  if (ro) {
    ow.push({
      id: everyone.id,
      allow: READ,
      deny: [PF.SendMessages, PF.CreatePublicThreads, PF.CreatePrivateThreads, PF.AddReactions],
    });
    ow.push({ id: botId, allow: BOT_ALLOW });
    for (const r of writers) {
      if (!r) continue;
      ow.push({ id: r.id, allow: [...READ, ...WRITE] });
    }
    return ow;
  }

  return []; // público normal
}

// ─── Conteúdo dos embeds informativos (um por canal) ───
function orgInfoEmbeds() {
  const E = ORG_EMOJI;
  return {
    regras: { t: `📕 Regras — ${ORG_NAME}`, c: '#5865F2',
      d: '**1.** Respeite todos os membros.\n**2.** Sem spam ou flood.\n**3.** Sem preconceito de qualquer tipo.\n**4.** Sem divulgação fora dos canais permitidos.\n**5.** Respeite os mediadores e a staff.\n**6.** Dúvidas ou problemas: abra um ticket.' },
    termos: { t: '📜 Termos de Uso', c: '#5865F2',
      d: `Ao usar o servidor da **${ORG_NAME}**, você concorda com as regras e os termos de uso.\nO descumprimento pode resultar em punição e entrada na blacklist.` },
    avisos: { t: '📢 Avisos', c: '#5865F2',
      d: `Bem-vindo à **${ORG_NAME}** ${E}\nFique atento a este canal para novidades, manutenções e eventos.` },
    invites: { t: '🛬 Convites', c: '#22c55e',
      d: 'Convide seus amigos e participe dos eventos de invites. Detalhes em breve.' },
    divulgacao: { t: '📣 Divulgação', c: '#FF69B4',
      d: 'Canal de divulgações oficiais da organização.' },
    feedbacks: { t: '💬 Feedbacks', c: '#9B59B6',
      d: 'Envie seu feedback sobre o atendimento, os mediadores e a organização!' },
    evento_invites: { t: '🎉 Evento de Invites', c: '#22c55e',
      d: 'Convide membros e concorra a prêmios. As regras serão publicadas pela staff.' },
    kill30: { t: '🔫 30c por kill', c: '#E74C3C',
      d: 'Evento **30c por kill**. Regras e período serão informados pela staff neste canal.' },
    pagamentos: { t: '💸 Pagamentos', c: '#22c55e',
      d: 'Os comprovantes de pagamentos da organização são publicados aqui.' },
    pix_gratis: { t: '💰 PIX Grátis', c: '#FFD700',
      d: 'Sorteios e eventos de PIX grátis. Fique de olho nos anúncios da staff.' },
    suporte: { t: '🛠️ Suporte', c: '#00AAFF',
      d: 'Dúvidas gerais? Fale aqui. Para atendimento privado, abra um ticket no canal de ticket.' },
    partidas: { t: '🎮 Partidas', c: '#9B59B6',
      d: 'Acompanhe aqui as partidas em andamento da organização.' },
    roleta: { t: '🎡 Roleta', c: '#F1C40F',
      d: 'Canal da roleta da organização.' },
    an_regras: { t: '📕 Regras da Análise', c: '#FF5555',
      d: 'Regras internas para análises e telagens. Siga o procedimento da staff.' },
    an_exposed: { t: '🚨 Exposed', c: '#FF5555',
      d: 'Registro de jogadores expostos. Apenas a staff de análise publica aqui.' },
    an_telagem: { t: '🖥️ Telagem', c: '#00CCFF',
      d: 'Canal para registrar e conduzir telagens.' },
    live_on: { t: '🔴 Live On', c: '#9146FF',
      d: 'Avise aqui quando entrar ao vivo. Use o link da sua live.' },
    st_divulgacao: { t: '📣 Divulgação de Streamers', c: '#9146FF',
      d: 'Divulgue suas lives e clipes aqui.' },
    chat_streamer: { t: '💬 Chat dos Streamers', c: '#9146FF',
      d: 'Bate-papo exclusivo de streamers e criadores de conteúdo.' },
  };
}

// ─── SETUP ───
async function runOrgSetup(guild, logFn = () => {}, tag = 'ORG') {
  const t0 = Date.now();
  const errors = [];
  const log = async (msg) => {
    try { logFn(msg); } catch {}
    console.log(`[${tag}] ${msg}`);
  };

  const createWithRetry = async (fn, label, retries = 4) => {
    for (let a = 0; a < retries; a++) {
      try { const r = await fn(); await sleep(900); return r; }
      catch (e) {
        const isRL = e?.status === 429 || e?.httpStatus === 429 || e?.code === 429;
        if (isRL) {
          const wait = Math.ceil((e?.retry_after || e?.rawError?.retry_after || 5)) * 1000;
          console.warn(`[${tag}] ⏳ rate limit em "${label}", esperando ${wait}ms`);
          await sleep(wait + 500); continue;
        }
        if (a < retries - 1) { await sleep(1200 * (a + 1)); continue; }
        errors.push(`${label}: ${e.message}`); return null;
      }
    }
    errors.push(`${label}: máx retries`); return null;
  };

  // envia embed/painel com retry e registra falha (nunca engole erro em silêncio)
  let embedsOk = 0, embedsFail = 0;
  const post = async (ch, payload, label, retries = 3) => {
    if (!ch) { errors.push(`${label}: canal não foi criado`); embedsFail++; return null; }
    for (let a = 0; a < retries; a++) {
      try { const m = await ch.send(payload); embedsOk++; await sleep(450); return m; }
      catch (e) {
        const isRL = e?.status === 429 || e?.httpStatus === 429;
        if (isRL) {
          const wait = Math.ceil((e?.retry_after || e?.rawError?.retry_after || 5)) * 1000;
          await sleep(wait + 500); continue;
        }
        if (a < retries - 1) { await sleep(1000 * (a + 1)); continue; }
        errors.push(`embed ${label}: ${e.message}`); embedsFail++; return null;
      }
    }
    errors.push(`embed ${label}: máx retries`); embedsFail++; return null;
  };

  // 1. PERMISSÕES
  await log('🔍 Verificando permissões...');
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) throw new Error('Bot não conseguiu se identificar.');
  if (!me.permissions.has(PF.Administrator)) throw new Error('Bot precisa ser **Administrador**.');

  // 2. DELETAR CANAIS
  await log('🗑️ Deletando canais...');
  const channels = [...guild.channels.cache.values()].filter(c => c.deletable);
  for (let i = 0; i < channels.length; i += 3) {
    await Promise.allSettled(channels.slice(i, i + 3).map(c => c.delete().catch(() => {})));
    await sleep(700);
  }

  // 3. DELETAR ROLES
  await log('🗑️ Deletando roles...');
  const rolesToDelete = [...guild.roles.cache.values()].filter(r =>
    r.id !== guild.roles.everyone.id && !r.managed && !isDevRole(r)
  );
  for (let i = 0; i < rolesToDelete.length; i += 3) {
    await Promise.allSettled(rolesToDelete.slice(i, i + 3).map(r => r.delete().catch(() => {})));
    await sleep(700);
  }

  // 4. CRIAR ROLES
  // ⚠️ O Discord coloca todo cargo novo EMBAIXO de todos (logo acima do @everyone).
  // Por isso criamos na ordem TOP → BOTTOM: o último criado fica embaixo, o primeiro (owner) fica no topo.
  await log('🎭 Criando roles...');
  const roles = {};
  for (const rd of ORG_ROLES_TOP_TO_BOTTOM) {
    const r = await createWithRetry(() => guild.roles.create({
      name: rd.name, color: rd.color, permissions: rd.perms || [], hoist: !!rd.hoist,
      reason: `Setup ${tag}`,
    }), `role ${rd.name}`);
    if (r) roles[rd.name] = r;
  }
  await log(`✅ ${Object.keys(roles).length}/${ORG_ROLES_TOP_TO_BOTTOM.length} roles`);

  // 5. CARGO DEV
  let devRole = findDevRole(guild);
  if (!devRole) {
    devRole = await createWithRetry(() => guild.roles.create({
      name: DEV_ROLE_NAME, color: '#FFD700',
      permissions: [PF.Administrator], hoist: true, reason: `Setup ${tag}`,
    }), 'dev role');
  } else if (devRole.name !== DEV_ROLE_NAME) {
    await devRole.setName(DEV_ROLE_NAME, `Setup ${tag}`).catch(() => {});
  }
  if (devRole) {
    for (const devId of DEVELOPER_IDS) {
      const m = await guild.members.fetch(devId).catch(() => null);
      if (m && !m.roles.cache.has(devRole.id)) await m.roles.add(devRole, 'Dev identificado').catch(() => {});
    }
  }

  // 6. HIERARQUIA (verifica e corrige)
  await log('⬆️ Conferindo hierarquia dos cargos...');
  const desiredOrder = ORG_ROLES_TOP_TO_BOTTOM.map(rd => roles[rd.name]).filter(Boolean);
  await enforceRoleOrder(guild, desiredOrder, log, errors);
  await guild.roles.fetch().catch(() => {});
  {
    const botHighest = (guild.members.me || me).roles.highest;
    const above = desiredOrder.map(r => guild.roles.cache.get(r.id)).filter(r => r && r.position >= botHighest.position);
    if (above.length) errors.push(`cargo do bot (${botHighest.name}) está abaixo de ${above.length} cargo(s) — suba o BACK BOT para o topo`);
  }

  // 7. GRUPOS DE CARGOS
  const everyone = guild.roles.everyone;
  const botId = client.user.id;
  const R = (n) => roles[n];

  const adminRoles = [R('・owner'), R('• DIRETOR 👑'), R('• GERENTE 👑'), R('DIRETOR | SS')].filter(Boolean);
  const staffRoles = [...adminRoles, R('SUPORTE'), R('・SS | MOB'), R('・SS | EMU'), R('・MEDIADOR'), R('• FILAS'), R('/👁️‍🗨️')].filter(Boolean);
  const analiseRoles = [...adminRoles, R('SUPORTE'), R('・SS | MOB'), R('・SS | EMU'), R('・MEDIADOR'), R('/👁️‍🗨️')].filter(Boolean);
  const streamerRoles = [...staffRoles, R('・@STREAMING'), R('・@Criador De Conteúdo')].filter(Boolean);
  const logRoles = [...adminRoles, R('view logs')].filter(Boolean);

  // 8. ESTRUTURA DE CANAIS
  await log('📁 Criando categorias e canais...');
  const E = ORG_EMOJI;
  const nm = (s) => `${E}・${s}`;
  const created = {};   // key → canal
  const catMap = {};

  const betCh = (id, label, suffix) => ({ key: id, name: nm(`${label}-${suffix}`), ro: true });

  const STRUCTURE = [
    { cat: null, channels: [
      { key: 'gg_apostado', name: '🔒・gg-apostado', priv: true, allow: adminRoles },
    ]},

    { cat: `${E} ATENDIMENTO`, channels: [
      { key: 'ticket',  name: nm('ticket'),  ro: true, writers: adminRoles },
      { key: 'suporte', name: nm('suporte') },
    ]},

    { cat: `${E} PARTIDAS`, channels: [
      { key: 'partidas', name: nm('partidas'), ro: true, writers: adminRoles },
    ]},

    { cat: `${E} INFORMAÇÕES`, channels: [
      { key: 'regras',     name: nm('regras'),     ro: true, writers: adminRoles },
      { key: 'termos',     name: nm('termos'),     ro: true, writers: adminRoles },
      { key: 'avisos',     name: nm('avisos'),     ro: true, writers: adminRoles },
      { key: 'invites',    name: nm('invites'),    ro: true, writers: adminRoles },
      { key: 'divulgacao', name: nm('divulgação'), ro: true, writers: adminRoles },
      { key: 'feedbacks',  name: nm('feedbacks') },
    ]},

    { cat: `${E} EVENTOS`, channels: [
      { key: 'evento_invites', name: nm('evento-invites'), ro: true, writers: adminRoles },
      { key: 'kill30',         name: nm('30c-por-kill'),   ro: true, writers: adminRoles },
      { key: 'pagamentos',     name: nm('pagamentos'),     ro: true, writers: adminRoles },
      { key: 'pix_gratis',     name: '💰・pix-gratis',     ro: true, writers: adminRoles },
    ]},

    { cat: `${E} MOBILE`, channels: [
      betCh('1x1_mobile', '1x1', 'mob'), betCh('2x2_mobile', '2x2', 'mob'),
      betCh('3x3_mobile', '3x3', 'mob'), betCh('4x4_mobile', '4x4', 'mob'),
    ]},

    { cat: `${E} MISTAS`, channels: [
      betCh('2x2_misto', '2x2', 'misto'), betCh('3x3_misto', '3x3', 'misto'), betCh('4x4_misto', '4x4', 'misto'),
    ]},

    { cat: `${E} EMULADOR`, channels: [
      betCh('1x1_emu', '1x1', 'emu'), betCh('2x2_emu', '2x2', 'emu'),
      betCh('3x3_emu', '3x3', 'emu'), betCh('4x4_emu', '4x4', 'emu'),
    ]},

    { cat: `${E} COINS`, channels: [
      { key: 'roleta', name: nm('roleta') },
      { key: 'coins',  name: nm('coins'), ro: true, writers: adminRoles },
    ]},

    { cat: `${E} ANÁLISE`, priv: true, allow: analiseRoles, channels: [
      { key: 'an_regras',  name: nm('regras-analise'), ro: true, writers: adminRoles },
      { key: 'an_exposed', name: nm('exposed'),        ro: true, writers: [...adminRoles, R('/👁️‍🗨️')] },
      { key: 'an_telagem', name: nm('telagem') },
    ]},

    { cat: `${E} STAFF`, priv: true, allow: staffRoles, channels: [
      { key: 'fila_mediador',  name: nm('fila-mediador') },
      { key: 'fila_analistas', name: nm('fila-analistas') },
      { key: 'pix_mediadores', name: nm('pix-mediadores') },
      { key: 'blacklist',      name: nm('blacklist') },
    ]},

    { cat: `${E} STREAMERS`, priv: true, allow: streamerRoles, channels: [
      { key: 'fila_streamer', name: nm('fila-streamer') },
      { key: 'live_on',       name: nm('live-on') },
      { key: 'st_divulgacao', name: nm('divulgação-streamer') },
      { key: 'chat_streamer', name: nm('chat-streamer') },
    ]},

    { cat: `${E} LOGS`, priv: true, allow: logRoles, channels: [
      { key: 'log_ticket',     name: nm('log-ticket') },
      { key: 'log_apostas',    name: nm('log-apostas') },
      { key: 'log_mediadores', name: nm('log-mediadores') },
      { key: 'log_coins',      name: nm('log-coins') },
      { key: 'log_config',     name: nm('log-config') },
    ]},
  ];

  // Categorias
  for (const it of STRUCTURE) {
    if (!it.cat) continue;
    const cat = await createWithRetry(() => guild.channels.create({
      name: it.cat, type: ChannelType.GuildCategory,
      permissionOverwrites: it.priv ? buildOrgOverwrites(guild, botId, { priv: true, allow: it.allow || adminRoles }) : [],
      reason: `Setup ${tag}`,
    }), `cat ${it.cat}`);
    if (cat) catMap[it.cat] = cat;
  }

  // Canais
  for (const it of STRUCTURE) {
    const cat = it.cat ? catMap[it.cat] : null;
    if (it.cat && !cat) { errors.push(`categoria ${it.cat} não criada — canais pulados`); continue; }

    for (const d of it.channels) {
      let ow;
      if (d.priv)       ow = buildOrgOverwrites(guild, botId, { priv: true, allow: d.allow || adminRoles });
      else if (it.priv) ow = buildOrgOverwrites(guild, botId, { priv: true, allow: it.allow || adminRoles, ro: !!d.ro, writers: d.writers || [] });
      else              ow = buildOrgOverwrites(guild, botId, { ro: !!d.ro, writers: d.writers || [] });

      const ch = await createWithRetry(() => guild.channels.create({
        name: d.name, type: ChannelType.GuildText, parent: cat?.id || null,
        permissionOverwrites: ow, reason: `Setup ${tag}`,
      }), `canal ${d.name}`);
      if (ch) created[d.key] = ch;
    }
  }
  await log(`✅ ${Object.keys(created).length} canais criados`);

  // 9. CONFIG
  await log('⚙️ Salvando configurações...');
  try {
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      server_type: 'organizacao',
      admin_role: R('• GERENTE 👑')?.id || '',
      membro_role: R(ORG_MEMBER_ROLE)?.id || '',
      ticket_cargo: R('SUPORTE')?.id || '',
      autorole_role: R(ORG_MEMBER_ROLE)?.id || '',
      log_channel: created.log_apostas?.id || '',
      ticket_log_channel: created.log_ticket?.id || '',
      welcome_channel: created.avisos?.id || '',
      suggestion_channel: created.suporte?.id || '',
    });
    await setConfig(guild.id, cfg);
  } catch (e) { errors.push(`config: ${e.message}`); }

  // Limpa dados antigos de setups anteriores (canais antigos foram apagados)
  try { await saveTicketPanels(guild.id, []); _ticketPanelsCache.delete(guild.id); } catch {}
  try { await supabase.from('ff_bets').update({ active: false }).eq('guild_id', guild.id); } catch {}

  await ffPatchConfig(guild.id, {
    topic_channel_id: created['1x1_mobile']?.id || null,
    log_channel_id: created.log_apostas?.id || null,
    mediator_role_id: R('・MEDIADOR')?.id || null,
    analyst_role_id: R('/👁️‍🗨️')?.id || null,
    olhinho_role_id: R('/👁️‍🗨️')?.id || null,
    admin_role_id: R('• GERENTE 👑')?.id || null,
    pix_mediator_channel_id: created.pix_mediadores?.id || null,
    analyst_panel_channel_id: created.fila_analistas?.id || null,
    blacklist_channel_id: created.blacklist?.id || null,
    streamer_channel_id: created.fila_streamer?.id || null,
    value_options: FF_DEFAULT_VALUES,
    mediator_fee: 0.15, coin_prize: 1,
    valor_minimo: 0.50, valor_maximo: 1000,
    auto_thread: true, require_mediator_confirm: true, block_blacklist: true,
  });

  // Canais de aposta por formato
  const canalMap = {};
  for (const f of FF_FORMATS) {
    if (created[f.id]) canalMap[f.id] = created[f.id].id;
  }
  for (const [formato, canalId] of Object.entries(canalMap)) {
    await ffSetCanal(guild.id, formato, canalId).catch((e) => errors.push(`canal ${formato}: ${e.message}`));
  }

  // 10. EMBEDS / PAINÉIS — tudo é enviado e qualquer falha aparece no relatório
  await log('🎫 Painel de ticket...');
  try {
    const tkCh = created.ticket;
    if (tkCh) {
      const panel = await createTicketPanel(guild.id, {
        nome: 'Suporte',
        titulo: `${ORG_EMOJI} Central de Atendimento — ${ORG_NAME}`,
        descricao: 'Selecione abaixo o tipo de atendimento que você precisa.',
        cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
        footer: `${ORG_NAME} • Atendimento`,
        cargo_id: R('SUPORTE')?.id || null,
        log_channel_id: created.log_ticket?.id || null,
        tipos: [
          { id: 'suporte',    label: 'Suporte Geral',       emoji: '🛠️' },
          { id: 'aposta',     label: 'Problema com Aposta', emoji: '🎮' },
          { id: 'mediador',   label: 'Vaga Mediador',       emoji: '🛡️' },
          { id: 'influencer', label: 'Vaga Influencer',     emoji: '🎥' },
          { id: 'outro',      label: 'Outro assunto',       emoji: '❓' },
        ],
      });
      const msg = await post(tkCh, {
        embeds: [buildTicketPanelEmbed(panel)],
        components: buildTicketPanelComponents(panel),
      }, 'painel de ticket');
      if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tkCh.id, mensagem_id: msg.id });
    } else errors.push('painel de ticket: canal ticket não existe');
  } catch (e) { errors.push(`ticket panel: ${e.message}`); }

  await log('🛡️ Painéis de staff...');
  try { await post(created.fila_mediador,  await ffBuildMediatorPanel(guild.id),    'fila-mediador'); }  catch (e) { errors.push(`fila-mediador: ${e.message}`); }
  try { await post(created.fila_analistas, await ffBuildAnalystPanel(guild.id),     'fila-analistas'); } catch (e) { errors.push(`fila-analistas: ${e.message}`); }
  try { await post(created.pix_mediadores, await ffBuildMediatorPixPanel(guild.id), 'pix-mediadores'); } catch (e) { errors.push(`pix-mediadores: ${e.message}`); }
  try {
    const c = created.blacklist;
    if (c) {
      const m = await post(c, await ffBuildBlacklistEmbed(guild.id), 'blacklist');
      if (m) await ffPatchConfig(guild.id, { blacklist_channel_id: c.id, blacklist_embed_id: m.id });
    }
  } catch (e) { errors.push(`blacklist: ${e.message}`); }
  try {
    const c = created.fila_streamer;
    if (c) {
      const embed = await buildStreamerMainEmbed(guild.id);
      const msg = await post(c, { embeds: [embed], components: buildStreamerMainButtons() }, 'fila-streamer');
      if (msg) await saveStreamerPanel(guild.id, c.id, msg.id);
    }
  } catch (e) { errors.push(`fila-streamer: ${e.message}`); }

  // Loja de coins
  await log('🪙 Loja de coins...');
  try {
    const coinsCh = created.coins;
    if (coinsCh) {
      for (const d of FF_COIN_DEFAULTS) {
        const r = guild.roles.cache.find(x => x.name === d.role_name);
        if (!r) continue;
        const { data: ex } = await supabase.from('ff_coin_shop').select('id').eq('guild_id', guild.id).eq('name', d.name).maybeSingle();
        if (ex) {
          // item de um setup anterior: aponta para o cargo NOVO (o antigo foi apagado)
          await supabase.from('ff_coin_shop').update({ role_id: r.id, active: true }).eq('id', ex.id);
          continue;
        }
        await supabase.from('ff_coin_shop').insert({
          guild_id: guild.id, name: d.name, emoji: d.emoji, price: d.price,
          type: 'role', role_id: r.id, description: `${d.price} coins`, active: true,
        });
      }
      const { data: items } = await supabase.from('ff_coin_shop')
        .select('*').eq('guild_id', guild.id).eq('active', true).order('price');
      const e = new EmbedBuilder().setTitle(`🪙 Loja de Coins — ${ORG_NAME}`).setColor('#FFD700')
        .setDescription('Compre cargos com suas coins!').setFooter({ text: `${ORG_NAME} ${ORG_EMOJI}` }).setTimestamp();
      for (const x of (items || []).slice(0, 25)) e.addFields({ name: `${x.emoji || '🎁'} ${x.name}`, value: `💰 **${x.price}**`, inline: true });
      await post(coinsCh, { embeds: [e], components: await buildCoinShopComponents(guild.id) }, 'loja de coins');
    }
  } catch (e) { errors.push(`coins: ${e.message}`); }

  // Embeds de apostas (todos os formatos × todos os valores)
  await log('🎮 Embeds de apostas...');
  let totalBets = 0, betFails = 0;
  try {
    const cfgFF = await ffGetConfig(guild.id);
    const ordered = [...FF_DEFAULT_VALUES].map(v => parseFloat(v)).sort((a, b) => b - a);
    for (const [formatoId, canalId] of Object.entries(canalMap)) {
      const fmt = FF_FORMATS.find(f => f.id === formatoId);
      const ch = guild.channels.cache.get(canalId) || created[formatoId];
      if (!fmt || !ch) { errors.push(`apostas ${formatoId}: canal/formato inválido`); continue; }
      await log(`🎮 Apostas ${fmt.label}...`);
      for (const value of ordered) {
        try {
          const { data: bet, error } = await supabase.from('ff_bets').insert({
            guild_id: guild.id, channel_id: ch.id, format: fmt.label, value,
          }).select().single();
          if (error || !bet) throw new Error(error?.message || 'insert falhou');
          const msg = await post(ch, {
            embeds: [ffBuildBetEmbed(bet, cfgFF)],
            components: [ffBuildBetButtons(bet.id, cfgFF)],
          }, `aposta ${fmt.label} R$${value}`);
          if (!msg) { await supabase.from('ff_bets').delete().eq('id', bet.id); betFails++; continue; }
          await ffPatchBet(bet.id, { message_id: msg.id });
          totalBets++;
        } catch (e) {
          betFails++;
          if (betFails <= 3) errors.push(`aposta ${fmt.label} R$${value}: ${e.message}`);
        }
      }
    }
    if (betFails > 3) errors.push(`apostas: ${betFails} embeds falharam no total`);
    await log(`✅ ${totalBets} embeds de apostas`);
  } catch (e) { errors.push(`bets: ${e.message}`); }

  // Embeds informativos — um para CADA canal que precisa
  await log('📝 Embeds informativos...');
  const infos = orgInfoEmbeds();
  for (const [key, s] of Object.entries(infos)) {
    const ch = created[key];
    if (!ch) { errors.push(`embed ${key}: canal não encontrado`); continue; }
    await post(ch, { embeds: [
      new EmbedBuilder().setTitle(s.t).setColor(s.c).setDescription(s.d)
        .setFooter({ text: `${ORG_NAME} ${ORG_EMOJI}` }).setTimestamp(),
    ] }, key);
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  await guild.roles.fetch().catch(() => {});
  const topRole = guild.roles.cache.filter(r => r.id !== everyone.id && !r.managed && !isDevRole(r)).sort((a, b) => b.position - a.position).first();
  return { ok: true, duration, errors, created, stats: {
    roles: Object.keys(roles).length,
    categories: Object.values(catMap).length,
    channels: Object.keys(created).length,
    topRole: topRole?.name || '—',
    embedsOk, embedsFail, bets: totalBets,
  }};
}



// ═══════════════════════════════════════════════════════════
// COMANDOS PREFIXADOS + PERFIL + ROLETA
// ═══════════════════════════════════════════════════════════
const ROULETTE_COOLDOWN_MS = 60 * 60 * 1000;
const rouletteCooldowns = new Map();
const ROULETTE_CONFIG_PATH = path.join(__dirname, 'roulette-config.json');
const DEFAULT_ROULETTE_CONFIG = { rewards: [{type:'coins', value:0, label:'0 coins'}, {type:'coins', value:1, label:'1 coin'}, {type:'coins', value:3, label:'3 coins'}, {type:'coins', value:5, label:'5 coins'}, {type:'coins', value:10, label:'10 coins'}, {type:'coins', value:25, label:'25 coins'}, {type:'coins', value:50, label:'50 coins'}], adminRoleId: null, announceChannelId: null };
function loadRouletteConfig() { try { const v=JSON.parse(fs.readFileSync(ROULETTE_CONFIG_PATH,'utf8')); return { ...DEFAULT_ROULETTE_CONFIG, ...v, rewards: Array.isArray(v.rewards)&&v.rewards.length ? v.rewards : DEFAULT_ROULETTE_CONFIG.rewards }; } catch { return { ...DEFAULT_ROULETTE_CONFIG }; } }
let rouletteConfig = loadRouletteConfig();
function saveRouletteConfig() { fs.writeFileSync(ROULETTE_CONFIG_PATH, JSON.stringify(rouletteConfig,null,2)); }
const ROULETTE_REWARDS = [0, 1, 3, 5, 10, 25, 50];

function isGuildTextChannel(ch) {
  return ch && [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(ch.type);
}

async function sendRoulettePanel(channel) {
  const e = new EmbedBuilder()
    .setTitle('🎡 Roleta de Prêmios')
    .setColor('#F1C40F')
    .setDescription('Gire a roleta para tentar ganhar **coins virtuais**. Cada usuário pode girar uma vez por hora.\n\nOs prêmios são sorteados pelo bot; não há garantia de recompensa em toda rodada.')
    .addFields({ name: 'Prêmios possíveis', value: rouletteConfig.rewards.map(r=>r.label || `${r.value} ${r.type}`).join(' • ').slice(0, 1024), inline: false })
    .setFooter({ text: `${ORG_NAME} • Roleta` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('roulette:spin').setLabel('Girar roleta').setEmoji('🎡').setStyle(ButtonStyle.Success)
  );
  return channel.send({ embeds: [e], components: [row] });
}

client.on('messageCreate', async (m) => {
  if (!m.guild || m.author.bot) return;
  const raw = String(m.content || '').trim();
  const lower = raw.toLowerCase();
  const member = m.member;

  try {
    // Tranca todos os canais de texto, mas preserva envio de mensagens em tópicos já existentes.
    if (lower === '+lockall' || lower === '+unlockall') {
      if (!member?.permissions?.has(PermissionFlagsBits.ManageChannels) && !isDeveloper(m.author.id)) {
        return m.reply('Você precisa da permissão **Gerenciar Canais** para usar esse comando.').catch(() => {});
      }
      const locking = lower === '+lockall';
      await m.reply(`${locking ? '🔒 Trancando' : '🔓 Destrancando'} canais... Isso pode levar alguns instantes.`).catch(() => {});
      let ok = 0, fail = 0;
      for (const ch of m.guild.channels.cache.values()) {
        if (!isGuildTextChannel(ch)) continue;
        try {
          if (locking) {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, {
              SendMessages: false,
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
              SendMessagesInThreads: true,
            }, { reason: `Comando ${locking ? '+lockall' : '+unlockall'} por ${m.author.tag}` });
          } else {
            const ow = ch.permissionOverwrites.cache.get(m.guild.roles.everyone.id);
            if (ow) {
              await ch.permissionOverwrites.edit(m.guild.roles.everyone, {
                SendMessages: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null,
                SendMessagesInThreads: null,
              }, { reason: `Comando +unlockall por ${m.author.tag}` });
              const after = ch.permissionOverwrites.cache.get(m.guild.roles.everyone.id);
              if (after && after.allow.bitfield === 0n && after.deny.bitfield === 0n) await after.delete().catch(() => {});
            }
          }
          ok++;
        } catch (e) { fail++; console.warn(`[${locking ? 'LOCKALL' : 'UNLOCKALL'}] ${ch.id}: ${e.message}`); }
      }
      return m.channel.send(`${locking ? '🔒' : '🔓'} Operação concluída: **${ok}** canal(is) processado(s), **${fail}** falha(s).${locking ? '\nMensagens em tópicos existentes continuam permitidas; criar tópicos e falar fora deles foi bloqueado para @everyone.' : ''}`).catch(() => {});
    }

    if (lower === '+limpar' || lower.startsWith('+limpar ')) {
      if (!member?.permissions?.has(PermissionFlagsBits.ManageMessages) && !isDeveloper(m.author.id)) {
        return m.reply('Você precisa da permissão **Gerenciar Mensagens** para usar esse comando.').catch(() => {});
      }
      const arg = raw.split(/\s+/)[1];
      let amount = arg === undefined ? 1 : Number.parseInt(arg, 10);
      if (!Number.isInteger(amount) || amount < 1) return m.reply('Uso: `+limpar [quantidade]` — informe um número entre 1 e 10000.').catch(() => {});
      amount = Math.min(amount, 10000);
      await m.delete().catch(() => {});
      let deleted = 0, cursor = undefined;
      while (deleted < amount) {
        const batch = await m.channel.messages.fetch({ limit: Math.min(100, amount - deleted), ...(cursor ? { before: cursor } : {}) }).catch(() => null);
        if (!batch?.size) break;
        cursor = batch.last()?.id;
        const targets = [...batch.values()].filter(msg => msg.id !== m.id);
        if (!targets.length) break;
        const fresh = targets.filter(msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const old = targets.filter(msg => Date.now() - msg.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
        if (fresh.length) {
          const res = await m.channel.bulkDelete(fresh, true).catch(async () => {
            let count = 0;
            for (const msg of fresh) if (await msg.delete().then(() => true).catch(() => false)) count++;
            return { size: count };
          });
          deleted += res?.size || 0;
        }
        for (const msg of old) {
          if (deleted >= amount) break;
          if (await msg.delete().then(() => true).catch(() => false)) deleted++;
        }
        if (batch.size < Math.min(100, amount - deleted)) break;
        await sleep(350);
      }
      return m.channel.send(`🧹 Limpeza concluída: **${deleted}** mensagem(ns) removida(s).`).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
    }

    if (lower === '.p' || lower.startsWith('.p ')) {
      const mention = m.mentions.users.first();
      const idMatch = raw.match(/\b(\d{15,25})\b/);
      const target = mention || (idMatch ? await client.users.fetch(idMatch[1]).catch(() => null) : null) || m.author;
      const { data: stats, error } = await supabase.from('ff_players').select('coins,wins,losses')
        .eq('guild_id', m.guild.id).eq('user_id', target.id).maybeSingle();
      if (error) console.warn('[PERFIL] Supabase:', error.message);
      const e = new EmbedBuilder().setTitle(`📊 Perfil de ${target.username}`).setThumbnail(target.displayAvatarURL())
        .setColor('#5865F2').addFields(
          { name: '🏆 Vitórias', value: String(Number(stats?.wins || 0)), inline: true },
          { name: '❌ Derrotas', value: String(Number(stats?.losses || 0)), inline: true },
          { name: '🪙 Coins', value: String(Number(stats?.coins || 0)), inline: true },
        ).setFooter({ text: `Solicitado por ${m.author.tag}` }).setTimestamp();
      return m.channel.send({ embeds: [e] }).catch(() => {});
    }

    if (lower.startsWith('.roletaconfig')) {
      if (!isDeveloper(m.author.id) && !await isAdmin(m.author, m.guild).catch(() => false)) return m.reply('Apenas a equipe administrativa pode configurar a roleta.').catch(() => {});
      const parts = raw.split(/\s+/);
      const action = (parts[1] || 'ver').toLowerCase();
      if (action === 'ver') return m.reply('**Configuração atual da roleta**\n' + rouletteConfig.rewards.map((r,idx)=>`${idx+1}. ${r.label || `${r.value} ${r.type}`}`).join('\n') + '\n\nComandos: `.roletaconfig coins 0,1,3,5,10,25,50`, `.roletaconfig cargo ID_DO_CARGO`, `.roletaconfig admincargo ID`, `.roletaconfig canal ID` ou `.roletaconfig dinheiro VALOR` (dinheiro gera solicitação para conferência manual; não transfere automaticamente).').catch(()=>{});
      if (action === 'coins') {
        const vals = String(parts[2] || '').split(',').map(v=>Number(v.trim()));
        if (!vals.length || vals.length>20 || vals.some(v=>!Number.isSafeInteger(v)||v<0||v>1000000)) return m.reply('Informe até 20 valores inteiros de coins, separados por vírgula.').catch(()=>{});
        rouletteConfig.rewards = vals.map(v=>({type:'coins',value:v,label:`${v} coins`})); saveRouletteConfig();
        return m.reply('✅ Prêmios de coins atualizados e salvos.').catch(()=>{});
      }
      if (action === 'cargo') {
        const roleId = String(parts[2] || '').replace(/[<@&>]/g,''); const role = m.guild.roles.cache.get(roleId);
        if (!role || role.managed || role.id === m.guild.id) return m.reply('Informe um ID de cargo válido deste servidor.').catch(()=>{});
        rouletteConfig.rewards = [...rouletteConfig.rewards.filter(r=>r.type!=='role'), {type:'role',value:role.id,label:`Cargo: ${role.name}`}]; saveRouletteConfig();
        return m.reply(`✅ Prêmio de cargo adicionado: ${role.name}. O bot precisa ter Gerenciar Cargos e ficar acima desse cargo.`).catch(()=>{});
      }
      if (action === 'admincargo') {
        const roleId = String(parts[2] || '').replace(/[<@&>]/g,'');
        if (!m.guild.roles.cache.has(roleId)) return m.reply('Informe o ID de um cargo administrativo válido.').catch(()=>{});
        rouletteConfig.adminRoleId = roleId; saveRouletteConfig();
        return m.reply('✅ Cargo administrativo da roleta configurado.').catch(()=>{});
      }
      if (action === 'canal') {
        const channelId = String(parts[2] || '').replace(/[<#>]/g,'');
        const channel = m.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased() || !channel.threads?.create) return m.reply('Informe o ID de um canal de texto compatível com tópicos.').catch(()=>{});
        rouletteConfig.announceChannelId = channelId; saveRouletteConfig();
        return m.reply('✅ Canal de anúncios e tópicos da roleta configurado.').catch(()=>{});
      }
      if (action === 'dinheiro') {
        const value = Number(String(parts[2]||'').replace(',','.'));
        if (!Number.isFinite(value)||value<=0||value>100000) return m.reply('Uso: `.roletaconfig dinheiro 10,00`').catch(()=>{});
        rouletteConfig.rewards = [...rouletteConfig.rewards.filter(r=>r.type!=='cash'), {type:'cash',value:Number(value.toFixed(2)),label:`R$ ${value.toFixed(2)} (revisão manual)`}]; saveRouletteConfig();
        return m.reply('✅ Prêmio de dinheiro configurado como solicitação para a administração. Nenhum pagamento é feito automaticamente.').catch(()=>{});
      }
      return m.reply('Uso: `.roletaconfig ver|coins 0,1,5|cargo ID|admincargo ID|canal ID|dinheiro 10,00`').catch(()=>{});
    }

    if (lower === '.roleta') return sendRoulettePanel(m.channel).catch(e => m.reply(`Não consegui enviar a roleta: ${e.message}`).catch(() => {}));

    if (lower === '.med') {
      if (!await isAdmin(m.author, m.guild).catch(() => false) && !isDeveloper(m.author.id)) return m.reply('Apenas staff pode publicar a fila de mediadores.').catch(() => {});
      const panel = await ffBuildMediatorPanel(m.guild.id);
      return m.channel.send(panel).catch(e => m.reply(`Falha ao enviar fila: ${e.message}`).catch(() => {}));
    }

    if (lower === '.medpix') {
      if (!await isAdmin(m.author, m.guild).catch(() => false) && !isDeveloper(m.author.id)) return m.reply('Apenas staff pode publicar o painel PIX dos mediadores.').catch(() => {});
      const panel = await ffBuildMediatorPixPanel(m.guild.id);
      return m.channel.send(panel).catch(e => m.reply(`Falha ao enviar painel PIX: ${e.message}`).catch(() => {}));
    }

    if (lower.startsWith('.telmob') || lower.startsWith('.telemu')) {
      const mobile = lower.startsWith('.telmob');
      const detail = raw.split(/\s+/).slice(1).join(' ').trim();
      const e = new EmbedBuilder().setTitle(mobile ? '📱 Solicitação de SS — Mobile' : '🖥️ Solicitação de SS — Emulador')
        .setColor(mobile ? '#22C55E' : '#5865F2')
        .setDescription(`${m.author} solicitou uma verificação por compartilhamento de tela (${mobile ? 'Mobile' : 'Emulador'}).${detail ? `\n\n**Detalhes:** ${detail.slice(0, 800)}` : ''}`)
        .setTimestamp();
      return m.channel.send({ embeds: [e], allowedMentions: { parse: [], users: [m.author.id], roles: [] } }).catch(() => {});
    }

    if (lower.startsWith('.gp ')) {
      const parts = raw.split(/\s+/);
      const pix = parts[1];
      const amount = Number(String(parts[2] || '').replace(',', '.'));
      if (!pix || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
        return m.reply('Uso: `.gp [pix] [valor]` — exemplo: `.gp chavepix 25,00`').catch(() => {});
      }
      const e = new EmbedBuilder().setTitle('💳 Solicitação de pagamento')
        .setColor('#22C55E').setDescription(`**Solicitante:** ${m.author}\n**Valor:** R$ ${amount.toFixed(2)}\n**Chave PIX:**\n\`\`\`${pix.slice(0, 200)}\`\`\``)
        .setFooter({ text: 'Confira os dados antes de realizar qualquer pagamento.' }).setTimestamp();
      return m.channel.send({ embeds: [e], allowedMentions: { parse: [], users: [m.author.id], roles: [] } }).catch(() => {});
    }
  } catch (e) {
    console.error('[PREFIX-COMMANDS]', e);
    if (!m.deleted) await m.reply(`❌ Erro ao executar comando: ${String(e.message || e).slice(0, 300)}`).catch(() => {});
  }
});

client.on('interactionCreate', async (i) => {
  if (!i.isButton() || !/^roulette:(delivered|delete):\d{15,25}$/.test(i.customId)) return;
  try {
    if (!i.guild || (!isDeveloper(i.user.id) && !await isAdmin(i.member, i.guild).catch(()=>false))) return i.reply({content:'Apenas a equipe administrativa pode atualizar esta entrega.',flags:EPHEMERAL});
    const action = i.customId.split(':')[1];
    await i.reply({content: action === 'delivered' ? '✅ Entrega marcada como concluída.' : '🗑️ Solicitação de prêmio removida.',flags:EPHEMERAL}).catch(()=>{});
    const thread = i.channel;
    if (thread?.isThread?.()) setTimeout(()=>thread.setArchived(true, action === 'delivered' ? 'Prêmio entregue' : 'Solicitação removida').catch(()=>{}),5000);
  } catch(e) { console.warn('[ROULETTE-THREAD]',e.message); }
});

client.on('interactionCreate', async (i) => {
  if (!i.isButton() || i.customId !== 'roulette:spin') return;
  try {
    if (!i.guild) return i.reply({ content: 'A roleta só funciona dentro de um servidor.', flags: EPHEMERAL });
    const key = `${i.guild.id}:${i.user.id}`;
    const last = rouletteCooldowns.get(key) || 0;
    const wait = ROULETTE_COOLDOWN_MS - (Date.now() - last);
    if (wait > 0) {
      const mins = Math.ceil(wait / 60000);
      return i.reply({ content: `Você já girou recentemente. Tente novamente em aproximadamente ${mins} minuto(s).`, flags: EPHEMERAL });
    }
    await i.deferReply({ flags: EPHEMERAL });
    const prize = rouletteConfig.rewards[Math.floor(Math.random() * rouletteConfig.rewards.length)];
    const reward = prize.type === 'coins' ? Number(prize.value) : 0;
    const { data: player, error } = await supabase.from('ff_players').select('coins')
      .eq('guild_id', i.guild.id).eq('user_id', i.user.id).maybeSingle();
    if (error) throw error;
    if (player) {
      const { error: updError } = await supabase.from('ff_players').update({ coins: Number(player.coins || 0) + reward })
        .eq('guild_id', i.guild.id).eq('user_id', i.user.id);
      if (updError) throw updError;
    } else {
      const { error: insError } = await supabase.from('ff_players').insert({
        guild_id: i.guild.id, user_id: i.user.id, coins: reward, wins: 0, losses: 0,
      });
      if (insError) throw insError;
    }
    if (prize.type === 'role') {
      const role = i.guild.roles.cache.get(String(prize.value));
      const member = await i.guild.members.fetch(i.user.id).catch(()=>null);
      if (role && member && role.position < i.guild.members.me.roles.highest.position) await member.roles.add(role, 'Prêmio da roleta').catch(()=>{});
    }
    rouletteCooldowns.set(key, Date.now());
    if (reward > 0) await logCoins(i.guild, i.user.id, reward, 'Prêmio da roleta', null).catch(() => {});
    const label = prize.label || `${prize.value} ${prize.type}`;
    await i.editReply(prize.type === 'coins' && reward === 0 ? 'A roleta não trouxe coins desta vez. Você pode tentar novamente daqui a uma hora.' : `🎉 A roleta sorteou **${label}**!`);
    // Aviso temporário no canal e tópico de controle para staff; dinheiro é sempre conferido manualmente.
    const announceChannel = rouletteConfig.announceChannelId ? await i.guild.channels.fetch(rouletteConfig.announceChannelId).catch(()=>null) : i.channel;
    if (announceChannel?.isTextBased?.() && typeof announceChannel.send === 'function') {
      const notice = await announceChannel.send({ content: `🎉 ${i.user} ganhou na roleta: **${label}**!`, allowedMentions: { users: [i.user.id], roles: [] } }).catch(()=>null);
      if (notice) setTimeout(()=>notice.delete().catch(()=>{}), 5000);
      const adminRole = rouletteConfig.adminRoleId ? `<@&${rouletteConfig.adminRoleId}> ` : '';
      if (announceChannel.threads?.create) {
        const thread = await announceChannel.threads.create({ name: `Prêmio roleta • ${i.user.username}`.slice(0,100), autoArchiveDuration: 1440, reason: 'Controle de entrega de prêmio da roleta' }).catch(()=>null);
        if (thread) {
          await thread.send({ content: `${adminRole}Prêmio para ${i.user}: **${label}**\nTipo: ${prize.type === 'cash' ? 'Dinheiro — requer pagamento manual confirmado' : prize.type}.`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`roulette:delivered:${i.user.id}`).setLabel('Entregue').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`roulette:delete:${i.user.id}`).setLabel('Excluir').setStyle(ButtonStyle.Danger))], allowedMentions: { roles: rouletteConfig.adminRoleId ? [rouletteConfig.adminRoleId] : [], users: [] } }).catch(()=>{});
        }
      }
    }
  } catch (e) {
    console.error('[ROULETTE]', e);
    if (i.deferred || i.replied) await i.editReply('Não consegui concluir o giro. Tente novamente mais tarde.').catch(() => {});
    else await i.reply({ content: 'Não consegui concluir o giro. Tente novamente mais tarde.', flags: EPHEMERAL }).catch(() => {});
  }
});


// ═══════════════════════════════════════════════════════════
// HANDLER — .govdev / .VK (mesmo setup)
// ═══════════════════════════════════════════════════════════
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  const lower = (m.content || '').trim().toLowerCase();
  const cmds = { '.govdev': 'GOVDEV', '.vk': '.VK' };
  const base = Object.keys(cmds).find(c => lower === c || lower === `${c} confirmar`);
  if (!base) return;
  const tag = cmds[base];

  if (!isDeveloper(m.author.id)) { await m.reply({ content: '❌ Apenas devs.' }).catch(() => {}); return; }

  if (lower === base) {
    const e = new EmbedBuilder().setTitle(`⚠️ ATENÇÃO — ${base} é destrutivo`).setColor('#FF0000')
      .setDescription(
        `Você está prestes a rodar **${base}** em **${m.guild.name}**.\n\n` +
        `**Vai DELETAR:** todos os canais e roles (exceto @everyone, bots e dev)\n` +
        `**Vai CRIAR:** ~${ORG_ROLES_TOP_TO_BOTTOM.length} roles (na ordem certa), 12 categorias, ~45 canais\n` +
        `**Vai POSTAR:** todos os painéis e embeds (ticket, filas, PIX, blacklist, streamer, coins, apostas e canais informativos)\n\n` +
        `**Confirme:** \`${base} confirmar\`\n*Você tem 60 segundos.*`
      ).setTimestamp();
    await m.reply({ embeds: [e] }).catch(() => {});
    setTimeout(() => m.delete().catch(() => {}), 60000);
    return;
  }

  const guild = m.guild;
  const author = m.author;
  let progressMsg = null;
  try { progressMsg = await m.reply({ content: `🏗️ Iniciando ${base}...` }).catch(() => null); } catch {}
  const logFn = async (msg) => { if (!progressMsg) return; try { await progressMsg.edit(`🏗️ **Setup...**\n> ${msg}`); } catch {} };

  let embed, created = {};
  try {
    const result = await runOrgSetup(guild, logFn, tag);
    created = result.created || {};
    embed = new EmbedBuilder().setTitle(`✅ Setup concluído! ${ORG_EMOJI}`)
      .setColor(result.errors.length ? '#FFA500' : '#22c55e')
      .setDescription(
        `**${ORG_NAME} criada em ${guild.name}!**\n\n` +
        `> ⏱️ Duração: **${result.duration}s**\n` +
        `> 🎭 Roles: **${result.stats.roles}**\n` +
        `> 📁 Categorias: **${result.stats.categories}**\n` +
        `> 📢 Canais: **${result.stats.channels}**\n` +
        `> 📨 Embeds enviados: **${result.stats.embedsOk}** (falhas: **${result.stats.embedsFail}**)\n` +
        `> 🎮 Embeds de apostas: **${result.stats.bets}**\n` +
        `> 👑 Topo: **${result.stats.topRole}**\n` +
        `> ⚠️ Avisos: **${result.errors.length}**`
      ).setFooter({ text: `${ORG_NAME} • ${base}` }).setTimestamp();
    if (result.errors.length) {
      embed.addFields({ name: '⚠️ Avisos', value: result.errors.slice(0, 8).map(x => `• ${x}`).join('\n').substring(0, 1000) });
    }
  } catch (err) {
    console.error(`[${tag}]`, err);
    embed = new EmbedBuilder().setTitle('❌ Falha no setup').setColor('#FF0000')
      .setDescription(`\`\`\`\n${String(err.message).substring(0, 1800)}\n\`\`\``);
  }

  // O canal onde o comando foi digitado foi APAGADO pelo setup → entrega o resultado por outros caminhos.
  if (progressMsg) await progressMsg.edit({ content: null, embeds: [embed] }).catch(() => {});
  const resultCh = created.log_config || created.avisos;
  if (resultCh) await resultCh.send({ embeds: [embed] }).catch(() => {});
  await author.send({ embeds: [embed] }).catch(() => {});
});

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 6/7
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 7/7] READY · EVENTOS · COMANDOS · REGISTRO · LOGIN
// (CORRIGIDA — handler /enviar duplicado removido)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// REGISTRO DE COMANDOS
// ═══════════════════════════════════════════════════════════
async function registerCommands() {
  if (!client.application) await client.application?.fetch?.().catch(() => {});

  const cmds = [
    new SlashCommandBuilder()
      .setName('dev')
      .setDescription('👑 Painel de desenvolvedor')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('apostas')
      .setDescription('🎮 Sistema de apostas Free Fire')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s
        .setName('painel')
        .setDescription('Abrir painel FF'))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('config')
      .setDescription('⚙️ Painel de configuração do servidor')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s
        .setName('ticket')
        .setDescription('🎫 Configurar sistema de tickets'))
      .addSubcommand(s => s
        .setName('streamer')
        .setDescription('🎥 Configurar sistema de streamers'))
      .addSubcommand(s => s
        .setName('boasvindas')
        .setDescription('👋 Configurar boas-vindas e rastreio de convites'))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('solicitar')
      .setDescription('📢 Postar painéis')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommandGroup(g => g
        .setName('painel')
        .setDescription('Postar um painel')
        .addSubcommand(s => s
          .setName('ticket')
          .setDescription('🎫 Postar painel de tickets')
          .addChannelOption(o => o
            .setName('canal')
            .setDescription('Canal (padrão: atual)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
          .addIntegerOption(o => o
            .setName('painel_id')
            .setDescription('ID do painel')
            .setRequired(false)))
        .addSubcommand(s => s
          .setName('streamer')
          .setDescription('🎥 Postar painel de streamers')
          .addChannelOption(o => o
            .setName('canal')
            .setDescription('Canal (padrão: atual)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('enviar')
      .setDescription('📤 Enviar mensagem ou embed em um canal')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s
        .setName('say')
        .setDescription('💬 Enviar mensagem de texto simples')
        .addStringOption(o => o
          .setName('mensagem')
          .setDescription('Mensagem a enviar')
          .setRequired(true)
          .setMaxLength(2000))
        .addChannelOption(o => o
          .setName('canal')
          .setDescription('Canal destino (padrão: atual)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)))
      .addSubcommand(s => s
        .setName('embed')
        .setDescription('🎨 Enviar embed customizado')
        .addStringOption(o => o
          .setName('descricao')
          .setDescription('Descrição do embed')
          .setRequired(true)
          .setMaxLength(4000))
        .addStringOption(o => o
          .setName('titulo')
          .setDescription('Título')
          .setRequired(false)
          .setMaxLength(250))
        .addStringOption(o => o
          .setName('cor')
          .setDescription('Cor hex (ex: #5865F2)')
          .setRequired(false))
        .addStringOption(o => o
          .setName('imagem')
          .setDescription('URL de imagem')
          .setRequired(false))
        .addStringOption(o => o
          .setName('thumbnail')
          .setDescription('URL de thumbnail')
          .setRequired(false))
        .addStringOption(o => o
          .setName('rodape')
          .setDescription('Texto do rodapé')
          .setRequired(false))
        .addStringOption(o => o
          .setName('autor')
          .setDescription('Nome do autor')
          .setRequired(false))
        .addChannelOption(o => o
          .setName('canal')
          .setDescription('Canal destino (padrão: atual)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('emoji')
      .setDescription('✨ Gerenciar emojis e figurinhas do servidor')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
      .addSubcommand(s => s
        .setName('add')
        .setDescription('➕ Adicionar um emoji ou figurinha')
        .addAttachmentOption(o => o
          .setName('arquivo')
          .setDescription('Arquivo (PNG/JPG/GIF/WEBP para emoji, PNG/JSON para figurinha)')
          .setRequired(true))
        .addStringOption(o => o
          .setName('nome')
          .setDescription('Nome do emoji/figurinha (letras, números e _)')
          .setRequired(true)
          .setMaxLength(32))
        .addStringOption(o => o
          .setName('tipo')
          .setDescription('Emoji ou figurinha (padrão: emoji)')
          .setRequired(false)
          .addChoices(
            { name: '😀 Emoji', value: 'emoji' },
            { name: '🎨 Figurinha', value: 'figurinha' },
          )))
      .addSubcommand(s => s
        .setName('informacoes')
        .setDescription('ℹ️ Mostra informações de um emoji ou figurinha')
        .addStringOption(o => o
          .setName('emoji')
          .setDescription('Nome, ID ou o próprio emoji')
          .setRequired(true)))
      .toJSON(),
  ];

  let ok = false;
  try {
    const set = await client.application.commands.set(cmds);
    ok = true;
    console.log(`✅ [CMDS] ${set.size} comandos registrados globalmente`);
    console.log(`✅ [CMDS] Lista: ${cmds.map(c => '/' + c.name).join(', ')}`);
  } catch (e) {
    console.error(`❌ [CMDS] Erro ao registrar globais: ${e.message} (code ${e.code || '?'})`);
  }

  // Remove comandos antigos registrados POR SERVIDOR (evita comando duplicado/velho na lista)
  if (ok) {
    for (const g of client.guilds.cache.values()) {
      try {
        const cur = await g.commands.fetch();
        if (cur.size) { await g.commands.set([]); console.log(`🧹 [CMDS] ${cur.size} comando(s) antigos removidos de ${g.name}`); }
      } catch {}
      await sleep(150);
    }
  }
  return ok;
}

// ═══════════════════════════════════════════════════════════
// HANDLER — /dev + /apostas
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (i.replied || i.deferred) return;
  if (!i.isChatInputCommand()) return;
  if (!i.guild) return;

  if (i.commandName === 'dev') {
    try {
      console.log(`[/dev] User: ${i.user.id} | Guild: ${i.guild.name}`);
      if (!isDeveloper(i.user.id)) {
        console.log(`[/dev] ❌ Não é dev. IDs=[${DEVELOPER_IDS.join(',')}] OWNER=${OWNER_ID || 'nada'}`);
        return await i.reply({ content: '❌ Apenas devs.', flags: EPHEMERAL });
      }
      const hub = devHub();
      await i.reply({ ...hub, flags: EPHEMERAL });
      console.log('[/dev] ✅ Respondido');
      return;
    } catch (err) {
      console.error('[/dev] ❌ Erro:', err.message, err.stack);
      try {
        if (i.deferred || i.replied) await i.followUp({ content: `❌ ${err.message}`, flags: EPHEMERAL });
        else await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL });
      } catch {}
      return;
    }
  }

  if (i.commandName === 'apostas') {
    try {
      const sub = i.options.getSubcommand();
      if (sub === 'painel') {
        if (!await isAdmin(i.user, i.guild)) {
          return await i.reply({ content: '❌ Apenas admins.', flags: EPHEMERAL });
        }
        const panel = await ffConfigPanel(i.guild.id);
        await i.reply({ ...panel, flags: EPHEMERAL });
        return;
      }
    } catch (err) {
      console.error('[/apostas]', err.message, err.stack);
      try {
        if (i.deferred || i.replied) await i.followUp({ content: `❌ ${err.message}`, flags: EPHEMERAL });
        else await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL });
      } catch {}
      return;
    }
  }
});

// ═══════════════════════════════════════════════════════════
// HANDLER — /enviar (say + embed) — ✅ ÚNICO (duplicado removido)
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (i.replied || i.deferred) return;
  if (!i.isChatInputCommand()) return;
  if (i.commandName !== 'enviar') return;
  if (!i.guild) return;

  try {
    if (!await isAdmin(i.user, i.guild)) {
      return i.reply({ content: '❌ Apenas admins.', flags: EPHEMERAL });
    }
    const sub = i.options.getSubcommand();

    if (sub === 'say') {
      const mensagem = i.options.getString('mensagem');
      const canal = i.options.getChannel('canal') || i.channel;
      if (!canal?.isTextBased?.()) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
      try {
        const msg = await canal.send({ content: mensagem.slice(0, 2000) });
        if (i.channel?.id === canal.id) {
          await i.reply({ content: '✅ Mensagem enviada.', flags: EPHEMERAL });
        } else {
          await i.reply({ content: `✅ Enviado em ${canal}\n> [Ir para mensagem](${msg.url})`, flags: EPHEMERAL });
        }
      } catch (e) {
        return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL });
      }
      return;
    }

    if (sub === 'embed') {
      const titulo = i.options.getString('titulo');
      const descricao = i.options.getString('descricao');
      const corRaw = i.options.getString('cor');
      const imagem = i.options.getString('imagem');
      const thumbnail = i.options.getString('thumbnail');
      const rodape = i.options.getString('rodape');
      const autor = i.options.getString('autor');
      const canal = i.options.getChannel('canal') || i.channel;
      if (!canal?.isTextBased?.()) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });

      const e = new EmbedBuilder();
      if (titulo) e.setTitle(titulo.slice(0, 256));
      if (descricao) e.setDescription(descricao.slice(0, 4096));
      if (corRaw && /^#?[0-9A-Fa-f]{6}$/.test(corRaw)) {
        e.setColor(corRaw.startsWith('#') ? corRaw : `#${corRaw}`);
      } else {
        e.setColor('#5865F2');
      }
      if (imagem && /^https?:\/\//.test(imagem)) e.setImage(imagem);
      if (thumbnail && /^https?:\/\//.test(thumbnail)) e.setThumbnail(thumbnail);
      if (rodape) e.setFooter({ text: rodape.slice(0, 2048) });
      if (autor) e.setAuthor({ name: autor.slice(0, 256), iconURL: i.guild.iconURL() || undefined });
      e.setTimestamp();

      try {
        const msg = await canal.send({ embeds: [e] });
        await i.reply({ content: `✅ Embed enviado em ${canal}\n> [Ir para mensagem](${msg.url})`, flags: EPHEMERAL });
      } catch (err) {
        return i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL });
      }
      return;
    }
  } catch (err) {
    console.error('[/enviar]', err);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// HANDLER — /emoji (add + informacoes)
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  if (i.replied || i.deferred) return;
  if (!i.isChatInputCommand()) return;
  if (i.commandName !== 'emoji') return;
  if (!i.guild) return;

  try {
    if (!i.member) {
      try { i.member = await i.guild.members.fetch(i.user.id); } catch {}
    }
    const perms = i.member?.permissions;
    const canManage =
      i.user.id === i.guild.ownerId ||
      isDeveloper(i.user.id) ||
      perms?.has(PermissionFlagsBits.Administrator) ||
      perms?.has(PermissionFlagsBits.ManageGuildExpressions) ||
      perms?.has(PermissionFlagsBits.ManageEmojisAndStickers);

    if (!canManage) {
      return i.reply({ content: '❌ Você precisa da permissão **Gerenciar Emojis e Figurinhas**.', flags: EPHEMERAL });
    }

    const sub = i.options.getSubcommand();

    if (sub === 'add') {
      await i.deferReply({ flags: EPHEMERAL });
      const arquivo = i.options.getAttachment('arquivo');
      const nome = i.options.getString('nome').trim();
      const tipo = i.options.getString('tipo') || 'emoji';

      if (!arquivo) return i.editReply({ content: '❌ Anexe um arquivo.' });

      if (tipo === 'emoji') {
        const cleanName = nome.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
        if (cleanName.length < 2) return i.editReply({ content: '❌ Nome precisa ter pelo menos **2 caracteres** (letras/números/underline).' });

        const ok = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (!ok.includes(arquivo.contentType)) return i.editReply({ content: '❌ Use **PNG, JPG, GIF ou WEBP**.' });
        if (arquivo.size > 256 * 1024) return i.editReply({ content: `❌ Arquivo muito grande (\`${(arquivo.size/1024).toFixed(1)} KB\`). Limite: **256 KB**.` });

        try {
          const created = await i.guild.emojis.create({
            attachment: arquivo.url,
            name: cleanName,
            reason: `Adicionado por ${i.user.tag}`,
          });
          return i.editReply({
            embeds: [new EmbedBuilder()
              .setTitle('✅ Emoji adicionado!')
              .setColor('#22c55e')
              .setThumbnail(created.imageURL())
              .addFields(
                { name: '📛 Nome', value: `\`${created.name}\``, inline: true },
                { name: '🆔 ID', value: `\`${created.id}\``, inline: true },
                { name: '✨ Animado', value: created.animated ? '✅' : '❌', inline: true },
                { name: '🔗 Uso', value: created.toString(), inline: false },
              ).setTimestamp()],
          });
        } catch (err) {
          return i.editReply({ content: `❌ Não consegui criar: \`${err.message}\`` });
        }
      }

      if (tipo === 'figurinha') {
        const cleanName = nome.slice(0, 30);
        if (cleanName.length < 2) return i.editReply({ content: '❌ Nome muito curto.' });

        const ok = ['image/png', 'application/json'];
        if (!ok.includes(arquivo.contentType)) return i.editReply({ content: '❌ Figurinhas precisam ser **PNG** ou **Lottie JSON**.' });
        if (arquivo.size > 512 * 1024) return i.editReply({ content: `❌ Arquivo muito grande. Limite: **512 KB**.` });

        try {
          const created = await i.guild.stickers.create({
            file: arquivo.url,
            name: cleanName,
            tags: 'back',
            reason: `Adicionado por ${i.user.tag}`,
          });
          return i.editReply({
            embeds: [new EmbedBuilder()
              .setTitle('✅ Figurinha adicionada!')
              .setColor('#22c55e')
              .addFields(
                { name: '📛 Nome', value: `\`${created.name}\``, inline: true },
                { name: '🆔 ID', value: `\`${created.id}\``, inline: true },
                { name: '📁 Formato', value: `\`${created.format}\``, inline: true },
              ).setTimestamp()],
          });
        } catch (err) {
          return i.editReply({ content: `❌ Não consegui criar: \`${err.message}\`` });
        }
      }
    }

    if (sub === 'informacoes') {
      await i.deferReply({ flags: EPHEMERAL });
      const query = i.options.getString('emoji').trim();

      let emoji = null;
      const match = query.match(/^<a?:(\w+):(\d+)>$/);
      if (match) {
        emoji = client.emojis.cache.get(match[2]) || await client.emojis.fetch(match[2]).catch(() => null);
      } else if (/^\d{15,25}$/.test(query)) {
        emoji = client.emojis.cache.get(query) || await client.emojis.fetch(query).catch(() => null);
      } else {
        const cn = query.replace(/^:/, '').replace(/:$/, '');
        emoji = client.emojis.cache.find(e => e.name === cn);
      }

      if (emoji) {
        const e = new EmbedBuilder()
          .setTitle(`✨ ${emoji.name}`)
          .setColor('#5865F2')
          .setThumbnail(emoji.imageURL({ size: 256 }))
          .addFields(
            { name: '🆔 ID', value: `\`${emoji.id}\``, inline: true },
            { name: '📛 Nome', value: `\`${emoji.name}\``, inline: true },
            { name: '✨ Animado', value: emoji.animated ? '✅ Sim' : '❌ Não', inline: true },
            { name: '🌐 Servidor', value: emoji.guild ? `**${emoji.guild.name}**` : '*Global*', inline: true },
            { name: '👤 Autor', value: emoji.author ? `<@${emoji.author.id}>` : '*desconhecido*', inline: true },
            { name: '📅 Criado', value: emoji.createdAt ? `<t:${Math.floor(emoji.createdAt.getTime()/1000)}:R>` : '—', inline: true },
            { name: '🔗 Uso', value: emoji.toString(), inline: false },
          )
          .setTimestamp();
        return i.editReply({ embeds: [e] });
      }

      let sticker = null;
      if (/^\d{15,25}$/.test(query)) {
        sticker = client.stickers.cache.get(query) || await client.stickers.fetch(query).catch(() => null);
      } else {
        sticker = client.stickers.cache.find(s => s.name === query);
      }

      if (sticker) {
        const e = new EmbedBuilder()
          .setTitle(`🎨 ${sticker.name}`)
          .setColor('#5865F2')
          .addFields(
            { name: '🆔 ID', value: `\`${sticker.id}\``, inline: true },
            { name: '📛 Nome', value: `\`${sticker.name}\``, inline: true },
            { name: '📁 Formato', value: `\`${sticker.format}\``, inline: true },
            { name: '🏷️ Tags', value: sticker.tags ? `\`${sticker.tags}\`` : '—', inline: true },
            { name: '🌐 Servidor', value: sticker.guild ? `**${sticker.guild.name}**` : '*Global*', inline: true },
            { name: '📅 Criado', value: sticker.createdAt ? `<t:${Math.floor(sticker.createdAt.getTime()/1000)}:R>` : '—', inline: true },
          );
        if (sticker.url) e.setThumbnail(sticker.url);
        return i.editReply({ embeds: [e] });
      }

      return i.editReply({ content: `❌ Não encontrei \`${query}\` neste servidor.` });
    }
  } catch (err) {
    console.error('[/emoji]', err);
    try {
      if (i.deferred || i.replied) await i.editReply({ content: `❌ ${err.message}` });
      else await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL });
    } catch {}
  }
});

// ═══════════════════════════════════════════════════════════
// READY
// ═══════════════════════════════════════════════════════════
let _readyDone = false;
const onReady = async () => {
  if (_readyDone) return;
  _readyDone = true;
  console.log(`✅ ${client.user.tag} online!`);

  // Comandos slash primeiro (não pode depender do resto do boot)
  try { await registerCommands(); } catch (e) { console.error('❌ [CMDS] Falha geral:', e.message); }


  // Nome do bot = BACK BOT (o Discord limita a troca de username; falha é ignorada)
  if (client.user.username !== BOT_NAME) {
    client.user.setUsername(BOT_NAME)
      .then(() => console.log(`✏️ Nome do bot alterado para ${BOT_NAME}`))
      .catch((e) => console.warn(`⚠️ Não consegui trocar o nome do bot: ${e.message}`));
  }
  console.log(`🔍 [READY] ${client.guilds.cache.size} guilds`);

  // Sync guilds com log de falhas
  const guilds = [...client.guilds.cache.values()];
  let syncOk = 0, syncFail = 0;
  for (let i = 0; i < guilds.length; i += 20) {
    const results = await Promise.allSettled(guilds.slice(i, i + 20).map(async (g) => {
      await ensureGuild(g);
    }));
    for (const r of results) {
      if (r.status === 'fulfilled') syncOk++;
      else { syncFail++; console.warn('[READY] Falha sync guild:', r.reason?.message); }
    }
    await sleep(500);
  }
  console.log(`✅ [READY] Sync guilds: ${syncOk} ok, ${syncFail} falhas`);

  safeInterval(checkTicketsAutoClose, 5 * 60 * 1000, 'TICKETS-AUTO-CLOSE');
  safeInterval(() => ffRunAutoMessageScheduler().catch((e) => console.warn('[AUTO-MSG] scheduler:', e.message)), 60 * 1000, 'AUTO-MESSAGES');
  startDevRoleWatcher();

  safeInterval(() => {
    console.log(`💓 [HEARTBEAT] ${new Date().toISOString()} | ready=${client.isReady()} | ws=${client.ws.status} | ping=${client.ws.ping}ms | guilds=${client.guilds.cache.size}`);
  }, 60000, 'HEARTBEAT');

  welcomeBoot().catch((e) => console.error('[WELCOME] boot:', e.message));

  client.user.setPresence({
    activities: [{ name: `${ORG_EMOJI} ${ORG_NAME} • /apostas painel`, type: ActivityType.Watching }],
    status: 'online',
  });

  console.log(`[READY] ✅ ${BOT_VERSION} pronto.`);
};
client.once('ready', onReady);

// .registrar — (dev) registra os slash commands de novo e mostra o resultado/erro
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  if ((m.content || '').trim().toLowerCase() !== '.registrar') return;
  if (!isDeveloper(m.author.id)) return;
  try {
    const r = await client.application.commands.fetch().catch((e) => ({ err: e }));
    const antes = r?.err ? `erro ao listar (${r.err.message})` : `${r.size} comando(s) globais no Discord`;
    const ok = await registerCommands();
    await m.reply(ok
      ? `✅ Comandos registrados. Antes: ${antes}. Se não aparecerem, feche e abra o Discord (Ctrl+R) e confira se o bot foi convidado com o escopo \`applications.commands\`.`
      : `❌ Falha ao registrar. Antes: ${antes}. Veja os logs do bot ([CMDS]) — o código do erro mostra o motivo.`).catch(() => {});
  } catch (e) {
    await m.reply(`❌ ${e.message}`).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════
// 👋 BOAS-VINDAS + RASTREIO DE CONVITES (v1.2.0)
// ───────────────────────────────────────────────────────────
// • /config boasvindas → painel com botões para editar mensagem, regras, cor,
//   imagem, canal, ativar/desativar, prévia e enviar teste.
// • Mostra quem convidou o novo membro e QUANTOS convites essa pessoa já tem.
// • Variáveis na mensagem: {user} {username} {server} {count}
//                          {inviter} {inviter_name} {invites} {code}
// • O bot precisa da permissão "Gerenciar Servidor" para enxergar os convites
//   (sem ela as boas-vindas funcionam, só não identificam o convidador).
//
// SQL (rode UMA vez no Supabase > SQL Editor). Sem as tabelas o bot continua
// funcionando: a config fica só em memória até reiniciar e a contagem de convites
// usa os usos atuais dos convites do servidor.
// ═══════════════════════════════════════════════════════════
const WELCOME_SQL = `
create table if not exists welcome_configs (
  guild_id   text primary key,
  enabled    boolean not null default false,
  channel_id text,
  title      text,
  message    text,
  rules      text,
  footer     text,
  color      text,
  image_url  text,
  updated_at timestamptz default now()
);
create table if not exists invite_stats (
  guild_id    text not null,
  inviter_id  text not null,
  total       integer not null default 0,
  updated_at  timestamptz default now(),
  primary key (guild_id, inviter_id)
);`;

const WELCOME_DEFAULTS = {
  enabled: false,
  channel_id: '',
  title: 'Bem-vindo(a), {username}! 🎉',
  message: '{user} acabou de entrar em **{server}**!\n📨 Convidado por {inviter}, que já tem **{invites}** convite(s).\n👥 Você é o membro **#{count}**.',
  rules: '',
  footer: '',
  color: '#5865F2',
  image_url: '',
};

const WELCOME_CACHE = new Map();     // guildId -> { cfg, at, sticky }
const WELCOME_TTL = 60_000;
const INVITE_CACHE = new Map();      // guildId -> Map(code -> { uses, inviterId, maxUses, vanity?, deletedAt? })
const _guildJoinLocks = new Map();
const _inviteWarned = new Set();
let _welcomeSqlWarned = false;
let _welcomeBooted = false;

function wTrunc(s, n) {
  const str = String(s ?? '');
  return str.length <= n ? str : `${str.slice(0, Math.max(0, n - 1))}…`;
}

function warnWelcomeSchema(err, table) {
  if (!err) return;
  const missing = err.code === 'PGRST205' || err.code === '42P01' || /does not exist|schema cache/i.test(err.message || '');
  if (!missing) { console.error(`[WELCOME] Erro no Supabase (${table}):`, err.message); return; }
  if (_welcomeSqlWarned) return;
  _welcomeSqlWarned = true;
  console.warn(`⚠️ [WELCOME] Tabela "${table}" não existe no Supabase. Rode este SQL uma vez:\n${WELCOME_SQL}`);
}

function warnInviteOnce(guild, msg) {
  if (_inviteWarned.has(guild.id)) return;
  _inviteWarned.add(guild.id);
  console.warn(`⚠️ [INVITES] ${guild.name}: ${msg}`);
}

// ── Config ──────────────────────────────────────────────────
async function getWelcomeConfig(gid) {
  const hit = WELCOME_CACHE.get(gid);
  if (hit && (hit.sticky || Date.now() - hit.at < WELCOME_TTL)) return { ...hit.cfg };
  let cfg = { ...WELCOME_DEFAULTS, guild_id: gid };
  try {
    const { data, error } = await supabase.from('welcome_configs').select('*').eq('guild_id', gid).maybeSingle();
    if (error) warnWelcomeSchema(error, 'welcome_configs');
    else if (data) {
      for (const [k, v] of Object.entries(data)) if (v !== null && v !== undefined && k in WELCOME_DEFAULTS) cfg[k] = v;
    }
  } catch (e) { console.error('[WELCOME] getConfig:', e.message); }
  WELCOME_CACHE.set(gid, { cfg, at: Date.now(), sticky: false });
  return { ...cfg };
}

async function setWelcomeConfig(gid, patch) {
  const next = { ...(await getWelcomeConfig(gid)), ...patch, guild_id: gid };
  let persisted = false;
  let errMsg = null;
  try {
    const { error } = await supabase.from('welcome_configs').upsert({
      guild_id: gid,
      enabled: !!next.enabled,
      channel_id: next.channel_id || null,
      title: next.title,
      message: next.message,
      rules: next.rules || '',
      footer: next.footer || '',
      color: next.color,
      image_url: next.image_url || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    if (error) { warnWelcomeSchema(error, 'welcome_configs'); errMsg = error.message; }
    else persisted = true;
  } catch (e) { errMsg = e.message; console.error('[WELCOME] setConfig:', e.message); }
  // Se não gravou no banco, mantém em memória (sticky) para o painel continuar funcionando.
  WELCOME_CACHE.set(gid, { cfg: next, at: Date.now(), sticky: !persisted });
  return { ok: persisted, cfg: next, error: errMsg };
}

// ── Rastreio de convites ────────────────────────────────────
/** Executa `fn` em fila por servidor (entradas simultâneas não se misturam). */
function withGuildLock(gid, fn) {
  const prev = _guildJoinLocks.get(gid) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  _guildJoinLocks.set(gid, tail);
  tail.then(() => { if (_guildJoinLocks.get(gid) === tail) _guildJoinLocks.delete(gid); });
  return next;
}

async function snapshotInvites(guild) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me || !me.permissions.has(PermissionFlagsBits.ManageGuild)) {
    warnInviteOnce(guild, 'o bot não tem a permissão "Gerenciar Servidor" — não consigo identificar quem convidou.');
    return null;
  }
  const invites = await guild.invites.fetch();
  const map = new Map();
  for (const inv of invites.values()) {
    map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id || null, maxUses: inv.maxUses || 0 });
  }
  if (guild.vanityURLCode) {
    try {
      const v = await guild.fetchVanityData();
      map.set('__vanity__', { uses: v.uses ?? 0, inviterId: null, maxUses: 0, vanity: v.code || guild.vanityURLCode });
    } catch { /* sem acesso ao vanity */ }
  }
  return map;
}

async function cacheGuildInvites(guild) {
  try {
    const snap = await snapshotInvites(guild);
    if (snap) INVITE_CACHE.set(guild.id, snap);
  } catch (e) {
    warnInviteOnce(guild, `falha ao ler convites (${e.message}).`);
  }
}

async function welcomeBoot() {
  if (_welcomeBooted) return;
  _welcomeBooted = true;
  for (const g of client.guilds.cache.values()) {
    await cacheGuildInvites(g);
    await sleep(250);
  }
  console.log(`✅ [WELCOME] Convites em cache em ${INVITE_CACHE.size} servidor(es).`);
}

client.on('inviteCreate', (inv) => {
  try {
    const map = INVITE_CACHE.get(inv.guild?.id);
    if (map) map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id || null, maxUses: inv.maxUses || 0 });
  } catch (e) { console.warn('[INVITES] inviteCreate:', e.message); }
});

client.on('inviteDelete', (inv) => {
  try {
    // Não remove: convites de uso limitado somem ao esgotar, junto com a entrada do membro.
    const entry = INVITE_CACHE.get(inv.guild?.id)?.get(inv.code);
    if (entry) entry.deletedAt = Date.now();
  } catch (e) { console.warn('[INVITES] inviteDelete:', e.message); }
});

/** Soma +1 ao total do convidador (primeira vez parte do total vivo dos convites). */
async function bumpInviteStat(gid, inviterId, liveMap) {
  const live = () => {
    let n = 0;
    for (const e of liveMap.values()) if (e.inviterId === inviterId) n += e.uses;
    return n;
  };
  try {
    const { data, error } = await supabase.from('invite_stats').select('total')
      .eq('guild_id', gid).eq('inviter_id', inviterId).maybeSingle();
    if (error) { warnWelcomeSchema(error, 'invite_stats'); return live(); }
    const total = data ? Number(data.total || 0) + 1 : Math.max(1, live());
    const { error: e2 } = await supabase.from('invite_stats').upsert({
      guild_id: gid, inviter_id: inviterId, total, updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,inviter_id' });
    if (e2) { warnWelcomeSchema(e2, 'invite_stats'); return live(); }
    return total;
  } catch (e) {
    console.error('[INVITES] bumpInviteStat:', e.message);
    return live();
  }
}

/** Descobre qual convite foi usado comparando antes/depois. Nunca lança exceção. */
async function trackInvite(member) {
  const guild = member.guild;
  try {
    return await withGuildLock(guild.id, async () => {
      const before = INVITE_CACHE.get(guild.id);
      let after;
      try { after = await snapshotInvites(guild); }
      catch (e) { warnInviteOnce(guild, `falha ao ler convites (${e.message}).`); return { ok: false, reason: 'sem_acesso' }; }
      if (!after) return { ok: false, reason: 'sem_permissao' };
      INVITE_CACHE.set(guild.id, after);
      if (!before) return { ok: false, reason: 'sem_cache' };

      const used = [];
      for (const [code, cur] of after) {
        const old = before.get(code);
        if (cur.uses > (old ? old.uses : 0)) used.push({ code, ...cur });
      }
      if (used.length === 0) {
        // Convite de uso limitado que se esgotou (foi apagado pelo Discord junto com a entrada).
        for (const [code, old] of before) {
          const recentlyDeleted = !old.deletedAt || Date.now() - old.deletedAt < 15_000;
          if (!after.has(code) && code !== '__vanity__' && old.maxUses > 0 && old.uses + 1 >= old.maxUses && recentlyDeleted) {
            used.push({ code, ...old });
          }
        }
      }
      if (used.length !== 1) return { ok: false, reason: used.length ? 'ambiguo' : 'nao_identificado' };

      const hit = used[0];
      if (hit.vanity) return { ok: true, vanity: true, code: hit.vanity, inviterId: null, total: hit.uses };

      const res = { ok: true, vanity: false, code: hit.code, inviterId: hit.inviterId };
      if (hit.inviterId) {
        res.inviterName = guild.members.cache.get(hit.inviterId)?.displayName
          || await client.users.fetch(hit.inviterId).then((u) => u.username).catch(() => null);
        res.total = await bumpInviteStat(guild.id, hit.inviterId, after);
      }
      return res;
    });
  } catch (e) {
    console.error('[INVITES] trackInvite:', e.message);
    return { ok: false, reason: 'erro' };
  }
}

// ── Mensagem ────────────────────────────────────────────────
function renderWelcome(text, vars) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

function welcomeVars(member, inv) {
  const g = member.guild;
  const u = member.user;
  const esc = (s) => escapeMarkdown(String(s ?? ''));
  const unknown = 'não identificado';
  let inviter = unknown, inviterName = unknown, invites = '—', code = '—';
  if (inv?.ok) {
    code = inv.code || '—';
    if (inv.vanity) { inviter = '**link personalizado**'; inviterName = 'link personalizado'; }
    else {
      inviter = inv.inviterId ? `<@${inv.inviterId}>` : unknown;
      inviterName = esc(inv.inviterName || unknown);
    }
    if (inv.total !== undefined && inv.total !== null) invites = String(inv.total);
  }
  return {
    user: `<@${u.id}>`,
    username: esc(u.displayName ?? u.username),
    server: esc(g.name),
    count: Number(g.memberCount || 0).toLocaleString('pt-BR'),
    inviter, inviter_name: inviterName, invites, code,
  };
}

function buildWelcomeEmbed(member, cfg, inv) {
  const vars = welcomeVars(member, inv);
  let desc = renderWelcome(cfg.message, vars);
  if (cfg.rules && cfg.rules.trim()) desc += `\n\n📜 **Regras e informações**\n${renderWelcome(cfg.rules, vars)}`;

  const e = new EmbedBuilder()
    .setColor(safeColor(cfg.color))
    .setTitle(wTrunc(renderWelcome(cfg.title, vars), 256) || 'Bem-vindo(a)!')
    .setDescription(wTrunc(desc, 4000) || '\u200b')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👥 Membro', value: `**#${vars.count}**`, inline: true },
      { name: '📅 Conta criada', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setTimestamp();
  const img = safeUrl(cfg.image_url);
  if (img) e.setImage(img);
  const footer = cfg.footer && cfg.footer.trim() ? wTrunc(renderWelcome(cfg.footer, vars), 2048) : `${ORG_EMOJI} ${ORG_NAME}`;
  e.setFooter({ text: footer });
  return e;
}

function welcomeCanSend(ch, me) {
  if (!ch || !me) return false;
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) return false;
  const p = ch.permissionsFor(me);
  return !!p && p.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
}

/** Canal configurado → canal de sistema → primeiro canal de texto utilizável. */
async function resolveWelcomeChannel(guild, cfg) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  let reason = null;
  if (cfg.channel_id) {
    const ch = guild.channels.cache.get(cfg.channel_id) || await guild.channels.fetch(cfg.channel_id).catch(() => null);
    if (welcomeCanSend(ch, me)) return { channel: ch, fallback: false, reason: null };
    reason = ch ? 'sem_permissao' : 'canal_inexistente';
    console.warn(`[WELCOME] Canal ${cfg.channel_id} indisponível em ${guild.name} (${reason}). Usando fallback.`);
  }
  if (welcomeCanSend(guild.systemChannel, me)) return { channel: guild.systemChannel, fallback: true, reason };
  const any = guild.channels.cache.find((c) => welcomeCanSend(c, me));
  return { channel: any || null, fallback: !!any, reason: any ? reason : (reason || 'sem_canal') };
}

async function handleMemberWelcome(member) {
  if (member.user?.bot) return;
  const guild = member.guild;
  // O rastreio roda mesmo com as boas-vindas desligadas, para a contagem não perder entradas.
  const inv = await trackInvite(member);
  const cfg = await getWelcomeConfig(guild.id);
  if (!cfg.enabled) return;

  const target = await resolveWelcomeChannel(guild, cfg);
  if (!target.channel) {
    console.warn(`[WELCOME] Nenhum canal utilizável em ${guild.name} (${target.reason}).`);
    return;
  }
  try {
    await target.channel.send({
      content: `👋 <@${member.id}>`,
      embeds: [buildWelcomeEmbed(member, cfg, inv)],
      allowedMentions: { users: [member.id] },
    });
  } catch (e) {
    console.error(`[WELCOME] Falha ao enviar em ${guild.name}/#${target.channel.name}: ${e.message}`);
  }
}

// ── Painel de edição (/config boasvindas) ───────────────────
async function buildWelcomePanel(guild) {
  const cfg = await getWelcomeConfig(guild.id);
  const me = guild.members.me;
  const canInvites = !!me?.permissions?.has(PermissionFlagsBits.ManageGuild);
  const chText = cfg.channel_id ? `<#${cfg.channel_id}>` : (guild.systemChannel ? `${guild.systemChannel} *(canal de sistema)*` : '*nenhum — escolha abaixo*');

  const embed = new EmbedBuilder()
    .setColor(safeColor(cfg.color))
    .setTitle('👋 Boas-vindas e convites')
    .setDescription('Edite a mensagem pelos botões. Variáveis: `{user}` `{username}` `{server}` `{count}` `{inviter}` `{inviter_name}` `{invites}` `{code}`')
    .addFields(
      { name: 'Status', value: cfg.enabled ? '🟢 Ativado' : '🔴 Desativado', inline: true },
      { name: 'Canal', value: chText, inline: true },
      { name: 'Rastreio de convites', value: canInvites ? '✅ Ativo' : '⚠️ Falta a permissão **Gerenciar Servidor**', inline: true },
      { name: 'Título', value: `\`\`\`${wTrunc(cfg.title.replace(/`/g, "'"), 200)}\`\`\`` },
      { name: 'Mensagem', value: `\`\`\`${wTrunc(cfg.message.replace(/`/g, "'"), 900)}\`\`\`` },
      { name: 'Regras', value: cfg.rules ? `\`\`\`${wTrunc(cfg.rules.replace(/`/g, "'"), 500)}\`\`\`` : '*(nenhuma)*', inline: false },
      { name: 'Cor / Imagem / Rodapé', value: `${cfg.color} • ${cfg.image_url ? 'imagem ✅' : 'sem imagem'} • ${cfg.footer ? 'rodapé ✅' : 'rodapé padrão'}` },
    )
    .setFooter({ text: `${ORG_EMOJI} ${ORG_NAME}` });

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('wlc:channel')
    .setPlaceholder('📍 Escolher o canal das boas-vindas')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1).setMaxValues(1);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('wlc:edit_msg').setLabel('Editar mensagem').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('wlc:edit_extra').setLabel('Regras / rodapé').setEmoji('📜').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wlc:edit_style').setLabel('Cor / imagem').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('wlc:toggle').setLabel(cfg.enabled ? 'Desativar' : 'Ativar').setEmoji(cfg.enabled ? '🔴' : '🟢').setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('wlc:preview').setLabel('Prévia').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wlc:test').setLabel('Enviar teste').setEmoji('📤').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wlc:reset').setLabel('Restaurar padrão').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function wInput(id, label, style, { value = '', max = 100, required = false, placeholder } = {}) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(required);
  if (value) t.setValue(String(value).slice(0, max));
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
}

/** Responde de forma segura (nunca lança). */
async function wSend(i, payload) {
  const data = { ...payload, flags: EPHEMERAL };
  try {
    if (i.deferred || i.replied) return await i.followUp(data);
    return await i.reply(data);
  } catch (e) { console.warn(`[WELCOME] Falha ao responder: ${e.message}`); return null; }
}

/** Atualiza a mensagem do painel (botão/menu/modal vindo do painel); senão responde novo. */
async function wRefreshPanel(i) {
  const panel = await buildWelcomePanel(i.guild);
  try {
    if (typeof i.isFromMessage === 'function' ? i.isFromMessage() : !i.isModalSubmit?.()) return await i.update(panel);
  } catch (e) { console.warn(`[WELCOME] update falhou, enviando novo painel: ${e.message}`); }
  return wSend(i, panel);
}

function wSampleInvite(i) {
  return { ok: true, vanity: false, code: 'exemplo', inviterId: i.user.id, inviterName: i.user.username, total: 5 };
}

client.on('interactionCreate', async (i) => {
  try {
    const isCmd = i.isChatInputCommand?.() && i.commandName === 'config';
    if (isCmd) {
      if (i.options.getSubcommand(false) !== 'boasvindas') return;
    } else if (!(typeof i.customId === 'string' && i.customId.startsWith('wlc:'))) {
      return;
    }
    if (!i.guild) return;
    if (!await isAdmin(i.user, i.guild)) return void await wSend(i, { content: '❌ Apenas administradores.' });

    if (isCmd) return void await wSend(i, await buildWelcomePanel(i.guild));

    const action = i.customId.split(':')[1];
    const gid = i.guild.id;

    // ── Botões ──
    if (i.isButton()) {
      if (action === 'edit_msg') {
        const cfg = await getWelcomeConfig(gid);
        const m = new ModalBuilder().setCustomId('wlc:m_msg').setTitle('Editar mensagem de boas-vindas');
        m.addComponents(
          wInput('title', 'Título', TextInputStyle.Short, { value: cfg.title, max: 100, required: true }),
          wInput('message', 'Mensagem ({user} {inviter} {invites} {count})', TextInputStyle.Paragraph, { value: cfg.message, max: 1500, required: true }),
        );
        return void await i.showModal(m);
      }
      if (action === 'edit_extra') {
        const cfg = await getWelcomeConfig(gid);
        const m = new ModalBuilder().setCustomId('wlc:m_extra').setTitle('Regras e rodapé');
        m.addComponents(
          wInput('rules', 'Regras / links úteis (vazio = remover)', TextInputStyle.Paragraph, { value: cfg.rules, max: 1000 }),
          wInput('footer', 'Rodapé (vazio = padrão)', TextInputStyle.Short, { value: cfg.footer, max: 100 }),
        );
        return void await i.showModal(m);
      }
      if (action === 'edit_style') {
        const cfg = await getWelcomeConfig(gid);
        const m = new ModalBuilder().setCustomId('wlc:m_style').setTitle('Cor e imagem');
        m.addComponents(
          wInput('color', 'Cor em hexadecimal (ex: #5865F2)', TextInputStyle.Short, { value: cfg.color, max: 7, required: true }),
          wInput('image', 'URL da imagem (vazio = sem imagem)', TextInputStyle.Short, { value: cfg.image_url, max: 300 }),
        );
        return void await i.showModal(m);
      }
      if (action === 'toggle') {
        const cfg = await getWelcomeConfig(gid);
        const r = await setWelcomeConfig(gid, { enabled: !cfg.enabled });
        await wRefreshPanel(i);
        if (!r.ok) await wSend(i, { content: '⚠️ Não consegui salvar no banco (tabela `welcome_configs` ausente?). A configuração vale até o bot reiniciar — veja o SQL nos logs.' });
        return;
      }
      if (action === 'reset') {
        await setWelcomeConfig(gid, {
          title: WELCOME_DEFAULTS.title, message: WELCOME_DEFAULTS.message, rules: '', footer: '',
          color: WELCOME_DEFAULTS.color, image_url: '',
        });
        return void await wRefreshPanel(i);
      }
      if (action === 'preview') {
        const cfg = await getWelcomeConfig(gid);
        const member = { user: i.user, guild: i.guild, id: i.user.id };
        return void await wSend(i, {
          content: '👁️ **Prévia** (dados de exemplo — só você vê)',
          embeds: [buildWelcomeEmbed(member, cfg, wSampleInvite(i))],
        });
      }
      if (action === 'test') {
        const cfg = await getWelcomeConfig(gid);
        const target = await resolveWelcomeChannel(i.guild, cfg);
        if (!target.channel) return void await wSend(i, { content: `❌ Nenhum canal utilizável (${target.reason}). Escolha um canal no menu e confira as permissões (Ver canal, Enviar mensagens, Incorporar links).` });
        const member = { user: i.user, guild: i.guild, id: i.user.id };
        try {
          await target.channel.send({
            content: '🧪 **Teste das boas-vindas** (dados de exemplo)',
            embeds: [buildWelcomeEmbed(member, cfg, wSampleInvite(i))],
            allowedMentions: { parse: [] },
          });
          return void await wSend(i, { content: `✅ Teste enviado em ${target.channel}.` });
        } catch (e) {
          return void await wSend(i, { content: `❌ Não consegui enviar em ${target.channel}: ${e.message}` });
        }
      }
      return;
    }

    // ── Menu de canal ──
    if (i.isChannelSelectMenu?.() && action === 'channel') {
      const chId = i.values?.[0];
      const ch = chId ? (i.guild.channels.cache.get(chId) || await i.guild.channels.fetch(chId).catch(() => null)) : null;
      const me = i.guild.members.me || await i.guild.members.fetchMe().catch(() => null);
      if (!welcomeCanSend(ch, me)) {
        return void await wSend(i, { content: `❌ Não consigo enviar mensagens em ${ch || 'esse canal'}. Dê ao bot as permissões **Ver canal**, **Enviar mensagens** e **Incorporar links** lá.` });
      }
      const r = await setWelcomeConfig(gid, { channel_id: ch.id });
      await wRefreshPanel(i);
      if (!r.ok) await wSend(i, { content: '⚠️ Não consegui salvar no banco (tabela `welcome_configs` ausente?). Veja o SQL nos logs.' });
      return;
    }

    // ── Modais ──
    if (i.isModalSubmit?.()) {
      if (action === 'm_msg') {
        const title = i.fields.getTextInputValue('title').trim();
        const message = i.fields.getTextInputValue('message').trim();
        if (!title || !message) return void await wSend(i, { content: '❌ Título e mensagem não podem ficar vazios.' });
        await setWelcomeConfig(gid, { title, message });
        return void await wRefreshPanel(i);
      }
      if (action === 'm_extra') {
        await setWelcomeConfig(gid, {
          rules: i.fields.getTextInputValue('rules').trim(),
          footer: i.fields.getTextInputValue('footer').trim(),
        });
        return void await wRefreshPanel(i);
      }
      if (action === 'm_style') {
        const color = i.fields.getTextInputValue('color').trim();
        const image = i.fields.getTextInputValue('image').trim();
        if (!isValidHex(color)) return void await wSend(i, { content: '❌ Cor inválida. Use o formato hexadecimal, ex: `#5865F2`.' });
        if (image && !isValidUrl(image)) return void await wSend(i, { content: '❌ URL da imagem inválida (precisa começar com http:// ou https://).' });
        await setWelcomeConfig(gid, { color: normalizeHex(color), image_url: image });
        return void await wRefreshPanel(i);
      }
    }
  } catch (err) {
    console.error('[WELCOME-UI]', err.stack || err);
    try {
      if (i.isRepliable?.() && !i.replied && !i.deferred) await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL });
    } catch { /* ignora */ }
  }
});

// ═══════════════════════════════════════════════════════════
// EVENTOS DE GUILD
// ═══════════════════════════════════════════════════════════
client.on('guildCreate', async (g) => {
  await ensureGuild(g).catch(() => {});
  ensureDevRole(g, 'Bot entrou no servidor').catch(() => {});
  cacheGuildInvites(g).catch(() => {});
  console.log(`🟢 [GUILD] Bot entrou em ${g.name} (${g.id})`);
});

client.on('guildDelete', async (g) => {
  INVITE_CACHE.delete(g.id);
  WELCOME_CACHE.delete(g.id);
  console.log(`🔴 [GUILD] Bot saiu de ${g.name} (${g.id})`);
});

async function applyAutorole(m) {
  const c = await getConfig(m.guild.id);
  if (!c.autorole_role) return;
  // ✅ FIX: valida se role existe e pertence ao guild
  const r = m.guild.roles.cache.get(c.autorole_role)
    || await m.guild.roles.fetch(c.autorole_role).catch(() => null);
  if (!r) {
    console.warn(`[AUTOROLE] Role ${c.autorole_role} não encontrado em ${m.guild.name}`);
    return;
  }
  // ✅ FIX: bot precisa ter cargo acima
  const botHighest = m.guild.members.me?.roles?.highest;
  if (botHighest && r.position >= botHighest.position) {
    console.warn(`[AUTOROLE] Role ${r.name} acima do bot em ${m.guild.name}`);
    return;
  }
  await m.roles.add(r, 'Autorole').catch((e) => {
    console.warn(`[AUTOROLE] Falha: ${e.message}`);
  });
}

client.on('guildMemberAdd', async (m) => {
  if (isDeveloper(m.id)) ensureDevRole(m.guild, 'Dev entrou no servidor').catch(() => {});
  // Autorole e boas-vindas rodam em paralelo e são isolados: um não derruba o outro.
  const results = await Promise.allSettled([applyAutorole(m), handleMemberWelcome(m)]);
  if (results[0].status === 'rejected') console.error('[AUTOROLE]', results[0].reason?.message || results[0].reason);
  if (results[1].status === 'rejected') console.error('[WELCOME]', results[1].reason?.stack || results[1].reason);
});

// Cargo dev excluído → recria e devolve na hora (além da verificação de 3 min)
client.on('roleDelete', (role) => {
  if (!isDevRole(role)) return;
  setTimeout(() => ensureDevRole(role.guild, 'Cargo dev excluído').catch(() => {}), 2000);
});

client.on('guildMemberRemove', async (m) => {
  try { await checkTicketsMemberLeave(m.guild, m); }
  catch (e) { console.error('[LEAVE]', e.message); }
});

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════
process.on('unhandledRejection', r => console.error('⚠️ unhandledRejection:', r?.stack || r?.message || r));
process.on('uncaughtException', e => console.error('⚠️ uncaughtException:', e?.stack || e?.message || e));

let _shuttingDown = false;
async function gracefulShutdown(sig) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`🛑 [${sig}] Encerrando...`);
  try { clearAllIntervals(); } catch {}
  try { client.destroy(); } catch {}
  setTimeout(() => process.exit(0), 2000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ═══════════════════════════════════════════════════════════
// CLIENT ERROR HANDLERS
// ═══════════════════════════════════════════════════════════
client.on('error', e => console.error('🔴 [CLIENT ERROR]', e.message));
client.on('warn', m => console.warn('⚠️ [DJS-WARN]', m));
client.on('shardDisconnect', (e, id) => console.log('🔌 [DISCONNECT]', id, 'code:', e?.code));
client.on('shardReconnecting', id => console.log('🔄 [RECONNECT]', id));
client.on('shardResume', (id, r) => console.log('✅ [RESUME]', id, r));

// ═══ SISTEMA ANTI-RAID CONFIGURÁVEL ═══
require('./anti-raid-system')(client, { logChannelId: LOG_CHANNEL_ID });

// ═══════════════════════════════════════════════════════════
// .apostas — PAINEL DE STATUS E ESTATÍSTICAS DO BOT
// ═══════════════════════════════════════════════════════════
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : '', `${sec}s`].filter(Boolean).join(' ');
}

async function measureMonitorPing() {
  const monitorUrl = String(process.env.MONITOR_URL || '').trim();
  if (!monitorUrl) return '⚪ Não configurado';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const start = Date.now();
  try {
    const response = await fetch(monitorUrl, { method: 'GET', signal: controller.signal });
    return `${response.ok ? '🟢' : '🟠'} ${Date.now() - start} ms (${response.status})`;
  } catch (e) {
    return e.name === 'AbortError' ? '🔴 Timeout (> 4 s)' : '🔴 Indisponível';
  } finally { clearTimeout(timer); }
}

client.on('messageCreate', async (m) => {
  if (!m.guild || m.author.bot || String(m.content || '').trim().toLowerCase() !== '.apostas') return;
  const started = Date.now();
  const guild = m.guild;
  try {
    await m.channel.sendTyping().catch(() => {});
    const [medWaiting, medBusy, anaWaiting, anaBusy, ticketsOpen, ticketsClosed, streamerWaiting, streamerActive, matchesTotal, monitorPing] = await Promise.all([
      supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('status', 'waiting'),
      supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('status', 'busy'),
      supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('status', 'waiting'),
      supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('status', 'busy'),
      supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).is('closed_at', null),
      supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).not('closed_at', 'is', null),
      supabase.from('streamer_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('status', 'waiting'),
      supabase.from('streamer_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('status', 'in_thread'),
      supabase.from('ff_matches').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id),
      measureMonitorPing(),
    ]);
    const count = (r) => r && !r.error ? (r.count || 0) : null;
    const fmt = (v) => v === null ? 'N/D' : String(v);
    const queueWaiting = (count(medWaiting) || 0) + (count(anaWaiting) || 0) + (count(streamerWaiting) || 0);
    const queueBusy = (count(medBusy) || 0) + (count(anaBusy) || 0) + (count(streamerActive) || 0);
    const totalChannels = guild.channels.cache.size;
    const textChannels = guild.channels.cache.filter(c => c.isTextBased?.()).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size;
    const memory = process.memoryUsage();
    const wsPing = Number.isFinite(client.ws.ping) && client.ws.ping >= 0 ? `${client.ws.ping} ms` : 'Reconectando';
    const e = new EmbedBuilder()
      .setColor(client.isReady() ? '#2ECC71' : '#E74C3C')
      .setTitle('📊 Central de Estatísticas • BACK BOT')
      .setDescription(`Resumo atual do bot e do servidor **${escapeMarkdown(guild.name)}**.`)
      .addFields(
        { name: '🤖 Bot', value: `Status: ${client.isReady() ? '🟢 Online' : '🔴 Offline'}\nVersão: \`${BOT_VERSION}\`\nUptime: \`${formatDuration(process.uptime())}\`\nServidores atendidos: \`${client.guilds.cache.size}\``, inline: true },
        { name: '📡 Conexão', value: `Ping Discord: \`${wsPing}\`\nPing do comando: \`${Date.now() - started} ms\`\nPing do monitor: ${monitorPing}\nWebSocket: \`${client.ws.status}\``, inline: true },
        { name: '🖥️ Servidor', value: `Membros: \`${guild.memberCount ?? 'N/D'}\`\nCanais: \`${totalChannels}\`\nTexto: \`${textChannels}\` • Voz: \`${voiceChannels}\`\nCargos: \`${guild.roles.cache.size}\``, inline: true },
        { name: '⏳ Filas', value: `Mediadores esperando: \`${fmt(count(medWaiting))}\`\nMediadores ocupados: \`${fmt(count(medBusy))}\`\nAnalistas esperando: \`${fmt(count(anaWaiting))}\`\nAnalistas ocupados: \`${fmt(count(anaBusy))}\`\nStreamers esperando: \`${fmt(count(streamerWaiting))}\`\nEm atendimento de streamer: \`${fmt(count(streamerActive))}\`\n**Total esperando:** \`${queueWaiting}\` • **Em atendimento:** \`${queueBusy}\``, inline: false },
        { name: '🎟️ Tickets', value: `Abertos: \`${fmt(count(ticketsOpen))}\`\nFechados: \`${fmt(count(ticketsClosed))}\`\nTotal registrado: \`${count(ticketsOpen) === null || count(ticketsClosed) === null ? 'N/D' : count(ticketsOpen) + count(ticketsClosed)}\``, inline: true },
        { name: '🎮 Partidas', value: `Partidas registradas: \`${fmt(count(matchesTotal))}\``, inline: true },
        { name: '🧠 Recursos', value: `RAM usada: \`${(memory.rss / 1024 / 1024).toFixed(1)} MB\`\nHeap: \`${(memory.heapUsed / 1024 / 1024).toFixed(1)} / ${(memory.heapTotal / 1024 / 1024).toFixed(1)} MB\`\nPlataforma: \`${process.platform} • Node ${process.version}\``, inline: true },
      )
      .setFooter({ text: 'BACK BOT • Atualizado em tempo real' })
      .setTimestamp();
    await m.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } catch (err) {
    console.error('[APOSTAS-STATUS]', err?.stack || err);
    await m.reply('❌ Não consegui carregar todas as estatísticas agora. Confira a conexão com o banco de dados e tente novamente.').catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
console.log('🔑 [LOGIN] Token presente:', !!DISCORD_TOKEN);
console.log('🔑 [LOGIN] Token length:', DISCORD_TOKEN?.length || 0);
console.log('🔑 [LOGIN] Tentando conectar...');

client.login(DISCORD_TOKEN)
  .then(() => console.log('🔑 [LOGIN] Promise resolvida ✅'))
  .catch(e => {
    console.error('🔑 [LOGIN] ❌ FALHOU');
    console.error('🔑 [LOGIN] message:', e.message);
    console.error('🔑 [LOGIN] code:', e.code);
    process.exit(1);
  });

// ═══════════════════════════════════════════════════════════
// FIM DO ARQUIVO
// ═══════════════════════════════════════════════════════════
