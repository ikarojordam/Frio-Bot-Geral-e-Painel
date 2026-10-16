## v2.0.8 — logs de partidas, PIX e limpeza da roleta

- Ao finalizar uma partida, envia ao log de apostas um embed com vencedor, jogadores, mediador, prêmio, taxa, coins, responsável e transcript TXT do tópico.
- O tópico muda para `partida-finalizada`, exibe contagem de 1 a 5 e é excluído após cinco segundos; se a API negar a exclusão, fica arquivado como fallback.
- Alterações de PIX individual de mediadores e PIX configurado dentro de partidas geram logs sem registrar a chave secreta no conteúdo do log.
- Removidos os botões “Configurar PIX” e “Ver meu PIX” do painel da fila de mediadores; a configuração continua no painel dedicado de PIX.
- A roleta cria tópico privado, adiciona o ganhador e membros do cargo administrativo, exclui o aviso público após cinco segundos e remove o tópico cinco segundos após a ação de entrega/remoção.
- Validação: `node --check`, `npm run check` e `npm test`. Acesso e exclusão do tópico privado ainda dependem das permissões reais do bot no Discord.

# FrioBot Fleet v2.0.6 — atendimento e logs

- `.govdev`: categoria **ATENDIMENTO** com canais suporte, reembolso, receber, evento, vagas e divulgação. O painel oferece esses seis tipos, cada ticket cria thread privada no canal correspondente e os tipos antigos foram retirados do painel novo.
- Categorias de apostas ordenadas como **MOBILE → EMULADOR → MISTO** (MISTO fica logo abaixo de EMULADOR).
- Novos canais de logs: membros, mensagens, moderação, pagamentos e erros; eventos de membros, mensagens e banimentos são roteados para os canais correspondentes.
- Execute `sql/MIGRACAO_LOGS_ATENDIMENTO.sql` no Supabase para habilitar `configs.log_channels`.
- `.govdev confirmar` continua apagando os canais/cargos que o bot pode excluir; faça backup antes de usar.

# FrioBot v2.0.0 — Frota multibot

## Novidades
- **Frota**: `fleet.js` hospeda dezenas de bots por processo (registro `fleet_bots`, tokens cifrados, leases, claims de servidor, escalonamento de login, reconciliação a quente, status em `fleet_bot_status`). `apostas.js` segue como modo de 1 bot.
- `bot-runtime.js`: o código do bot virou uma fábrica `createBot(cfg, deps)`; cada instância tem client, caches, timers, marca e features próprios.
- Anti-Raid: config por (bot, servidor) no Supabase; anti-nuke por `guildAuditLogEntryCreate` (canais, cargos, bans/kicks em massa, webhooks com remoção, permissões perigosas no @everyone); whitelist por ID fora do cache; painel com limites de conta e anti-nuke; varredura de memória; import do `antiraid-config.json` antigo via `addConfigsFromLegacy`.
- HTTP sem Express: `/livez`, `/readyz` e `/health` (503 quando offline), `/bots/:id/health`, `/api/bots/:id/status`, `/api/fleet/status`, rate limit.
- **/dev → Sistema → 🪪 Perfil**: edita nome de usuário, bio, avatar, banner, presença (jogando/assistindo/ouvindo/competindo/transmitindo + status), apelido (neste servidor ou em todos), marca (nome/emoji nos embeds) e pronomes (interno). Tudo é salvo por bot e sobrevive a reinícios.
- CLI `scripts/fleet-cli.js`, gerador PM2 `scripts/generate-ecosystem.js`, 20 testes (`npm test`).

## Correções
Veja `docs/NOTAS_DE_SEGURANCA.md` (bypass de token no status, sandbox, cargo dev, kill switch global, queries sem filtro de servidor, roleta em arquivo local, `Math.random` na roleta, idempotência do PIX/MP, registro de comandos a cada boot).

## Atenção ao atualizar
- Rode `sql/FLEET_MIGRATION.sql`. Kill switch/manutenção/roleta deixam de usar as tabelas/arquivos antigos (estado reinicia desligado).
- Mudanças de comportamento: sandbox off, anti-nuke vigia admins, anti-webhook remove webhooks de não confiáveis, intent GuildModeration (não privilegiada) quando o Anti-Raid está ligado.
- Sem `npm install` offline não foi possível gerar `package-lock.json`: rode `npm install && npm audit` e versione o lock.

# BACK BOT v1.4.0

## Novidades
- Tipos de ticket agora aceitam ID opcional de canal dedicado para criar o tópico privado; o editor permite alterar essa configuração.
- Corrigida a confirmação de interações demoradas em Encerrar Fila e Escolher Vencedor para reduzir erros de “aplicativo não respondeu”.
- Estatísticas de perfil incluem vitórias, derrotas e coins; ao registrar vencedor, os demais participantes recebem uma derrota e a partida concluída não pode creditar o prêmio novamente pelo mesmo fluxo.
- Categoria **Embeds manuais** no painel de apostas com criar, editar e excluir publicações existentes, além da seleção de modalidade, canal e valor.
- Auto mensagens substituem a mensagem anterior da mesma automação a cada envio.
- Comandos de prefixo: `+lockall`, `+unlockall`, `+limpar [quantidade]`, `.telmob`, `.telemu`, `.gp [pix] [valor]`, `.med`, `.medpix`, `.p [@usuário]` e `.roleta`.
- `+lockall` bloqueia envio fora de tópicos e criação de tópicos por @everyone, mantendo o envio em tópicos existentes permitido.
- Roleta com prêmios de coins virtuais e limite de um giro por hora por usuário (o cooldown é mantido em memória e reinicia junto com o bot).

## Notas
- `MIGRACAO_AUTO_MENSAGENS.sql` inclui a coluna `last_message_id`; execute a migração no Supabase antes de usar a substituição automática da mensagem anterior.
- Validação estática de sintaxe executada com `node --check`. Não foi possível realizar teste integrado em Discord/Supabase real nesta sessão.

## Direitos autorais e uso do projeto

© 2026 Frio Painel / Frio Bot. Todos os direitos reservados sobre os materiais originais deste projeto, incluindo código, documentação, identidade visual e conteúdo criado para ele, ressalvados componentes de terceiros e suas respectivas licenças. Este pacote não é oferecido sob uma licença open source geral; não copie, redistribua, revenda ou publique versões modificadas dos materiais originais sem autorização escrita, salvo quando uma licença de terceiro ou a legislação aplicável permitir.

Para suporte, pedidos de autorização ou denúncias de uso indevido: **friomortalcoracaogelado@gmail.com**. Comunidade: https://discord.gg/n3Zd4bTFS

Esse aviso não revoga licenças de terceiros já aplicáveis, não garante por si só a titularidade de cada arquivo e não substitui aconselhamento jurídico.



## v1.6.0
- Adicionado sistema Anti-Raid configuravel por servidor, com modulos, limites, acoes, whitelist e logs.


## v1.4.1
- Adicionado comando `.apostas` com painel de status, ping do Discord e do comando, uptime, memória, estatísticas do servidor, filas, tickets e partidas.
- Adicionada verificação opcional de latência HTTP por `MONITOR_URL`.


## v1.5.0
- Painel Anti-Raid em embed com botões, menus e modal para configuração interativa.
- Suporte a arquivo de ambiente selecionável por processo (`ENV_FILE`) e exemplo PM2 para múltiplos bots com tokens/portas distintos.

## Patch de manutenção — 2026-10-16
- `+lockall` e `+unlockall`: atualizada a leitura dos overwrites antes de remover permissões explícitas no desbloqueio.
- `.ss`, `.telmob` e `.telemu`: consultam a fila de analistas; os cargos de Mobile/Emulador são definidos no painel efêmero de apostas.
- `.gp [chave PIX ou link] [valor opcional]`: gera QR Code, embed e botão para revelar a chave/link em resposta efêmera. Valor padrão configurável por `.gpconfig valor 25,00`.
- `!criar cargo Dev`: cria o cargo Dev para desenvolvedores autorizados, sem conceder permissões administrativas automaticamente.
- Anti-Raid: o adaptador Supabase agora faz fallback para arquivo quando o FleetStore não oferece os métodos de Anti-Raid (ex.: mocks/integrações antigas), em vez de falhar silenciosamente sem configuração.
- Verificação após patch: `npm run check` e `npm test` aprovados (20 testes).

Limitações importantes: o QR Code do `.gp` codifica exatamente a chave/link informado; não é um payload Pix Cobrança dinâmico e não valida beneficiário nem valor no banco. O botão não copia diretamente para a área de transferência (limitação do Discord); ele mostra o conteúdo em resposta efêmera para cópia manual. A cobertura do Anti-Raid continua parcial, conforme `README_ANTI_RAID.md`.


## v2.0.4 — Correção de UX do painel de apostas
- Movidos os seletores SS Mobile/Emulador para a própria seção **Apostas** do painel efêmero existente `/apostas painel`.
- O painel mostra os cargos salvos e atualiza a mensagem efêmera após uma seleção.
- Nenhum novo comando slash foi adicionado; existe apenas `/apostas painel`.

## v2.0.5 — Setup da organização e publicação manual
- O setup da organização agora inclui regras mais completas e registra explicitamente formatos sem canal, incluindo modalidades mistas, no relatório de falhas.
- Reforçada a detecção de rate limit no envio de embeds para melhorar a recuperação em setups com muitas publicações.
- A publicação manual de apostas usa seletor nativo de canal do Discord com pesquisa, sem o limite dos primeiros 25 canais.
- Ao escolher uma modalidade e canal, é possível publicar todos os valores de aposta em ordem decrescente, ou escolher apenas um valor.


## v2.0.7 — filas, partidas e PIX (2026-10-16)
- Reduzida a latência de criação de tópicos: removida pausa artificial, config e mediador carregados em paralelo, convites e logs não bloqueiam a publicação inicial.
- Cancelar fila/partida confirma a interação assim que o estado é atualizado; renomeação, limpeza e arquivamento continuam em segundo plano.
- Controles da partida reunidos em menu selecionável: enviar sala, escolher vencedor e cancelar.
- Escolher vencedor apenas grava a seleção; o botão **Finalizar partida** aparece nos controles da partida após a escolha e só então credita resultado/coins e libera o mediador.
- Adicionado botão **Copiar PIX** com chave e valor em resposta efêmera.
- Configuração PIX da partida grava o PIX individual do mediador atribuído, sem sobrescrever o PIX global do servidor; painel PIX continua disponível a todos os usuários com cargo de mediador configurado.
- Verificações: `node --check bot-runtime.js` e `npm test` (29 testes aprovados).
