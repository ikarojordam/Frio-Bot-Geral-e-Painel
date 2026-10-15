'use strict';
// Sistema Anti-Raid configurável do BACK BOT — discord.js v14
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');

module.exports = function installAntiRaid(client, options = {}) {
  const root = __dirname;
  const instanceId = String(process.env.BOT_INSTANCE_ID || process.env.DISCORD_CLIENT_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const stateRoot = path.resolve(process.env.STATE_ROOT || path.join(root, 'data'));
  const stateDir = path.join(stateRoot, instanceId);
  try { fs.mkdirSync(stateDir, { recursive: true }); } catch (e) { console.error('[ANTIRAID] state dir:', e.message); }
  const configPath = path.join(stateDir, 'antiraid-config.json');
  const DEFAULT = {
    enabled: false, logChannelId: null,
    modules: { join: true, spam: true, mentions: true, invites: true, antinuke: true, antiwebhook: true, antibot: true },
    thresholds: { joinCount: 6, joinWindowSec: 12, accountAgeDays: 3, spamCount: 6, spamWindowSec: 7, mentionCount: 6, nukeCount: 3, nukeWindowSec: 12 },
    actions: { suspiciousJoin: 'kick', spam: 'timeout', invite: 'delete', mention: 'timeout', antinuke: 'strip', antibot: 'kick' },
    whitelistUserIds: [], whitelistRoleIds: [],
    customRules: []
  };
  let configs = {};
  try { configs = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  const recentJoins = new Map(), messageBuckets = new Map(), auditBuckets = new Map();
  function save() { try { const tmp = `${configPath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(configs, null, 2)); fs.renameSync(tmp, configPath); } catch (e) { console.error('[ANTIRAID] config save:', e.message); } }
  function cfg(gid) {
    if (!configs[gid]) configs[gid] = structuredClone(DEFAULT);
    const c = configs[gid];
    c.modules = { ...DEFAULT.modules, ...(c.modules || {}) };
    c.thresholds = { ...DEFAULT.thresholds, ...(c.thresholds || {}) };
    c.actions = { ...DEFAULT.actions, ...(c.actions || {}) };
    c.whitelistUserIds ||= []; c.whitelistRoleIds ||= []; c.customRules ||= [];
    return c;
  }
  const isExempt = (member, c) => !!member && (member.id === member.guild.ownerId || c.whitelistUserIds.includes(member.id) || member.roles.cache.some(r => c.whitelistRoleIds.includes(r.id)) || member.permissions.has(PermissionFlagsBits.Administrator));
  async function log(guild, title, description, color = 0xE74C3C, fields = []) {
    const c = cfg(guild.id); const embed = new EmbedBuilder().setColor(color).setTitle(`🛡️ ${title}`).setDescription(String(description || 'Sem detalhes.').slice(0, 4000)).addFields(fields.slice(0, 8)).setFooter({ text: 'BACK BOT • Anti-Raid' }).setTimestamp();
    const ch = c.logChannelId ? guild.channels.cache.get(c.logChannelId) : null;
    if (ch?.isTextBased()) await ch.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
    else if (options.logChannelId) { const fallback = guild.channels.cache.get(options.logChannelId); if (fallback?.isTextBased()) await fallback.send({ embeds: [embed] }).catch(() => {}); }
  }
  async function act(member, action, reason) {
    if (!member || member.user?.bot && action !== 'kick' || member.id === member.guild.ownerId) return 'ignorado';
    const me = member.guild.members.me;
    try {
      if (action === 'kick' && me?.permissions.has(PermissionFlagsBits.KickMembers) && member.kickable) { await member.kick(reason); return 'expulso'; }
      if (action === 'ban' && me?.permissions.has(PermissionFlagsBits.BanMembers) && member.bannable) { await member.ban({ reason }); return 'banido'; }
      if (action === 'timeout' && me?.permissions.has(PermissionFlagsBits.ModerateMembers) && member.moderatable) { await member.timeout(10 * 60 * 1000, reason); return 'silenciado por 10 minutos'; }
      if (action === 'strip' && me?.permissions.has(PermissionFlagsBits.ManageRoles) && member.manageable) { const roles = member.roles.cache.filter(r => r.id !== member.guild.id && !r.managed && r.editable); await member.roles.remove(roles, reason); return 'cargos removidos'; }
    } catch (e) { return `falhou: ${e.message}`; }
    return 'ação não aplicada (permissão ou hierarquia insuficiente)';
  }
  const countInWindow = (map, key, now, windowMs) => { const arr = (map.get(key) || []).filter(t => now - t < windowMs); arr.push(now); map.set(key, arr); return arr.length; };
  const admin = m => m.memberPermissions?.has(PermissionFlagsBits.Administrator) || m.guild?.ownerId === m.author?.id;
  const moduleLabels = { join: 'Entradas em massa', spam: 'Anti-spam', mentions: 'Anti-menções', invites: 'Anti-convites', antinuke: 'Anti-nuke', antiwebhook: 'Anti-webhook', antibot: 'Anti-bots' };
  const actionLabels = { suspiciousJoin: 'Entrada suspeita', spam: 'Spam', invite: 'Convites', mention: 'Menções', antinuke: 'Anti-nuke', antibot: 'Bot adicionado' };
  function dashboard(c, guild) {
    const modules = Object.entries(c.modules).map(([k,v]) => `**${moduleLabels[k] || k}**: ${v ? 'Ativado' : 'Desativado'}`).join('\n');
    const actions = Object.entries(c.actions).map(([k,v]) => `**${actionLabels[k] || k}**: \`${v}\``).join('\n');
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
        { name: 'Limites atuais', value: `Entradas: **${c.thresholds.joinCount}** em ${c.thresholds.joinWindowSec}s\nSpam: **${c.thresholds.spamCount}** em ${c.thresholds.spamWindowSec}s\nMenções: **${c.thresholds.mentionCount}**\nAnti-nuke: **${c.thresholds.nukeCount}** em ${c.thresholds.nukeWindowSec}s` }
      )
      .setFooter({ text: `Anti-Raid • ${guild.name} • Use os menus para editar` })
      .setTimestamp();
  }
  function dashboardRows(c) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar:toggle').setLabel(c.enabled ? 'Desativar proteção' : 'Ativar proteção').setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ar:limits').setLabel('Editar limites').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ar:reset').setLabel('Restaurar padrão').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ar:module').setPlaceholder('Ativar/desativar módulos').setMinValues(1).setMaxValues(7).addOptions(
          Object.entries(moduleLabels).map(([value,label]) => ({ label, value, default: Boolean(c.modules[value]) }))
        )
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ar:action').setPlaceholder('Configurar ações automáticas').setMinValues(1).setMaxValues(6).addOptions(
          Object.entries(actionLabels).map(([value,label]) => ({ label, value, description: `Ação atual: ${c.actions[value]}` }))
        )
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('ar:logs').setPlaceholder('Selecionar canal de logs').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
      )
    ];
  }
  function help(c) {
    return `**Anti-Raid ${c.enabled ? '🟢 ATIVO' : '🔴 DESATIVADO'}**\nDigite \`.antiraid\` para abrir o painel interativo.\nComandos legados: \`.antiraid on|off\`, \`.antiraid status\`, \`.antiraid logs #canal\`, \`.antiraid modulo <módulo> on|off\`, \`.antiraid limite <join|spam|mentions|nuke> <2-100>\`, \`.antiraid acao <tipo> <kick|ban|timeout|strip|delete|none>\`, \`.antiraid whitelist add|remove <ID ou @cargo>\`, \`.antiraid reset\`.`;
  }
  client.on('messageCreate', async m => {
    if (!m.guild || m.author.bot || !/^\.antiraid(?:\s|$)/i.test(String(m.content || '').trim())) return;
    if (!admin(m)) return m.reply('Apenas o dono ou administradores podem configurar o Anti-Raid.').catch(() => {});
    const p = String(m.content).trim().split(/\s+/); const c = cfg(m.guild.id); const sub = (p[1] || '').toLowerCase();
    if (!sub || sub === 'painel' || sub === 'ajuda') return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {});
    if (sub === 'on' || sub === 'ativar') { c.enabled = true; save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'off' || sub === 'desativar') { c.enabled = false; save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'status') return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {});
    if (sub === 'logs') { const id = (p[2] || '').replace(/[<#>]/g, ''); const ch = m.guild.channels.cache.get(id); if (!ch?.isTextBased()) return m.reply('Use `.antiraid logs #canal` com um canal de texto válido.').catch(() => {}); c.logChannelId = ch.id; save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'modulo') { const k = (p[2] || '').toLowerCase(), v = (p[3] || '').toLowerCase(); if (!(k in c.modules) || !['on','off','ativar','desativar'].includes(v)) return m.reply(help(c)).catch(() => {}); c.modules[k] = ['on','ativar'].includes(v); save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'limite') { const k = (p[2] || '').toLowerCase(), n = Number(p[3]); const map = { join:'joinCount', spam:'spamCount', mentions:'mentionCount', nuke:'nukeCount' }; if (!map[k] || !Number.isInteger(n) || n < 2 || n > 100) return m.reply('Uso: `.antiraid limite <join|spam|mentions|nuke> <2-100>`').catch(() => {}); c.thresholds[map[k]] = n; save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'acao') { const k = (p[2] || '').toLowerCase(), v = (p[3] || '').toLowerCase(); if (!(k in c.actions) || !['kick','ban','timeout','strip','delete','none'].includes(v)) return m.reply(help(c)).catch(() => {}); c.actions[k] = v; save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'whitelist') { const mode=(p[2]||'').toLowerCase(), id=(p[3]||'').replace(/[<@!&>]/g,''); const role = m.guild.roles.cache.get(id); const uid = m.guild.members.cache.has(id) ? id : null; const list = role ? c.whitelistRoleIds : c.whitelistUserIds; const val = role ? role.id : uid; if (!['add','remove'].includes(mode) || !val) return m.reply('Uso: `.antiraid whitelist add|remove @usuário|@cargo`').catch(() => {}); if (mode === 'add' && !list.includes(val)) list.push(val); if (mode === 'remove') { const i=list.indexOf(val); if(i>=0) list.splice(i,1); } save(); return m.reply({ embeds: [dashboard(c, m.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (sub === 'reset') { configs[m.guild.id] = structuredClone(DEFAULT); save(); return m.reply({ embeds: [dashboard(cfg(m.guild.id), m.guild)], components: dashboardRows(cfg(m.guild.id)) }).catch(() => {}); }
    return m.reply(help(c)).catch(() => {});
  });
  client.on('interactionCreate', async i => {
    if (!i.inGuild() || !i.customId?.startsWith('ar:')) return;
    if (!i.memberPermissions?.has(PermissionFlagsBits.Administrator) && i.guild.ownerId !== i.user.id) return i.reply({ content: 'Apenas o dono ou administradores podem configurar o Anti-Raid.', ephemeral: true }).catch(() => {});
    const c = cfg(i.guild.id);
    if (i.customId === 'ar:toggle') { c.enabled = !c.enabled; save(); return i.update({ embeds: [dashboard(c, i.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (i.customId === 'ar:reset') { configs[i.guild.id] = structuredClone(DEFAULT); save(); const fresh=cfg(i.guild.id); return i.update({ embeds: [dashboard(fresh, i.guild)], components: dashboardRows(fresh) }).catch(() => {}); }
    if (i.customId === 'ar:module') { for (const [key] of Object.entries(moduleLabels)) c.modules[key] = i.values.includes(key); save(); return i.update({ embeds: [dashboard(c, i.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (i.customId === 'ar:logs') { c.logChannelId = i.values[0]; save(); return i.update({ embeds: [dashboard(c, i.guild)], components: dashboardRows(c) }).catch(() => {}); }
    if (i.customId === 'ar:action') {
      const key = i.values[0];
      const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
      const opts = ['kick','ban','timeout','strip','delete','none'].map(v => ({ label: v, value: v, default: c.actions[key] === v }));
      const menu = new StringSelectMenuBuilder().setCustomId(`ar:setaction:${key}`).setPlaceholder(`Escolha a ação para ${actionLabels[key] || key}`).addOptions(opts);
      return i.reply({ content: `Ação para **${actionLabels[key] || key}**: \`${c.actions[key]}\``, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true }).catch(() => {});
    }
    if (i.customId.startsWith('ar:setaction:')) { const key=i.customId.split(':')[2]; if (!(key in c.actions)) return i.reply({ content:'Ação inválida.', ephemeral:true }); c.actions[key]=i.values[0]; save(); return i.update({ content:`Ação atualizada: **${actionLabels[key] || key}** → \`${c.actions[key]}\``, components: [] }).catch(() => {}); }
    if (i.customId === 'ar:limits') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modal = new ModalBuilder().setCustomId('ar:limits-modal').setTitle('Editar limites Anti-Raid');
      const fields = [
        ['joinCount','Entradas em massa (2-100)',c.thresholds.joinCount],
        ['joinWindowSec','Janela de entradas em segundos (3-120)',c.thresholds.joinWindowSec],
        ['spamCount','Mensagens para detectar spam (2-100)',c.thresholds.spamCount],
        ['spamWindowSec','Janela de spam em segundos (2-60)',c.thresholds.spamWindowSec],
        ['mentionCount','Menções para detectar abuso (2-100)',c.thresholds.mentionCount]
      ];
      modal.addComponents(...fields.map(([id,label,value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setValue(String(value)).setRequired(true))));
      return i.showModal(modal).catch(() => {});
    }
    if (i.customId === 'ar:limits-modal') {
      const bounds = { joinCount:[2,100], joinWindowSec:[3,120], spamCount:[2,100], spamWindowSec:[2,60], mentionCount:[2,100] };
      for (const [key,[min,max]] of Object.entries(bounds)) { const n=Number(i.fields.getTextInputValue(key)); if (!Number.isInteger(n)||n<min||n>max) return i.reply({ content:`Valor inválido em ${key}. Confira os limites permitidos.`, ephemeral:true }).catch(()=>{}); c.thresholds[key]=n; }
      save(); return i.reply({ embeds:[dashboard(c,i.guild)], components:dashboardRows(c), ephemeral:true }).catch(()=>{});
    }
  });

  client.on('guildMemberAdd', async member => {
    const c = cfg(member.guild.id); if (!c.enabled || isExempt(member, c)) return;
    if (c.modules.join) {
      const now = Date.now(); const n = countInWindow(recentJoins, member.guild.id, now, c.thresholds.joinWindowSec * 1000);
      const ageDays = (now - member.user.createdTimestamp) / 86400000;
      if (n >= c.thresholds.joinCount) {
        const result = await act(member, c.actions.suspiciousJoin, 'Anti-Raid: entrada em massa detectada');
        await log(member.guild, 'Possível raid detectada', `${member.user.tag} (${member.id}) entrou durante uma sequência de ${n} entradas em ${c.thresholds.joinWindowSec}s. Ação: ${result}.`);
      } else if (ageDays < c.thresholds.accountAgeDays) {
        await log(member.guild, 'Conta recém-criada entrou', `${member.user.tag} (${member.id}); conta com ${ageDays.toFixed(1)} dia(s).` , 0xF39C12);
        if (c.actions.suspiciousJoin !== 'none') { const result=await act(member,c.actions.suspiciousJoin,'Anti-Raid: conta muito recente'); await log(member.guild,'Ação contra conta recente',`${member.user.tag}: ${result}.`,0xF39C12); }
      }
    }
    if (member.user.bot && c.modules.antibot) {
      await log(member.guild, 'Bot adicionado', `${member.user.tag} (${member.id}) foi adicionado ao servidor. Verifique se foi autorizado.`, 0xF39C12);
      if (c.actions.antibot !== 'none') { const result=await act(member,c.actions.antibot,'Anti-Raid: bot adicionado'); await log(member.guild,'Proteção contra bots',`${member.user.tag}: ${result}.`); }
    }
  });

  client.on('messageCreate', async m => {
    if (!m.guild || m.author.bot) return;
    const c=cfg(m.guild.id); if(!c.enabled) return;
    const member=m.member; if(isExempt(member,c)) return;
    const key=`${m.guild.id}:${m.author.id}`; const now=Date.now();
    if(c.modules.spam){ const n=countInWindow(messageBuckets,key,now,c.thresholds.spamWindowSec*1000); if(n>=c.thresholds.spamCount){ await m.delete().catch(()=>{}); let result='mensagens apagadas'; if(c.actions.spam!=='delete'&&c.actions.spam!=='none') result=await act(member,c.actions.spam,'Anti-Raid: spam detectado'); await log(m.guild,'Spam detectado',`${m.author.tag} (${m.author.id}) enviou ${n} mensagens em ${c.thresholds.spamWindowSec}s. Ação: ${result}.`); messageBuckets.set(key,[]); return; } }
    if(c.modules.mentions && (m.mentions.users.size + m.mentions.roles.size)>=c.thresholds.mentionCount){ await m.delete().catch(()=>{}); const result=c.actions.mention==='delete'||c.actions.mention==='none'?'mensagem apagada':await act(member,c.actions.mention,'Anti-Raid: excesso de menções'); await log(m.guild,'Excesso de menções',`${m.author.tag} marcou muitas pessoas/cargos. Ação: ${result}.`); return; }
    if(c.modules.invites && /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(m.content)){ await m.delete().catch(()=>{}); const result=c.actions.invite==='delete'||c.actions.invite==='none'?'convite removido':await act(member,c.actions.invite,'Anti-Raid: convite não permitido'); await log(m.guild,'Convite do Discord detectado',`${m.author.tag} enviou um convite. Ação: ${result}.`,0xF39C12); }
  });

  // Eventos de criação/remoção são sempre auditados quando o Anti-Raid está ligado.
  for (const event of ['channelCreate','channelDelete','roleCreate','roleDelete','webhookUpdate']) client.on(event, async obj => {
    const guild=obj.guild || obj; const c=cfg(guild.id); if(!c.enabled) return;
    const isWebhook=event==='webhookUpdate'; if(isWebhook&&!c.modules.antiwebhook) return;
    const auditType = ({channelCreate:AuditLogEvent.ChannelCreate,channelDelete:AuditLogEvent.ChannelDelete,roleCreate:AuditLogEvent.RoleCreate,roleDelete:AuditLogEvent.RoleDelete,webhookUpdate:AuditLogEvent.WebhookUpdate})[event];
    const logs=await guild.fetchAuditLogs({type:auditType,limit:3}).catch(()=>null); const entry=logs?.entries?.find(e=>Date.now()-e.createdTimestamp<15000); const executor=entry?.executor;
    let action='';
    if(c.modules.antinuke && executor && !c.whitelistUserIds.includes(executor.id) && executor.id!==guild.ownerId){
      const k=`${guild.id}:${executor.id}:${event}`; const n=countInWindow(auditBuckets,k,Date.now(),c.thresholds.nukeWindowSec*1000);
      if(n>=c.thresholds.nukeCount){ const member=await guild.members.fetch(executor.id).catch(()=>null); if(member&&!isExempt(member,c)&&c.actions.antinuke!=='none') action=await act(member,c.actions.antinuke,'Anti-Raid: atividade destrutiva em massa'); await log(guild,'Possível ataque de destruição',`${executor.tag} executou ${n} ações do tipo ${event} em ${c.thresholds.nukeWindowSec}s. Proteção: ${action||'registrado; sem ação automática'}.`); auditBuckets.set(k,[]); }
    }
    if(event==='webhookUpdate'&&!c.modules.antiwebhook) return;
    const target=event.startsWith('channel')?(obj.name||obj.id):(event.startsWith('role')?(obj.name||obj.id):'webhooks do canal');
    await log(guild,`Auditoria: ${event}`,`Alvo: **${String(target).slice(0,150)}**\nExecutor: ${executor ? `${executor.tag} (${executor.id})` : 'não identificado'}\n${entry?.reason ? `Motivo: ${entry.reason}` : ''}`,0x5865F2);
  });
  console.log('[ANTIRAID] Sistema configurável carregado. Use .antiraid ajuda');
};
