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
