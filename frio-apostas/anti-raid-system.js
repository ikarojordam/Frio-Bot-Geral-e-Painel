'use strict';
// Sistema Anti-Raid configurável do BACK BOT — discord.js v14
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');

module.exports = function installAntiRaid(client, options = {}) {
  const root = __dirname;
  const configPath = path.join(root, 'antiraid-config.json');
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
  function save() { try { fs.writeFileSync(configPath, JSON.stringify(configs, null, 2)); } catch (e) { console.error('[ANTIRAID] config save:', e.message); } }
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
  function help(c) {
    return `**Anti-Raid ${c.enabled ? '🟢 ATIVO' : '🔴 DESATIVADO'}**\n` +
      '`.antiraid on|off` — ligar/desligar sistema\n' +
      '`.antiraid status` — ver configurações\n' +
      '`.antiraid logs #canal` — definir canal de logs\n' +
      '`.antiraid modulo <join|spam|mentions|invites|antinuke|antiwebhook|antibot> on|off`\n' +
      '`.antiraid limite <join|spam|mentions|nuke> <número>`\n' +
      '`.antiraid acao <join|spam|invites|mentions|antinuke|antibot> <kick|ban|timeout|strip|delete|none>`\n' +
      '`.antiraid whitelist add|remove <ID ou @cargo>`\n' +
      '`.antiraid regra criar <nome> <on|off>` / `.antiraid regra excluir <nome>` — regras personalizadas\n' +
      '`.antiraid reset` — restaurar configuração padrão (desligado).';
  }
  client.on('messageCreate', async m => {
    if (!m.guild || m.author.bot) return;
    const raw = String(m.content || '').trim();
    if (!/^\.antiraid(?:\s|$)/i.test(raw)) return;
    if (!admin(m)) return m.reply('❌ Apenas o dono ou administradores podem configurar o Anti-Raid.').catch(() => {});
    const p = raw.split(/\s+/); const c = cfg(m.guild.id); const sub = (p[1] || 'ajuda').toLowerCase();
    if (sub === 'on' || sub === 'ativar') { c.enabled = true; save(); await log(m.guild, 'Sistema ativado', `Ativado por ${m.author.tag}.`, 0x2ECC71); return m.reply('🟢 Anti-Raid ativado.').catch(() => {}); }
    if (sub === 'off' || sub === 'desativar') { c.enabled = false; save(); await log(m.guild, 'Sistema desativado', `Desativado por ${m.author.tag}.`, 0xF39C12); return m.reply('🔴 Anti-Raid desativado.').catch(() => {}); }
    if (sub === 'status') return m.reply(help(c) + `\n\n**Logs:** ${c.logChannelId ? `<#${c.logChannelId}>` : 'não configurado'}\n**Limites:** ${JSON.stringify(c.thresholds)}\n**Módulos:** ${Object.entries(c.modules).map(([k,v]) => `${k}=${v?'on':'off'}`).join(' • ')}`).catch(() => {});
    if (sub === 'logs') { const id = (p[2] || '').replace(/[<#>]/g, ''); const ch = m.guild.channels.cache.get(id); if (!ch?.isTextBased()) return m.reply('Use `.antiraid logs #canal` com um canal de texto válido.').catch(() => {}); c.logChannelId = ch.id; save(); await log(m.guild, 'Canal de logs configurado', `Alterado por ${m.author.tag}.`, 0x2ECC71); return m.reply(`✅ Logs serão enviados para ${ch}.`).catch(() => {}); }
    if (sub === 'modulo') { const k = (p[2] || '').toLowerCase(), v = (p[3] || '').toLowerCase(); if (!(k in c.modules) || !['on','off','ativar','desativar'].includes(v)) return m.reply('Uso: `.antiraid modulo <join|spam|mentions|invites|antinuke|antiwebhook|antibot> on|off`').catch(() => {}); c.modules[k] = ['on','ativar'].includes(v); save(); return m.reply(`✅ Módulo **${k}** ${c.modules[k] ? 'ativado' : 'desativado'}.`).catch(() => {}); }
    if (sub === 'limite') { const k = (p[2] || '').toLowerCase(), n = Number(p[3]); const map = { join:'joinCount', spam:'spamCount', mentions:'mentionCount', nuke:'nukeCount' }; if (!map[k] || !Number.isInteger(n) || n < 2 || n > 100) return m.reply('Uso: `.antiraid limite <join|spam|mentions|nuke> <2-100>`').catch(() => {}); c.thresholds[map[k]] = n; save(); return m.reply(`✅ Limite ${k} definido para ${n}.`).catch(() => {}); }
    if (sub === 'acao') { const k = (p[2] || '').toLowerCase(), v = (p[3] || '').toLowerCase(); if (!(k in c.actions) || !['kick','ban','timeout','strip','delete','none'].includes(v)) return m.reply('Uso: `.antiraid acao <join|spam|invites|mentions|antinuke|antibot> <kick|ban|timeout|strip|delete|none>`').catch(() => {}); c.actions[k] = v; save(); return m.reply(`✅ Ação de ${k}: **${v}**.`).catch(() => {}); }
    if (sub === 'whitelist') { const mode=(p[2]||'').toLowerCase(), id=(p[3]||'').replace(/[<@!&>]/g,''); const role = m.guild.roles.cache.get(id); const uid = m.guild.members.cache.has(id) ? id : null; const list = role ? c.whitelistRoleIds : c.whitelistUserIds; const val = role ? role.id : uid; if (!['add','remove'].includes(mode) || !val) return m.reply('Uso: `.antiraid whitelist add|remove @usuário|@cargo`').catch(() => {}); if (mode === 'add' && !list.includes(val)) list.push(val); if (mode === 'remove') { const i=list.indexOf(val); if(i>=0) list.splice(i,1); } save(); return m.reply(`✅ Whitelist atualizada para ${role ? role.name : `<@${val}>`}.`).catch(() => {}); }
    if (sub === 'regra') { const mode=(p[2]||'').toLowerCase(), name=String(p[3]||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,32), state=(p[4]||'').toLowerCase(); if(mode==='criar' && name && ['on','off'].includes(state)){ if(c.customRules.some(r=>r.name===name)) return m.reply('Já existe uma regra com esse nome.').catch(()=>{}); c.customRules.push({name,enabled:state==='on',createdBy:m.author.id,createdAt:new Date().toISOString()}); save(); return m.reply(`✅ Regra **${name}** criada como ${state}. Observação: regras personalizadas ficam registradas para expansão; não executam ações sem um gatilho configurado.`).catch(()=>{}); } if(mode==='excluir' && name){ const before=c.customRules.length; c.customRules=c.customRules.filter(r=>r.name!==name); save(); return m.reply(before===c.customRules.length?'Regra não encontrada.':`✅ Regra **${name}** excluída.`).catch(()=>{}); } return m.reply('Uso: `.antiraid regra criar <nome> on|off` ou `.antiraid regra excluir <nome>`').catch(()=>{}); }
    if (sub === 'reset') { configs[m.guild.id] = structuredClone(DEFAULT); save(); return m.reply('♻️ Configuração restaurada. O sistema fica desativado por segurança; use `.antiraid on` para ativar.').catch(() => {}); }
    return m.reply(help(c)).catch(() => {});
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
