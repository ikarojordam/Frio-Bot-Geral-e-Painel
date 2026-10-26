// ═══════════════════════════════════════════════════════════
// FRIO PAINEL — Backend v6.2.0
// + Edição de perfil (cliente + dev)
// + Isolamento de servidores por discord_id
// ═══════════════════════════════════════════════════════════
try { require('dotenv').config(); } catch {}

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Express 4 não captura rejeições de handlers async: sem isto, um erro inesperado deixava a
// requisição pendurada até o timeout. Aqui qualquer exceção vai para o error handler global.
for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (route, ...handlers) => {
    if (method === 'get' && handlers.length === 0) return original(route); // app.get('setting')
    return original(route, ...handlers.map((h) => {
      if (typeof h !== 'function' || h.length >= 4) return h;
      return (req, res, next) => {
        try {
          const out = h(req, res, next);
          if (out && typeof out.catch === 'function') out.catch(next);
        } catch (err) { next(err); }
      };
    }));
  };
}
const PORT = process.env.PANEL_PORT || process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PROD = NODE_ENV === 'production';

// ═══ ENV ═══
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// ═══ VALIDAÇÕES ═══
function fatal(msg) { console.error(`[BOOT] ${msg}`); process.exit(1); }
if (!SUPABASE_URL) fatal('SUPABASE_URL ausente');
if (!SUPABASE_ANON) fatal('SUPABASE_ANON_KEY ausente');
if (!SUPABASE_SERVICE) fatal('SUPABASE_SERVICE_ROLE_KEY ausente');
if (!PANEL_API_TOKEN || PANEL_API_TOKEN.length < 24) console.warn('[SECURITY] PANEL_API_TOKEN curto/ausente');
if (!DISCORD_TOKEN) console.warn('DISCORD_TOKEN ausente — ações Discord desabilitadas');

// ═══ SUPABASE ═══
const supaPublic = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Client-Info': 'frio-panel/6.2.0' } },
});
const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Client-Info': 'frio-panel/6.2.0-admin' } },
});

// ═══ AUTO-MIGRATION CHECK ═══
(async function autoMigrate() {
  try {
    const { error } = await supaAdmin.from('panel_admins').select('email_confirmed').limit(1);
    if (!error) console.log('[MIGRATION] Colunas presentes.');
    else console.warn('[MIGRATION] Coluna ausente. Rode: ALTER TABLE panel_admins ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN DEFAULT false, confirm_token TEXT, confirm_expires TIMESTAMPTZ, reset_token TEXT, reset_expires TIMESTAMPTZ;');
  } catch (e) { console.error('[MIGRATION]', e.message); }
})();

// ═══ CONSTANTES ═══
const ROLES = ['dev', 'admin', 'funcionario', 'cliente', 'pending'];
const PLANS = ['none', 'basic', 'premium', 'ultra', 'unlimited'];
const TIERS = ['basic', 'premium', 'ultra', 'unlimited'];
const COOKIE_NAME = 'sb_token';
const REFRESH_COOKIE = 'sb_refresh';
const REMEMBER_COOKIE = 'frio_rem';
const CSRF_COOKIE = 'frio_csrf';
const CSRF_HEADER = 'x-csrf-token';

// ═══ HELPERS ═══
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function cleanId(s) { return String(s || '').replace(/[<@!>]/g, '').trim(); }
function safeStr(v, max = 500) {
  if (v === null || v === undefined) return null;
  return String(v).trim().slice(0, max) || null;
}
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 254;
}
function isValidDiscordId(id) { return /^\d{15,25}$/.test(String(id || '')); }
// Aleatoriedade criptográfica (Math.random é previsível — não serve para senhas nem keys)
function randomChars(chars, len) {
  return Array.from({ length: len }, () => chars[crypto.randomInt(chars.length)]).join('');
}
function genPassword(len = 14) {
  return randomChars('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#', len);
}
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
function intParam(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}
// Texto de busca seguro para filtros .or() do PostgREST (vírgula/parênteses quebram o filtro)
function safeSearch(v, max = 60) {
  return String(v || '').replace(/[^\p{L}\p{N}\s@._-]/gu, '').trim().slice(0, max);
}
function sanitizeGuildIds(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(cleanId).filter(isValidDiscordId))].slice(0, 200);
}
function stripSecrets(row) {
  if (!row) return row;
  const { confirm_token, reset_token, ...rest } = row;
  return rest;
}
function csvCell(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // evita injeção de fórmula ao abrir no Excel
  return `"${t.replace(/"/g, '""')}"`;
}
const _ttlCache = new Map();
async function ttlCached(key, ms, fn) {
  const hit = _ttlCache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  _ttlCache.set(key, { value, at: Date.now() });
  return value;
}
function baseUrl() {
  return process.env.PANEL_URL
    || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`);
}
function genKeyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n) => randomChars(chars, n);
  return `FRIO-${seg(4)}-${seg(4)}-${seg(4)}`;
}
function clientIp(req) {
  return ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown');
}
function genericError(res, status = 500, msg = 'Erro interno.') {
  return res.status(status).json({ ok: false, error: msg });
}
function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = String(email).split('@');
  if (!name || !domain) return null;
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.slice(-1)}@${domain}`;
}

// ═══════════════════════════════════════════════════════════
// SECURITY HEADERS
// ═══════════════════════════════════════════════════════════
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Compressão gzip/brotli (opcional: ativa sozinha após `npm install`, que instala o pacote "compression")
try {
  app.use(require('compression')({ threshold: 1024 }));
} catch { console.warn('[PERF] pacote "compression" ausente — rode npm install para ativar a compressão.'); }

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com https://cdn.jsdelivr.net 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "media-src 'self' https:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '));

  next();
});

// Respostas privadas da API nunca devem ficar em cache (navegador/proxy)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(cookieParser());

// ═══════════════════════════════════════════════════════════
// STATIC — assets
// ═══════════════════════════════════════════════════════════
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (/\.(css|js|html)$/i.test(filePath)) {
      // revalida por ETag (resposta 304 barata): atualização aparece na hora, sem baixar de novo
      res.setHeader('Cache-Control', 'no-cache');
    } else if (IS_PROD) {
      // imagens/fontes quase nunca mudam
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    }
  },
}));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// ═══════════════════════════════════════════════════════════
// RATE LIMIT
// ═══════════════════════════════════════════════════════════
const _rlBuckets = new Map();
function hitBucket(key, max, windowMs) {
  const now = Date.now();
  const bucket = (_rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  const allowed = bucket.length < max;
  if (allowed) bucket.push(now);
  _rlBuckets.set(key, bucket);
  return allowed;
}
function bucketCount(key, windowMs) {
  const now = Date.now();
  return (_rlBuckets.get(key) || []).filter((t) => now - t < windowMs).length;
}
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${clientIp(req)}:${req.baseUrl}${req.path}`;
    if (!hitBucket(key, max, windowMs)) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ ok: false, error: 'Muitas requisições. Aguarde.' });
    }
    next();
  };
}
// limpeza periódica (maior janela usada = 1h)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rlBuckets) {
    if (!v.length || now - v[v.length - 1] > 60 * 60 * 1000) _rlBuckets.delete(k);
  }
  for (const [k, v] of _ttlCache) if (now - v.at > 10 * 60 * 1000) _ttlCache.delete(k);
}, 5 * 60 * 1000).unref();

// ═══════════════════════════════════════════════════════════
// CSRF
// ═══════════════════════════════════════════════════════════
const DAY_MS = 24 * 60 * 60 * 1000;
function ttlFor(remember) { return (remember ? 30 : 7) * DAY_MS; }
function setCsrfCookie(res, remember = false, existing = null) {
  const token = existing || crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, secure: IS_PROD, sameSite: 'lax',
    maxAge: ttlFor(remember), path: '/',
  });
  return token;
}
function setAuthCookies(res, session, remember) {
  const base = { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/', maxAge: ttlFor(remember) };
  res.cookie(COOKIE_NAME, session.access_token, base);
  if (session.refresh_token) res.cookie(REFRESH_COOKIE, session.refresh_token, base);
  res.cookie(REMEMBER_COOKIE, remember ? '1' : '0', base);
}
function clearAuthCookies(res) {
  for (const name of [COOKIE_NAME, REFRESH_COOKIE, REMEMBER_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, { path: '/' });
  }
}
function csrfProtect(req, res, next) {
  const m = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(m)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ ok: false, error: 'CSRF inválido.' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// CONTEXT EXTRACTOR + AUDITORIA
// ═══════════════════════════════════════════════════════════
function extractCtx(req) {
  const ua = String(req.headers['user-agent'] || '');
  return {
    ip: clientIp(req),
    user_agent: ua.slice(0, 500),
    referer: safeStr(req.headers.referer, 500),
    origin: safeStr(req.headers.origin, 200),
    accept_language: safeStr(req.headers['accept-language'], 100),
    country: safeStr(req.headers['cf-ipcountry'], 10),
    city: safeStr(req.headers['cf-ipcity'], 100),
    device_type: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
    browser: /edg/i.test(ua) ? 'Edge'
           : /chrome/i.test(ua) ? 'Chrome'
           : /firefox/i.test(ua) ? 'Firefox'
           : /safari/i.test(ua) ? 'Safari'
           : 'Outro',
    os: /windows/i.test(ua) ? 'Windows'
      : /mac/i.test(ua) ? 'macOS'
      : /linux/i.test(ua) ? 'Linux'
      : /android/i.test(ua) ? 'Android'
      : /iphone|ipad/i.test(ua) ? 'iOS'
      : 'Outro',
  };
}

const _AUDIT_WHITELIST = new Set([
  'email','username','role','plan','tier','guild_id','guild_name',
  'target_user_id','product_id','product_name','amount','status',
  'panel_id','ticket_id','reason','metadata','action','success',
  'duration_ms','method','path','error','code','device','browser',
  'os','country','city','ip','user_agent','key_id','key_code','changed',
  'discord_id','quantidade','added','failed','total','deletedChannels','deletedRoles',
  'pack_id','session_id','title','scope','target_id','days','count',
]);
function sanitizeAuditPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const safe = {};
  for (const k of Object.keys(payload)) {
    if (!_AUDIT_WHITELIST.has(k)) continue;
    const lk = k.toLowerCase();
    if (['password','senha','pwd','token','secret','cookie','authorization'].some(f => lk.includes(f))) continue;
    const v = payload[k];
    if (v === null || v === undefined) continue;
    safe[k] = typeof v === 'object' ? v : String(v).slice(0, 500);
  }
  return safe;
}
async function audit(req, action, opts = {}) {
  try {
    req._audited = true;
    const ctx = extractCtx(req);
    const actorId = req.user?.id || req.admin?.user_id || 'system';
    const actorEmail = req.user?.email || req.admin?.email || null;
    const row = {
      actor_id: actorId, actor_email: actorEmail,
      action: String(action).slice(0, 80),
      target_id: opts.target_id || null,
      target_role: opts.target_role || null,
      metadata: sanitizeAuditPayload(opts.metadata || {}),
      ip: ctx.ip, user_agent: ctx.user_agent,
      device_type: ctx.device_type, browser: ctx.browser, os: ctx.os,
      country: ctx.country, city: ctx.city,
      referer: ctx.referer, accept_language: ctx.accept_language,
      session_id: req.sessionId || null,
      success: opts.success !== false,
      error_reason: opts.error_reason ? String(opts.error_reason).slice(0, 200) : null,
      duration_ms: Number.isFinite(opts.duration_ms) ? opts.duration_ms : null,
    };
    await supaAdmin.from('site_audit_log').insert(row);
    if (isSensitiveAction(action)) {
      setImmediate(() => notifyDevsRealtime(action, row).catch(() => {}));
    }
  } catch (e) { console.error('[AUDIT]', e.message); }
}
function isSensitiveAction(a) {
  return [
    'login_failed', 'access_denied', 'nuke_guild', 'force_leave_guild',
    'kill_switch_on', 'maintenance_on', 'force_premium_add',
    'generate_keys', 'generate_pack', 'broadcast_global',
    'password_reset', 'update_user', 'deactivate_user', 'self_update_profile',
  ].includes(a);
}
async function notifyDevsRealtime(action, data) {
  // O painel registra auditoria no Supabase; não depende de uma URL externa do bot.
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
async function notify(userId, type, title, content, metadata = null) {
  try {
    await supaAdmin.from('site_notifications').insert({
      user_id: userId, type, title, content, metadata,
    });
  } catch (e) { console.error('[NOTIFY]', e.message); }
}

async function notifyMany(userIds, type, title, content, metadata = null) {
  const ids = [...new Set(userIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += 500) {
    const rows = ids.slice(i, i + 500).map((user_id) => ({ user_id, type, title, content, metadata }));
    const { error } = await supaAdmin.from('site_notifications').insert(rows);
    if (error) console.error('[NOTIFY-MANY]', error.message);
  }
}

// ═══════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════
async function createSession(userId, token, req, ttlMs = 7 * DAY_MS) {
  try {
    const ctx = extractCtx(req);
    const { data, error } = await supaAdmin.from('active_sessions').insert({
      user_id: userId, token_hash: sha256(token),
      ip: ctx.ip, user_agent: ctx.user_agent,
      device_type: ctx.device_type, browser: ctx.browser, os: ctx.os,
      country: ctx.country, city: ctx.city,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data?.id || null;
  } catch (e) { console.error('[createSession]', e.message); return null; }
}
async function touchSession(tokenHash) {
  try {
    await supaAdmin.from('active_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('token_hash', tokenHash);
  } catch {}
}
async function deleteSessionByToken(token) {
  try {
    await supaAdmin.from('active_sessions').delete().eq('token_hash', sha256(token));
  } catch {}
}

// Cliente Supabase descartável: o cliente público compartilhado guarda sessão em memória,
// e chamar signOut() nele podia derrubar o login de OUTRO usuário (condição de corrida).
function newAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
async function revokeSupabaseToken(accessToken) {
  try { await supaAdmin.auth.admin.signOut(accessToken, 'local'); } catch {}
}

// ═══════════════════════════════════════════════════════════
// AUTH MIDDLEWARES
// ═══════════════════════════════════════════════════════════
// Cache curto de autenticação: o dashboard dispara várias requisições em paralelo e cada uma
// fazia 2 consultas (getUser + panel_admins) + 1 escrita (last_seen).
const AUTH_CACHE_MS = 15 * 1000;
const _authCache = new Map(); // tokenHash -> { user, admin, sessionId, at, touchedAt }
const _refreshInflight = new Map();

function invalidateAuthCache(userId = null) {
  for (const [k, v] of _authCache) if (!userId || v.user?.id === userId) _authCache.delete(k);
  // renovações recentes também: após logout/revogação ninguém pode "reaproveitar" uma sessão já encerrada
  _refreshInflight.clear();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _authCache) if (now - v.at > AUTH_CACHE_MS * 4) _authCache.delete(k);
}, 60 * 1000).unref();

// O access token do Supabase vale ~1h. Sem renovar, o usuário era deslogado após 1 hora
// mesmo com o cookie válido por 7/30 dias.
// A rotação é "single-flight": várias requisições paralelas com o mesmo cookie vencido
// compartilham UMA renovação (senão a 2ª não acharia mais a sessão antiga e seria deslogada).
function rotateSession(oldHash, refreshToken, remember) {
  const key = `${oldHash || ''}:${sha256(refreshToken)}`; // só quem tem os DOIS cookies reaproveita a renovação
  if (_refreshInflight.has(key)) return _refreshInflight.get(key);
  const p = (async () => {
    try {
      if (!oldHash) return { fail: 'expired' };
      const { data, error } = await newAuthClient().auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data?.session?.user) return { fail: 'expired' };

      const found = await supaAdmin.from('active_sessions').select('id')
        .eq('token_hash', oldHash).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!found.error && !found.data) {
        await revokeSupabaseToken(data.session.access_token);
        return { fail: 'revoked' };
      }
      const sessionId = found.data?.id || null;
      if (sessionId) {
        await supaAdmin.from('active_sessions').update({
          token_hash: sha256(data.session.access_token),
          last_seen: new Date().toISOString(),
          expires_at: new Date(Date.now() + ttlFor(remember)).toISOString(),
        }).eq('id', sessionId);
      }
      return { session: data.session, sessionId };
    } catch (e) {
      console.error('[rotateSession]', e.message);
      return { fail: 'expired' };
    }
  })();
  _refreshInflight.set(key, p);
  setTimeout(() => _refreshInflight.delete(key), 8 * 1000).unref();
  return p;
}

async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME] || null;
    const viaCookie = !!token;
    const refreshToken = req.cookies?.[REFRESH_COOKIE] || null;
    if (!token) {
      const auth = req.headers.authorization || '';
      if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
    }
    if (!token) token = req.headers['x-panel-token'] || null;
    const cookieSession = viaCookie || (!token && !!refreshToken);
    if (!token && !refreshToken) return res.status(401).json({ ok: false, error: 'Não autenticado' });

    const now = Date.now();
    const remember = req.cookies?.[REMEMBER_COOKIE] === '1';
    let hash = token ? sha256(token) : null;
    let entry = hash ? _authCache.get(hash) : null;
    if (entry && now - entry.at >= AUTH_CACHE_MS) entry = null;

    if (!entry) {
      let user = null, sessionId = null, rotated = null;
      if (token) {
        const { data, error } = await supaPublic.auth.getUser(token);
        if (!error && data?.user) user = data.user;
      }

      if (!user && refreshToken && cookieSession) {
        const rot = await rotateSession(hash, refreshToken, remember);
        if (rot.fail) {
          clearAuthCookies(res);
          return rot.fail === 'revoked'
            ? res.status(401).json({ ok: false, error: 'Sessão encerrada. Entre novamente.', code: 'SESSION_REVOKED' })
            : res.status(401).json({ ok: false, error: 'Sessão expirada. Entre novamente.' });
        }
        rotated = rot;
        user = rot.session.user;
        sessionId = rot.sessionId;
        token = rot.session.access_token;
        hash = sha256(token);
        setAuthCookies(res, rot.session, remember);
        setCsrfCookie(res, remember, req.cookies?.[CSRF_COOKIE] || null);
      }
      if (!user) {
        if (cookieSession) clearAuthCookies(res);
        return res.status(401).json({ ok: false, error: 'Sessão inválida' });
      }

      const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', user.id).maybeSingle();
      if (!admin) return res.status(403).json({ ok: false, error: 'Sem acesso' });

      // Sessão revogada (logout, "encerrar sessões", troca de senha, ban) não pode mais ser usada.
      if (cookieSession && !rotated) {
        const r = await supaAdmin.from('active_sessions').select('id')
          .eq('token_hash', hash).gt('expires_at', new Date().toISOString()).maybeSingle();
        if (!r.error && !r.data) {
          clearAuthCookies(res);
          return res.status(401).json({ ok: false, error: 'Sessão encerrada. Entre novamente.', code: 'SESSION_REVOKED' });
        }
        sessionId = r.data?.id || null;
      }

      entry = { user, admin, sessionId, at: now, touchedAt: now };
      _authCache.set(hash, entry);
    }

    const { user, admin } = entry;
    if (!admin.ativo) {
      if (admin.role === 'pending') return res.status(403).json({ ok: false, error: 'Aguarde aprovação', code: 'PENDING' });
      return res.status(403).json({ ok: false, error: 'Conta desativada' });
    }
    if (admin.banned) return res.status(403).json({ ok: false, error: 'Conta banida' });

    req.user = user;
    req.admin = admin;
    req.role = admin.role;
    req.token = token;
    req.sessionId = entry.sessionId;
    if (now - entry.touchedAt > 60 * 1000) { // last_seen no máx. 1x por minuto
      entry.touchedAt = now;
      setImmediate(() => touchSession(sha256(token)));
    }
    next();
  } catch (e) {
    console.error('[requireAuth]', e.message);
    return genericError(res);
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!allowed.includes(req.admin.role)) {
        return res.status(403).json({ ok: false, error: 'Permissão negada' });
      }
      next();
    });
  };
}
const requireDev = requireRole('dev');
const requireAdmin = requireRole('dev', 'admin');
const requireStaff = requireRole('dev', 'admin', 'funcionario');

// ═══════════════════════════════════════════════════════════
// AUTO-AUDIT
// ═══════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const started = Date.now();
  const origJson = res.json.bind(res);
  res.json = function (data) {
    const duration = Date.now() - started;
    const skip = req.method === 'GET'
      || req.path === '/api/auth/me'
      || req.path === '/api/public-config'
      || req.path.startsWith('/api/auth/validate');
    if (!skip && !req._audited) {
      setImmediate(() => {
        audit(req, `${req.method}_${req.path}`, {
          success: res.statusCode < 400 && data?.ok !== false,
          error_reason: data?.error || null,
          duration_ms: duration,
          metadata: { path: req.path },
        });
      });
    }
    return origJson(data);
  };
  next();
});

// ═══════════════════════════════════════════════════════════
// VALIDAÇÃO DE PARÂMETROS DE ROTA
// ═══════════════════════════════════════════════════════════
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.param('guildId', (req, res, next, v) => (
  isValidDiscordId(v) ? next() : res.status(400).json({ ok: false, error: 'ID de servidor inválido.' })
));
app.param('userId', (req, res, next, v) => (
  UUID_RE.test(v) ? next() : res.status(400).json({ ok: false, error: 'ID de usuário inválido.' })
));

// ═══════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS
// ═══════════════════════════════════════════════════════════
app.get('/api/public-config', (req, res) => {
  res.json({
    ok: true,
    supabase_url: SUPABASE_URL,
    supabase_anon: SUPABASE_ANON,
    panel_url: baseUrl(),
    discord_client_id: DISCORD_CLIENT_ID || null,
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true, service: 'frio-panel', version: '6.2.0',
    uptime: Math.floor(process.uptime()),
    env: NODE_ENV,
  });
});

// ═══════════════════════════════════════════════════════════
// AUTH — LOGIN
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const started = Date.now();
  try {
    const { email, password, remember } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'E-mail e senha obrigatórios' });
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 256) {
      return res.status(400).json({ ok: false, error: 'Dados inválidos' });
    }
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });

    const emailNorm = email.toLowerCase().trim();
    // Limite por conta (só conta FALHAS): trocar o IP (cabeçalho forjado) não permite tentar senhas à vontade,
    // e logins bem-sucedidos não gastam a cota.
    const emailKey = `login-email:${emailNorm}`;
    if (bucketCount(emailKey, 15 * 60 * 1000) >= 8) {
      res.setHeader('Retry-After', 900);
      return res.status(429).json({ ok: false, error: 'Muitas tentativas para este e-mail. Aguarde alguns minutos.' });
    }

    const { data, error } = await newAuthClient().auth.signInWithPassword({ email: emailNorm, password });
    if (error) {
      hitBucket(emailKey, Infinity, 15 * 60 * 1000);
      const msg = String(error.message || '').toLowerCase();
      let reason = 'invalid_credentials';
      if (msg.includes('not confirmed')) reason = 'email_not_confirmed';
      if (msg.includes('banned')) reason = 'banned';
      await audit(req, 'login_failed', {
        success: false, error_reason: reason,
        metadata: { email: emailNorm, duration_ms: Date.now() - started },
      });
      if (reason === 'email_not_confirmed') return res.status(403).json({ ok: false, error: 'Confirme seu email antes de logar.', code: 'EMAIL_NOT_CONFIRMED' });
      return res.status(401).json({ ok: false, error: 'E-mail ou senha inválidos' });
    }
    if (!data.session) {
      await audit(req, 'login_failed', { success: false, error_reason: 'no_session', metadata: { email: emailNorm } });
      return res.status(401).json({ ok: false, error: 'Sessão não criada' });
    }

    _rlBuckets.delete(emailKey); // senha correta: zera as falhas desta conta

    const reject = async (status, reason, body) => {
      await revokeSupabaseToken(data.session.access_token);
      await audit(req, 'login_failed', { success: false, error_reason: reason, metadata: { email: emailNorm } });
      return res.status(status).json({ ok: false, ...body });
    };

    const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', data.user.id).maybeSingle();
    if (!admin) return reject(403, 'no_panel_admin', { error: 'Sem acesso' });
    if (admin.banned) return reject(403, 'banned', { error: 'Conta banida' });
    if (!admin.ativo) {
      if (admin.role === 'pending') return reject(403, 'pending_approval', { error: 'Aguarde aprovação', code: 'PENDING' });
      return reject(403, 'inactive', { error: 'Conta desativada' });
    }

    const keep = remember === true || remember === 'true';
    const sessionId = await createSession(data.user.id, data.session.access_token, req, ttlFor(keep));
    if (!sessionId) {
      await revokeSupabaseToken(data.session.access_token);
      return res.status(500).json({ ok: false, error: 'Não foi possível iniciar a sessão. Tente novamente.' });
    }

    setAuthCookies(res, data.session, keep);
    const csrf = setCsrfCookie(res, keep);

    req.user = data.user;
    req.admin = admin;
    req.sessionId = sessionId;
    await audit(req, 'login', { metadata: { role: admin.role, plan: admin.plan || 'basic' } });

    return res.json({
      ok: true, csrf, session_id: sessionId,
      user: { id: data.user.id, email: data.user.email },
      admin: {
        nome: admin.nome, role: admin.role, plan: admin.plan || 'basic',
        is_owner: admin.role === 'dev',
        pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(admin.role),
        assigned_guilds: admin.assigned_guilds || [],
        discord_id: admin.discord_id || null,
      },
    });
  } catch (e) { console.error('[LOGIN]', e); return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/logout', requireAuth, csrfProtect, async (req, res) => {
  try {
    await deleteSessionByToken(req.token);
    await revokeSupabaseToken(req.token);
    invalidateAuthCache(req.user.id);
    await audit(req, 'logout');
    clearAuthCookies(res);
    return res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// ME
// ═══════════════════════════════════════════════════════════
app.get('/api/auth/me', requireAuth, (req, res) => {
  const a = req.admin;
  // garante o cookie CSRF (se tiver sido apagado/expirado o usuário não ficava mais "preso" sem conseguir salvar nada)
  if (!req.cookies?.[CSRF_COOKIE]) setCsrfCookie(res, req.cookies?.[REMEMBER_COOKIE] === '1');
  res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email },
    admin: {
      nome: a.nome, role: a.role, plan: a.plan || 'basic',
      is_owner: a.role === 'dev',
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(a.role),
      assigned_guilds: a.assigned_guilds || [],
      discord_id: a.discord_id || null,
    },
  });
});

// ═══════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/register', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email, password, discord_id, username } = req.body || {};

    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ ok: false, error: 'Senha deve ter 8+ caracteres' });
    if (password.length > 128) return res.status(400).json({ ok: false, error: 'Senha muito longa' });
    if (!discord_id) return res.status(400).json({ ok: false, error: 'ID do Discord é obrigatório.', code: 'DISCORD_ID_REQUIRED' });

    const discordIdClean = cleanId(discord_id);
    if (!isValidDiscordId(discordIdClean)) {
      return res.status(400).json({ ok: false, error: 'ID do Discord inválido.', code: 'DISCORD_ID_INVALID' });
    }

    const emailNorm = String(email).toLowerCase().trim();

    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id, ativo').eq('email', emailNorm).maybeSingle();
    if (existing) {
      if (existing.ativo) return res.status(400).json({ ok: false, error: 'E-mail já cadastrado' });
      return res.status(400).json({ ok: false, error: 'Já existe um cadastro com este e-mail.', code: 'PENDING_EXISTS' });
    }

    const { data: existingDiscord } = await supaAdmin.from('panel_admins').select('user_id').eq('discord_id', discordIdClean).maybeSingle();
    if (existingDiscord) return res.status(409).json({ ok: false, error: 'Este ID do Discord já está cadastrado.', code: 'DISCORD_ID_TAKEN' });

    const url = baseUrl();
    const { data: signupData, error: signupErr } = await newAuthClient().auth.signUp({
      email: emailNorm,
      password,
      options: {
        emailRedirectTo: `${url}/confirm.html`,
        data: { discord_id: discordIdClean },
      },
    });
    if (signupErr) return res.status(400).json({ ok: false, error: signupErr.message });
    if (!signupData?.user) return res.status(500).json({ ok: false, error: 'Falha ao criar conta' });
    // E-mail já existente no Auth (mas sem registro no painel): o Supabase devolve um usuário "fantasma" sem identities.
    if (Array.isArray(signupData.user.identities) && signupData.user.identities.length === 0) {
      return res.status(400).json({ ok: false, error: 'E-mail já cadastrado' });
    }

    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: signupData.user.id,
      email: emailNorm,
      nome: safeStr(username, 60) || emailNorm.split('@')[0],
      role: 'pending', plan: 'basic', ativo: false, is_owner: false,
      discord_id: discordIdClean,
      email_confirmed: false,
    });
    if (dbErr) {
      await supaAdmin.auth.admin.deleteUser(signupData.user.id).catch(() => {});
      return res.status(500).json({ ok: false, error: dbErr.message });
    }

    req.user = { id: signupData.user.id, email: emailNorm };
    await audit(req, 'register_pending', {
      target_id: signupData.user.id, target_role: 'pending',
      metadata: { email: emailNorm, discord_id: discordIdClean },
    });

    const { data: devs } = await supaAdmin.from('panel_admins').select('user_id').eq('role', 'dev').eq('ativo', true);
    await notifyMany((devs || []).map((d) => d.user_id), 'system', 'Novo cadastro pendente',
      `${emailNorm} (Discord: ${discordIdClean}) solicitou acesso.`,
      { user_id: signupData.user.id, discord_id: discordIdClean });

    return res.json({ ok: true, message: 'Cadastro criado! Verifique seu email.' });
  } catch (e) { console.error('[REGISTER]', e); return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// RESEND CONFIRMATION
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/resend-confirmation', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    const url = baseUrl();
    const { error } = await supaPublic.auth.resend({
      type: 'signup',
      email: String(email).toLowerCase().trim(),
      options: { emailRedirectTo: `${url}/confirm.html` },
    });
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, message: 'Email reenviado!' });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// FORGOT
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/forgot', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    const url = baseUrl();
    await supaPublic.auth.resetPasswordForEmail(String(email).toLowerCase().trim(), {
      redirectTo: `${url}/reset.html`,
    }).catch(() => {});
    await audit(req, 'forgot_password_requested', { metadata: { email: String(email).toLowerCase().trim() } });
    return res.json({ ok: true, message: 'Se o e-mail existir, enviaremos instruções.' });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// VALIDATE RESET
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/validate-reset', rateLimit(20, 60 * 60 * 1000), async (req, res) => {
  try {
    const { token, access_token } = req.body || {};
    const finalToken = access_token || token;
    if (!finalToken) return res.json({ ok: false, valid: false, error: 'Token ausente.' });

    const { data: { user }, error } = await supaPublic.auth.getUser(finalToken);
    if (!error && user) {
      return res.json({ ok: true, valid: true, kind: 'supabase', email: user.email });
    }

    const { data: customUser, error: dbErr } = await supaAdmin
      .from('panel_admins')
      .select('user_id, email, reset_expires')
      .eq('reset_token', finalToken)
      .maybeSingle();

    if (dbErr) console.error('[validate-reset/db]', dbErr.message);
    if (!customUser) {
      await audit(req, 'reset_validate_failed', { success: false, error_reason: 'invalid_token' });
      return res.json({ ok: false, valid: false, error: 'Link inválido ou já utilizado.' });
    }
    if (customUser.reset_expires && new Date(customUser.reset_expires) < new Date()) {
      await audit(req, 'reset_validate_failed', { success: false, error_reason: 'expired_token', target_id: customUser.user_id });
      return res.json({ ok: false, valid: false, error: 'Este link expirou.' });
    }

    return res.json({ ok: true, valid: true, kind: 'custom', email_masked: maskEmail(customUser.email) });
  } catch (e) {
    console.error('[validate-reset]', e);
    return res.status(500).json({ ok: false, valid: false, error: 'Erro ao validar.' });
  }
});

// ═══════════════════════════════════════════════════════════
// VALIDATE CONFIRM
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/validate-confirm', rateLimit(20, 60 * 60 * 1000), async (req, res) => {
  try {
    const { token, access_token } = req.body || {};
    const finalToken = access_token || token;
    if (!finalToken) return res.json({ ok: false, valid: false, error: 'Token ausente.' });

    const { data: { user }, error } = await supaPublic.auth.getUser(finalToken);
    if (!error && user) {
      return res.json({ ok: true, valid: true, kind: 'supabase', email: user.email });
    }

    const { data: customUser, error: dbErr } = await supaAdmin
      .from('panel_admins')
      .select('user_id, email, confirm_expires, email_confirmed')
      .eq('confirm_token', finalToken)
      .maybeSingle();

    if (dbErr) console.error('[validate-confirm/db]', dbErr.message);
    if (!customUser) return res.json({ ok: false, valid: false, error: 'Link inválido ou já utilizado.' });
    if (customUser.email_confirmed) return res.json({ ok: true, valid: true, already_confirmed: true, kind: 'custom' });
    if (customUser.confirm_expires && new Date(customUser.confirm_expires) < new Date()) {
      return res.json({ ok: false, valid: false, error: 'Este link expirou.' });
    }

    return res.json({ ok: true, valid: true, kind: 'custom', email_masked: maskEmail(customUser.email) });
  } catch (e) {
    console.error('[validate-confirm]', e);
    return res.status(500).json({ ok: false, valid: false, error: 'Erro ao validar.' });
  }
});

// ═══════════════════════════════════════════════════════════
// RESEND BY TOKEN
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/resend-confirmation-by-token', rateLimit(3, 60 * 60 * 1000), async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'Token obrigatório.' });

    const { data: user, error: dbErr } = await supaAdmin
      .from('panel_admins')
      .select('user_id, email, email_confirmed')
      .eq('confirm_token', token)
      .maybeSingle();

    if (dbErr) console.error('[resend-by-token/db]', dbErr.message);
    if (!user) return res.status(404).json({ ok: false, error: 'Cadastro não encontrado.' });
    if (user.email_confirmed) return res.json({ ok: true, message: 'E-mail já está confirmado.' });

    const url = baseUrl();
    const { error } = await supaPublic.auth.resend({
      type: 'signup',
      email: user.email,
      options: { emailRedirectTo: `${url}/confirm.html` },
    });
    if (error) return res.status(400).json({ ok: false, error: error.message });

    await audit(req, 'confirmation_resent', { target_id: user.user_id, metadata: { email: user.email } });
    return res.json({ ok: true, message: 'E-mail reenviado!' });
  } catch (e) {
    console.error('[resend-by-token]', e);
    return genericError(res);
  }
});

// ═══════════════════════════════════════════════════════════
// CONFIRM
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/confirm', rateLimit(20, 60 * 60 * 1000), async (req, res) => {
  try {
    const token = safeStr(req.body?.token, 128);
    if (!token) return res.status(400).json({ ok: false, error: 'Token obrigatório' });

    const { data: user, error: dbErr } = await supaAdmin
      .from('panel_admins')
      .select('user_id, confirm_expires, email_confirmed')
      .eq('confirm_token', token)
      .maybeSingle();

    if (dbErr) console.error('[confirm/db]', dbErr.message);
    if (!user) return res.status(400).json({ ok: false, error: 'Token inválido' });
    if (user.email_confirmed) return res.json({ ok: true, message: 'Já confirmado' });
    if (user.confirm_expires && new Date(user.confirm_expires) < new Date()) {
      return res.status(400).json({ ok: false, error: 'Token expirado' });
    }

    await supaAdmin.auth.admin.updateUserById(user.user_id, { email_confirm: true }).catch(() => {});
    await supaAdmin.from('panel_admins').update({
      email_confirmed: true,
      confirm_token: null,
      confirm_expires: null,
    }).eq('user_id', user.user_id);

    await audit(req, 'email_verified_via_token', { success: true, target_id: user.user_id });
    return res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// VERIFY (token_hash)
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/verify', rateLimit(20, 60 * 60 * 1000), async (req, res) => {
  try {
    const { token_hash, type } = req.body || {};
    if (!token_hash) return res.status(400).json({ ok: false, error: 'token_hash obrigatório' });

    const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type || 'signup', token_hash }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(400).json({ ok: false, error: data.error_description || data.msg || 'Token inválido' });

    await audit(req, 'email_verified_via_hash', { success: true, metadata: { user_id: data.user?.id || null } });
    return res.json({ ok: true, user_id: data.user?.id || null });
  } catch (e) { console.error('[verify]', e); return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// UPDATE PASSWORD
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/update-password', rateLimit(10, 60 * 60 * 1000), async (req, res) => {
  try {
    const { token, access_token, new_password } = req.body || {};
    const finalToken = access_token || token;
    if (!finalToken) return res.status(400).json({ ok: false, error: 'Token obrigatório' });
    if (!new_password || new_password.length < 8) return res.status(400).json({ ok: false, error: 'Senha deve ter 8+ caracteres' });
    if (new_password.length > 128) return res.status(400).json({ ok: false, error: 'Senha muito longa' });

    const { data: { user }, error: uErr } = await supaPublic.auth.getUser(finalToken);

    if (uErr || !user) {
      const { data: customUser, error: dbErr } = await supaAdmin
        .from('panel_admins')
        .select('user_id, reset_expires')
        .eq('reset_token', finalToken)
        .maybeSingle();

      if (dbErr) console.error('[update-password/db]', dbErr.message);
      if (!customUser) return res.status(401).json({ ok: false, error: 'Token inválido' });
      if (customUser.reset_expires && new Date(customUser.reset_expires) < new Date()) {
        return res.status(400).json({ ok: false, error: 'Token expirado' });
      }

      const { error: updErr } = await supaAdmin.auth.admin.updateUserById(customUser.user_id, { password: new_password });
      if (updErr) return res.status(400).json({ ok: false, error: updErr.message });

      await supaAdmin.from('panel_admins').update({ reset_token: null, reset_expires: null }).eq('user_id', customUser.user_id);
      await supaAdmin.from('active_sessions').delete().eq('user_id', customUser.user_id);

      invalidateAuthCache(customUser.user_id);
      req.user = { id: customUser.user_id };
      await audit(req, 'password_reset', { target_id: customUser.user_id });
      return res.json({ ok: true });
    }

    const { error: updErr } = await supaAdmin.auth.admin.updateUserById(user.id, { password: new_password });
    if (updErr) return res.status(400).json({ ok: false, error: updErr.message });

    await supaAdmin.from('active_sessions').delete().eq('user_id', user.id);
    invalidateAuthCache(user.id);
    req.user = user;
    await audit(req, 'password_reset', { target_id: user.id });
    return res.json({ ok: true });
  } catch (e) { console.error('[update-password]', e); return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// ⚡ NOVO — MEU PERFIL (cliente edita próprio e-mail e Discord ID)
// ═══════════════════════════════════════════════════════════
app.patch('/api/me/profile', requireAuth, csrfProtect, rateLimit(10, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email, discord_id } = req.body || {};
    const patchAdmin = { updated_at: new Date().toISOString() };
    const changed = [];
    let newEmail = null;

    // ─── E-mail ───
    if (email !== undefined) {
      const emailNorm = String(email).toLowerCase().trim();
      if (!isValidEmail(emailNorm)) {
        return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
      }
      const currentEmail = String(req.admin.email || '').toLowerCase();
      if (emailNorm !== currentEmail) {
        const { data: existing } = await supaAdmin
          .from('panel_admins')
          .select('user_id')
          .eq('email', emailNorm)
          .neq('user_id', req.user.id)
          .maybeSingle();
        if (existing) {
          return res.status(409).json({ ok: false, error: 'Este e-mail já está em uso.', code: 'EMAIL_TAKEN' });
        }
        patchAdmin.email = emailNorm;
        newEmail = emailNorm;
        changed.push('email');
      }
    }

    // ─── Discord ID ───
    if (discord_id !== undefined) {
      const clean = cleanId(discord_id);
      if (!clean) {
        return res.status(400).json({ ok: false, error: 'ID do Discord é obrigatório.', code: 'DISCORD_ID_REQUIRED' });
      }
      if (!isValidDiscordId(clean)) {
        return res.status(400).json({ ok: false, error: 'ID do Discord inválido (15–25 dígitos).', code: 'DISCORD_ID_INVALID' });
      }
      if (clean !== String(req.admin.discord_id || '')) {
        const { data: existingDiscord } = await supaAdmin
          .from('panel_admins')
          .select('user_id')
          .eq('discord_id', clean)
          .neq('user_id', req.user.id)
          .maybeSingle();
        if (existingDiscord) {
          return res.status(409).json({ ok: false, error: 'Este ID do Discord já está cadastrado.', code: 'DISCORD_ID_TAKEN' });
        }
        patchAdmin.discord_id = clean;
        changed.push('discord_id');
      }
    }

    if (!changed.length) {
      return res.json({ ok: true, changed: [], message: 'Nenhuma alteração necessária.' });
    }

    // 1) Atualiza Supabase Auth (email)
    if (newEmail) {
      const { error: authErr } = await supaAdmin.auth.admin.updateUserById(req.user.id, {
        email: newEmail,
        email_confirm: true,
      });
      if (authErr) {
        return res.status(400).json({ ok: false, error: `Falha ao atualizar e-mail: ${authErr.message}` });
      }
    }

    // 2) Atualiza panel_admins
    const { error: dbErr } = await supaAdmin
      .from('panel_admins')
      .update(patchAdmin)
      .eq('user_id', req.user.id);
    if (dbErr) {
      return res.status(500).json({ ok: false, error: dbErr.message });
    }

    invalidateAuthCache(req.user.id);
    await audit(req, 'self_update_profile', {
      target_id: req.user.id,
      metadata: {
        changed: changed.join(','),
        ...(patchAdmin.email ? { email: patchAdmin.email } : {}),
        ...(patchAdmin.discord_id ? { discord_id: patchAdmin.discord_id } : {}),
      },
    });

    return res.json({
      ok: true,
      changed,
      admin: {
        email: patchAdmin.email || req.admin.email,
        discord_id: patchAdmin.discord_id || req.admin.discord_id,
      },
    });
  } catch (e) {
    console.error('[me/profile PATCH]', e);
    return genericError(res);
  }
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const role = req.admin.role;
    const uid = req.user.id;

    if (role === 'cliente' || role === 'funcionario') {
      const [servers, keys, notifs] = await Promise.all([
        req.admin.discord_id
          ? supaAdmin.from('user_guilds').select('*', { count: 'exact', head: true }).eq('discord_id', req.admin.discord_id)
          : Promise.resolve({ count: 0 }),
        supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).eq('sent_to', uid),
        supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false),
      ]);
      return res.json({ ok: true, stats: {
        servers: servers.count || 0,
        keys: keys.count || 0,
        notifs: notifs.count || 0,
      }});
    }

    const stats = await ttlCached('dash:stats:staff', 20 * 1000, async () => {
      const [guilds, users, keys, redemptions, notifs, activeKeys, pendingUsers, totalMembers] = await Promise.all([
        supaAdmin.from('bot_guilds').select('*', { count: 'exact', head: true }).eq('in_guild', true),
        supaAdmin.from('panel_admins').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).eq('is_pack', false),
        supaAdmin.from('premium_redemptions').select('*', { count: 'exact', head: true }),
        supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }),
        supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).eq('is_pack', false).eq('ativo', true),
        supaAdmin.from('panel_admins').select('*', { count: 'exact', head: true }).eq('role', 'pending'),
        sumGuildMembers(),
      ]);
      return {
        guilds: guilds.count || 0,
        users: users.count || 0,
        keys: keys.count || 0,
        active_keys: activeKeys.count || 0,
        redemptions: redemptions.count || 0,
        notifications: notifs.count || 0,
        pending: pendingUsers.count || 0,
        total_members: totalMembers,
      };
    });
    res.json({ ok: true, stats });
  } catch (e) { return genericError(res); }
});

// O PostgREST limita respostas a 1000 linhas: a soma antiga ficava errada com mais de 1000 servidores.
async function sumGuildMembers() {
  let total = 0;
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supaAdmin.from('bot_guilds').select('member_count')
      .eq('in_guild', true).order('guild_id', { ascending: true }).range(from, from + 999);
    if (error || !data?.length) break;
    total += data.reduce((acc, g) => acc + (g.member_count || 0), 0);
    if (data.length < 1000) break;
  }
  return total;
}

app.get('/api/dashboard/charts', requireStaff, async (req, res) => {
  try {
    const charts = await ttlCached('dash:charts', 30 * 1000, async () => {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const byDayList = (map) => Object.entries(map).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

      const [keysRes, redsRes, usersRes, topRes] = await Promise.all([
        supaAdmin.from('premium_keys').select('tier, created_at, ativo').eq('is_pack', false).gte('created_at', since30),
        supaAdmin.from('premium_redemptions').select('created_at').gte('created_at', since30),
        supaAdmin.from('panel_admins').select('role, plan, ativo'),
        supaAdmin.from('bot_guilds').select('guild_id,name,member_count,icon').eq('in_guild', true).order('member_count', { ascending: false }).limit(10),
      ]);

      const byTier = { basic: 0, premium: 0, ultra: 0, unlimited: 0 };
      const byDay = {};
      for (const k of keysRes.data || []) {
        if (byTier[k.tier] !== undefined) byTier[k.tier]++;
        const d = String(k.created_at || '').substring(0, 10);
        if (d) byDay[d] = (byDay[d] || 0) + 1;
      }
      const redDay = {};
      for (const r of redsRes.data || []) {
        const d = String(r.created_at || '').substring(0, 10);
        if (d) redDay[d] = (redDay[d] || 0) + 1;
      }
      const byRole = { dev: 0, admin: 0, funcionario: 0, cliente: 0, pending: 0 };
      const byPlan = { basic: 0, premium: 0, ultra: 0, unlimited: 0, none: 0 };
      for (const u of usersRes.data || []) {
        if (byRole[u.role] !== undefined) byRole[u.role]++;
        if (u.ativo && byPlan[u.plan || 'basic'] !== undefined) byPlan[u.plan || 'basic']++;
      }
      return {
        keys_by_tier: byTier,
        keys_by_day: byDayList(byDay),
        redemptions_by_day: byDayList(redDay),
        users_by_role: byRole,
        users_by_plan: byPlan,
        top_servers: (topRes.data || []).map((x) => ({ name: x.name, member_count: x.member_count || 0, icon: x.icon })),
      };
    });
    res.json({ ok: true, charts });
  } catch (e) { return genericError(res); }
});

app.get('/api/dashboard/bot-status', requireStaff, async (req, res) => {
  try {
    // O painel não consulta diretamente o processo do bot.
    const botStatus = { configured: false, ok: false, message: 'Monitoramento do bot não configurado' };

    const [ks, mm] = await Promise.all([
      supaAdmin.from('kill_switch').select('active,reason').eq('id', 1).maybeSingle(),
      supaAdmin.from('maintenance_mode').select('active,reason').eq('id', 1).maybeSingle(),
    ]);

    return res.json({
      ok: true,
      bot: botStatus,
      kill_switch: { active: !!ks.data?.active, reason: ks.data?.reason || null },
      maintenance: { active: !!mm.data?.active, reason: mm.data?.reason || null },
    });
  } catch (e) {
    console.error('[dashboard/bot-status]', e);
    return res.status(500).json({ ok: false, error: 'Erro ao consultar bot.' });
  }
});

app.get('/api/dashboard/recent-activity', requireStaff, rateLimit(120, 60 * 1000), async (req, res) => {
  try {
    const { data } = await supaAdmin.from('site_audit_log')
      .select('id,action,actor_email,actor_id,target_id,ip,browser,device_type,success,error_reason,created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    return res.json({ ok: true, activity: data || [] });
  } catch (e) {
    console.error('[recent-activity]', e);
    return genericError(res);
  }
});

app.get('/api/dashboard/keys-expiring', requireStaff, async (req, res) => {
  try {
    const in7d = new Date(Date.now() + 7 * 86400000).toISOString();
    const now = new Date().toISOString();
    const { data } = await supaAdmin.from('premium_keys')
      .select('id,key_code,tier,duracao_dias,expira_em,ativo,sent_to')
      .eq('ativo', true).eq('is_pack', false)
      .not('expira_em', 'is', null)
      .gte('expira_em', now)
      .lte('expira_em', in7d)
      .order('expira_em', { ascending: true })
      .limit(20);
    return res.json({ ok: true, keys: data || [] });
  } catch (e) {
    console.error('[keys-expiring]', e);
    return genericError(res);
  }
});

app.get('/api/dashboard/quick-stats', requireStaff, async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const [logins24h, loginsFailed24h, keysGenerated24h, redemptions7d] = await Promise.all([
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'login').gte('created_at', since24h),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'login_failed').gte('created_at', since24h),
      supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
      supaAdmin.from('premium_redemptions').select('*', { count: 'exact', head: true }).gte('created_at', since7d),
    ]);
    return res.json({ ok: true, quick: {
      logins_24h: logins24h.count || 0,
      logins_failed_24h: loginsFailed24h.count || 0,
      keys_generated_24h: keysGenerated24h.count || 0,
      redemptions_7d: redemptions7d.count || 0,
    }});
  } catch (e) {
    console.error('[quick-stats]', e);
    return genericError(res);
  }
});

// ═══════════════════════════════════════════════════════════
// ⚡ SERVIDORES — isolamento reforçado por discord_id
// ═══════════════════════════════════════════════════════════
app.get('/api/me/servers', requireAuth, async (req, res) => {
  try {
    const role = req.admin.role;

    // ─── DEV/ADMIN: visão global (intencional) ───
    if (role === 'dev' || role === 'admin') {
      const { data } = await supaAdmin
        .from('bot_guilds')
        .select('*')
        .eq('in_guild', true)
        .order('member_count', { ascending: false })
        .limit(500);
      return res.json({ ok: true, servers: data || [] });
    }

    // ─── CLIENTE/FUNCIONARIO: SÓ os próprios servidores ───
    const discordId = String(req.admin.discord_id || '').trim();
    if (!discordId) {
      return res.json({ ok: true, servers: [] });
    }

    // Fonte 1: servidores onde ele é DONO
    const { data: ug } = await supaAdmin
      .from('user_guilds')
      .select('guild_id')
      .eq('discord_id', discordId);

    // Fonte 2: servidores atribuídos manualmente pela staff
    const assigned = Array.isArray(req.admin.assigned_guilds) ? req.admin.assigned_guilds : [];

    const allIds = [...new Set([...(ug || []).map(x => x.guild_id), ...assigned])]
      .filter(id => typeof id === 'string' && /^\d{15,25}$/.test(id));

    if (!allIds.length) {
      return res.json({ ok: true, servers: [] });
    }

    const { data } = await supaAdmin
      .from('bot_guilds')
      .select('guild_id, name, icon, member_count, in_guild, owner_id')
      .in('guild_id', allIds)
      .eq('in_guild', true)
      .order('member_count', { ascending: false });

    return res.json({ ok: true, servers: data || [] });
  } catch (e) {
    console.error('[me/servers]', e);
    return genericError(res);
  }
});

async function canAccessGuild(req, guildId) {
  if (['dev', 'admin'].includes(req.admin.role)) return true;
  const discordId = req.admin.discord_id;
  if (discordId) {
    const { data: ug } = await supaAdmin.from('user_guilds')
      .select('guild_id').eq('discord_id', discordId).eq('guild_id', guildId).maybeSingle();
    if (ug) return true;
  }
  if ((req.admin.assigned_guilds || []).includes(guildId)) return true;
  return false;
}

app.get('/api/me/servers/:guildId/stats', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) {
      await audit(req, 'access_denied', { success: false, error_reason: 'no_guild_access', metadata: { guild_id: req.params.guildId } });
      return res.status(403).json({ ok: false, error: 'Sem acesso' });
    }
    const gid = req.params.guildId;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [ticketsOpen, bets, orders, g] = await Promise.all([
      supaAdmin.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', gid).is('closed_at', null),
      supaAdmin.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', gid).gte('created_at', since),
      supaAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', gid).eq('status', 'delivered').gte('created_at', since),
      supaAdmin.from('bot_guilds').select('member_count, name, icon').eq('guild_id', gid).maybeSingle(),
    ]);
    res.json({ ok: true, guild: g.data, stats: {
      members: g.data?.member_count || 0,
      tickets_open: ticketsOpen.count || 0,
      bets_30d: bets.count || 0,
      orders_30d: orders.count || 0,
    }});
  } catch (e) { return genericError(res); }
});

app.get('/api/me/servers/:guildId/tickets', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    const { data } = await supaAdmin.from('ticket_data').select('*').eq('guild_id', req.params.guildId).order('opened_at', { ascending: false }).limit(50);
    res.json({ ok: true, tickets: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/servers/:guildId/products', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    const { data } = await supaAdmin.from('products').select('*').eq('guild_id', req.params.guildId).order('id', { ascending: false }).limit(100);
    res.json({ ok: true, products: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/servers/:guildId/orders', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    const { data } = await supaAdmin.from('orders').select('*').eq('guild_id', req.params.guildId).order('id', { ascending: false }).limit(50);
    res.json({ ok: true, orders: data || [] });
  } catch (e) { return genericError(res); }
});

// FRIOBOTS STORE WEB — APIs com isolamento por servidor e CSRF
const storeAllowed = async (req,res) => {
  if (!(await canAccessGuild(req, req.params.guildId))) {
    res.status(403).json({ok:false,error:'Sem acesso a este servidor'}); return false;
  }
  return true;
};
const storeError = (res, error) => res.status(400).json({ok:false,error: error?.message || 'Operação não concluída'});
const storeId = v => /^\d{1,15}$/.test(String(v||'')) ? Number(v) : null;
const storeName = v => typeof v === 'string' ? v.trim().slice(0,120) : '';
app.get('/api/me/servers/:guildId/store/overview',requireAuth,async(req,res)=>{
  try {
    if (!(await storeAllowed(req,res))) return;
    const gid=req.params.guildId;
    const [pr,ct,co,od] = await Promise.all([
      supaAdmin.from('products').select('id,name,price,active,category_id,delivery_type').eq('guild_id',gid).order('id',{ascending:false}).limit(250),
      supaAdmin.from('categories').select('*').eq('guild_id',gid).limit(100),
      supaAdmin.from('coupons').select('id,code,type,value,max_uses,uses').eq('guild_id',gid).limit(100),
      supaAdmin.from('orders').select('id,status,total,created_at,user_id').eq('guild_id',gid).order('id',{ascending:false}).limit(250)
    ]);
    for(const r of [pr,ct,co,od]) if(r.error) return storeError(res,r.error);
    const ids=(pr.data||[]).map(x=>x.id);
    let inv=[];
    if(ids.length){const r=await supaAdmin.from('inventory').select('id,product_id,status').eq('guild_id',gid).in('product_id',ids).limit(3000);if(r.error) return storeError(res,r.error);inv=r.data||[];}
    const counts={};for(const i of inv){counts[i.product_id] ||= {available:0,sold:0};counts[i.product_id][i.status]=(counts[i.product_id][i.status]||0)+1;}
    const orders=od.data||[];
    res.json({ok:true,products:(pr.data||[]).map(x=>({...x,stock:counts[x.id]||{available:0,sold:0}})),categories:ct.data||[],coupons:co.data||[],orders,metrics:{orders:orders.length,delivered:orders.filter(o=>o.status==='delivered').length,revenue:orders.filter(o=>o.status==='delivered').reduce((n,o)=>n+Number(o.total||0),0)}});
  }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/products',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;
 const b=req.body||{};const name=storeName(b.name),price=Number(b.price);
 if(!name||!Number.isFinite(price)||price<0||price>1e7)return res.status(400).json({ok:false,error:'Nome ou preço inválido'});
 const categoryId=b.category_id?storeId(b.category_id):null;
 if(b.category_id&&!categoryId)return res.status(400).json({ok:false,error:'Categoria inválida'});
 if(categoryId){const c=await supaAdmin.from('categories').select('id').eq('guild_id',req.params.guildId).eq('id',categoryId).maybeSingle();if(!c.data)return res.status(400).json({ok:false,error:'Categoria não pertence ao servidor'});}
 const payload={name,price,description:storeName(b.description).slice(0,120),active:b.active!==false,delivery_type:['key','text','file','link','role','manual'].includes(b.delivery_type)?b.delivery_type:'key',category_id:categoryId};
 let q=supaAdmin.from('products');
 if(b.id){const id=storeId(b.id);if(!id)return res.status(400).json({ok:false,error:'Produto inválido'});q=q.update(payload).eq('id',id).eq('guild_id',req.params.guildId);}else{payload.guild_id=req.params.guildId;payload.slug=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').slice(0,38)+'-'+Date.now().toString(36);q=q.insert(payload);}
 const r=await q.select('id').single();if(r.error)return storeError(res,r.error);
 await audit(req,'store_product_write',{metadata:{guild_id:req.params.guildId,product_id:r.data.id}});res.json({ok:true,id:r.data.id});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/categories',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;const name=storeName(req.body?.name);if(!name)return res.status(400).json({ok:false,error:'Nome obrigatório'});
 const r=await supaAdmin.from('categories').insert({guild_id:req.params.guildId,name,emoji:null}).select('id').single();if(r.error)return storeError(res,r.error);res.json({ok:true,id:r.data.id});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/coupons',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;const b=req.body||{};const code=storeName(b.code).toUpperCase();const type=b.type==='fixed'?'fixed':'percent';const value=Number(b.value),max=Number(b.max_uses||0);
 if(!/^[A-Z0-9_-]{3,30}$/.test(code)||!Number.isFinite(value)||value<=0||(type==='percent'&&value>100)||!Number.isInteger(max)||max<0||max>1000000)return res.status(400).json({ok:false,error:'Cupom inválido'});
 const r=await supaAdmin.from('coupons').upsert({guild_id:req.params.guildId,code,type,value,max_uses:max},{onConflict:'guild_id,code'});if(r.error)return storeError(res,r.error);res.json({ok:true});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/stock',requireAuth,csrfProtect,rateLimit(15,60*1000),async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;const id=storeId(req.body?.product_id);if(!id)return res.status(400).json({ok:false,error:'Produto inválido'});
 const product=await supaAdmin.from('products').select('id').eq('guild_id',req.params.guildId).eq('id',id).maybeSingle();if(!product.data)return res.status(404).json({ok:false,error:'Produto não encontrado'});
 const items=String(req.body?.items||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(!items.length||items.length>100||items.some(x=>x.length>3000))return res.status(400).json({ok:false,error:'Envie de 1 a 100 itens, com até 3000 caracteres cada'});
 const r=await supaAdmin.from('inventory').insert(items.map(content=>({guild_id:req.params.guildId,product_id:id,content,status:'available'})));if(r.error)return storeError(res,r.error);
 await audit(req,'store_stock_add',{metadata:{guild_id:req.params.guildId,product_id:id,count:items.length}});res.json({ok:true,added:items.length});
 }catch(e){return genericError(res)}
});

// FRIOBOTS STORE V5 — extensões não destrutivas. Dados exclusivos de cada guild.
const storeText=(s,n=500)=>typeof s==='string'?s.trim().slice(0,n):'';
const storeAudit=async (gid,actor,action,metadata={})=>{try{await supaAdmin.from('frio_store_audit').insert({guild_id:gid,actor_id:String(actor||''),action,metadata});}catch(_){}};
app.get('/api/me/servers/:guildId/store/extras',requireAuth,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;const gid=req.params.guildId;
 const [profile,loyalty,reviews,campaigns]=await Promise.all([
 supaAdmin.from('frio_store_profiles').select('*').eq('guild_id',gid).maybeSingle(),
 supaAdmin.from('frio_store_loyalty').select('user_id,points,purchases').eq('guild_id',gid).order('points',{ascending:false}).limit(30),
 supaAdmin.from('frio_store_reviews').select('id,order_id,user_id,rating,comment,created_at').eq('guild_id',gid).order('id',{ascending:false}).limit(50),
 supaAdmin.from('frio_store_campaigns').select('*').eq('guild_id',gid).order('created_at',{ascending:false}).limit(100)]);
 for(const r of [profile,loyalty,reviews,campaigns])if(r.error)return storeError(res,r.error);
 res.json({ok:true,profile:profile.data||null,loyalty:loyalty.data||[],reviews:reviews.data||[],campaigns:campaigns.data||[]});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/profile',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;const gid=req.params.guildId,b=req.body||{};
 const display_name=storeText(b.display_name,80),description=storeText(b.description,800),brand_color=storeText(b.brand_color,7);
 if(!display_name||!/^#[0-9a-fA-F]{6}$/.test(brand_color))return res.status(400).json({ok:false,error:'Nome ou cor inválidos'});
 const payload={guild_id:gid,display_name,description,brand_color,updated_at:new Date().toISOString()};
 const r=await supaAdmin.from('frio_store_profiles').upsert(payload,{onConflict:'guild_id'});if(r.error)return storeError(res,r.error);
 await storeAudit(gid,req.user?.id,'profile_update');res.json({ok:true});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/campaigns',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;const gid=req.params.guildId,b=req.body||{};
 const title=storeText(b.title,100),description=storeText(b.description,500),discount=Number(b.discount_percent),start=Date.parse(b.starts_at),end=Date.parse(b.ends_at);
 if(!title||!Number.isFinite(discount)||discount<0||discount>100||!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return res.status(400).json({ok:false,error:'Campanha inválida'});
 const payload={guild_id:gid,title,description,discount_percent:discount,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),active:b.active!==false};
 const r=await supaAdmin.from('frio_store_campaigns').insert(payload).select('id').single();if(r.error)return storeError(res,r.error);
 await storeAudit(gid,req.user?.id,'campaign_created',{id:r.data.id});res.json({ok:true,id:r.data.id});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/campaigns/:id/status',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;
 const id=storeId(req.params.id);if(!id||typeof req.body?.active!=='boolean')return res.status(400).json({ok:false,error:'Dados inválidos'});
 const r=await supaAdmin.from('frio_store_campaigns').update({active:req.body.active}).eq('guild_id',req.params.guildId).eq('id',id).select('id');if(r.error)return storeError(res,r.error);
 if(!r.data?.length)return res.status(404).json({ok:false,error:'Campanha não encontrada'});
 res.json({ok:true});}catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/products/:id/status',requireAuth,csrfProtect,async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;
 const id=storeId(req.params.id);if(!id||typeof req.body?.active!=='boolean')return res.status(400).json({ok:false,error:'Dados inválidos'});
 const r=await supaAdmin.from('products').update({active:req.body.active}).eq('guild_id',req.params.guildId).eq('id',id).select('id');if(r.error)return storeError(res,r.error);
 if(!r.data?.length)return res.status(404).json({ok:false,error:'Produto não encontrado'});
 await storeAudit(req.params.guildId,req.user?.id,'product_status',{id,active:req.body.active});res.json({ok:true});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/store/loyalty/adjust',requireAuth,csrfProtect,rateLimit(10,60000),async(req,res)=>{
 try{if(!(await storeAllowed(req,res)))return;
 const gid=req.params.guildId,user_id=storeText(req.body?.user_id,25),delta=Number(req.body?.delta);
 if(!/^\d{15,22}$/.test(user_id)||!Number.isSafeInteger(delta)||Math.abs(delta)>100000)return res.status(400).json({ok:false,error:'Usuário ou pontos inválidos'});
 const old=await supaAdmin.from('frio_store_loyalty').select('points,purchases').eq('guild_id',gid).eq('user_id',user_id).maybeSingle();if(old.error)return storeError(res,old.error);
 const next=(old.data?.points||0)+delta;if(next<0)return res.status(400).json({ok:false,error:'Pontos insuficientes'});
 const r=await supaAdmin.from('frio_store_loyalty').upsert({guild_id:gid,user_id,points:next,purchases:old.data?.purchases||0,updated_at:new Date().toISOString()},{onConflict:'guild_id,user_id'});if(r.error)return storeError(res,r.error);
 await storeAudit(gid,req.user?.id,'loyalty_adjust',{user_id,delta});res.json({ok:true,points:next});
 }catch(e){return genericError(res)}
});
app.post('/api/me/servers/:guildId/take-members', requireAdmin, csrfProtect, rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) return res.status(500).json({ ok: false, error: 'OAuth não configurado' });

    const limit = Math.min(Number(req.body?.limit) || 20, 50);
    const gid = req.params.guildId;
    const { data: vers } = await supaAdmin.from('verifications').select('user_id, access_token, refresh_token, expires_at').limit(limit);
    if (!vers?.length) return res.json({ ok: true, added: 0, failed: 0, total: 0 });

    let added = 0, failed = 0;
    for (const v of vers) {
      let token = v.access_token;
      if (v.expires_at && new Date(v.expires_at) <= new Date()) {
        try {
          const r = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
              grant_type: 'refresh_token', refresh_token: v.refresh_token,
            }),
          });
          const rd = await r.json();
          if (rd.access_token) {
            token = rd.access_token;
            await supaAdmin.from('verifications').update({
              access_token: rd.access_token, refresh_token: rd.refresh_token,
              expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
            }).eq('user_id', v.user_id);
          } else { failed++; continue; }
        } catch { failed++; continue; }
      }
      try {
        const r = await fetch(`https://discord.com/api/v10/guilds/${gid}/members/${v.user_id}`, {
          method: 'PUT',
          headers: { Authorization: `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token }),
        });
        if (r.ok || r.status === 204) added++; else failed++;
      } catch { failed++; }
      await sleep(1100);
    }
    await audit(req, 'take_members', { metadata: { guild_id: gid, added, failed, total: vers.length } });
    res.json({ ok: true, added, failed, total: vers.length });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV — SERVIDORES
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/servers', requireDev, async (req, res) => {
  try {
    const { min_members, has_premium } = req.query;
    const search = safeSearch(req.query.search);
    const limit = intParam(req.query.limit, 100, 1, 200);
    const offset = intParam(req.query.offset, 0, 0, 100000);
    let q = supaAdmin.from('bot_guilds').select('*', { count: 'exact' }).eq('in_guild', true);
    if (search) q = q.or(`name.ilike.%${search}%,guild_id.eq.${search}`);
    if (Number.isFinite(Number(min_members)) && min_members !== undefined && min_members !== '') q = q.gte('member_count', Number(min_members));
    q = q.order('member_count', { ascending: false });
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const ids = (data || []).map(g => g.guild_id);
    const premiumIds = new Set();
    if (ids.length) {
      const { data: fps } = await supaAdmin.from('force_premium').select('target_id').eq('scope', 'guild').in('target_id', ids);
      const { data: cfgs } = await supaAdmin.from('configs').select('guild_id').in('guild_id', ids).eq('is_premium', true);
      for (const f of fps || []) premiumIds.add(f.target_id);
      for (const c of cfgs || []) premiumIds.add(c.guild_id);
    }

    const enriched = (data || []).map(g => ({ ...g, is_premium: premiumIds.has(g.guild_id) }));
    const filtered = has_premium === 'true' ? enriched.filter(g => g.is_premium)
                   : has_premium === 'false' ? enriched.filter(g => !g.is_premium)
                   : enriched;

    res.json({ ok: true, servers: filtered, total: count || 0 });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/servers/:guildId/full', requireDev, async (req, res) => {
  try {
    const gid = req.params.guildId;
    const [g, cfg, ff, fps, tickets, bets, orders, products] = await Promise.all([
      supaAdmin.from('bot_guilds').select('*').eq('guild_id', gid).maybeSingle(),
      supaAdmin.from('configs').select('*').eq('guild_id', gid).maybeSingle(),
      supaAdmin.from('ff_config').select('*').eq('guild_id', gid).maybeSingle(),
      supaAdmin.from('force_premium').select('*').eq('scope', 'guild').eq('target_id', gid).maybeSingle(),
      supaAdmin.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', gid).is('closed_at', null),
      supaAdmin.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', gid),
      supaAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', gid).eq('status', 'delivered'),
      supaAdmin.from('products').select('*', { count: 'exact', head: true }).eq('guild_id', gid),
    ]);
    res.json({
      ok: true,
      guild: g.data, config: cfg.data, ff: ff.data, force_premium: fps.data,
      counts: {
        tickets_open: tickets.count || 0,
        bets_total: bets.count || 0,
        orders_delivered: orders.count || 0,
        products: products.count || 0,
      },
    });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/leave', requireDev, csrfProtect, async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const r = await fetch(`https://discord.com/api/v10/users/@me/guilds/${gid}`, {
      method: 'DELETE', headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
    });
    if (!r.ok && r.status !== 204) {
      const err = await r.json().catch(() => ({}));
      return res.status(400).json({ ok: false, error: err.message || `Discord HTTP ${r.status}` });
    }
    await supaAdmin.from('bot_guilds').update({ in_guild: false }).eq('guild_id', gid);
    await audit(req, 'force_leave_guild', { metadata: { guild_id: gid } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/rename', requireDev, csrfProtect, async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ ok: false, error: 'Nome inválido (1-100 chars)' });
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(400).json({ ok: false, error: err.message || `Discord HTTP ${r.status}` });
    }
    await supaAdmin.from('bot_guilds').update({ name }).eq('guild_id', gid);
    await audit(req, 'force_rename_guild', { metadata: { guild_id: gid, name } });
    res.json({ ok: true, name });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/refresh', requireDev, csrfProtect, async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}?with_counts=true`, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(400).json({ ok: false, error: err.message || `Discord HTTP ${r.status}` });
    }
    const d = await r.json();
    await supaAdmin.from('bot_guilds').upsert({
      guild_id: d.id, name: d.name,
      member_count: d.approximate_member_count || 0,
      icon: d.icon ? `https://cdn.discordapp.com/icons/${d.id}/${d.icon}.png` : null,
      owner_id: d.owner_id, in_guild: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    await audit(req, 'refresh_guild', { metadata: { guild_id: gid } });
    res.json({ ok: true, guild: { id: d.id, name: d.name, member_count: d.approximate_member_count || 0 } });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/nuke', requireDev, csrfProtect, rateLimit(3, 60 * 60 * 1000), async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const confirmName = String(req.body?.confirm || '').trim();
    if (confirmName !== 'CONFIRMAR') return res.status(400).json({ ok: false, error: 'Digite CONFIRMAR para prosseguir' });

    let deletedChannels = 0, deletedRoles = 0;
    try {
      const chRes = await fetch(`https://discord.com/api/v10/guilds/${gid}/channels`, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
      if (chRes.ok) {
        const channels = await chRes.json();
        for (const ch of channels) {
          const dr = await fetch(`https://discord.com/api/v10/channels/${ch.id}`, { method: 'DELETE', headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
          if (dr.ok) deletedChannels++;
          await sleep(300);
        }
      }
    } catch {}
    try {
      const roleRes = await fetch(`https://discord.com/api/v10/guilds/${gid}/roles`, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
      if (roleRes.ok) {
        const roles = await roleRes.json();
        for (const role of roles) {
          if (role.name === '@everyone' || role.managed) continue;
          const dr = await fetch(`https://discord.com/api/v10/guilds/${gid}/roles/${role.id}`, { method: 'DELETE', headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
          if (dr.ok) deletedRoles++;
          await sleep(300);
        }
      }
    } catch {}
    await audit(req, 'nuke_guild', { metadata: { guild_id: gid, deletedChannels, deletedRoles } });
    res.json({ ok: true, deletedChannels, deletedRoles });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV — USUÁRIOS
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/usuarios', requireDev, async (req, res) => {
  try {
    const { role, ativo, plan } = req.query;
    const search = safeSearch(req.query.search);
    const limit = intParam(req.query.limit, 100, 1, 200);
    const offset = intParam(req.query.offset, 0, 0, 100000);
    let q = supaAdmin.from('panel_admins').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (ROLES.includes(role)) q = q.eq('role', role);
    if (PLANS.includes(plan)) q = q.eq('plan', plan);
    if (ativo === 'true') q = q.eq('ativo', true);
    if (ativo === 'false') q = q.eq('ativo', false);
    if (search) q = q.or(`email.ilike.%${search}%,nome.ilike.%${search}%,discord_id.eq.${search}`);
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    // tokens de confirmação/reset nunca devem sair do servidor
    res.json({ ok: true, usuarios: (data || []).map(stripSecrets), total: count || 0 });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/usuarios/clientes', requireStaff, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('panel_admins')
      .select('user_id,email,nome,discord_id,role,plan,assigned_guilds')
      .eq('ativo', true).in('role', ['cliente', 'funcionario']).order('nome');
    res.json({ ok: true, clientes: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/usuarios/pending', requireDev, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('panel_admins').select('*').eq('role', 'pending').order('created_at', { ascending: false });
    res.json({ ok: true, pendentes: (data || []).map(stripSecrets) });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/usuarios', requireDev, csrfProtect, async (req, res) => {
  try {
    const { email, discord_id, password, role, plan, assigned_guilds, notes, nome } = req.body || {};
    if (!email || !role) return res.status(400).json({ ok: false, error: 'Email e role obrigatórios' });
    if (!ROLES.includes(role)) return res.status(400).json({ ok: false, error: 'Role inválido' });
    if (plan && !PLANS.includes(plan)) return res.status(400).json({ ok: false, error: 'Plano inválido' });
    if (!discord_id) return res.status(400).json({ ok: false, error: 'Discord ID obrigatório', code: 'DISCORD_ID_REQUIRED' });

    const discordIdClean = cleanId(discord_id);
    if (!isValidDiscordId(discordIdClean)) return res.status(400).json({ ok: false, error: 'Discord ID inválido' });

    const emailNorm = String(email).toLowerCase().trim();
    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id').eq('email', emailNorm).maybeSingle();
    if (existing) return res.status(400).json({ ok: false, error: 'E-mail já cadastrado', code: 'EMAIL_TAKEN' });

    const { data: existingDiscord } = await supaAdmin.from('panel_admins').select('user_id').eq('discord_id', discordIdClean).maybeSingle();
    if (existingDiscord) return res.status(409).json({ ok: false, error: 'Discord ID já cadastrado', code: 'DISCORD_ID_TAKEN' });

    if (password !== undefined && password !== null && password !== '' && (typeof password !== 'string' || password.length < 8 || password.length > 128)) {
      return res.status(400).json({ ok: false, error: 'Senha deve ter entre 8 e 128 caracteres' });
    }
    const finalPassword = password ? password : genPassword(14);
    const { data: authData, error: authErr } = await supaAdmin.auth.admin.createUser({
      email: emailNorm, password: finalPassword, email_confirm: true,
    });
    if (authErr) return res.status(400).json({ ok: false, error: authErr.message });

    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: authData.user.id, email: emailNorm,
      nome: safeStr(nome, 60) || emailNorm.split('@')[0],
      role, plan: plan || 'basic', ativo: true, is_owner: false,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      discord_id: discordIdClean,
      assigned_guilds: sanitizeGuildIds(assigned_guilds),
      notes: safeStr(notes, 1000),
      approved_at: new Date().toISOString(),
      approved_by: req.user.email,
      email_confirmed: true,
    });
    if (dbErr) {
      await supaAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ ok: false, error: dbErr.message });
    }

    await audit(req, `add_${role}`, {
      target_id: authData.user.id, target_role: role,
      metadata: { email: emailNorm, plan, discord_id: discordIdClean },
    });
    // A senha temporária é mostrada só para quem criou a conta (resposta abaixo) — nunca gravada em notificação.
    await notify(authData.user.id, 'system', 'Bem-vindo!',
      `Conta (${role} · ${plan || 'basic'}) criada. Use a senha temporária enviada pelo administrador e troque-a no primeiro acesso.`,
      { role, plan });

    res.json({ ok: true, user_id: authData.user.id, temp_password: finalPassword });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/usuarios/:userId/approve', requireDev, csrfProtect, async (req, res) => {
  try {
    const { role, plan, assigned_guilds, notes } = req.body || {};
    if (!ROLES.includes(role) || role === 'pending') return res.status(400).json({ ok: false, error: 'Role inválido' });
    if (plan && !PLANS.includes(plan)) return res.status(400).json({ ok: false, error: 'Plano inválido' });

    const { data: target } = await supaAdmin.from('panel_admins').select('user_id').eq('user_id', req.params.userId).maybeSingle();
    if (!target) return res.status(404).json({ ok: false, error: 'Usuário não encontrado' });

    const { error } = await supaAdmin.from('panel_admins').update({
      role, plan: plan || 'basic', ativo: true,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      assigned_guilds: sanitizeGuildIds(assigned_guilds),
      notes: safeStr(notes, 1000),
      approved_at: new Date().toISOString(),
      approved_by: req.user.email,
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    invalidateAuthCache(req.params.userId);
    await audit(req, 'approve_user', { target_id: req.params.userId, target_role: role });
    await notify(req.params.userId, 'system', 'Aprovado!', `Você é ${role} · ${plan || 'basic'}.`, { role, plan });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.patch('/api/dev/usuarios/:userId/plan', requireDev, csrfProtect, async (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!PLANS.includes(plan)) return res.status(400).json({ ok: false, error: 'Plano inválido' });
    const { error } = await supaAdmin.from('panel_admins').update({ plan, updated_at: new Date().toISOString() }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    invalidateAuthCache(req.params.userId);
    await audit(req, 'change_plan', { target_id: req.params.userId, metadata: { plan } });
    await notify(req.params.userId, 'system', 'Plano alterado!', `Seu plano agora é ${String(plan).toUpperCase()}.`, { plan });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ⚡ PATCH atualizado — agora aceita e-mail, discord_id e assigned_guilds
app.patch('/api/dev/usuarios/:userId', requireDev, csrfProtect, async (req, res) => {
  try {
    const { role, ativo, nome, discord_id, assigned_guilds, notes, plan, banned, email } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    let newEmail = null;

    const { data: targetRow } = await supaAdmin.from('panel_admins').select('user_id,email,role').eq('user_id', req.params.userId).maybeSingle();
    if (!targetRow) return res.status(404).json({ ok: false, error: 'Usuário não encontrado' });

    // Um dev não pode se rebaixar/desativar/banir (ficaria sem acesso), nem banir/desativar outro dev
    const isSelf = req.params.userId === req.user.id;
    const losesAccess = (role && role !== targetRow.role && targetRow.role === 'dev') || ativo === false || banned === true;
    if (targetRow.role === 'dev' && losesAccess) {
      return res.status(400).json({ ok: false, error: isSelf ? 'Você não pode remover o próprio acesso de DEV.' : 'Não é permitido rebaixar, desativar ou banir outro DEV.' });
    }
    if (isSelf && losesAccess) {
      return res.status(400).json({ ok: false, error: 'Você não pode desativar ou banir a si mesmo.' });
    }

    if (role && ROLES.includes(role)) {
      patch.role = role;
      patch.pode_gerar_keys = ['dev', 'admin', 'funcionario'].includes(role);
    }
    if (plan && PLANS.includes(plan)) patch.plan = plan;
    if (typeof ativo === 'boolean') patch.ativo = ativo;
    if (typeof banned === 'boolean') patch.banned = banned;
    if (nome) patch.nome = safeStr(nome, 60);

    // ─── E-mail ───
    if (email !== undefined) {
      const emailNorm = String(email).toLowerCase().trim();
      if (!isValidEmail(emailNorm)) {
        return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
      }
      const target = targetRow;
      if (target && emailNorm !== String(target.email || '').toLowerCase()) {
        const { data: existing } = await supaAdmin
          .from('panel_admins')
          .select('user_id')
          .eq('email', emailNorm)
          .neq('user_id', req.params.userId)
          .maybeSingle();
        if (existing) {
          return res.status(409).json({ ok: false, error: 'E-mail já cadastrado em outra conta.', code: 'EMAIL_TAKEN' });
        }
        patch.email = emailNorm;
        newEmail = emailNorm;
      }
    }

    // ─── Discord ID ───
    if (discord_id !== undefined) {
      if (discord_id) {
        const clean = cleanId(discord_id);
        if (!isValidDiscordId(clean)) {
          return res.status(400).json({ ok: false, error: 'Discord ID inválido' });
        }
        const { data: existingDiscord } = await supaAdmin
          .from('panel_admins')
          .select('user_id')
          .eq('discord_id', clean)
          .neq('user_id', req.params.userId)
          .maybeSingle();
        if (existingDiscord) {
          return res.status(409).json({ ok: false, error: 'Discord ID já cadastrado em outra conta.', code: 'DISCORD_ID_TAKEN' });
        }
        patch.discord_id = clean;
      } else {
        patch.discord_id = null;
      }
    }

    if (Array.isArray(assigned_guilds)) patch.assigned_guilds = sanitizeGuildIds(assigned_guilds);
    if (notes !== undefined) patch.notes = safeStr(notes, 1000);

    // Atualiza Supabase Auth primeiro se o e-mail mudou
    if (newEmail) {
      const { error: authErr } = await supaAdmin.auth.admin.updateUserById(req.params.userId, {
        email: newEmail,
        email_confirm: true,
      });
      if (authErr) {
        return res.status(400).json({ ok: false, error: `Falha ao atualizar e-mail: ${authErr.message}` });
      }
    }

    const { error } = await supaAdmin.from('panel_admins').update(patch).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    if (patch.ativo === false || patch.banned === true) {
      await supaAdmin.from('active_sessions').delete().eq('user_id', req.params.userId);
    }
    invalidateAuthCache(req.params.userId);
    await audit(req, 'update_user', { target_id: req.params.userId, metadata: patch });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.delete('/api/dev/usuarios/:userId', requireDev, csrfProtect, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ ok: false, error: 'Não pode remover a si mesmo' });
    const { data: target } = await supaAdmin.from('panel_admins').select('role').eq('user_id', req.params.userId).maybeSingle();
    if (target?.role === 'dev') return res.status(400).json({ ok: false, error: 'Não pode remover outro DEV' });

    const { error } = await supaAdmin.from('panel_admins').update({ ativo: false, banned: true }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    await supaAdmin.from('active_sessions').delete().eq('user_id', req.params.userId);
    invalidateAuthCache(req.params.userId);
    await audit(req, 'deactivate_user', { target_id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════
app.post('/api/keys/generate', requireStaff, csrfProtect, rateLimit(20, 60 * 1000), async (req, res) => {
  try {
    const { tier, duracao_dias, quantidade = 1, max_usos = 1, motivo, validade_key_dias } = req.body || {};
    if (!TIERS.includes(tier)) return res.status(400).json({ ok: false, error: 'Tier inválido' });
    if (![7, 15, 30, 90, 180, 365, 0].includes(Number(duracao_dias))) return res.status(400).json({ ok: false, error: 'Duração inválida' });
    const qty = intParam(quantidade, 1, 1, 50);
    const usos = intParam(max_usos, 1, 1, 1000);
    const validade = intParam(validade_key_dias, 0, 0, 3650);
    const expiresKey = validade > 0 ? new Date(Date.now() + validade * 86400000).toISOString() : null;

    const rows = Array.from({ length: qty }, () => ({
      key_code: genKeyCode(), tier, duracao_dias: Number(duracao_dias),
      max_usos: usos, usos_atuais: 0,
      gerado_por: req.user.id, gerado_por_email: req.user.email,
      motivo: safeStr(motivo, 200), expira_em: expiresKey, ativo: true, is_pack: false,
    }));
    // um único INSERT: ou todas as keys são criadas ou nenhuma (antes podia falhar no meio do loop)
    const { data, error } = await supaAdmin.from('premium_keys').insert(rows).select();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    await audit(req, 'generate_keys', { metadata: { tier, quantidade: (data || []).length } });
    res.json({ ok: true, keys: data || [] });
  } catch (e) { return genericError(res); }
});

app.post('/api/keys/generate-pack', requireDev, csrfProtect, rateLimit(10, 60 * 1000), async (req, res) => {
  try {
    const { quantidade = 1, motivo } = req.body || {};
    const qty = intParam(quantidade, 1, 1, 20);
    const packContents = { tiers: ['basic','premium','ultra','unlimited'], durations: [7,15,30], quantity_each: 5, total: 60 };
    const rows = Array.from({ length: qty }, () => ({
      key_code: genKeyCode(), tier: 'pack', duracao_dias: 0,
      max_usos: 1, usos_atuais: 0,
      gerado_por: req.user.id, gerado_por_email: req.user.email,
      motivo: safeStr(motivo, 200), ativo: true, is_pack: true,
      pack_contents: packContents,
    }));
    const { data, error } = await supaAdmin.from('premium_keys').insert(rows).select();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    await audit(req, 'generate_pack', { metadata: { quantidade: (data || []).length } });
    res.json({ ok: true, packs: data || [] });
  } catch (e) { return genericError(res); }
});

app.post('/api/keys/redeem-pack', requireDev, csrfProtect, async (req, res) => {
  try {
    const { key_id } = req.body || {};
    if (!key_id) return res.status(400).json({ ok: false, error: 'key_id obrigatório' });
    const { data: pack } = await supaAdmin.from('premium_keys').select('*').eq('id', key_id).maybeSingle();
    if (!pack) return res.status(404).json({ ok: false, error: 'Pack não encontrado' });
    if (!pack.is_pack) return res.status(400).json({ ok: false, error: 'Não é um pack' });

    // "Reivindica" o pack de forma atômica ANTES de gerar as keys: dois cliques/abas simultâneos
    // não geram 120 keys a partir do mesmo pack.
    const { data: claimed } = await supaAdmin.from('premium_keys')
      .update({ ativo: false, usos_atuais: 1 })
      .eq('id', pack.id).eq('is_pack', true).eq('ativo', true)
      .select('id').maybeSingle();
    if (!claimed) return res.status(400).json({ ok: false, error: 'Pack já resgatado' });

    const rows = [];
    for (const tier of ['basic', 'premium', 'ultra', 'unlimited']) {
      for (const dias of [7, 15, 30]) {
        for (let i = 0; i < 5; i++) {
          rows.push({
            key_code: genKeyCode(), tier, duracao_dias: dias,
            max_usos: 1, usos_atuais: 0,
            gerado_por: req.user.id, gerado_por_email: req.user.email,
            motivo: 'Pack', ativo: true,
            is_pack: false, generated_from_pack: String(pack.id),
          });
        }
      }
    }
    const { data: geradas, error } = await supaAdmin.from('premium_keys').insert(rows).select();
    if (error) {
      // devolve o pack para não perdê-lo
      await supaAdmin.from('premium_keys').update({ ativo: true, usos_atuais: 0 }).eq('id', pack.id);
      return res.status(500).json({ ok: false, error: 'Falha ao gerar as keys do pack. Nada foi consumido.' });
    }
    await audit(req, 'redeem_pack', { metadata: { pack_id: pack.id, total: (geradas || []).length } });
    res.json({ ok: true, keys: geradas || [], total: (geradas || []).length });
  } catch (e) { return genericError(res); }
});

app.get('/api/keys', requireStaff, async (req, res) => {
  try {
    const { status, tier, include_packs } = req.query;
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0, 100000);
    let q = supaAdmin.from('premium_keys').select('*').order('created_at', { ascending: false });
    if (include_packs !== 'true') q = q.eq('is_pack', false);
    if (status === 'active') q = q.eq('ativo', true);
    if (status === 'used') q = q.eq('ativo', false);
    if (TIERS.includes(tier) || tier === 'pack') q = q.eq('tier', tier);
    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, keys: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/keys/packs', requireDev, async (req, res) => {
  try {
    const { data, error } = await supaAdmin.from('premium_keys').select('*').eq('is_pack', true).order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, packs: data || [] });
  } catch (e) { return genericError(res); }
});

app.post('/api/keys/send', requireStaff, csrfProtect, async (req, res) => {
  try {
    const { key_id, user_id } = req.body || {};
    if (!key_id || !user_id) return res.status(400).json({ ok: false, error: 'key_id e user_id obrigatórios' });
    const { data: key } = await supaAdmin.from('premium_keys').select('*').eq('id', key_id).maybeSingle();
    if (!key) return res.status(404).json({ ok: false, error: 'Key não encontrada' });
    if (!key.ativo) return res.status(400).json({ ok: false, error: 'Esta key já foi utilizada ou está desativada.' });
    const { data: target } = await supaAdmin.from('panel_admins').select('user_id,email,nome,ativo').eq('user_id', user_id).maybeSingle();
    if (!target) return res.status(404).json({ ok: false, error: 'Usuário não encontrado' });
    if (!target.ativo) return res.status(400).json({ ok: false, error: 'Usuário inativo' });

    await supaAdmin.from('premium_keys').update({ sent_to: user_id, sent_at: new Date().toISOString() }).eq('id', key_id);
    const label = key.is_pack ? 'Pack de Keys' : String(key.tier || 'key').toUpperCase();
    await notify(user_id, 'key_received', `${label} recebido!`, `Código: ${key.key_code}`,
      { key_id, key_code: key.key_code, tier: key.tier, is_pack: key.is_pack });

    if (!key.is_pack) await audit(req, 'send_key', { target_id: user_id, metadata: { key_id, key_code: key.key_code } });
    res.json({ ok: true, sent_to: target.email, key_code: key.key_code });
  } catch (e) { return genericError(res); }
});

app.delete('/api/keys/:id', requireDev, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('premium_keys').delete().eq('id', req.params.id);
    await audit(req, 'delete_key', { metadata: { key_id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.get('/api/redemptions', requireStaff, async (req, res) => {
  try {
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0, 100000);
    const { data } = await supaAdmin.from('premium_redemptions')
      .select('*').neq('tier', 'pack')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    res.json({ ok: true, redemptions: data || [] });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// CLIENTE
// ═══════════════════════════════════════════════════════════
app.get('/api/me/keys-sent', requireAuth, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('premium_keys').select('*').eq('sent_to', req.user.id).order('sent_at', { ascending: false }).limit(100);
    res.json({ ok: true, keys: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/orders', requireAuth, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('orders').select('*').eq('user_id', req.user.id).order('id', { ascending: false }).limit(100);
    res.json({ ok: true, orders: data || [] });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════
app.get('/api/me/sessions', requireAuth, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('active_sessions')
      .select('id, ip, browser, os, device_type, country, city, created_at, last_seen, expires_at')
      .eq('user_id', req.user.id)
      .gt('expires_at', new Date().toISOString())
      .order('last_seen', { ascending: false });
    res.json({ ok: true, sessions: data || [] });
  } catch (e) { return genericError(res); }
});

app.delete('/api/me/sessions/:sessionId', requireAuth, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('active_sessions').delete().eq('id', req.params.sessionId).eq('user_id', req.user.id);
    invalidateAuthCache(req.user.id);
    await audit(req, 'revoke_own_session', { metadata: { session_id: req.params.sessionId } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.delete('/api/me/sessions', requireAuth, csrfProtect, async (req, res) => {
  try {
    const hash = sha256(req.token);
    const { data: current } = await supaAdmin.from('active_sessions').select('id').eq('token_hash', hash).maybeSingle();
    let q = supaAdmin.from('active_sessions').delete().eq('user_id', req.user.id);
    if (current?.id) q = q.neq('id', current.id);
    await q;
    invalidateAuthCache(req.user.id);
    await audit(req, 'revoke_all_sessions');
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/user/:userId/sessions', requireDev, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('active_sessions')
      .select('*').eq('user_id', req.params.userId)
      .gt('expires_at', new Date().toISOString())
      .order('last_seen', { ascending: false });
    await audit(req, 'view_user_sessions', { target_id: req.params.userId });
    res.json({ ok: true, sessions: data || [] });
  } catch (e) { return genericError(res); }
});

app.delete('/api/dev/user/:userId/sessions', requireDev, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('active_sessions').delete().eq('user_id', req.params.userId);
    invalidateAuthCache(req.params.userId);
    await audit(req, 'revoke_all_user_sessions', { target_id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/audit', requireDev, rateLimit(120, 60 * 1000), async (req, res) => {
  try {
    const { action, actor_id, target_id, ip, from, to, success } = req.query;
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0, 1000000);
    let q = supaAdmin.from('site_audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (action) q = q.eq('action', action);
    if (actor_id) q = q.eq('actor_id', actor_id);
    if (target_id) q = q.eq('target_id', target_id);
    if (ip) q = q.eq('ip', ip);
    if (success !== undefined) q = q.eq('success', success === 'true');
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, logs: data || [], total: count || 0 });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/audit/export', requireDev, rateLimit(5, 60 * 1000), async (req, res) => {
  try {
    const { from, to, action } = req.query;
    let q = supaAdmin.from('site_audit_log').select('*').order('created_at', { ascending: false }).limit(10000);
    if (action) q = q.eq('action', action);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data } = await q;

    const csv = ['id,created_at,actor_id,actor_email,action,target_id,target_role,ip,browser,os,device_type,country,city,success,error_reason'];
    for (const r of data || []) {
      csv.push([
        r.id, r.created_at, r.actor_id || '', csvCell(r.actor_email),
        csvCell(r.action), r.target_id || '', r.target_role || '',
        r.ip || '', csvCell(r.browser), csvCell(r.os), r.device_type || '',
        csvCell(r.country), csvCell(r.city),
        r.success !== false, csvCell(r.error_reason),
      ].join(','));
    }
    await audit(req, 'export_audit');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
    res.send('\ufeff' + csv.join('\n')); // BOM: o Excel abre acentos corretamente
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/audit/stats', requireDev, async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const [total, fails, logins7d, loginsFailed7d, accessDenied7d] = await Promise.all([
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('success', false),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'login').gte('created_at', since7d),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'login_failed').gte('created_at', since7d),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'access_denied').gte('created_at', since7d),
    ]);
    res.json({ ok: true, stats: {
      total: total.count || 0,
      failed: fails.count || 0,
      logins_7d: logins7d.count || 0,
      logins_failed_7d: loginsFailed7d.count || 0,
      access_denied_7d: accessDenied7d.count || 0,
    }});
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// BACKUP / SYNC
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/backup', requireDev, async (req, res) => {
  try {
    const tables = ['panel_admins','bot_guilds','user_guilds','premium_keys','premium_redemptions','site_notifications','site_audit_log','active_sessions'];
    const dump = { generated_at: new Date().toISOString(), tables: {} };
    for (const t of tables) {
      const { data } = await supaAdmin.from(t).select('*').limit(5000);
      // nunca exporta tokens de confirmação/reset nem hashes de sessão
      dump.tables[t] = (data || []).map((row) => {
        const { confirm_token, reset_token, token_hash, ...rest } = row;
        return rest;
      });
    }
    await audit(req, 'export_backup');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="frio-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/sync-servers', requireDev, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('bot_meta').upsert({
      key: 'force_sync_servers',
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    await audit(req, 'force_sync_servers');
    res.json({ ok: true, message: 'Sync agendado. O bot vai atualizar em até 1 minuto.' });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════
app.get('/api/admin/tickets-global', requireAdmin, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('ticket_data').select('*').is('closed_at', null).order('opened_at', { ascending: false }).limit(100);
    res.json({ ok: true, tickets: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/admin/financial', requireAdmin, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: orders } = await supaAdmin.from('orders').select('total,status,created_at').gte('created_at', since);
    const delivered = (orders || []).filter(o => o.status === 'delivered');
    const total = delivered.reduce((a, o) => a + Number(o.total || 0), 0);
    const daily = {};
    for (const o of delivered) {
      const d = o.created_at.substring(0, 10);
      daily[d] = (daily[d] || 0) + Number(o.total || 0);
    }
    res.json({
      ok: true,
      total, count: delivered.length,
      avg: delivered.length ? total / delivered.length : 0,
      daily: Object.entries(daily).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV TOOLS
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/kill-switch', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('kill_switch').select('*').eq('id', 1).maybeSingle();
  res.json({ ok: true, active: !!data?.active, reason: data?.reason });
});
app.post('/api/dev/kill-switch', requireDev, csrfProtect, async (req, res) => {
  const active = req.body?.active === true || req.body?.active === 'true';
  const reason = safeStr(req.body?.reason, 300);
  const { error } = await supaAdmin.from('kill_switch').upsert({
    id: 1, active, reason,
    enabled_by: req.user.id,
    enabled_at: active ? new Date().toISOString() : null,
  });
  if (error) return res.status(500).json({ ok: false, error: 'Não foi possível salvar.' });
  await audit(req, active ? 'kill_switch_on' : 'kill_switch_off', { metadata: { reason } });
  res.json({ ok: true });
});

app.get('/api/dev/maintenance', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  res.json({ ok: true, active: !!data?.active, reason: data?.reason });
});
app.post('/api/dev/maintenance', requireDev, csrfProtect, async (req, res) => {
  const active = req.body?.active === true || req.body?.active === 'true';
  const reason = safeStr(req.body?.reason, 300);
  const { error } = await supaAdmin.from('maintenance_mode').upsert({
    id: 1, active, reason,
    by: req.user.id,
    started_at: active ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return res.status(500).json({ ok: false, error: 'Não foi possível salvar.' });
  await audit(req, active ? 'maintenance_on' : 'maintenance_off', { metadata: { reason } });
  res.json({ ok: true });
});

app.get('/api/dev/force-premium', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('force_premium').select('*').order('granted_at', { ascending: false }).limit(200);
  res.json({ ok: true, items: data || [] });
});
app.post('/api/dev/force-premium', requireDev, csrfProtect, async (req, res) => {
  const { scope, days, reason } = req.body || {};
  const target_id = cleanId(req.body?.target_id);
  if (!['guild', 'user'].includes(scope) || !target_id) return res.status(400).json({ ok: false, error: 'scope e target_id obrigatórios' });
  if (!isValidDiscordId(target_id)) return res.status(400).json({ ok: false, error: 'ID alvo inválido (15–25 dígitos).' });
  const nDays = Number(days || 0);
  if (!Number.isFinite(nDays) || nDays < 0 || nDays > 3650) return res.status(400).json({ ok: false, error: 'Dias inválidos (0 a 3650).' });
  const permanent = nDays === 0;
  const expires_at = permanent ? null : new Date(Date.now() + nDays * 86400000).toISOString();
  const { error } = await supaAdmin.from('force_premium').upsert({
    scope, target_id, permanent, expires_at,
    reason: safeStr(reason, 200),
    granted_by: req.user.id,
    granted_at: new Date().toISOString(),
  }, { onConflict: 'scope,target_id' });
  if (error) return res.status(500).json({ ok: false, error: 'Não foi possível salvar.' });
  await audit(req, 'force_premium_add', { metadata: { scope, target_id, days: nDays } });
  res.json({ ok: true });
});
app.delete('/api/dev/force-premium/:id', requireDev, csrfProtect, async (req, res) => {
  await supaAdmin.from('force_premium').delete().eq('id', req.params.id);
  await audit(req, 'force_premium_remove', { metadata: { id: req.params.id } });
  res.json({ ok: true });
});

app.post('/api/dev/broadcast', requireDev, csrfProtect, rateLimit(5, 60 * 1000), async (req, res) => {
  const title = safeStr(req.body?.title, 120);
  const content = safeStr(req.body?.content, 1000);
  const role = req.body?.role;
  if (!title || !content) return res.status(400).json({ ok: false, error: 'title e content obrigatórios' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ ok: false, error: 'Role inválido' });
  let q = supaAdmin.from('panel_admins').select('user_id').eq('ativo', true);
  if (role) q = q.eq('role', role);
  const { data: users } = await q;
  await notifyMany((users || []).map((u) => u.user_id), 'system', title, content);
  await audit(req, 'broadcast_global', { metadata: { title, role, count: (users || []).length } });
  res.json({ ok: true, sent: (users || []).length });
});

app.post('/api/dev/force-update', requireDev, csrfProtect, async (req, res) => {
  await supaAdmin.from('bot_meta').delete().eq('key', 'last_update_broadcast');
  await supaAdmin.from('guild_update_log').delete().neq('guild_id', 'x');
  await audit(req, 'force_update_reset');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const limit = intParam(req.query.limit, 30, 1, 100);
    const { data, error } = await supaAdmin.from('site_notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(limit);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const { count: unread } = await supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('read', false);
    res.json({ ok: true, notifications: data || [], unread: unread || 0 });
  } catch (e) { return genericError(res); }
});
app.patch('/api/notifications/:id/read', requireAuth, csrfProtect, async (req, res) => {
  await supaAdmin.from('site_notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});
app.post('/api/notifications/read-all', requireAuth, csrfProtect, async (req, res) => {
  await supaAdmin.from('site_notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false);
  res.json({ ok: true });
});
app.post('/api/dev/notifications', requireStaff, csrfProtect, async (req, res) => {
  try {
    const { user_id, broadcast_to_role } = req.body || {};
    const type = ['system', 'info', 'warning', 'key_received'].includes(req.body?.type) ? req.body.type : 'system';
    const title = safeStr(req.body?.title, 120);
    const content = safeStr(req.body?.content, 1000);
    if (!title || !content) return res.status(400).json({ ok: false, error: 'title e content obrigatórios' });
    if (broadcast_to_role) {
      // Só dev/admin podem mandar aviso em massa (funcionário não)
      if (!['dev', 'admin'].includes(req.admin.role)) return res.status(403).json({ ok: false, error: 'Permissão negada' });
      if (!ROLES.includes(broadcast_to_role)) return res.status(400).json({ ok: false, error: 'Role inválido' });
      const { data: targets } = await supaAdmin.from('panel_admins').select('user_id').eq('role', broadcast_to_role).eq('ativo', true);
      await notifyMany((targets || []).map((t) => t.user_id), type, title, content);
      await audit(req, 'broadcast_notification', { target_role: broadcast_to_role });
      return res.json({ ok: true, sent: (targets || []).length });
    }
    if (!user_id || !UUID_RE.test(String(user_id))) return res.status(400).json({ ok: false, error: 'user_id inválido' });
    await notify(user_id, type, title, content);
    await audit(req, 'send_notification', { target_id: user_id, metadata: { title, type } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// PÁGINAS PÚBLICAS
// ═══════════════════════════════════════════════════════════
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/confirm', (req, res) => res.sendFile(path.join(__dirname, 'public', 'confirm.html')));
app.get('/reset', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset.html')));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(
`User-agent: *
Allow: /
Allow: /terms
Allow: /privacy
Disallow: /app
Disallow: /login
Disallow: /register
Disallow: /api/

Sitemap: ${baseUrl()}/sitemap.xml`);
});

app.get('/sitemap.xml', (req, res) => {
  const base = baseUrl();
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/terms', priority: '0.5' },
    { loc: '/privacy', priority: '0.5' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${base}${u.loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  res.type('application/xml');
  res.send(xml);
});

// ═══════════════════════════════════════════════════════════
// FALLBACK — SPA do /app e 404
// ═══════════════════════════════════════════════════════════
app.get(/^\/app(\/.*)?$/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const isApi = req.path.startsWith('/api/');
  // corpo da requisição malformado/grande demais não é "erro interno"
  if (err?.type === 'entity.parse.failed') return isApi ? res.status(400).json({ ok: false, error: 'JSON inválido.' }) : res.status(400).send('Requisição inválida.');
  if (err?.type === 'entity.too.large') return isApi ? res.status(413).json({ ok: false, error: 'Conteúdo muito grande.' }) : res.status(413).send('Conteúdo muito grande.');
  console.error('[UNCAUGHT]', err);
  if (isApi) return genericError(res, 500);
  res.status(500).send('Erro interno.');
});

// ═══════════════════════════════════════════════════════════
// CLEANUP JOB
// ═══════════════════════════════════════════════════════════
async function cleanupJob() {
  try {
    const { error } = await supaAdmin.rpc('cleanup_expired_data');
    if (error) console.warn('[cleanup] função cleanup_expired_data indisponível:', error.message);
    // sessões vencidas nunca mais serão usadas — remove mesmo sem a função SQL
    await supaAdmin.from('active_sessions').delete().lt('expires_at', new Date().toISOString());
    console.log('[cleanup] executado');
  } catch (e) { console.error('[cleanup]', e.message); }
}
setTimeout(cleanupJob, 60 * 1000).unref();
setInterval(cleanupJob, 6 * 60 * 60 * 1000).unref();

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r?.message || r));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e));

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
const server = app.listen(PORT, () => {
  console.log(`[PANEL v6.2.0] Rodando na porta ${PORT}`);
  console.log(`NODE_ENV=${NODE_ENV}`);
  console.log(`Painel URL: ${baseUrl()}`);
});
// O balanceador do Render mantém conexões abertas por ~60s: o Node precisa mantê-las por mais tempo,
// senão aparecem 502 esporádicos.
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 70 * 1000;

function shutdown(signal) {
  console.log(`[PANEL] ${signal} recebido — encerrando com segurança...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10 * 1000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
