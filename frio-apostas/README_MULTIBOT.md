# Frota multibot — FrioBot v2.0.0

Um processo (worker) hospeda vários bots; cada bot é uma **aplicação/token Discord diferente**, com marca, presença, recursos e dados próprios.
`npm start` continua funcionando como antes (1 bot via `.env`). Para a frota use `npm run fleet`.

## O que cada bot tem de próprio ("cada um diferente")
Linha em `fleet_bots`: token (cifrado), nome, org/emoji/cor, presença (texto/tipo/status), canal de logs, dono, `features`
(`antiraid, auto_messages, message_content, guild_members, heartbeat_log, sync_username, dev_role, owner_is_developer, dev_sandbox`).
Dados por servidor ficam no Supabase por `guild_id`; kill switch, manutenção, roleta e Anti-Raid ficam por **bot**.
Regra do modelo: **1 servidor = 1 bot da frota** (claims). Se outro bot da frota já atende o servidor, o segundo ignora os eventos dele.

## Subir (passo a passo)
1. Supabase > SQL Editor: execute `sql/FLEET_MIGRATION.sql` (e `sql/MIGRACAO_AUTO_MENSAGENS.sql` se ainda não rodou).
2. `node scripts/fleet-cli.js gen-key` → guarde em `FLEET_MASTER_KEY` (variável do host; **sem ela os tokens são irrecuperáveis**). `gen-secret` → `FLEET_ADMIN_TOKEN`.
3. Cadastre bots: `echo "$TOKEN" | node scripts/fleet-cli.js add cliente-001 --name "Meu Bot" --client_id 123 --panel-token auto`
   ou em massa: `node scripts/fleet-cli.js import bots.json` (lista `[{"id","name","token","client_id",...}]`; apague o JSON depois).
4. `node scripts/generate-ecosystem.js 10` (10 workers ⇒ ~50 bots cada para 500) e `pm2 start ecosystem.config.cjs`.
5. Cada bot precisa, no Developer Portal, dos intents **Server Members** e **Message Content** (ou desligue com `set <id> feature.message_content=false feature.guild_members=false`).
6. Monitoramento: `GET /livez` (processo), `/readyz` (200 só com ≥80% dos bots online), `/bots/:id/health`, `/api/fleet/status` (Bearer `FLEET_ADMIN_TOKEN`); tabela `fleet_bot_status`; `fleet-cli list`.

## Como funciona (garantias)
- **1 token = 1 processo**: lease atômico no banco (`fleet_acquire_leases`, TTL 60s, renovação em lote a cada 20s). Lease perdido ⇒ o bot cai.
- **Escalonamento**: login com concorrência `START_CONCURRENCY` (3) e espaçamento `START_SPACING_MS` (1500). Erro de token/intents não derruba os outros e só é re-tentado a cada 30 min.
- **Quente x frio**: mudar nome/presença/logs/dono aplica sem reconectar; mudar token/features reinicia só aquele bot. O registro é relido a cada 60s.
- **Slash commands**: só são re-registrados quando o hash muda (`.registrar` força).
- **Segredos**: AES-256-GCM amarrado ao id do bot; tokens nunca vão para logs (redação automática); `FLEET_MASTER_KEY` é removida do `process.env` após o boot.

## Capacidade — seja realista
Não foi possível testar com Discord/Supabase reais nem 500 tokens. Valide em degraus (1 → 10 → 50 → 100 → 500) observando RAM (`/api/fleet/status`), `event_loop_lag_ms`, reconnects e rate limits.
Ordem de grandeza (estimativa, não medição): 20–60 MB por bot conectado ⇒ 500 bots ≈ 10–30 GB no total, por isso o padrão é ~10 workers de ~50 bots (`--max-old-space-size` no PM2). Um host de 4 GB comporta algumas dezenas, não 500.
Cada aplicação Discord tem limites próprios (ex.: 1000 logins/dia por token). Se "500 bots" na verdade for **um** bot em 500 servidores, o caminho é sharding, não esta frota.

## Rotação / emergência
`rotate-token <id>`, `reencrypt` (após trocar a chave mestra: ponha a antiga em `FLEET_MASTER_KEY_PREVIOUS`), `release-lease <id>` (só se o worker antigo morreu), `release-guild <guildId>`.
