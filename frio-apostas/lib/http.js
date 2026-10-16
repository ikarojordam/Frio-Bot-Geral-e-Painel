'use strict';
// Servidor HTTP único por worker (node:http, sem dependências). Substitui o Express por-bot do v1.5.0.
//   GET /livez                      -> processo vivo (200 sempre)
//   GET /readyz | /health           -> 200 só se a fração de bots online >= READY_MIN_RATIO; senão 503
//   GET /bots/:id/health            -> 200 se aquele bot está online, 503 se não
//   GET /api/bots/:id/status        -> detalhes (Bearer = PANEL_API_TOKEN do bot ou FLEET_ADMIN_TOKEN)
//   GET /api/bot/status             -> alias legado quando o worker tem exatamente 1 bot
//   GET /api/fleet/status           -> visão completa (Bearer = FLEET_ADMIN_TOKEN)
const http = require('node:http');
const { safeEqual } = require('./crypto');

const VERSION = '2.0.0';

function createRateLimiter({ limit = 120, windowMs = 60000 } = {}) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length) hits.set(ip, kept); else hits.delete(ip);
    }
  }, windowMs);
  timer.unref();
  return {
    allow(ip) {
      const now = Date.now();
      const arr = (hits.get(ip) || []).filter((t) => t > now - windowMs);
      arr.push(now);
      hits.set(ip, arr);
      return arr.length <= limit;
    },
    stop: () => clearInterval(timer),
  };
}

function createHttpServer({ supervisor, settings, logger }) {
  const limiter = createRateLimiter();

  const clientIp = (req) => {
    if (settings.trustProxy) {
      const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1]; // último salto = adicionado pelo proxy confiável
    }
    return req.socket.remoteAddress || 'unknown';
  };

  const send = (res, status, body, headers = {}) => {
    const isText = typeof body === 'string';
    const payload = isText ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      ...headers,
    });
    res.end(payload);
  };

  const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const isAdmin = (req) => Boolean(settings.adminToken) && safeEqual(bearer(req), settings.adminToken);
  const canSeeBot = (req, cfg) => isAdmin(req) || (Boolean(cfg?.panelApiToken) && safeEqual(bearer(req), cfg.panelApiToken));

  const botView = (entry, withError) => {
    const d = supervisor.describe(entry);
    const view = {
      ok: d.state === 'online', service: 'frio-apostas', version: VERSION, bot: d.id, state: d.state,
      discord_ready: d.state === 'online', guilds: d.guilds, ping_ms: d.ping_ms, uptime_seconds: d.uptime_seconds,
      timestamp: new Date().toISOString(),
    };
    if (withError) view.last_error = d.last_error;
    return view;
  };

  const handler = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname.replace(/\/+$/, '') || '/';

    if (p === '/livez') return send(res, 200, { ok: true, uptime_seconds: Math.floor(process.uptime()) });
    if (p === '/') return send(res, 200, `Frio Bot Fleet ${VERSION} — worker ${settings.workerIndex}/${settings.workerCount}`);

    if (!limiter.allow(clientIp(req))) return send(res, 429, { ok: false, error: 'rate_limited' }, { 'Retry-After': '60' });

    if (p === '/readyz' || p === '/health') {
      const snap = supervisor.snapshot();
      const ready = snap.ready_ratio >= settings.readyMinRatio;
      const body = {
        ok: ready, service: 'frio-apostas', version: VERSION, worker: snap.worker,
        online: snap.wanted === 1 ? snap.online === 1 : ready,
        bots: { wanted: snap.wanted, online: snap.online }, counts: snap.counts,
        uptime_seconds: snap.uptime_seconds, timestamp: new Date().toISOString(),
      };
      return send(res, ready ? 200 : 503, body);
    }

    let m = p.match(/^\/bots\/([a-z0-9_-]{2,63})\/health$/);
    if (m) {
      const entry = supervisor.getEntry(m[1]);
      if (!entry) return send(res, 404, { ok: false, error: 'bot_not_found_on_this_worker' });
      const v = botView(entry, false);
      return send(res, v.ok ? 200 : 503, { ok: v.ok, bot: v.bot, state: v.state, version: v.version, uptime_seconds: v.uptime_seconds });
    }

    m = p.match(/^\/api\/bots\/([a-z0-9_-]{2,63})\/status$/);
    let entry = null;
    if (m) entry = supervisor.getEntry(m[1]);
    else if (p === '/api/bot/status') {
      const all = [...supervisor.bots.values()];
      entry = all.length === 1 ? all[0] : null;
      if (!entry) return send(res, 404, { ok: false, error: 'use /api/bots/:id/status' });
    }
    if (m || p === '/api/bot/status') {
      if (!entry || !canSeeBot(req, entry.cfg)) return send(res, 401, { ok: false, error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      return send(res, 200, botView(entry, isAdmin(req)));
    }

    if (p === '/api/fleet/status') {
      if (!isAdmin(req)) return send(res, 401, { ok: false, error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      return send(res, 200, supervisor.snapshot());
    }

    return send(res, 404, { ok: false, error: 'not_found' });
  };

  const server = http.createServer((req, res) => {
    try { handler(req, res); } catch (err) {
      logger.error('[HTTP]', err.message);
      if (!res.headersSent) send(res, 500, { ok: false, error: 'internal_error' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(settings.port, settings.host, () => {
        server.off('error', reject);
        logger.info(`🌐 [HTTP] escutando em ${settings.host}:${server.address().port}`);
        resolve(server);
      });
    }),
    close: () => new Promise((resolve) => { limiter.stop(); server.close(() => resolve()); server.closeIdleConnections?.(); }),
  };
}

module.exports = { createHttpServer, createRateLimiter, VERSION };
