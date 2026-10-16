'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'bot-runtime.js'), 'utf8');
function between(start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, `não encontrou: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `não encontrou marcador final: ${end}`);
  return source.slice(a, b);
}

test('não adiciona outro comando slash /apostas', () => {
  const defs = source.match(/new SlashCommandBuilder\(\)\s*\.setName\('apostas'\)/g) || [];
  assert.equal(defs.length, 1, 'deve haver somente uma definição slash de /apostas');
  assert.match(source, /\.setName\('painel'\)\s*\.setDescription\('Abrir painel FF'\)/);
});

test('seletores SS ficam dentro da seção Apostas, não na tela raiz', () => {
  const rootPanel = between('async function ffConfigPanel(gid)', 'async function ffPanelCanais(gid)');
  const betsPanel = between('async function ffPanelApostas(gid)', 'async function ffPanelValores(gid)');
  assert.doesNotMatch(rootPanel, /ffcfg:ssrole:(mobile|emu)/);
  assert.match(betsPanel, /ffcfg:ssrole:mobile/);
  assert.match(betsPanel, /ffcfg:ssrole:emu/);
  assert.match(betsPanel, /ss_role_mobile:/);
  assert.match(betsPanel, /ss_role_emu:/);
});

test('seleção de cargo salva e atualiza o mesmo painel efêmero', () => {
  const handler = between("// Configuração de cargos SS dentro do painel efêmero /apostas painel.", "// ═══════════════════════════════════════════════════════════\n// HANDLER — /dev + /apostas");
  assert.match(handler, /deps\.flags\.set\(BOT_ID, `ss_role_\$\{mode\}:\$\{i\.guild\.id\}`, role\.id\)/);
  assert.match(handler, /i\.deferUpdate\(\)/);
  assert.match(handler, /i\.editReply\(await ffPanelApostas\(i\.guild\.id\)\)/);
});

test('.telmob e .telemu usam cargos definidos no painel; .ss é geral', () => {
  const handler = between("if (['.ss', '.telmob', '.telemu'].some", "if (lower === '.gpconfig'");
  assert.match(handler, /ss_role_mobile:/);
  assert.match(handler, /ss_role_emu:/);
  assert.match(handler, /mode === 'any'/);
});

test('não existe configuração SS pelo comando de prefixo .apostas ssrole', () => {
  assert.doesNotMatch(source, /args\[1\]\?\.toLowerCase\(\)\s*===\s*'ssrole'/);
});


test('publicação manual permite pesquisar canal e publicar todos os valores em ordem decrescente', () => {
  assert.match(source, /ChannelSelectMenuBuilder\(\)[\s\S]{0,220}setChannelTypes\(ChannelType\.GuildText\)/);
  assert.match(source, /ffcfg:postar_channelpick:/);
  assert.match(source, /Publicar TODOS os valores \(maior → menor\)/);
  assert.match(source, /\.sort\(\(a, b\) => b - a\)/);
  assert.match(source, /Publicados: \*\*\$\{posted\}\/\$\{valuesToPost\.length\}\*\*/);
});

test('setup informa explicitamente modalidades ausentes e regras abrangem apostas e pagamentos', () => {
  assert.match(source, /apostas \$\{f\.label\}: canal não criado, embeds não serão publicados/);
  assert.match(source, /2x2_misto/);
  assert.match(source, /6\. Pagamentos/);
  assert.match(source, /Embeds informativos — um para CADA canal que precisa/);
});


test('.govdev cria os seis canais de atendimento e encaminha cada tipo ao canal certo', () => {
  const setup = between('const STRUCTURE = [', '// Categorias');
  assert.match(setup, /cat: `\$\{E\} ATENDIMENTO`/);
  for (const key of ['suporte', 'reembolso', 'receber', 'atendimento_evento', 'vagas', 'atendimento_divulgacao']) assert.match(setup, new RegExp(`key: '${key}'`));
  const panel = between("const tkCh = created.suporte", "await log('🛡️ Painéis de staff...") ;
  for (const id of ['suporte', 'reembolso', 'receber', 'evento', 'vagas', 'divulgacao']) assert.match(panel, new RegExp(`id: '${id}'`));
  assert.match(panel, /topic_channel_id: created\.reembolso\?\.id/);
  assert.doesNotMatch(panel, /label: 'Problema com Aposta'|label: 'Vaga Mediador'|label: 'Vaga Influencer'|label: 'Outro assunto'/);
});

test('categoria MISTO é criada depois de EMULADOR e há canais de logs separados', () => {
  const setup = between('const STRUCTURE = [', '// Categorias');
  assert.ok(setup.indexOf('cat: `${E} EMULADOR`') < setup.indexOf('cat: `${E} MISTO`'));
  for (const key of ['log_membros', 'log_mensagens', 'log_moderacao', 'log_pagamentos', 'log_erros']) assert.match(setup, new RegExp(`key: '${key}'`));
  assert.match(source, /client\.on\('messageDelete'/);
  assert.match(source, /client\.on\('messageUpdate'/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'sql', 'MIGRACAO_LOGS_ATENDIMENTO.sql'), 'utf8');
  assert.match(migration, /ALTER TABLE public\.configs/s);
});

test('partida: menu único, botão de finalizar só após vencedor e copiar PIX efêmero', () => {
  assert.match(source, /setCustomId\(`ffm:manage:\$\{matchId\}`\)/);
  assert.match(source, /setCustomId\(`ffm:finalizar:\$\{matchId\}`\)/);
  assert.match(source, /Vencedor selecionado:[\s\S]{0,240}Finalizar partida/);
  assert.match(source, /setCustomId\(`ffm:copy_pix:\$\{matchId\}`\)/);
  assert.match(source, /action === 'copy_pix'[\s\S]{0,700}flags: EPHEMERAL/);
});

test('fila: não há pausa artificial e cancelamento responde antes da limpeza do tópico', () => {
  const thread = between('async function ffCriarThreadAposta', 'function ffEscapeHtml');
  assert.doesNotMatch(thread, /sleep\(300\)/);
  assert.match(thread, /Promise\.all\(\[ffGetConfig\(g\.id\), ffMediatorNext\(g\.id\)\]\)/);
  assert.match(thread, /void inviteMembers\.catch/);
  assert.match(source, /Fila cancelada\. Organizando o tópico em segundo plano/);
});

test('PIX por partida é salvo no cadastro individual do mediador', () => {
  assert.match(source, /ffSetMediatorPix\(guild\.id, m\.mediator_id, key, name, city, 'aleatoria'\)/);
  assert.match(source, /const pix = m\.mediator_id \? await ffGetMediatorPix\(guild\.id, m\.mediator_id\)/);
});
