'use strict';
// Fleet configurável: BOT_COUNT=100 pm2 start ecosystem.config.cjs
// Cada processo exige .env.botN com token e credenciais próprios.
// Não use o mesmo DISCORD_TOKEN em processos diferentes.
const path = require('node:path');
const count = Math.max(1, Math.min(500, Number.parseInt(process.env.BOT_COUNT || '2', 10) || 2));
const basePort = Math.max(1, Number.parseInt(process.env.BASE_PORT || '3001', 10) || 3001);
const root = __dirname;

module.exports = {
  apps: Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      name: `frio-bot-${n}`,
      cwd: root,
      script: path.join(root, 'apostas.js'),
      instances: 1,
      exec_mode: 'fork',
      env: {
        ENV_FILE: path.join(root, `.env.bot${n}`),
        BOT_INSTANCE_ID: `bot${n}`,
        PORT: String(basePort + index),
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
      time: true,
    };
  }),
};
