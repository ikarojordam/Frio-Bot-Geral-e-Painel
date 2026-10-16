'use strict';
const { createLogger } = require('../lib/logger');
const quiet = createLogger('test', { level: 'error' });
// Store em memória que imita as funções SQL (leases exclusivos, claims first-come).
class MemStore {
  constructor() { this.leases = new Map(); this.claims = new Map(); this.statusRows = []; this.calls = { acquire: 0 }; }
  async acquireLeases(holder, ids, ttl) {
    this.calls.acquire++; const now = Date.now(); const got = [];
    for (const id of new Set(ids)) { const l = this.leases.get(id); if (!l || l.holder === holder || l.expires < now) { this.leases.set(id, { holder, expires: now + ttl * 1000 }); got.push(id); } }
    return got;
  }
  async releaseLeases(holder, ids) { let n = 0; for (const id of ids) if (this.leases.get(id)?.holder === holder) { this.leases.delete(id); n++; } return n; }
  async claimGuilds(bot, ids) { for (const g of ids) if (!this.claims.has(g)) this.claims.set(g, bot); return ids.filter((g) => this.claims.get(g) === bot); }
  async releaseGuild(bot, g) { if (this.claims.get(g) === bot) this.claims.delete(g); }
  async flushStatus(rows) { this.statusRows = rows; }
}
const fakeBotFactory = (log = []) => (cfg) => {
  let ready = false; let stopped = false;
  return { id: cfg.id, async start() { if (cfg.token === 'BAD') { const e = new Error('invalid token'); e.code = 'TokenInvalid'; throw e; } log.push(['start', cfg.id]); setImmediate(() => { ready = true; }); },
    async stop() { stopped = true; ready = false; log.push(['stop', cfg.id]); }, isReady: () => ready, whenReady: () => new Promise((r) => setImmediate(r)),
    health: () => ({ ok: ready, guilds: 3, ping_ms: 30, uptime_seconds: 1 }), applyHotConfig(c) { log.push(['hot', cfg.id, c.brand.botName]); }, get stopped() { return stopped; } };
};
module.exports = { quiet, MemStore, fakeBotFactory };
