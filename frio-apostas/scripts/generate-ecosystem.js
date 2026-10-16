#!/usr/bin/env node
'use strict';
// Gera ecosystem.config.cjs com N workers. Uso: node scripts/generate-ecosystem.js <workers> [porta-base] [heap-MB]
const fs = require('node:fs');
const n = Number(process.argv[2] || 10); const base = Number(process.argv[3] || 3000); const heap = Number(process.argv[4] || 1536);
if (!Number.isInteger(n) || n < 1 || n > 256) { console.error('workers deve ser 1..256'); process.exit(1); }
const apps = Array.from({ length: n }, (_, i) => ({
  name: `frio-fleet-w${i}`, script: './fleet.js', exec_mode: 'fork', instances: 1,
  node_args: `--max-old-space-size=${heap}`, env: { WORKER_INDEX: String(i), WORKER_COUNT: String(n), PORT: String(base + i) },
  autorestart: true, max_restarts: 20, restart_delay: 3000, kill_timeout: 30000, max_memory_restart: `${Math.round(heap * 1.25)}M`,
}));
fs.writeFileSync('ecosystem.config.cjs', `// Gerado por scripts/generate-ecosystem.js — ${n} worker(s). Segredos ficam no .env / variáveis do host.\nmodule.exports = ${JSON.stringify({ apps }, null, 2)};\n`);
console.log(`✅ ecosystem.config.cjs com ${n} workers (portas ${base}..${base + n - 1}).`);
