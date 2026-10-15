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


## v1.6.0 — 2026-10-15
- Estado local isolado por BOT_INSTANCE_ID.
- Endpoint /readyz para readiness real do Discord.
- Validação de segredo do painel com comparação de comprimento constante.
- Configuração PM2 com BOT_COUNT para gerar uma frota de processos.
- Documentação de escala e limites revisada.


## v1.7.0 — Personalização global e acesso Anti-Raid
- Adicionada a área **Personalizar Bot** ao `/dev`.
- Nome e atividade persistidos por instância; tipos PLAYING, WATCHING, LISTENING e COMPETING.
- Avatar pode ser atualizado por URL HTTPS/HTTP.
- URL do banner fica salva como referência; alteração do banner do perfil continua manual pelo Developer Portal devido à limitação da API do bot.
- O acesso `.antiraid` e seus componentes agora reconhecem os desenvolvedores autorizados, incluindo `1535751259347222538`.
