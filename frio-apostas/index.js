/**
 * Frio Mortal Developer — FrioBots
 * © 2026 Frio Mortal Developer. Respeite as licenças das dependências.
 * Bot Discord de uso geral, sem funcionalidades de apostas.
 */
'use strict';
require('dotenv').config();
// Render Web Service: expõe uma porta HTTP sem interferir na conexão do Discord.
const http = require('node:http');
const port = Number(process.env.PORT || 3000);
const healthServer = http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/health') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('FrioBot HTTP online');
});
healthServer.listen(port, '0.0.0.0', () => console.log(`[FrioBot] HTTP ativo na porta ${port}`));
healthServer.on('error', err => { console.error('[FrioBot] Erro HTTP:', err); process.exitCode = 1; });
const { Client, GatewayIntentBits, ActivityType, REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('[Frio Mortal Developer] Configure DISCORD_TOKEN.'); process.exit(1); }
const site = (process.env.SITE_URL || 'https://frio-painel.onrender.com').trim();
const server = (process.env.SERVER_URL || '').trim();
const validUrl = (s) => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol); } catch { return false; } };
if (![site, server].every((s) => !s || validUrl(s))) { console.error('SITE_URL / SERVER_URL inválidos.'); process.exit(1); }

const signature = 'Desenvolvido por Frio Mortal Developer';
function description() {
  return [signature, server && `Servidor: ${server}`, site && `Site: ${site}`].filter(Boolean).join('\n').slice(0, 400);
}
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let lastDescription = null;
async function syncProfile() {
  if (!client.user) return;
  const text = description();
  if (lastDescription === text) return;
  // Descrição no perfil da aplicação (não é o campo 'Sobre mim' da conta do bot).
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    const app = await rest.get(Routes.currentApplication());
    if (app.description !== text) await rest.patch(Routes.currentApplication(), { body: { description: text } });
    lastDescription = text;
    console.log('[Frio Mortal Developer] Descrição da aplicação sincronizada.');
  } catch (err) {
    console.error('[Frio Mortal Developer] Não foi possível atualizar a descrição:', err.message);
  }
}
client.once('ready', async () => {
  console.log(`[Frio Mortal Developer] Online: ${client.user.tag}`);
  client.user.setPresence({ status: 'online', activities: [{ name: 'Frio Mortal Developer', type: ActivityType.Watching }] });
  await syncProfile();
  // Evita atualizações incessantes e limita chamadas à API.
  setInterval(syncProfile, 6 * 60 * 60 * 1000).unref();
});
client.on('error', (error) => console.error('[Frio Mortal Developer] Erro:', error));
client.login(token).catch((err) => { console.error('Falha de login:', err.message); process.exitCode = 1; });
