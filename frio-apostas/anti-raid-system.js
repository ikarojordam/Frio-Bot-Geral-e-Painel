'use strict';
// Sistema Anti-Raid configurável — discord.js v14 — v2.0.0 (multibot)
//
// Mudanças principais em relação ao v1.5.0:
//  • Configuração persistida por (bot, servidor) no Supabase (tabela antiraid_configs), não mais em JSON local.
//    Fallback automático para arquivo por bot em DATA_DIR quando a migração ainda não foi aplicada.
//  • Anti-nuke baseado em guildAuditLogEntryCreate: o executor vem do próprio evento (sem "adivinhar" a
//    primeira entrada do audit log) e cobre canais, cargos, bans/kicks em massa, webhooks e @everyone.
//  • Anti-webhook agora remove o webhook criado por quem não é confiável (ação configurável).
//  • Administradores deixam de ser isentos do anti-nuke por padrão (opção nukeExemptAdmins).
//  • Whitelist por ID funciona mesmo com o membro fora do cache.
//  • Mapas em memória têm varredura periódica (antes cresciam sem limite).
const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AuditLogEvent, MessageFlags, Events,
} = require('discord.js');

const EPHEMERAL = MessageFlags.Ephemeral;
const VALID_ACTIONS = ['kick', 'ban', 'timeout', 'strip', 'delete', 'none'];
const SNOWFLAKE = /^\d{17,20}$/;

const DEFAULT = Object.freeze({
  enabled: false,
  logChannelId: null,
  modules: { join: true, spam: true, mentions: true, invites: true, antinuke: true, antiwebhook: true, antibot: true },
  thresholds: {
    joinCount: 6, joinWindowSec: 12, accountAgeDays: 3, spamCount: 6, spamWindowSec: 7, mentionCount: 6,
    nukeCount: 3, nukeWindowSec: 12, banCount: 3, banWindowSec: 30,
  },
  actions: { suspiciousJoin: 'kick', spam: 'timeout', invite: 'delete', mention: 'timeout', antinuke: 'strip', antibot: 'kick', antiwebhook: 'delete' },
  nukeExemptAdmins: false,
  whitelistUserIds: [],
  whitelistRoleIds: [],
  customRules: [], // armazenadas apenas por compatibilidade; NÃO têm gatilho de execução
});

const moduleLabels = { join: 'Entradas em massa', spam: 'Anti-spam', mentions: 'Anti-menções', invites: 'Anti-convites', antinuke: 'Anti-nuke', antiwebhook: 'Anti-webhook', antibot: 'Anti-bots' };
const actionLabels = { suspiciousJoin: 'Entrada suspeita', spam: 'Spam', invite: 'Convites', mention: 'Menções', antinuke: 'Anti-nuke', antibot: 'Bot adicionado', antiwebhook: 'Webhook criado' };

const DANGEROUS_PERMS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles
  | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageWebhooks | PermissionFlagsBits.BanMembers
  | PermissionFlagsBits.KickMembers | PermissionFlagsBits.MentionEveryone;

function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: Boolean(c.enabled),
    logChannelId: c.logChannelId || null,
    modules: { ...DEFAULT.modules, ...(c.modules || {}) },
    thresholds: { ...DEFAULT.thresholds, ...(c.thresholds || {}) },
    actions: { ...DEFAULT.actions, ...(c.actions || {}) },
    nukeExemptAdmins: typeof c.nukeExemptAdmins === 'boolean' ? c.nukeExemptAdmins : DEFAULT.nukeExemptAdmins,
    whitelistUserIds: Array.isArray(c.whitelistUserIds) ? [...c.whitelistUserIds] : [],
    whitelistRoleIds: Array.isArray(c.whitelistRoleIds) ? [...c.whitelistRoleIds] : [],
    customRules: Array.isArray(c.customRules) ? c.customRules : [],
  };
}

// Conta eventos dentro de uma janela deslizante. Retorna a contagem incluindo o evento atual.
function countInWindow(map, key, now, windowMs) {
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  map.set(key, arr);
  return arr.length;
}

// Remove chaves cujo último evento já saiu de qualquer janela possível (evita vazamento de memória).
function sweepBuckets(map, now, maxWindowMs) {
  for (const [key, arr] of map) {
    if (!arr.length || now - arr[arr.length - 1] > maxWindowMs) map.delete(key);
  }
}

// ───────────────────────── storage ─────────────────────────
function createFileStore(dataDir, botId, logger = console) {
  const file = path.join(dataDir, `antiraid-${String(botId).replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
  let cache = null;
  const read = () => { if (cache) return cache; try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = {}; } return cache; };
  return {
    kind: 'file',
    async loadMany(guildIds) { const all = read(); return new Map(guildIds.filter((g) => all[g]).map((g) => [g, all[g]])); },
    async save(guildId, config) {
      const all = read(); all[guildId] = config;
      try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(all)); fs.renameSync(`${file}.tmp`, file); }
      catch (e) { logger.error('[ANTIRAID] gravar arquivo:', e.message); }
    },
    // Importa o antiraid-config.json do v1.5.0 (uma vez) quando existir.
    importLegacy(legacyPath) {
      try {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        const all = read();
        let n = 0;
        for (const [gid, cfg] of Object.entries(legacy)) if (!all[gid]) { all[gid] = cfg; n++; }
        return { all, n };
      } catch { return { all: {}, n: 0 }; }
    },
  };
}

function createSupabaseStore(fleetStore, botId, fallbackFactory, logger = console) {
  let fallback = null;
  const useFallback = (err) => {
    if (err.code !== 'MISSING_MIGRATION') throw err;
    if (!fallback) { logger.warn('[ANTIRAID] tabela antiraid_configs ausente — usando arquivo local. Execute sql/FLEET_MIGRATION.sql.'); fallback = fallbackFactory(); }
    return fallback;
  };
  return {
    kind: 'supabase',
    async loadMany(guildIds) { if (fallback) return fallback.loadMany(guildIds); try { return await fleetStore.loadAntiRaid(botId, guildIds); } catch (e) { return useFallback(e).loadMany(guildIds); } },
    async save(guildId, config) { if (fallback) return fallback.save(guildId, config); try { return await fleetStore.saveAntiRaid(botId, guildId, config); } catch (e) { return useFallback(e).save(guildId, config); } },
  };
}

// ───────────────────────── instalação ─────────────────────────
// options: { botId, store, logChannelId, getBrand(), logger, legacyConfigPath }
module.exports = function installAntiRaid(client, options = {}) {
  const log = options.logger || console;
  const store = options.store;
  const getBrand = options.getBrand || (() => ({ botName: 'BOT', orgName: 'BOT' }));

  const configs = new Map();            // guildId -> config normalizada
  const saveTimers = new Map();         // guildId -> timeout (debounce)
  const recentJoins = new Map();
  const messageBuckets = new Map();
  const auditBuckets = new Map();
  let initDone;
  const initPromise = new Promise((r) => { initDone = r; });

  const cfg = (gid) => {
    let c = configs.get(gid);
    if (!c) { c = normalizeConfig(null); configs.set(gid, c); }
    return c;
  };
  const save = (gid) => {
    clearTimeout(saveTimers.get(gid));
    saveTimers.set(gid, setTimeout(() => {
      saveTimers.delete(gid);
      Promise.resolve(store?.save(gid, configs.get(gid))).catch((e) => log.error('[ANTIRAID] salvar config:', e.message));
    }, 400));
  };
  const reset = (gid) => { configs.set(gid, normalizeConfig(null)); save(gid); return configs.get(gid); };

  // Carrega as configs dos servidores de que este bot é responsável. Chamado pelo runtime no ready.
  async function init(guildIds) {
    try {
      const loaded = await store.loadMany(guildIds);
      for (const [gid, raw] of loaded) configs.set(gid, normalizeConfig(raw));
      log.info(`[ANTIRAID] ${loaded.size} configuração(ões) carregada(s) de ${guildIds.length} servidor(es).`);
    } catch (e) {
      log.error('[ANTIRAID] falha ao carregar configurações (proteções ficam no padrão/desligado):', e.message);
    } finally { initDone(); }
  }

  function addConfigsFromLegacy(all) {
    for (const [gid, raw] of Object.entries(all || {})) if (!configs.has(gid)) { configs.set(gid, normalizeConfig(raw)); save(gid); }
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    sweepBuckets(recentJoins, now, 125000);
    sweepBuckets(messageBuckets, now, 65000);
    sweepBuckets(auditBuckets, now, 305000);
  }, 60000);
  sweeper.unref?.();

  // ── helpers de permissão/ação ──
  const isOwnerOrWhitelisted = (member, c) => !!member && (member.id === member.guild.ownerId
    || c.whitelistUserIds.includes(member.id) || member.roles.cache.some((r) => c.whitelistRoleIds.includes(r.id)));
  // Isenção geral (spam, menções, convites, entradas): dono, whitelist ou administrador.
  const isExempt = (member, c) => isOwnerOrWhitelisted(member, c) || (!!member && member.permissions.has(PermissionFlagsBits.Administrator));
  // Isenção do anti-nuke: administradores só são isentos se o servidor optar (nukeExemptAdmins).
  const isNukeExempt = (member, c) => isOwnerOrWhitelisted(member, c) || (c.nukeExemptAdmins && !!member && member.permissions.has(PermissionFlagsBits.Administrator));
  const isAdminCtx = (m) => m.memberPermissions?.has(PermissionFlagsBits.Administrator) || m.guild?.ownerId === (m.author?.id || m.user?.id);

  async function sendLog(guild, title, description, color = 0xE74C3C, fields = []) {
    const c = cfg(guild.id);
    const brand = getBrand();
    const embed = new EmbedBuilder().setColor(color).setTitle(`🛡️ ${title}`)
      .setDescription(String(description || 'Sem detalhes.').slice(0, 4000)).addFields(fields.slice(0, 8))
      .setFooter({ text: `${brand.botName} • Anti-Raid` }).setTimestamp();
    const ch = (c.logChannelId && guild.channels.cache.get(c.logChannelId))
      || ((options.getLogChannelId?.() || options.logChannelId) && guild.channels.cache.get(options.getLogChannelId?.() || options.logChannelId)) || null;
    if (ch?.isTextBased()) await ch.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
  }

  async function act(member, action, reason) {
    if (!member || member.id === member.guild.ownerId) return 'ignorado';
    if (member.user?.bot && action !== 'kick') return 'ignorado';
    const me = member.guild.members.me;
    try {
      if (action === 'kick' && me?.permissions.has(PermissionFlagsBits.KickMembers) && member.kickable) { await member.kick(reason); return 'expulso'; }
      if (action === 'ban' && me?.permissions.has(PermissionFlagsBits.BanMembers) && member.bannable) { await member.ban({ reason }); return 'banido'; }
      if (action === 'timeout' && me?.permissions.has(PermissionFlagsBits.ModerateMembers) && member.moderatable) { await member.timeout(10 * 60 * 1000, reason); return 'silenciado por 10 minutos'; }
      if (action === 'strip' && me?.permissions.has(PermissionFlagsBits.ManageRoles) && member.manageable) {
        const roles = member.roles.cache.filter((r) => r.id !== member.guild.id && !r.managed && r.editable);
        await member.roles.remove(roles, reason); return `${roles.size} cargo(s) removido(s)`;
      }
      if (action === 'delete' || action === 'none') return 'sem ação sobre o membro';
    } catch (e) { return `falhou: ${e.message}`; }
    return 'ação não aplicada (permissão ou hierarquia insuficiente)';
  }

  // ── painel ──
  const onOff = (v) => (v ? 'Ativado' : 'Desativado');
  function dashboard(c, guild) {
    const brand = getBrand();
    const modules = Object.entries(c.modules).map(([k, v]) => `**${moduleLabels[k] || k}**: ${onOff(v)}`).join('\n');
    const actions = Object.entries(c.actions).map(([k, v]) => `**${actionLabels[k] || k}**: \`${v}\``).join('\n');
    const t = c.thresholds;
    return new EmbedBuilder()
      .setColor(c.enabled ? 0x2ECC71 : 0xE74C3C)
      .setTitle('🛡️ Configuração do Anti-Raid')
      .setDescription('Configure a proteção deste servidor pelos controles abaixo. As alterações são salvas automaticamente.')
      .addFields(
        { name: 'Estado', value: c.enabled ? '🟢 **Ativado**' : '🔴 **Desativado**', inline: true },
        { name: 'Canal de logs', value: c.logChannelId ? `<#${c.logChannelId}>` : 'Não configurado', inline: true },
        { name: 'Whitelist', value: `${c.whitelistUserIds.length} usuário(s) • ${c.whitelistRoleIds.length} cargo(s)`, inline: true },
        { name: 'Módulos', value: modules.slice(0, 1024) },
        { name: 'Ações automáticas', value: actions.slice(0, 1024) },
        { name: 'Limites atuais', value: [
          `Entradas: **${t.joinCount}** em ${t.joinWindowSec}s • conta mínima: **${t.accountAgeDays}** dia(s)`,
          `Spam: **${t.spamCount}** em ${t.spamWindowSec}s • Menções: **${t.mentionCount}**`,
          `Anti-nuke: **${t.nukeCount}** em ${t.nukeWindowSec}s • Bans/kicks: **${t.banCount}** em ${t.banWindowSec}s`,
          `Admins isentos do anti-nuke: **${c.nukeExemptAdmins ? 'sim' : 'não'}**`,
        ].join('\n') },
        { name: 'Cobertura do anti-nuke', value: 'Criação/remoção de canais e cargos, bans/kicks em massa, webhooks criados e permissões perigosas no @everyone. **Proteção parcial** — não cobre toda ação destrutiva possível; mantenha o cargo do bot alto e a whitelist enxuta.' },
      )
      .setFooter({ text: `${brand.botName} • ${guild.name} • Use os menus para editar` })
      .setTimestamp();
  }

  function dashboardRows(c) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar:toggle').setLabel(c.enabled ? 'Desativar proteção' : 'Ativar proteção').setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ar:limits').setLabel('Limites (entrada/spam)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ar:limits2').setLabel('Limites (nuke/conta)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ar:nukeadmin').setLabel(`Admins no anti-nuke: ${c.nukeExemptAdmins ? 'isentos' : 'vigiados'}`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ar:reset').setLabel('Restaurar padrão').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ar:module').setPlaceholder('Ativar/desativar módulos').setMinValues(0).setMaxValues(Object.keys(moduleLabels).length)
          .addOptions(Object.entries(moduleLabels).map(([value, label]) => ({ label, value, default: Boolean(c.modules[value]) }))),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ar:action').setPlaceholder('Configurar ações automáticas').setMinValues(1).setMaxValues(1)
          .addOptions(Object.entries(actionLabels).map(([value, label]) => ({ label, value, description: `Ação atual: ${c.actions[value]}` }))),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('ar:logs').setPlaceholder('Selecionar canal de logs').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
      ),
    ];
  }

  const panel = (c, guild) => ({ embeds: [dashboard(c, guild)], components: dashboardRows(c) });
  const help = (c) => `**Anti-Raid ${c.enabled ? '🟢 ATIVO' : '🔴 DESATIVADO'}**\nDigite \`.antiraid\` para abrir o painel interativo.\n`
    + 'Comandos: `.antiraid on|off`, `.antiraid status`, `.antiraid logs #canal`, `.antiraid modulo <nome> on|off`, '
    + '`.antiraid limite <join|spam|mentions|nuke|ban> <2-100>`, `.antiraid acao <tipo> <kick|ban|timeout|strip|delete|none>`, '
    + '`.antiraid nukeadmin on|off`, `.antiraid whitelist add|remove @usuário|@cargo|ID`, `.antiraid reset`.';

  async function resolveUserId(guild, raw) {
    if (!SNOWFLAKE.test(raw)) return null;
    if (guild.members.cache.has(raw)) return raw;
    const m = await guild.members.fetch(raw).catch(() => null);
    if (m) return m.id;
    const u = await client.users.fetch(raw).catch(() => null); // usuário fora do servidor também pode ser confiável
    return u ? u.id : null;
  }

  // ── comando de texto ──
  client.on('messageCreate', async (m) => {
    if (!m.guild || m.author.bot || !/^\.antiraid(?:\s|$)/i.test(String(m.content || '').trim())) return;
    await initPromise;
    if (!isAdminCtx(m)) return m.reply('Apenas o dono ou administradores podem configurar o Anti-Raid.').catch(() => {});
    const p = String(m.content).trim().split(/\s+/);
    const c = cfg(m.guild.id);
    const sub = (p[1] || '').toLowerCase();
    const show = () => m.reply(panel(cfg(m.guild.id), m.guild)).catch(() => {});

    if (!sub || ['painel', 'ajuda', 'status'].includes(sub)) return show();
    if (sub === 'on' || sub === 'ativar') { c.enabled = true; save(m.guild.id); return show(); }
    if (sub === 'off' || sub === 'desativar') { c.enabled = false; save(m.guild.id); return show(); }
    if (sub === 'logs') {
      const ch = m.guild.channels.cache.get((p[2] || '').replace(/[<#>]/g, ''));
      if (!ch?.isTextBased()) return m.reply('Use `.antiraid logs #canal` com um canal de texto válido.').catch(() => {});
      c.logChannelId = ch.id; save(m.guild.id); return show();
    }
    if (sub === 'modulo') {
      const k = (p[2] || '').toLowerCase(); const v = (p[3] || '').toLowerCase();
      if (!(k in c.modules) || !['on', 'off', 'ativar', 'desativar'].includes(v)) return m.reply(help(c)).catch(() => {});
      c.modules[k] = ['on', 'ativar'].includes(v); save(m.guild.id); return show();
    }
    if (sub === 'limite') {
      const k = (p[2] || '').toLowerCase(); const n = Number(p[3]);
      const map = { join: 'joinCount', spam: 'spamCount', mentions: 'mentionCount', nuke: 'nukeCount', ban: 'banCount' };
      if (!map[k] || !Number.isInteger(n) || n < 2 || n > 100) return m.reply('Uso: `.antiraid limite <join|spam|mentions|nuke|ban> <2-100>`').catch(() => {});
      c.thresholds[map[k]] = n; save(m.guild.id); return show();
    }
    if (sub === 'acao') {
      const k = (p[2] || '').toLowerCase(); const v = (p[3] || '').toLowerCase();
      if (!(k in c.actions) || !VALID_ACTIONS.includes(v)) return m.reply(help(c)).catch(() => {});
      c.actions[k] = v; save(m.guild.id); return show();
    }
    if (sub === 'nukeadmin') {
      const v = (p[2] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return m.reply('Uso: `.antiraid nukeadmin on|off` (on = administradores ficam isentos do anti-nuke).').catch(() => {});
      c.nukeExemptAdmins = v === 'on'; save(m.guild.id); return show();
    }
    if (sub === 'whitelist') {
      const mode = (p[2] || '').toLowerCase(); const id = (p[3] || '').replace(/[<@!&>]/g, '');
      const role = m.guild.roles.cache.get(id);
      const val = role ? role.id : await resolveUserId(m.guild, id);
      if (!['add', 'remove'].includes(mode) || !val) return m.reply('Uso: `.antiraid whitelist add|remove @usuário|@cargo|ID` (o ID precisa existir).').catch(() => {});
      const list = role ? c.whitelistRoleIds : c.whitelistUserIds;
      if (mode === 'add' && !list.includes(val)) list.push(val);
      if (mode === 'remove') { const i = list.indexOf(val); if (i >= 0) list.splice(i, 1); }
      save(m.guild.id); return show();
    }
    if (sub === 'reset') { reset(m.guild.id); return show(); }
    return m.reply(help(c)).catch(() => {});
  });

  // ── painel interativo ──
  const LIMIT_BOUNDS_1 = { joinCount: [2, 100], joinWindowSec: [3, 120], spamCount: [2, 100], spamWindowSec: [2, 60], mentionCount: [2, 100] };
  const LIMIT_BOUNDS_2 = { accountAgeDays: [0, 60], nukeCount: [2, 50], nukeWindowSec: [3, 120], banCount: [2, 50], banWindowSec: [5, 300] };
  const LIMIT_LABELS = {
    joinCount: 'Entradas em massa', joinWindowSec: 'Janela de entradas (s)', spamCount: 'Mensagens p/ spam', spamWindowSec: 'Janela de spam (s)', mentionCount: 'Menções p/ abuso',
    accountAgeDays: 'Idade mínima da conta (dias)', nukeCount: 'Ações destrutivas p/ nuke', nukeWindowSec: 'Janela do nuke (s)', banCount: 'Bans/kicks p/ alerta', banWindowSec: 'Janela de bans/kicks (s)',
  };

  const limitsModal = (id, title, bounds, c) => {
    const modal = new ModalBuilder().setCustomId(id).setTitle(title);
    modal.addComponents(...Object.entries(bounds).map(([key, [min, max]]) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(key).setLabel(`${LIMIT_LABELS[key]} (${min}-${max})`.slice(0, 45)).setStyle(TextInputStyle.Short)
        .setValue(String(c.thresholds[key])).setRequired(true))));
    return modal;
  };

  client.on('interactionCreate', async (i) => {
    if (!i.inGuild() || !i.customId?.startsWith('ar:')) return;
    await initPromise;
    if (!isAdminCtx(i)) return i.reply({ content: 'Apenas o dono ou administradores podem configurar o Anti-Raid.', flags: EPHEMERAL }).catch(() => {});
    const gid = i.guild.id;
    const c = cfg(gid);
    const update = (cc = cfg(gid)) => i.update(panel(cc, i.guild)).catch(() => {});
    const id = i.customId;

    if (id === 'ar:toggle') { c.enabled = !c.enabled; save(gid); return update(c); }
    if (id === 'ar:nukeadmin') { c.nukeExemptAdmins = !c.nukeExemptAdmins; save(gid); return update(c); }
    if (id === 'ar:reset') { return update(reset(gid)); }
    if (id === 'ar:module') { for (const key of Object.keys(moduleLabels)) c.modules[key] = i.values.includes(key); save(gid); return update(c); }
    if (id === 'ar:logs') { c.logChannelId = i.values[0]; save(gid); return update(c); }
    if (id === 'ar:action') {
      const key = i.values[0];
      const menu = new StringSelectMenuBuilder().setCustomId(`ar:setaction:${key}`).setPlaceholder(`Escolha a ação para ${actionLabels[key] || key}`)
        .addOptions(VALID_ACTIONS.map((v) => ({ label: v, value: v, default: c.actions[key] === v })));
      return i.reply({ content: `Ação para **${actionLabels[key] || key}**: \`${c.actions[key]}\``, components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL }).catch(() => {});
    }
    if (id.startsWith('ar:setaction:')) {
      const key = id.split(':')[2];
      if (!(key in c.actions) || !VALID_ACTIONS.includes(i.values[0])) return i.reply({ content: 'Ação inválida.', flags: EPHEMERAL }).catch(() => {});
      c.actions[key] = i.values[0]; save(gid);
      return i.update({ content: `✅ **${actionLabels[key] || key}** agora usa \`${c.actions[key]}\`.`, components: [] }).catch(() => {});
    }
    if (id === 'ar:limits') return i.showModal(limitsModal('ar:limits-modal', 'Limites: entrada, spam, menções', LIMIT_BOUNDS_1, c)).catch(() => {});
    if (id === 'ar:limits2') return i.showModal(limitsModal('ar:limits2-modal', 'Limites: anti-nuke e conta', LIMIT_BOUNDS_2, c)).catch(() => {});
    if (id === 'ar:limits-modal' || id === 'ar:limits2-modal') {
      const bounds = id === 'ar:limits-modal' ? LIMIT_BOUNDS_1 : LIMIT_BOUNDS_2;
      const next = {};
      for (const [key, [min, max]] of Object.entries(bounds)) {
        const n = Number(i.fields.getTextInputValue(key));
        if (!Number.isInteger(n) || n < min || n > max) return i.reply({ content: `Valor inválido em **${LIMIT_LABELS[key]}**. Use um inteiro entre ${min} e ${max}.`, flags: EPHEMERAL }).catch(() => {});
        next[key] = n;
      }
      Object.assign(c.thresholds, next); save(gid);
      return i.reply({ ...panel(c, i.guild), flags: EPHEMERAL }).catch(() => {});
    }
  });

  // ── entradas ──
  client.on('guildMemberAdd', async (member) => {
    await initPromise;
    const c = cfg(member.guild.id);
    if (!c.enabled || isExempt(member, c)) return;
    if (c.modules.join) {
      const now = Date.now();
      const n = countInWindow(recentJoins, member.guild.id, now, c.thresholds.joinWindowSec * 1000);
      const ageDays = (now - member.user.createdTimestamp) / 86400000;
      if (n >= c.thresholds.joinCount) {
        const result = await act(member, c.actions.suspiciousJoin, 'Anti-Raid: entrada em massa detectada');
        await sendLog(member.guild, 'Possível raid detectada', `${member.user.tag} (${member.id}) entrou durante uma sequência de ${n} entradas em ${c.thresholds.joinWindowSec}s. Ação: ${result}.`);
      } else if (ageDays < c.thresholds.accountAgeDays) {
        await sendLog(member.guild, 'Conta recém-criada entrou', `${member.user.tag} (${member.id}); conta com ${ageDays.toFixed(1)} dia(s).`, 0xF39C12);
        if (c.actions.suspiciousJoin !== 'none') {
          const result = await act(member, c.actions.suspiciousJoin, 'Anti-Raid: conta muito recente');
          await sendLog(member.guild, 'Ação contra conta recente', `${member.user.tag}: ${result}.`, 0xF39C12);
        }
      }
    }
    if (member.user.bot && c.modules.antibot) {
      await sendLog(member.guild, 'Bot adicionado', `${member.user.tag} (${member.id}) foi adicionado ao servidor. Verifique se foi autorizado.`, 0xF39C12);
      if (c.actions.antibot !== 'none') {
        const result = await act(member, c.actions.antibot, 'Anti-Raid: bot adicionado');
        await sendLog(member.guild, 'Proteção contra bots', `${member.user.tag}: ${result}.`);
      }
    }
  });

  // ── mensagens: spam, menções, convites ──
  client.on('messageCreate', async (m) => {
    if (!m.guild || m.author.bot) return;
    const c = cfg(m.guild.id);
    if (!c.enabled) return;
    const member = m.member;
    if (isExempt(member, c)) return;
    const now = Date.now();
    if (c.modules.spam) {
      const key = `${m.guild.id}:${m.author.id}`;
      const n = countInWindow(messageBuckets, key, now, c.thresholds.spamWindowSec * 1000);
      if (n >= c.thresholds.spamCount) {
        await m.delete().catch(() => {});
        let result = 'mensagens apagadas';
        if (c.actions.spam !== 'delete' && c.actions.spam !== 'none') result = await act(member, c.actions.spam, 'Anti-Raid: spam detectado');
        await sendLog(m.guild, 'Spam detectado', `${m.author.tag} (${m.author.id}) enviou ${n} mensagens em ${c.thresholds.spamWindowSec}s. Ação: ${result}.`);
        messageBuckets.set(key, []);
        return;
      }
    }
    if (c.modules.mentions && (m.mentions.users.size + m.mentions.roles.size) >= c.thresholds.mentionCount) {
      await m.delete().catch(() => {});
      const result = c.actions.mention === 'delete' || c.actions.mention === 'none' ? 'mensagem apagada' : await act(member, c.actions.mention, 'Anti-Raid: menções em massa');
      await sendLog(m.guild, 'Menções em massa', `${m.author.tag} (${m.author.id}) mencionou ${m.mentions.users.size + m.mentions.roles.size} alvos. Ação: ${result}.`);
      return;
    }
    if (c.modules.invites && /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(m.content)) {
      await m.delete().catch(() => {});
      const result = c.actions.invite === 'delete' || c.actions.invite === 'none' ? 'convite removido' : await act(member, c.actions.invite, 'Anti-Raid: convite não autorizado');
      await sendLog(m.guild, 'Convite bloqueado', `${m.author.tag} (${m.author.id}) enviou um convite. Ação: ${result}.`, 0xF39C12);
    }
  });

  // ── anti-nuke: o executor vem direto do evento do audit log ──
  const AUDIT_LABEL = {
    [AuditLogEvent.ChannelCreate]: 'channelCreate', [AuditLogEvent.ChannelDelete]: 'channelDelete',
    [AuditLogEvent.RoleCreate]: 'roleCreate', [AuditLogEvent.RoleDelete]: 'roleDelete',
    [AuditLogEvent.MemberBanAdd]: 'memberBan', [AuditLogEvent.MemberKick]: 'memberKick', [AuditLogEvent.MemberPrune]: 'memberPrune',
    [AuditLogEvent.WebhookCreate]: 'webhookCreate', [AuditLogEvent.RoleUpdate]: 'roleUpdate',
  };
  const COUNTED = new Set([AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelDelete, AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete]);
  const MOD_COUNTED = new Set([AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberKick, AuditLogEvent.MemberPrune]);

  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    try {
      await initPromise;
      const label = AUDIT_LABEL[entry.action];
      if (!label) return;
      const c = cfg(guild.id);
      if (!c.enabled || !entry.executorId || entry.executorId === client.user?.id) return;
      const executorUser = entry.executor || await client.users.fetch(entry.executorId).catch(() => null);
      const who = executorUser ? `${executorUser.tag} (${executorUser.id})` : entry.executorId;
      const executor = await guild.members.fetch(entry.executorId).catch(() => null);
      const botExecutor = Boolean(executorUser?.bot); // integrações legítimas (ex.: bot de tickets) criam canais em rajada: só registramos

      // 1) Rajada de criação/remoção de canais e cargos
      if (COUNTED.has(entry.action)) {
        let action = '';
        if (c.modules.antinuke && !botExecutor && executor && !isNukeExempt(executor, c)) {
          const n = countInWindow(auditBuckets, `${guild.id}:${entry.executorId}:nuke`, Date.now(), c.thresholds.nukeWindowSec * 1000);
          if (n >= c.thresholds.nukeCount) {
            if (c.actions.antinuke !== 'none') action = await act(executor, c.actions.antinuke, 'Anti-Raid: atividade destrutiva em massa');
            await sendLog(guild, 'Possível ataque de destruição', `${who} executou ${n} ações destrutivas (canais/cargos) em ${c.thresholds.nukeWindowSec}s. Proteção: ${action || 'registrado; sem ação automática'}.`);
            auditBuckets.set(`${guild.id}:${entry.executorId}:nuke`, []);
          }
        }
        const target = entry.target?.name || entry.targetId || '—';
        await sendLog(guild, `Auditoria: ${label}`, `Alvo: **${String(target).slice(0, 150)}**\nExecutor: ${who}${entry.reason ? `\nMotivo: ${entry.reason}` : ''}`, 0x5865F2);
        return;
      }

      // 2) Bans/kicks/prune em massa
      if (MOD_COUNTED.has(entry.action)) {
        if (!c.modules.antinuke || botExecutor || !executor || isNukeExempt(executor, c)) return;
        const n = countInWindow(auditBuckets, `${guild.id}:${entry.executorId}:mod`, Date.now(), c.thresholds.banWindowSec * 1000);
        if (n >= c.thresholds.banCount) {
          const action = c.actions.antinuke !== 'none' ? await act(executor, c.actions.antinuke, 'Anti-Raid: bans/kicks em massa') : '';
          await sendLog(guild, 'Bans/kicks em massa', `${who} aplicou ${n} bans/kicks em ${c.thresholds.banWindowSec}s. Proteção: ${action || 'registrado; sem ação automática'}.`);
          auditBuckets.set(`${guild.id}:${entry.executorId}:mod`, []);
        }
        return;
      }

      // 3) Webhook criado por alguém não confiável
      if (entry.action === AuditLogEvent.WebhookCreate) {
        if (!c.modules.antiwebhook) return;
        const trusted = botExecutor || (executor && isExempt(executor, c));
        let result = 'registrado';
        if (!trusted && c.actions.antiwebhook === 'delete') {
          const wh = await client.fetchWebhook(entry.targetId).catch(() => null);
          result = wh ? await wh.delete('Anti-Raid: webhook criado por usuário não confiável').then(() => 'webhook removido').catch((e) => `falha ao remover: ${e.message}`) : 'webhook não encontrado';
        } else if (!trusted && c.actions.antiwebhook !== 'none') {
          result = executor ? await act(executor, c.actions.antiwebhook, 'Anti-Raid: webhook criado') : 'executor desconhecido';
        }
        await sendLog(guild, 'Webhook criado', `Executor: ${who}\nWebhook: \`${entry.targetId}\`\nResultado: ${result}.`, trusted ? 0x5865F2 : 0xE74C3C);
        return;
      }

      // 4) @everyone ganhando permissões perigosas
      if (entry.action === AuditLogEvent.RoleUpdate && entry.targetId === guild.id && c.modules.antinuke) {
        const change = entry.changes?.find((x) => x.key === 'permissions');
        if (!change) return;
        let gained = 0n;
        try { gained = BigInt(change.new ?? 0) & ~BigInt(change.old ?? 0) & DANGEROUS_PERMS; } catch { return; }
        if (!gained) return;
        const trusted = botExecutor || (executor && isNukeExempt(executor, c));
        let result = 'registrado (executor confiável)';
        if (!trusted) {
          const reverted = await guild.roles.everyone.setPermissions(BigInt(change.old ?? 0), 'Anti-Raid: permissão perigosa concedida ao @everyone').then(() => true).catch(() => false);
          const acted = executor && c.actions.antinuke !== 'none' ? await act(executor, c.actions.antinuke, 'Anti-Raid: permissões perigosas no @everyone') : 'sem ação sobre o executor';
          result = `permissões ${reverted ? 'revertidas' : 'NÃO revertidas (verifique a hierarquia do bot)'}; executor: ${acted}`;
        }
        await sendLog(guild, 'Permissões perigosas no @everyone', `Executor: ${who}\nResultado: ${result}.`, trusted ? 0xF39C12 : 0xE74C3C);
      }
    } catch (e) {
      log.error('[ANTIRAID] audit:', e.message);
    }
  });

  log.info('[ANTIRAID] Sistema configurável carregado. Use .antiraid ajuda');

  return {
    init,
    addConfigsFromLegacy,
    dispose() {
      clearInterval(sweeper);
      // grava imediatamente o que estiver pendente (shutdown gracioso)
      for (const [gid, t] of saveTimers) { clearTimeout(t); Promise.resolve(store?.save(gid, configs.get(gid))).catch(() => {}); }
      saveTimers.clear();
    },
    // exposto para testes
    _internals: { cfg, configs, isExempt, isNukeExempt, recentJoins, messageBuckets, auditBuckets, sweeper },
  };
};

module.exports.DEFAULT = DEFAULT;
module.exports.normalizeConfig = normalizeConfig;
module.exports.countInWindow = countInWindow;
module.exports.sweepBuckets = sweepBuckets;
module.exports.createFileStore = createFileStore;
module.exports.createSupabaseStore = createSupabaseStore;
module.exports.DANGEROUS_PERMS = DANGEROUS_PERMS;
