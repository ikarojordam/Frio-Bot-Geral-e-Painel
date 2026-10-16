'use strict';
// Acesso ao Supabase para as tabelas da frota (registro, leases, claims, flags, status).
const fs = require('node:fs');
const path = require('node:path');

const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);

function wrapError(error, what) {
  const err = new Error(`${what}: ${error?.message || error}`);
  err.code = MISSING_CODES.has(error?.code) || /does not exist|schema cache|Could not find the (function|table)/i.test(error?.message || '')
    ? 'MISSING_MIGRATION' : (error?.code || 'DB_ERROR');
  err.cause = error;
  return err;
}

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

class FleetStore {
  constructor(supabase, logger = console) {
    this.sb = supabase;
    this.log = logger;
  }

  async listBots() {
    const { data, error } = await this.sb.from('fleet_bots').select('*').order('id', { ascending: true }).limit(5000);
    if (error) throw wrapError(error, 'listar fleet_bots');
    return data || [];
  }

  async acquireLeases(holder, botIds, ttlSec) {
    if (!botIds.length) return [];
    const { data, error } = await this.sb.rpc('fleet_acquire_leases', { p_holder: holder, p_bots: botIds, p_ttl_seconds: ttlSec });
    if (error) throw wrapError(error, 'fleet_acquire_leases');
    return Array.isArray(data) ? data : [];
  }

  async releaseLeases(holder, botIds) {
    if (!botIds.length) return 0;
    const { data, error } = await this.sb.rpc('fleet_release_leases', { p_holder: holder, p_bots: botIds });
    if (error) throw wrapError(error, 'fleet_release_leases');
    return Number(data) || 0;
  }

  // Retorna os guild_ids que pertencem a este bot depois da tentativa (first-come-first-served).
  async claimGuilds(botId, guildIds) {
    const owned = [];
    for (const part of chunk([...new Set(guildIds)], 200)) {
      const { data, error } = await this.sb.rpc('fleet_claim_guilds', { p_bot: botId, p_guilds: part });
      if (error) throw wrapError(error, 'fleet_claim_guilds');
      if (Array.isArray(data)) owned.push(...data);
    }
    return owned;
  }

  async releaseGuild(botId, guildId) {
    const { error } = await this.sb.rpc('fleet_release_guild', { p_bot: botId, p_guild: guildId });
    if (error) throw wrapError(error, 'fleet_release_guild');
  }

  async getFlag(botId, key) {
    const { data, error } = await this.sb.from('fleet_bot_flags').select('value').eq('bot_id', botId).eq('key', key).maybeSingle();
    if (error) throw wrapError(error, 'ler fleet_bot_flags');
    return data ? data.value : null;
  }

  async setFlag(botId, key, value) {
    const { error } = await this.sb.from('fleet_bot_flags')
      .upsert({ bot_id: botId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'bot_id,key' });
    if (error) throw wrapError(error, 'gravar fleet_bot_flags');
  }

  async flushStatus(rows) {
    for (const part of chunk(rows, 200)) {
      const { error } = await this.sb.from('fleet_bot_status').upsert(part, { onConflict: 'bot_id' });
      if (error) throw wrapError(error, 'gravar fleet_bot_status');
    }
  }

  // Anti-Raid por (bot, guild)
  async loadAntiRaid(botId, guildIds) {
    const out = new Map();
    for (const part of chunk(guildIds, 150)) {
      const { data, error } = await this.sb.from('antiraid_configs').select('guild_id,config').eq('bot_id', botId).in('guild_id', part);
      if (error) throw wrapError(error, 'ler antiraid_configs');
      for (const row of data || []) out.set(row.guild_id, row.config);
    }
    return out;
  }

  async saveAntiRaid(botId, guildId, config) {
    const { error } = await this.sb.from('antiraid_configs')
      .upsert({ bot_id: botId, guild_id: guildId, config, updated_at: new Date().toISOString() }, { onConflict: 'bot_id,guild_id' });
    if (error) throw wrapError(error, 'gravar antiraid_configs');
  }
}

// Flags/estado por bot com fallback para arquivo local caso a migração ainda não tenha sido aplicada.
class FlagStore {
  constructor(store, dataDir, logger = console) {
    this.store = store;
    this.dir = dataDir;
    this.log = logger;
    this.useFile = !store;
    this.warned = false;
  }

  _file(botId) {
    return path.join(this.dir, `flags-${String(botId).replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
  }

  _readFile(botId) {
    try { return JSON.parse(fs.readFileSync(this._file(botId), 'utf8')); } catch { return {}; }
  }

  _writeFile(botId, obj) {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this._file(botId)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, this._file(botId));
  }

  _fallback(err) {
    if (err.code !== 'MISSING_MIGRATION') throw err;
    this.useFile = true;
    if (!this.warned) {
      this.warned = true;
      this.log.warn('[FLAGS] tabela fleet_bot_flags ausente — usando arquivo local. Execute sql/FLEET_MIGRATION.sql.');
    }
  }

  async get(botId, key) {
    if (!this.useFile) {
      try { return await this.store.getFlag(botId, key); } catch (err) { this._fallback(err); }
    }
    return this._readFile(botId)[key] ?? null;
  }

  async set(botId, key, value) {
    if (!this.useFile) {
      try { return await this.store.setFlag(botId, key, value); } catch (err) { this._fallback(err); }
    }
    const all = this._readFile(botId);
    all[key] = value;
    this._writeFile(botId, all);
  }
}

module.exports = { FleetStore, FlagStore, wrapError, chunk };
