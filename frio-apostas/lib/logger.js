'use strict';
// Logger com prefixo por bot e redação automática de segredos (tokens nunca vão para o log).
const util = require('node:util');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(prefix, { secrets = () => [], level = process.env.LOG_LEVEL || 'info' } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const redact = (text) => {
    let out = text;
    for (const s of secrets()) {
      if (s && String(s).length >= 8 && out.includes(s)) out = out.split(s).join('[REDACTED]');
    }
    return out;
  };
  const make = (lvl, sink) => (...args) => {
    if (LEVELS[lvl] < min) return;
    sink(`[${prefix}] ${redact(util.format(...args))}`);
  };
  return {
    debug: make('debug', (m) => console.debug(m)),
    log: make('info', (m) => console.log(m)),
    info: make('info', (m) => console.log(m)),
    warn: make('warn', (m) => console.warn(m)),
    error: make('error', (m) => console.error(m)),
    child: (p) => createLogger(`${prefix}:${p}`, { secrets, level }),
  };
}

module.exports = { createLogger };
