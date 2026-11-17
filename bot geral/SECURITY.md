# Segurança — FrioBot

## Regras de ouro
1. **Nenhum segredo no código ou no Git.** Token do bot, chave do Supabase, `*_SECRET`, tokens do Mercado Pago e webhooks ficam só em variáveis de ambiente (painel do host) ou no `.env` local, que está no `.gitignore`.
2. **`.env.example` só tem nomes**, nunca valores.
3. **Repositório privado**, com 2FA ligado na conta do GitHub.
4. **Eval/sandbox desligados** (`ENABLE_DEV_EVAL=false`). Quem executa código no bot lê `process.env` e o token. Ligue só para depurar e desligue depois.
5. **Poucos devs.** Quem está em `DEVELOPER_IDS`/`OWNER_ID` controla o bot inteiro (`!massdm`, `!globalban`, `!lockdown`...). Ative 2FA nessas contas do Discord.

## Ativar as proteções (uma vez)
```bash
git config core.hooksPath .githooks   # bloqueia commit com segredo
npm install                           # gera package-lock.json -> faça commit dele
```
No GitHub (Settings):
- **Code security** → ligue *Secret scanning* + *Push protection* + *Dependabot alerts*.
- **Branches** → proteja `main`: exigir pull request e o check "Segurança e qualidade".
- **Actions → General** → permissões do `GITHUB_TOKEN` somente leitura.

## Se um segredo vazou (ou pode ter vazado)
Apagar o arquivo **não basta**: o valor continua no histórico do Git. Faça nesta ordem:
1. **Rotacione** o segredo (o antigo passa a valer nada):
   - `DISCORD_TOKEN`: Developer Portal → Bot → *Reset Token*
   - `DISCORD_CLIENT_SECRET`: Developer Portal → OAuth2 → *Reset Secret*
   - `SUPABASE_KEY`: Supabase → Project Settings → API → regenerar a chave de serviço
   - `MP_ACCESS_TOKEN`: Mercado Pago → Suas integrações → renovar credenciais
   - `JWT_SECRET`, `PANEL_API_TOKEN`, `VERIFY_SECRET`: gere novos (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
2. Atualize as variáveis no host e reinicie.
3. Só então limpe o histórico (`git filter-repo` ou BFG) e force o push.

## Dados sensíveis no banco
- `verifications` guarda `access_token`/`refresh_token` OAuth dos usuários e `settings` guarda `mp_access_token` de cada servidor, **em texto puro**. Proteja o acesso ao Supabase (chave de serviço só no servidor, RLS ligado, backups privados) e considere criptografar esses campos.
- Nunca poste dumps do banco nem logs com tokens em issues/PRs.

## Reportar vulnerabilidade
Não abra issue pública. Fale direto com o dono do repositório (mensagem privada) com passos para reproduzir.
