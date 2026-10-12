# Frio Painel

Painel web profissional para gerenciamento do **Frio Bot** (Discord).
Interface SaaS, autenticação por e-mail/senha, aprovação manual, multi-servidor e integração direta com o bot.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Configuração (.env)](#configuração-env)
- [Banco de Dados](#banco-de-dados)
- [Execução local](#execução-local)
- [Produção](#produção)
- [Integração com o Bot](#integração-com-o-bot)
- [Rotas do Painel](#rotas-do-painel)
- [Segurança](#segurança)
- [Estrutura de pastas](#estrutura-de-pastas)

---

## Visão Geral

O Frio Painel é o painel oficial do bot Discord **FrioBot**. Ele permite:

- **Clientes** gerenciarem os próprios servidores (tickets, apostas, loja, streamers);
- **Staff** administrar keys, planos, usuários e financeiro;
- **Dev** ter visão global: todos os bots, servidores, keys, auditoria, kill switch e manutenção.

Página pública (`/`) explica o produto antes do login. Após autenticar, o usuário acessa `/app`.

---

## Requisitos

- **Node.js 22.x** (o `package.json` força `engines.node = 22.x`)
- **npm 10+**
- Conta no **Supabase** (banco de dados + autenticação)
- (Opcional) **Bot Discord** já rodando com o `PANEL_API_TOKEN`

---

## Instalação

```bash
# 1. Clone o projeto
git clone https://github.com/seu-usuario/frio-painel.git
cd frio-panel

# 2. Instale as dependências
npm install

# 3. Copie o .env.example
cp .env.example .env

# 4. Edite o .env com suas credenciais (veja seção Configuração)
```

---

## Configuração (.env)

O painel lê as seguintes variáveis. **Todas as chaves abaixo são obrigatórias**, exceto as marcadas como opcionais.

```env
NODE_ENV=production
PORT=10000
PANEL_URL=https://painel.seudominio.com

# Supabase (obrigatórias)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Integração com o bot
PANEL_API_TOKEN=<token de 32+ caracteres>

# Discord (opcional, mas recomendado)
DISCORD_TOKEN=<bot token>
DISCORD_CLIENT_ID=<application id>
DISCORD_CLIENT_SECRET=<oauth secret>
```

**Onde obter cada valor:**

- **Supabase URL / Anon / Service Role** → painel do Supabase → *Settings → API*.
- **PANEL_API_TOKEN** → gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` e use **o mesmo** no bot.
- **Discord Token / Client ID / Secret** → [Discord Developer Portal](https://discord.com/developers/applications) → sua aplicação → *Bot* / *OAuth2*.

---

## Banco de Dados

O painel usa as mesmas tabelas do bot. Ele **não cria o schema** — apenas consome.

### Tabelas usadas pelo painel

| Tabela | Função |
|---|---|
| `panel_admins` | Usuários do painel (role, plan, discord_id, ativo, banned) |
| `premium_keys` | Keys geradas e enviadas |
| `premium_redemptions` | Histórico de resgates |
| `bot_guilds` | Servidores onde o bot está |
| `user_guilds` | Associação usuário ↔ servidor Discord |
| `active_sessions` | Sessões de login ativas |
| `site_notifications` | Notificações in-app |
| `site_audit_log` | Auditoria de ações |
| `kill_switch` | Estado do kill switch global |
| `maintenance_mode` | Estado da manutenção global |
| `force_premium` | Premium forçado manualmente |
| `bot_meta` | Metadados (sync, last update) |
| `guild_update_log` | Controle de broadcast de updates |
| `verifications` | Tokens OAuth do Discord |

### Migration necessária (se ainda não rodou)

Se `panel_admins` não tiver as colunas de confirmação/reset, rode no SQL Editor do Supabase:

```sql
ALTER TABLE panel_admins
  ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirm_token TEXT,
  ADD COLUMN IF NOT EXISTS confirm_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_gerar_keys BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_guilds JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_panel_admins_email ON panel_admins (email);
CREATE INDEX IF NOT EXISTS idx_panel_admins_discord_id ON panel_admins (discord_id);
CREATE INDEX IF NOT EXISTS idx_panel_admins_role ON panel_admins (role);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON site_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON active_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON active_sessions (user_id);
```

Também é preciso ter um **primeiro DEV** no banco. Se o banco estiver vazio:

```sql
-- Substitua os valores pelos seus
INSERT INTO panel_admins (user_id, email, nome, role, plan, ativo, is_owner, email_confirmed)
VALUES (
  '<uuid do usuário no Supabase Auth>',
  'seu@email.com',
  'Seu Nome',
  'dev',
  'unlimited',
  true,
  true,
  true
);
```

O `user_id` deve corresponder ao `id` do usuário criado em **Authentication → Users** no Supabase.

---

## Execução local

```bash
# Produção
npm start

# Desenvolvimento (logs mais verbosos)
npm run dev
```

Acesse:
- Landing → http://localhost:10000/
- Login → http://localhost:10000/login
- Painel → http://localhost:10000/app

---

## Produção

### Deploy no Render (recomendado)

1. Crie um **Web Service** apontando para o repositório.
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. **Environment**: cole todas as variáveis do `.env` na seção *Environment Variables*.
5. **Health Check Path**: `/health`
6. Ative **Auto-Deploy** se quiser.

### Deploy via Docker (opcional)

`Dockerfile` mínimo:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.js"]
```

### Variáveis de produção

- `NODE_ENV=production` — ativa HSTS, cookies `secure`, esconde stack traces.
- `PANEL_URL=https://seu-dominio.com` — usada nos links de confirmação/reset.
- `RENDER_EXTERNAL_HOSTNAME` — o Render injeta automaticamente; `baseUrl()` já a usa.

---

## Integração com o Bot

```
Frontend (browser)
      │
      ▼  fetch /api/*
┌───────────────────┐
│  Painel (Express)  │  ──► Supabase (banco, auth)
└───────────────────┘
      │
      ▼  Bearer PANEL_API_TOKEN
┌───────────────────┐
│  Bot (Express)     │  ──► Discord API
└───────────────────┘
```

O **navegador nunca fala com o bot diretamente**. Toda comunicação passa pelo painel, que valida sessão, role e permissão do usuário antes de repassar.

O **token compartilhado** (`PANEL_API_TOKEN`) garante que só o painel consiga chamar endpoints `/api/bot/*` do bot.

### Testar a integração

```bash
curl -H "Authorization: Bearer $PANEL_API_TOKEN" https://URL-DO-BOT/api/bot/health
```

Resposta `{ "ok": true, ... }` = funcionando.

---

## Rotas do Painel

### Públicas (HTML)

| Rota | Descrição |
|---|---|
| `/` | Landing page |
| `/login` | Login |
| `/register` | Cadastro |
| `/terms` | Termos de Uso |
| `/privacy` | Política de Privacidade |
| `/robots.txt` | robots |
| `/sitemap.xml` | sitemap |

### Autenticadas (HTML SPA)

| Rota | Descrição |
|---|---|
| `/app` | Painel (SPA) |

### API (JSON)

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/login` | público |
| POST | `/api/auth/logout` | autenticado |
| GET | `/api/auth/me` | autenticado |
| POST | `/api/auth/register` | público |
| POST | `/api/auth/forgot` | público |
| POST | `/api/auth/update-password` | público (com token) |
| GET | `/api/dashboard/*` | staff |
| GET | `/api/me/*` | autenticado |
| GET/POST/DELETE | `/api/keys/*` | staff/dev |
| GET/POST/PATCH/DELETE | `/api/dev/*` | dev |
| GET | `/api/admin/*` | admin |
| GET/PATCH/POST | `/api/notifications/*` | autenticado |
| GET | `/health` | público |

---

## Segurança

- **Autenticação exclusivamente por e-mail/senha** (via Supabase Auth). Sem login por Discord.
- **Aprovação manual** obrigatória — contas nascem com `role = 'pending'` e `ativo = false`.
- **Sessões**: cookie httpOnly, secure em produção, expiração de 7 dias (30 se "lembrar").
- **CSRF**: header `x-csrf-token` obrigatório em POST/PATCH/PUT/DELETE.
- **Rate limiting** em login, registro, reset, geração de keys, auditoria.
- **CSP** restritiva (permite só unpkg, jsdelivr e Google Fonts).
- **Auditoria completa**: toda ação registrada com IP, browser, OS, device, país.
- **Kill switch** e **manutenção global** controláveis pelo dev.
- **Sem secrets no frontend** — `.env` só no backend.
- **Sem stack traces** para o usuário final em produção.

---

## Estrutura de pastas

```
frio-panel/
├── server.js              # Express + rotas + segurança
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
└── public/
    ├── index.html         # Landing
    ├── login.html
    ├── register.html
    ├── terms.html
    ├── privacy.html
    ├── app.html           # SPA do painel
    ├── confirm.html
    ├── reset.html
    └── assets/
        ├── logo.png
        ├── landing.css
        ├── auth.css
        ├── legal.css
        ├── app.css
        └── app.js
```

---

## Licença

MIT — veja `LICENSE`.


## Atualização visual 6.1.0

Esta versão reorganiza a página inicial com atalhos de recursos, apresentação dos tiers Basic/Premium/Ultra/Unlimited, FAQ e layout responsivo. A seção dedicada a segurança foi retirada da Home conforme solicitado. As telas autenticadas, endpoints e regras de autorização do backend foram mantidos sem alterações intencionais.

**Deploy:** use a pasta `Painel` como raiz do serviço Node.js e `npm start` como comando de inicialização. Os arquivos web estão com extensões reais (`.html`, `.css` e `package.json`) para corresponder aos caminhos utilizados pelo Express. Configure as variáveis do ambiente conforme `.env.example`; não publique o arquivo `.env` com segredos.


## Atualização 6.2.0 — correções e otimizações

**Bugs corrigidos**
- Sessão caía após ~1h (o token do Supabase expira, mas o cookie durava 7/30 dias). Agora há renovação automática (cookie `sb_refresh`).
- Cookie CSRF expirava em 7 dias mesmo com "lembrar" (30 dias): depois disso nenhum botão de salvar funcionava.
- "Encerrar sessão" não derrubava o outro dispositivo; agora derruba de verdade (logout, troca de senha, ban).
- Status do bot sempre aparecia "offline" por incompatibilidade API × tela.
- Cancelar o prompt de Force Premium aplicava premium **permanente**.
- Rotas async sem tratamento deixavam a requisição pendurada; `signOut()` no cliente compartilhado podia deslogar outro usuário.
- Soma de "membros totais" ficava errada com mais de 1000 servidores; `redeem-pack` podia gerar keys em duplicidade; keys para usuários eram enviadas mesmo já usadas.

**Segurança**: senhas/keys com `crypto` (antes `Math.random`), busca sem injeção de filtro, senha temporária não vai mais em notificação, tokens de reset/confirmação não saem do servidor (lista/backup), CSV sem injeção de fórmula, limite de login também por e-mail, parâmetros de rota validados, dev não consegue se auto-bloquear.

**Performance**: gzip (`npm install` instala `compression`), cache correto de estáticos (imagens 30d, CSS/JS por ETag), logo/fundo/ícones reduzidos (de ~1,7 MB para poucas dezenas de KB), cache de 15s na autenticação e 20-30s nas estatísticas, inserts em lote, scripts de terceiros não bloqueiam a tela no painel, polling de notificações pausa com a aba oculta, desligamento limpo no Render.

**Deploy**: rode `npm install` (novo pacote `compression`). Sessões antigas pedirão novo login uma única vez.
