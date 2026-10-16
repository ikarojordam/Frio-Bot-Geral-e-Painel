#!/usr/bin/env node
'use strict';
// Administração do registro da frota. Uso: node scripts/fleet-cli.js <comando> [args]
// Tokens NUNCA vão na linha de comando: use --token-env VAR ou entrada padrão (stdin) ou import de JSON.
try { require('dotenv').config({ path: process.env.ENV_FILE || '.env' }); } catch {}
const fs = require('node:fs');
const crypto = require('node:crypto');
const { vaultFromEnv, generateKey } = require('../lib/crypto');
const { createSupabase } = require('../lib/launch');
const { FleetStore } = require('../lib/store');
const { FEATURE_DEFAULTS, PRESENCE_TYPES, PRESENCE_STATUS } = require('../lib/config');

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { const k = rest[i].slice(2); flags[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; } else pos.push(rest[i]);
}
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/;

const FIELD_MAP = { name: 'display_name', display_name: 'display_name', org: 'org_name', org_name: 'org_name', emoji: 'org_emoji', org_emoji: 'org_emoji',
  color: 'embed_color', embed_color: 'embed_color', presence: 'presence_text', presence_text: 'presence_text', presence_type: 'presence_type',
  presence_status: 'presence_status', log_channel: 'log_channel_id', log_channel_id: 'log_channel_id', owner: 'owner_id', owner_id: 'owner_id',
  client_id: 'application_id', application_id: 'application_id', worker_group: 'worker_group', notes: 'notes' };

async function readStdin() { return new Promise((res) => { let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => res(d.trim())); }); }
async function readToken() {
  if (flags['token-env']) return process.env[flags['token-env']] || die(`variável ${flags['token-env']} vazia`);
  if (!process.stdin.isTTY) return (await readStdin()) || die('nenhum token recebido no stdin');
  die('informe o token por --token-env VAR ou via stdin (echo "$TOKEN" | node scripts/fleet-cli.js add ...)');
}
function applyFields(row, obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('feature.')) {
      const name = k.slice(8); if (!(name in FEATURE_DEFAULTS.fleet)) die(`feature desconhecida: ${name}`);
      row.features = { ...(row.features || {}), [name]: v === true || ['true', 'on', '1'].includes(String(v)) };
    } else if (FIELD_MAP[k]) {
      let val = v === 'null' ? null : v;
      if (FIELD_MAP[k] === 'worker_group' && val !== null) val = Number(val);
      if (FIELD_MAP[k] === 'presence_type' && !PRESENCE_TYPES.includes(val)) die(`presence_type deve ser ${PRESENCE_TYPES.join('|')}`);
      if (FIELD_MAP[k] === 'presence_status' && !PRESENCE_STATUS.includes(val)) die(`presence_status deve ser ${PRESENCE_STATUS.join('|')}`);
      row[FIELD_MAP[k]] = val;
    } else if (!['token', 'panel_token', 'id', 'enabled'].includes(k) && k !== 'token-env') die(`campo desconhecido: ${k}`);
  }
  return row;
}

(async () => {
  if (cmd === 'gen-key') { console.log(generateKey()); console.error('↑ Guarde em FLEET_MASTER_KEY (segredo do host). Perder esta chave = perder o acesso aos tokens.'); return; }
  if (cmd === 'gen-secret') { console.log(crypto.randomBytes(32).toString('hex')); return; }
  if (!cmd || cmd === 'help') {
    console.log(`Comandos: gen-key | gen-secret | add <id> --name N [--token-env VAR] [--client_id ID] [--owner ID] [--org N] [--emoji E] [--panel-token auto] [--worker_group N]
          import <arquivo.json> | list | show <id> | set <id> campo=valor ... (feature.dev_role=true) | enable <id> | disable <id>
          rotate-token <id> [--token-env VAR] | remove <id> | reencrypt | release-lease <id> | release-guild <guildId>`); return;
  }
  const vault = vaultFromEnv(); if (!vault) die('FLEET_MASTER_KEY ausente.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) die('SUPABASE_URL/SUPABASE_KEY ausentes.');
  const sb = createSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const store = new FleetStore(sb);
  const ok = (r, what) => { if (r.error) die(`${what}: ${r.error.message}`); return r.data; };
  const getRow = async (id) => { const d = ok(await sb.from('fleet_bots').select('*').eq('id', id).maybeSingle(), 'consulta'); if (!d) die(`bot ${id} não existe`); return d; };

  if (cmd === 'add') {
    const id = pos[0]; if (!ID_RE.test(id || '')) die('id inválido (a-z, 0-9, _ e -, 2-63 chars)');
    if (!flags.name) die('--name é obrigatório');
    const token = await readToken();
    const row = applyFields({ id, enabled: true, token_enc: vault.encrypt(token, id) }, flags);
    if (flags['panel-token']) { const pt = flags['panel-token'] === 'auto' ? crypto.randomBytes(24).toString('hex') : flags['panel-token']; row.panel_api_token_enc = vault.encrypt(pt, id); console.log('PANEL_API_TOKEN (guarde agora):', pt); }
    ok(await sb.from('fleet_bots').insert(row), 'inserir'); console.log(`✅ ${id} registrado.`);
  } else if (cmd === 'import') {
    const list = JSON.parse(fs.readFileSync(pos[0], 'utf8')); if (!Array.isArray(list)) die('o JSON precisa ser uma lista');
    const rows = list.map((b) => {
      if (!ID_RE.test(b.id || '')) die(`id inválido: ${b.id}`); if (!b.token || !b.name) die(`${b.id}: token e name são obrigatórios`);
      const { id, token, panel_token, name, enabled, ...others } = b;
      const row = applyFields({ id, enabled: enabled !== false, display_name: name, token_enc: vault.encrypt(token, id) }, others);
      if (panel_token) row.panel_api_token_enc = vault.encrypt(panel_token, id);
      return row;
    });
    for (let i = 0; i < rows.length; i += 100) ok(await sb.from('fleet_bots').upsert(rows.slice(i, i + 100), { onConflict: 'id' }), 'importar');
    console.log(`✅ ${rows.length} bot(s) importado(s). APAGUE o arquivo JSON (contém tokens em texto puro).`);
  } else if (cmd === 'list') {
    const bots = await store.listBots(); const st = ok(await sb.from('fleet_bot_status').select('*').limit(5000), 'status');
    const m = new Map(st.map((r) => [r.bot_id, r]));
    for (const b of bots) { const s = m.get(b.id); console.log(`${b.id.padEnd(24)} ${b.enabled ? 'on ' : 'off'} ${(s?.state || '-').padEnd(12)} guilds=${s?.guilds ?? '-'} ${s?.last_error ? '| ' + s.last_error : ''}`); }
    console.log(`Total: ${bots.length}`);
  } else if (cmd === 'show') {
    const r = await getRow(pos[0]); delete r.token_enc; delete r.panel_api_token_enc; console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'set') {
    const id = pos[0]; await getRow(id); const patch = {};
    const kv = {}; for (const p of pos.slice(1)) { const i = p.indexOf('='); if (i < 1) die(`use campo=valor (recebido: ${p})`); kv[p.slice(0, i)] = p.slice(i + 1); }
    applyFields(patch, kv);
    if (patch.features) patch.features = { ...(await getRow(id)).features, ...patch.features };
    ok(await sb.from('fleet_bots').update(patch).eq('id', id), 'atualizar'); console.log('✅ atualizado (aplica em até 1 min).');
  } else if (cmd === 'enable' || cmd === 'disable') {
    ok(await sb.from('fleet_bots').update({ enabled: cmd === 'enable' }).eq('id', pos[0]), cmd); console.log('✅ ok');
  } else if (cmd === 'rotate-token') {
    await getRow(pos[0]); const t = await readToken();
    ok(await sb.from('fleet_bots').update({ token_enc: vault.encrypt(t, pos[0]) }).eq('id', pos[0]), 'rotacionar'); console.log('✅ token trocado; o bot reinicia sozinho.');
  } else if (cmd === 'remove') {
    const id = pos[0]; await getRow(id);
    ok(await sb.from('fleet_bots').delete().eq('id', id), 'remover');
    await sb.from('fleet_guild_claims').delete().eq('bot_id', id); await sb.from('fleet_leases').delete().eq('bot_id', id);
    await sb.from('fleet_bot_status').delete().eq('bot_id', id); console.log('✅ removido (dados por servidor em ff_* NÃO foram apagados).');
  } else if (cmd === 'reencrypt') {
    let n = 0; for (const r of await store.listBots()) {
      const patch = {};
      if (vault.needsRotation(r.token_enc)) patch.token_enc = vault.encrypt(vault.decrypt(r.token_enc, r.id), r.id);
      if (r.panel_api_token_enc && vault.needsRotation(r.panel_api_token_enc)) patch.panel_api_token_enc = vault.encrypt(vault.decrypt(r.panel_api_token_enc, r.id), r.id);
      if (Object.keys(patch).length) { ok(await sb.from('fleet_bots').update(patch).eq('id', r.id), 'reencrypt'); n++; }
    } console.log(`✅ ${n} linha(s) recifrada(s) com a chave atual.`);
  } else if (cmd === 'release-lease') { ok(await sb.from('fleet_leases').delete().eq('bot_id', pos[0]), 'lease'); console.log('✅ lease liberado (use só se o worker antigo estiver morto).');
  } else if (cmd === 'release-guild') { ok(await sb.from('fleet_guild_claims').delete().eq('guild_id', pos[0]), 'claim'); console.log('✅ claim removido.');
  } else die(`comando desconhecido: ${cmd}`);
})().catch((e) => die(e.message));
