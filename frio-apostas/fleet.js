/*
 * fleet.js — MODO FROTA: hospeda vários bots (tokens do registro fleet_bots) neste processo.
 * Escala com WORKER_COUNT/WORKER_INDEX (um processo por índice). Veja README_MULTIBOT.md.
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
require('./lib/launch').launch('fleet').catch((e) => { console.error('❌ Falha ao iniciar a frota:', e.message); process.exit(1); });
