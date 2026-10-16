'use strict';
// Stubs mínimos de discord.js/qrcode para testar offline (sem npm install).
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const chain = () => new Proxy(function () {}, { get: (t, p) => (p === 'toJSON' ? () => ({}) : p === Symbol.toPrimitive ? () => '' : chain()), apply: () => chain(), construct: () => chain() });
class Guild { constructor(id) { this.id = id; } }
class Client extends EventEmitter {
  constructor(opts) { super(); this.opts = opts; this.guilds = { cache: new Map() }; this.ws = { ping: 42, status: 0 }; this.user = null; this._ready = false; this.loginCalls = 0; }
  isReady() { return this._ready; }
  async login(token) { this.loginCalls++; if (token === 'BAD') { const e = new Error('An invalid token was provided.'); e.code = 'TokenInvalid'; throw e; }
    this.user = { id: 'u1', tag: 'bot#0001', username: 'bot', setPresence: () => {}, setUsername: async () => {} }; setImmediate(() => { this._ready = true; this.emit('ready'); }); return token; }
  async destroy() { this._ready = false; }
}
const bigflags = new Proxy({}, { get: (t, p) => (typeof p === 'string' ? 1n : undefined) });
const nums = new Proxy({}, { get: (t, p) => (typeof p === 'string' ? 1 : undefined) });
const stub = new Proxy({
  Client, Guild, PermissionFlagsBits: bigflags, GatewayIntentBits: nums, ActivityType: nums, ButtonStyle: nums, TextInputStyle: nums, ChannelType: nums,
  AuditLogEvent: nums, Events: new Proxy({}, { get: (t, p) => (typeof p === 'string' ? p.charAt(0).toLowerCase() + p.slice(1) : undefined) }),
  MessageFlags: { Ephemeral: 64 }, Partials: nums, escapeMarkdown: (s) => s,
  Options: { cacheWithLimits: (x) => x, DefaultMakeCacheSettings: {}, DefaultSweeperSettings: {} },
}, { get: (t, p) => (p in t ? t[p] : typeof p === 'string' ? chain() : undefined) });
const orig = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'discord.js') return stub;
  if (request === 'qrcode') return { toBuffer: async () => Buffer.alloc(1) };
  if (request === 'play-dl') throw new Error('stub');
  return orig.call(this, request, ...rest);
};
module.exports = { Client, Guild };
