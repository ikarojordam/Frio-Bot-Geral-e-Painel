# CHANGELOG

## v1.2.0
### Novo — Boas-vindas + rastreio de convites
- `/config boasvindas` (admin): painel com botões para **editar mensagem/título**, **regras e rodapé**, **cor e imagem**, escolher o **canal**, **ativar/desativar**, **prévia**, **enviar teste** e **restaurar padrão**.
- Mostra **quem convidou** o novo membro e **quantos convites** essa pessoa já tem. Variáveis: `{user} {username} {server} {count} {inviter} {inviter_name} {invites} {code}`.
- Detecta convite normal, convite de uso único que esgotou e link personalizado (vanity). Entradas simultâneas são processadas em fila por servidor.
- Se o canal configurado for apagado ou o bot perder permissão: usa o canal de sistema e depois o primeiro canal utilizável; sem canal, só registra aviso.
- Requer a permissão **Gerenciar Servidor** para ler convites (sem ela as boas-vindas funcionam como "não identificado") e a intent `GuildInvites` (não é privilegiada).
- **SQL (rodar uma vez no Supabase)** — também aparece nos logs se faltar:
  `welcome_configs` e `invite_stats` (veja `WELCOME_SQL` no `apostas.js`).

### Correções
- Partidas FF: botões da thread (`ffm:*`) agora rodam em **fila por partida** (`ffLockMatch`), evitando que dois cliques simultâneos (ex.: dois jogadores confirmando) sobrescrevam o estado ou postem o pagamento duas vezes.
- `ffPatchBet` / `ffPatchMatch` / `ffGetBet` / `ffGetMatch`: o `supabase-js` não lança exceção, devolve `{ error }` — antes ignorado. Agora é logado.
- `ffCalcPlayerPay`: arredondamento em centavos sem `toFixed`.
- Constantes `REDIRECT_URI` e `VERIFY_SECRET` sem fallback inválido/fixo no código (não eram usadas).
- Servidor Express: erro ao abrir a porta é logado.
- `unhandledRejection` / `uncaughtException` agora registram a **stack** completa.
- Versão unificada em v1.2.0.

---

# BACK BOT — v1.1.0 (BACK E-ESPORTES 🐦‍⬛)

## Marca
- Org: **BACK E-ESPORTES** · Bot: **BACK BOT** · Emoji: **🐦‍⬛** (canais, embeds, footers, presença, cargo de membro).
- O bot tenta renomear o próprio usuário para "BACK BOT" ao iniciar (limite do Discord: ~2 trocas/hora).
- Cargo dev agora é "Dev do Back Bot" (o antigo "Dev do Mate Bot" é renomeado sozinho).

## Setup (.govdev e .VK agora são o mesmo setup completo)
- **Cargos**: eram criados de baixo pra cima, e o Discord põe cargo novo embaixo, então a hierarquia saía invertida. Agora são criados na ordem certa e a ordem é verificada/corrigida (até 3 tentativas).
- **Embeds**: o .VK não enviava nenhum. Agora os dois enviam TUDO (ticket, filas, PIX, blacklist, streamer, loja, 11 formatos × 12 valores de aposta e um embed informativo por canal), com retry e relatório de falhas.
- **Canais**: ticket movido para Atendimento (antes ficava na categoria privada Staff e ninguém abria ticket); `fila-streamer` movido para Streamers; `pix-gratis` movido para Eventos; `feedbacks` agora aceita mensagens; canais de aposta ficam só-leitura (botões funcionam); nomes duplicados (divulgação) não se sobrescrevem mais; `log-suporte` do .VK virou `log-ticket`.
- Resultado do setup é enviado na DM de quem rodou e no log-config (o canal do comando é apagado pelo próprio setup).
- Limpa painéis de ticket/apostas de setups anteriores e atualiza os cargos da loja de coins para os novos.

## Tickets
- Ao fechar (manual, auto-close, autor saiu) ou excluir: gera transcript (.html + .txt) e envia no canal de log **e na DM de quem abriu o ticket**. Se a DM estiver fechada, a staff é avisada no log.

## v1.1.1 — comandos slash
- Comandos globais agora são registrados PRIMEIRO no boot (antes dependiam do sync de servidores e eram apagados antes de recriar).
- Aceita os eventos `ready` e `clientReady` (discord.js novo).
- Comando de dev `.registrar` registra os slash commands na hora e mostra o resultado.
