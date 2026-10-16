'use strict';
// Supervisor da frota: carrega o registro, atribui bots a este worker, adquire leases (1 token = 1 processo),
// inicia com escalonamento, reinicia com backoff, aplica mudanças a quente e reporta status.
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { shardOf } = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(Object.assign(new Error(label), { code: 'TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const FATAL_RETRY_MS = 30 * 60 * 1000;
const FATAL_CODES = new Set(['TokenInvalid', 'TokenMissing', 'DisallowedIntents', 'InvalidIntents', 'BotInvalidToken']);
function isFatalLoginError(err) {
  if (!err) return false;
  if (FATAL_CODES.has(err.code)) return true;
  const msg = String(err.message || '');
  return /invalid token|disallowed intents|used disallowed intents|an invalid token was provided/i.test(msg);
}

function backoffMs(attempts) {
  const base = Math.min(15 * 60 * 1000, 5000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.5 + Math.random()));
}

class Supervisor {
  constructor({ settings, source, store, createBot, supabase, flags, logger, leaseMode }) {
    this.settings = settings;
    this.source = source;
    this.store = store; // pode ser null (modo único sem migração)
    this.createBot = createBot;
    this.supabase = supabase;
    this.flags = flags;
    this.log = logger;
    this.leaseMode = leaseMode; // required | auto | off
    this.bots = new Map(); // id -> entry
    this.passive = new Map(); // id -> { state, lastError } (desativados/sem config válida)
    this.timers = [];
    this.startQueue = [];
    this._queueRunning = false;
    this._nextSlot = 0;
    this.shuttingDown = false;
    this.reconciling = false;
    this.lastRenewOk = Date.now();
    this.loop = monitorEventLoopDelay({ resolution: 20 });
    this.loop.enable();
    this.bootedAt = Date.now();
    this.overCapacityWarned = false;
  }

  // ───────────── ciclo de vida ─────────────
  async start() {
    await this.reconcile();
    this.timers.push(setInterval(() => this.reconcile().catch((e) => this.log.error('[RECONCILE]', e.message)), this.settings.reconcileSec * 1000));
    this.timers.push(setInterval(() => this.renewLeases().catch((e) => this.log.error('[LEASE]', e.message)), this.settings.leaseRenewSec * 1000));
    this.timers.push(setInterval(() => this.flushStatus().catch((e) => this.log.warn('[STATUS]', e.message)), this.settings.statusFlushSec * 1000));
  }

  async shutdown(reason = 'shutdown') {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.log.info(`[FLEET] encerrando (${reason})...`);
    for (const t of this.timers) clearInterval(t);
    this.startQueue.length = 0;
    const ids = [...this.bots.keys()];
    await this._parallel(ids, 25, (id) => this._stopEntry(this.bots.get(id), 'shutdown', { release: false }));
    if (this.store && this.leaseMode !== 'off') {
      await this.store.releaseLeases(this.settings.holder, ids).catch((e) => this.log.warn('[LEASE] release:', e.message));
    }
    await this.flushStatus(true).catch(() => {});
    this.loop.disable();
  }

  async _parallel(items, limit, fn) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try { await fn(item); } catch (e) { this.log.warn('[FLEET] tarefa paralela:', e.message); }
      }
    });
    await Promise.all(workers);
  }

  // ───────────── reconciliação com o registro ─────────────
  async reconcile() {
    if (this.reconciling || this.shuttingDown) return;
    this.reconciling = true;
    try {
      const records = await this.source.load();
      const mine = records.filter((r) => shardOf(r, this.settings.workerCount) === this.settings.workerIndex);
      const mineIds = new Set(mine.map((r) => r.id));

      this.passive.clear();
      let desired = [];
      for (const r of mine) {
        if (r.error) this.passive.set(r.id, { state: 'config_error', lastError: r.error });
        else if (!r.enabled) this.passive.set(r.id, { state: 'disabled', lastError: null });
        else desired.push(r);
      }

      if (desired.length > this.settings.maxBotsPerWorker) {
        if (!this.overCapacityWarned) {
          this.log.error(`[FLEET] worker ${this.settings.workerIndex} recebeu ${desired.length} bots (limite ${this.settings.maxBotsPerWorker}). `
            + 'Aumente WORKER_COUNT ou MAX_BOTS_PER_WORKER. Excedentes ficam em "over_capacity".');
          this.overCapacityWarned = true;
        }
        desired.sort((a, b) => a.id.localeCompare(b.id));
        for (const extra of desired.slice(this.settings.maxBotsPerWorker)) this.passive.set(extra.id, { state: 'over_capacity', lastError: null });
        desired = desired.slice(0, this.settings.maxBotsPerWorker);
      } else this.overCapacityWarned = false;

      const desiredIds = new Set(desired.map((r) => r.id));

      // 1) parar o que saiu (removido, desativado, realocado para outro worker)
      const toStop = [...this.bots.keys()].filter((id) => !desiredIds.has(id));
      await this._parallel(toStop, 10, async (id) => {
        const reason = !mineIds.has(id) ? 'removed_or_reassigned' : (this.passive.get(id)?.state || 'removed');
        await this._stopEntry(this.bots.get(id), reason, { remove: true });
      });

      // 2) criar / atualizar
      for (const cfg of desired) {
        const entry = this.bots.get(cfg.id);
        if (!entry) {
          this.bots.set(cfg.id, this._newEntry(cfg));
          continue;
        }
        if (entry.cfg.coldRev !== cfg.coldRev) {
          this.log.info(`[FLEET] ${cfg.id}: configuração crítica mudou — reiniciando.`);
          await this._stopEntry(entry, 'config_changed', { release: false });
          entry.cfg = cfg;
          entry.attempts = 0;
          entry.state = 'queued';
          entry.lastError = null;
        } else if (entry.cfg.hotRev !== cfg.hotRev) {
          entry.cfg = cfg;
          try { entry.bot?.applyHotConfig(cfg); } catch (e) { this.log.warn(`[FLEET] ${cfg.id}: applyHotConfig falhou: ${e.message}`); }
        } else {
          entry.cfg = cfg;
        }
        // zera tentativas se estável há 5 min
        if (entry.bot?.isReady?.() && entry.readyAt && Date.now() - entry.readyAt > 5 * 60 * 1000) entry.attempts = 0;
      }

      // 3) quem precisa (re)iniciar
      const now = Date.now();
      const candidates = [...this.bots.values()].filter((e) =>
        ['queued', 'lease_wait'].includes(e.state) || (['backoff', 'error'].includes(e.state) && e.nextAttemptAt <= now));
      await this._admit(candidates);
    } finally {
      this.reconciling = false;
    }
  }

  _newEntry(cfg) {
    return { id: cfg.id, cfg, bot: null, state: 'queued', attempts: 0, lastError: null, nextAttemptAt: 0, readyAt: null, startedAt: null, enqueued: false };
  }

  async _admit(candidates) {
    if (!candidates.length) return;
    let acquired = new Set(candidates.map((e) => e.id));
    if (this.store && this.leaseMode !== 'off') {
      try {
        acquired = new Set(await this.store.acquireLeases(this.settings.holder, candidates.map((e) => e.id), this.settings.leaseTtlSec));
        this.lastRenewOk = Date.now();
      } catch (err) {
        if (err.code === 'MISSING_MIGRATION' && this.leaseMode === 'auto') {
          this.log.warn('[LEASE] funções de lease ausentes — seguindo sem trava (execute sql/FLEET_MIGRATION.sql).');
          this.leaseMode = 'off';
          acquired = new Set(candidates.map((e) => e.id));
        } else throw err;
      }
    }
    for (const e of candidates) {
      if (acquired.has(e.id)) this._enqueue(e);
      else {
        if (e.state !== 'lease_wait') this.log.warn(`[LEASE] ${e.id}: outro processo detém este token — aguardando.`);
        e.state = 'lease_wait';
      }
    }
  }

  // ───────────── fila de início (concorrência limitada + espaçamento) ─────────────
  _enqueue(entry) {
    if (entry.enqueued) return;
    entry.enqueued = true;
    entry.state = 'queued';
    this.startQueue.push(entry);
    this._runQueue().catch((e) => this.log.error('[QUEUE]', e.message));
  }

  async _slot() {
    const now = Date.now();
    const at = Math.max(now, this._nextSlot);
    this._nextSlot = at + this.settings.startSpacingMs;
    if (at > now) await sleep(at - now);
  }

  async _runQueue() {
    if (this._queueRunning) return;
    this._queueRunning = true;
    const active = new Set();
    try {
      while (!this.shuttingDown && (this.startQueue.length || active.size)) {
        while (this.startQueue.length && active.size < this.settings.startConcurrency) {
          const entry = this.startQueue.shift();
          await this._slot();
          const p = this._startEntry(entry).catch((e) => this.log.error(`[START] ${entry.id}:`, e.message)).finally(() => active.delete(p));
          active.add(p);
        }
        if (active.size) await Promise.race(active);
      }
    } finally {
      this._queueRunning = false;
    }
  }

  _botDeps(entry) {
    return {
      supabase: this.supabase,
      store: this.store,
      flags: this.flags,
      settings: this.settings,
      mode: this.source.mode,
      onFatal: (err) => this._onFatal(entry, err),
    };
  }

  async _startEntry(entry) {
    entry.enqueued = false;
    if (this.shuttingDown || this.bots.get(entry.id) !== entry) return;
    entry.state = 'starting';
    entry.attempts += 1;
    entry.startedAt = Date.now();
    try {
      const bot = this.createBot(entry.cfg, this._botDeps(entry));
      entry.bot = bot;
      await withTimeout(bot.start(), this.settings.loginTimeoutMs, 'timeout no login do Discord');
      entry.state = 'connecting';
      entry.lastError = null;
      bot.whenReady().then(() => { entry.readyAt = Date.now(); }).catch(() => {});
    } catch (err) {
      const fatal = isFatalLoginError(err);
      entry.lastError = String(err.message || err).slice(0, 300);
      await this._destroyBot(entry);
      if (fatal) {
        entry.state = 'error';
        entry.nextAttemptAt = Date.now() + FATAL_RETRY_MS;
        this.log.error(`[START] ${entry.id}: erro fatal de login (${entry.lastError}). Nova tentativa em 30 min (ou quando a configuração mudar).`);
        if (this.store && this.leaseMode !== 'off') await this.store.releaseLeases(this.settings.holder, [entry.id]).catch(() => {});
      } else {
        const wait = backoffMs(entry.attempts);
        entry.state = 'backoff';
        entry.nextAttemptAt = Date.now() + wait;
        this.log.warn(`[START] ${entry.id}: falha (${entry.lastError}); nova tentativa em ${Math.round(wait / 1000)}s.`);
      }
    }
  }

  _onFatal(entry, err) {
    if (this.bots.get(entry.id) !== entry || ['error', 'stopping'].includes(entry.state)) return;
    entry.lastError = String(err?.message || err).slice(0, 300);
    this.log.error(`[FATAL] ${entry.id}: ${entry.lastError}`);
    this._stopEntry(entry, 'fatal', { release: true })
      .then(() => { entry.state = 'error'; entry.nextAttemptAt = Date.now() + FATAL_RETRY_MS; })
      .catch(() => {});
  }

  async _destroyBot(entry) {
    const bot = entry.bot;
    entry.bot = null;
    entry.readyAt = null;
    if (bot) { try { await bot.stop(); } catch (e) { this.log.warn(`[STOP] ${entry.id}: ${e.message}`); } }
  }

  async _stopEntry(entry, reason, { remove = false, release = true } = {}) {
    if (!entry) return;
    entry.state = 'stopping';
    entry.enqueued = false;
    const qi = this.startQueue.indexOf(entry);
    if (qi >= 0) this.startQueue.splice(qi, 1);
    await this._destroyBot(entry);
    if (release && this.store && this.leaseMode !== 'off' && reason !== 'lease_lost') {
      await this.store.releaseLeases(this.settings.holder, [entry.id]).catch(() => {});
    }
    if (remove) this.bots.delete(entry.id);
    else entry.state = reason === 'shutdown' ? 'stopped' : 'queued';
  }

  // ───────────── leases ─────────────
  async renewLeases() {
    if (this.shuttingDown || !this.store || this.leaseMode === 'off') return;
    const ids = [...this.bots.values()].filter((e) => e.bot).map((e) => e.id);
    if (!ids.length) return;
    try {
      const held = new Set(await this.store.acquireLeases(this.settings.holder, ids, this.settings.leaseTtlSec));
      this.lastRenewOk = Date.now();
      for (const id of ids) {
        if (held.has(id)) continue;
        this.log.error(`[LEASE] ${id}: lease perdido para outro processo — derrubando este bot para evitar sessões duplicadas.`);
        const entry = this.bots.get(id);
        entry.lastError = 'lease perdido';
        await this._stopEntry(entry, 'lease_lost', { release: false });
        entry.state = 'lease_wait';
      }
    } catch (err) {
      this.log.warn('[LEASE] renovação falhou:', err.message);
      const silentMs = Date.now() - this.lastRenewOk;
      if (this.settings.leaseFencing && silentMs > this.settings.leaseTtlSec * 800) {
        this.log.error('[LEASE] sem contato com o banco além do TTL — fencing: parando todos os bots deste worker.');
        await this._parallel(ids, 25, (id) => this._stopEntry(this.bots.get(id), 'lease_lost', { release: false }));
        for (const id of ids) this.bots.get(id).state = 'lease_wait';
      }
    }
  }

  // ───────────── status ─────────────
  describe(entry) {
    const bot = entry.bot;
    const ready = Boolean(bot?.isReady?.());
    const h = ready ? bot.health() : null;
    return {
      id: entry.id,
      state: ready ? 'online' : entry.state,
      guilds: h?.guilds ?? 0,
      ping_ms: h?.ping_ms ?? null,
      uptime_seconds: h?.uptime_seconds ?? 0,
      attempts: entry.attempts,
      last_error: entry.lastError,
    };
  }

  snapshot() {
    const bots = [...this.bots.values()].map((e) => this.describe(e));
    for (const [id, p] of this.passive) bots.push({ id, state: p.state, guilds: 0, ping_ms: null, uptime_seconds: 0, attempts: 0, last_error: p.lastError });
    const counts = {};
    for (const b of bots) counts[b.state] = (counts[b.state] || 0) + 1;
    const wanted = [...this.bots.values()].length;
    const online = counts.online || 0;
    const mem = process.memoryUsage();
    return {
      worker: this.settings.workerIndex,
      worker_count: this.settings.workerCount,
      holder: this.settings.holder,
      mode: this.source.mode,
      lease_mode: this.leaseMode,
      uptime_seconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      wanted, online,
      ready_ratio: wanted ? online / wanted : 1,
      counts,
      memory_mb: { rss: Math.round(mem.rss / 1048576), heap_used: Math.round(mem.heapUsed / 1048576) },
      event_loop_lag_ms: { p50: Math.round(this.loop.percentile(50) / 1e6), p99: Math.round(this.loop.percentile(99) / 1e6) },
      bots,
    };
  }

  getEntry(id) { return this.bots.get(id) || null; }

  async flushStatus(final = false) {
    if (!this.store) return;
    const now = new Date().toISOString();
    const rows = [];
    for (const e of this.bots.values()) {
      const d = this.describe(e);
      rows.push({ bot_id: d.id, worker: this.settings.holder, state: final ? 'stopped' : d.state, last_error: d.last_error,
        guilds: d.guilds, ping_ms: d.ping_ms, ready_at: e.readyAt ? new Date(e.readyAt).toISOString() : null, updated_at: now });
    }
    for (const [id, p] of this.passive) rows.push({ bot_id: id, worker: this.settings.holder, state: p.state, last_error: p.lastError, guilds: 0, ping_ms: null, ready_at: null, updated_at: now });
    if (rows.length) {
      try { await this.store.flushStatus(rows); } catch (err) {
        if (err.code === 'MISSING_MIGRATION') return; // sem tabela de status: silencioso
        throw err;
      }
    }
  }
}

module.exports = { Supervisor, isFatalLoginError, backoffMs, withTimeout };
