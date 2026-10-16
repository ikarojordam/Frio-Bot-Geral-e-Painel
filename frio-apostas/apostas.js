/*
 * © 2026 Frio Painel / Frio Bot. Todos os direitos reservados sobre os materiais originais deste arquivo.
 * Contato: friomortalcoracaogelado@gmail.com | Discord: https://discord.gg/n3Zd4bTFS
 *
 * apostas.js — MODO ÚNICO (1 bot, configurado por .env). Compatível com v1.5.0: `npm start`.
 * Para 500+ bots use `npm run fleet` (fleet.js).
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
require('./lib/launch').launch('single').catch((e) => { console.error('❌ Falha ao iniciar:', e.message); process.exit(1); });
