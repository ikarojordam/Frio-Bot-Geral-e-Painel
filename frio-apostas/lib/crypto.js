'use strict';
// Cofre de segredos: AES-256-GCM com chave mestra (FLEET_MASTER_KEY), suporta rotação de chave.
// Formato: v1:<kid>:<iv>:<tag>:<ciphertext>  (base64). O "aad" (id do bot) amarra o segredo à linha.
const crypto = require('node:crypto');

const keyId = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

function parseKey(b64, label = 'FLEET_MASTER_KEY') {
  const key = Buffer.from(String(b64 || '').trim(), 'base64');
  if (key.length !== 32) {
    throw new Error(`${label} inválida: precisa ter 32 bytes em base64 (gere com: node scripts/fleet-cli.js gen-key)`);
  }
  return key;
}

function generateKey() {
  return crypto.randomBytes(32).toString('base64');
}

class Vault {
  // keys[0] é a chave atual (usada para cifrar); as demais só decifram (rotação).
  constructor(keys) {
    if (!Array.isArray(keys) || !keys.length) throw new Error('Vault precisa de ao menos uma chave.');
    this.keys = keys.map((key) => ({ key, kid: keyId(key) }));
  }

  encrypt(plain, aad = '') {
    const { key, kid } = this.keys[0];
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(aad)));
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', kid, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
  }

  decrypt(blob, aad = '') {
    const parts = String(blob || '').split(':');
    if (parts.length !== 5 || parts[0] !== 'v1') throw new Error('segredo cifrado em formato inválido');
    const [, kid, iv, tag, ct] = parts;
    const entry = this.keys.find((k) => k.kid === kid);
    if (!entry) throw new Error(`chave mestra ${kid} não está disponível (configure FLEET_MASTER_KEY_PREVIOUS?)`);
    const decipher = crypto.createDecipheriv('aes-256-gcm', entry.key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(String(aad)));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    try {
      return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('falha ao decifrar segredo (chave errada ou linha adulterada)');
    }
  }

  needsRotation(blob) {
    const kid = String(blob || '').split(':')[1];
    return kid !== this.keys[0].kid;
  }
}

function vaultFromEnv(env = process.env) {
  const keys = [];
  if (env.FLEET_MASTER_KEY) keys.push(parseKey(env.FLEET_MASTER_KEY, 'FLEET_MASTER_KEY'));
  for (const prev of String(env.FLEET_MASTER_KEY_PREVIOUS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    keys.push(parseKey(prev, 'FLEET_MASTER_KEY_PREVIOUS'));
  }
  return keys.length ? new Vault(keys) : null;
}

// Comparação em tempo constante que NÃO aceita sufixos/prefixos (corrige o bug do /api/bot/status original).
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { Vault, vaultFromEnv, parseKey, generateKey, safeEqual, keyId };
