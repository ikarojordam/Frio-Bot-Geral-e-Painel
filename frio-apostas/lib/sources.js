'use strict';
// Fontes de configuração de bots: .env (modo único, compatível com v1.5.0) e registro no Supabase (frota).
const { buildBotConfig, parseBool, FEATURE_DEFAULTS } = require('./config');

class EnvSource {
  constructor(settings, env = process.env) {
    this.settings = settings;
    this.env = env;
    this.mode = 'single';
  }

  async load() {
    const e = this.env;
    if (!e.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN ausente.');
    const features = {};
    for (const key of Object.keys(FEATURE_DEFAULTS.single)) {
      const raw = e[`FEATURE_${key.toUpperCase()}`];
      if (raw !== undefined && raw !== '') features[key] = parseBool(raw, FEATURE_DEFAULTS.single[key]);
    }
    const id = String(e.BOT_ID || e.DISCORD_CLIENT_ID || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return [buildBotConfig({
      id,
      enabled: true,
      token: e.DISCORD_TOKEN,
      applicationId: e.DISCORD_CLIENT_ID,
      ownerId: e.OWNER_ID,
      panelApiToken: e.PANEL_API_TOKEN,
      logChannelId: e.LOG_CHANNEL_ID,
      displayName: e.BOT_NAME || 'BACK BOT',
      orgName: e.ORG_NAME || 'BACK E-ESPORTES',
      orgEmoji: e.ORG_EMOJI || '🐦‍⬛',
      presenceText: e.PRESENCE_TEXT,
      presenceType: e.PRESENCE_TYPE,
      presenceStatus: e.PRESENCE_STATUS,
      features,
      mpAccessToken: e.MP_ACCESS_TOKEN,
    }, this.settings, 'single')];
  }
}

class DbSource {
  constructor(store, vault, settings, logger = console) {
    this.store = store;
    this.vault = vault;
    this.settings = settings;
    this.log = logger;
    this.mode = 'fleet';
  }

  async load() {
    const rows = await this.store.listBots();
    const out = [];
    for (const row of rows) {
      try {
        out.push(buildBotConfig({
          id: row.id,
          enabled: row.enabled,
          token: this.vault.decrypt(row.token_enc, row.id),
          applicationId: row.application_id,
          ownerId: row.owner_id,
          panelApiToken: row.panel_api_token_enc ? this.vault.decrypt(row.panel_api_token_enc, row.id) : null,
          logChannelId: row.log_channel_id,
          displayName: row.display_name,
          orgName: row.org_name,
          orgEmoji: row.org_emoji,
          embedColor: row.embed_color,
          presenceText: row.presence_text,
          presenceType: row.presence_type,
          presenceStatus: row.presence_status,
          features: row.features,
          workerGroup: row.worker_group,
          commandsHash: row.commands_hash,
        }, this.settings, 'fleet'));
      } catch (err) {
        // Um segredo ilegível não pode derrubar os outros 499 bots.
        out.push({ id: row.id, enabled: row.enabled !== false, error: `config inválida: ${err.message}`, workerGroup: row.worker_group ?? null });
      }
    }
    return out;
  }
}

module.exports = { EnvSource, DbSource };
