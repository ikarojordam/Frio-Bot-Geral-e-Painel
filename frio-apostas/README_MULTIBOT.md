# FrioBot Anti-Raid Multibot — v1.6.0

## O que esta versão melhora
- Isola arquivos locais por identidade (`BOT_INSTANCE_ID`): configuração do Anti-Raid e roleta não colidem entre processos no mesmo disco.
- Adiciona `/readyz` (retorna HTTP 503 se o Gateway Discord ainda não estiver pronto); `/health` continua sendo liveness.
- Compara o segredo `PANEL_API_TOKEN` com validação de comprimento antes de `timingSafeEqual`.
- Configuração PM2 escalável por `BOT_COUNT`, com um processo e uma porta por bot.
- Mantém comandos agrupados, incluindo `/config ticket`, `/config streamer` e `/config boasvindas`.
- Comando `.antiraid` abre o painel configurável do Anti-Raid (módulos, limites, ações e logs).

## Requisitos
- Node.js 22.x.
- Uma aplicação/token Discord distinto por bot.
- Credenciais de banco configuradas em cada processo.
- PM2 para gerenciar vários processos no mesmo host.

## Executar um bot
1. `npm install`
2. Copie `.env.bot1.example` para `.env.bot1` e preencha credenciais reais.
3. `npm start`

## Executar vários bots com PM2
1. Crie `.env.bot1`, `.env.bot2`, ... para cada identidade.
2. Garanta que cada arquivo tenha `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_KEY` e `PANEL_API_TOKEN` conforme necessário. Tokens devem ser diferentes; os segredos devem ser fortes.
3. No terminal, defina a quantidade e inicie:
   - Linux/macOS: `BOT_COUNT=10 pm2 start ecosystem.config.cjs`
   - PowerShell: `$env:BOT_COUNT=10; pm2 start ecosystem.config.cjs`
4. Confira `pm2 status` e `pm2 logs`.
5. Para reiniciar após reboot, configure `pm2 startup` e `pm2 save`.

`BOT_COUNT` aceita de 1 a 500. Isso apenas gera processos; **não garante** que a hospedagem suporte essa carga. Comece com 1, 5, 10, 20 e aumente só após medir CPU, RAM, conexões, latência, reconnects e rate limits.

## Portas
Cada processo usa `BASE_PORT + índice`, começando em 3001 por padrão. Se a hospedagem só expõe uma porta HTTP por serviço, rode cada bot como serviço separado e configure a porta da plataforma. Não tente executar vários processos com a mesma porta no mesmo host.

## Dados e escalabilidade
`STATE_ROOT/<BOT_INSTANCE_ID>/` contém dados locais da roleta e Anti-Raid. O diretório precisa de volume persistente para sobreviver a redeploys. O isolamento evita colisões locais, mas não é armazenamento distribuído. Em hosts diferentes, os arquivos não são compartilhados.

Para alta escala, as configurações e contadores Anti-Raid ainda precisam migrar para banco/Redis central com operações atômicas. Se vários bots atenderem o mesmo servidor, defina um bot responsável por cada função para evitar respostas duplicadas. Não execute o mesmo token em várias hospedagens para balancear o Gateway. Uma frota de 100 bots diferentes exige 100 aplicações/tokens distintos e respeita os limites do Discord e da hospedagem.

## Comandos de configuração
- `/config ticket` — configurar painéis e tipos de ticket.
- `/config streamer` — abrir a configuração de streamers.
- `/config boasvindas` — configurar boas-vindas e convites.
- `/solicitar painel ticket` — publicar painel de tickets.
- `/solicitar painel streamer` — publicar painel de streamers.
- `.antiraid` — painel Anti-Raid; requer permissões administrativas conforme o handler.
- `/apostas painel` — painel de Free Fire.
- `.registrar` — registrar comandos novamente (desenvolvedor).

## Segurança operacional
- Nunca publique `.env.botN`, tokens Discord ou chave `service_role` do Supabase.
- Use `SUPABASE_KEY` de servidor apenas no backend.
- Faça backup antes de atualizar.
- Execute `npm run check` antes de publicar.
- A validação estática não substitui testes em servidor Discord isolado; não há benchmark certificado para 100+ bots.
