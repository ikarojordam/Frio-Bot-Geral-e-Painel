# BACK BOT — v1.4.0

## Atualização
1. Faça backup do projeto e do banco antes de publicar.
2. Substitua o `apostas.js` e o `package.json` pelos arquivos deste ZIP.
3. No Supabase, abra **SQL Editor** e execute `MIGRACAO_AUTO_MENSAGENS.sql`. O SQL é idempotente e inclui `last_message_id` para substituir a mensagem anterior da automação.
4. Publique/reinicie o bot.
5. Teste primeiro em um canal de desenvolvimento.

## Tickets
Em `/config ticket`, edite o painel e entre em **Tipos**. Ao criar ou editar um tipo, preencha **ID do canal para o tópico** para usar um canal dedicado. Se deixar vazio, o bot usa o canal configurado para o tipo/painel, com fallback para o canal em que o painel foi aberto. O bot precisa de `Criar Tópicos Privados` e `Gerenciar Tópicos` no canal de texto escolhido.

## Apostas e embeds manuais
Em `/apostas painel`, abra **Embeds manuais**:
- **Criar**: escolha modalidade, canal e valor.
- **Editar**: escolha um embed publicado e altere modalidade/valor.
- **Excluir**: remove a mensagem publicada do canal.
A lista de gerenciamento exibe até 25 publicações recentes por vez. As modalidades são as definidas no código em `FF_FORMATS` (Mobile, Emulador e Misto, conforme configuração do projeto).

## Prefixos
- `+lockall`: bloqueia @everyone de enviar mensagens fora de tópicos e de criar tópicos; enviar mensagens em tópicos existentes permanece permitido.
- `+unlockall`: remove as restrições que `+lockall` aplica às permissões de @everyone.
- `+limpar` ou `+limpar [quantidade]`: apaga 1 mensagem por padrão, até 10.000 quando informado. Requer **Gerenciar Mensagens**.
- `.telmob` / `.telemu`: publica uma solicitação de SS Mobile/Emulador. Texto adicional após o comando é incluído como detalhe.
- `.gp [pix] [valor]`: publica os dados informados num embed; não valida nem realiza uma transação PIX.
- `.med`: publica o painel da fila de mediadores.
- `.medpix`: publica o painel PIX dos mediadores.
- `.p` / `.p @usuário`: mostra vitórias, derrotas e coins do perfil.
- `.roleta`: publica a roleta de coins virtuais; cada pessoa pode girar uma vez por hora.

## Permissões e observações
- `+lockall` e `+unlockall` exigem **Gerenciar Canais** ou ser desenvolvedor.
- `.med` e `.medpix` exigem permissão administrativa ou ser desenvolvedor.
- `+limpar` exige **Gerenciar Mensagens** ou ser desenvolvedor.
- A roleta concede coins virtuais já usados pelo sistema de perfil. O cooldown fica em memória e reinicia se o bot reiniciar.
- Não compartilhe `DISCORD_TOKEN`, `SUPABASE_KEY` nem outras credenciais.
- `node --check apostas.js` passou, mas o bot não foi executado contra Discord/Supabase real nesta sessão. Testes integrados ainda são necessários.


## Integração com Frio Painel

Configure as mesmas variáveis nos serviços de bot e painel: `PANEL_API_TOKEN` deve ser um segredo aleatório longo e idêntico nos dois serviços; o painel não precisa de uma URL de API do bot; `PANEL_API_TOKEN` permanece como segredo compartilhado para autenticação. O bot expõe `GET /health` para estado básico e `GET /api/bot/status` com Bearer token para verificação autenticada. Não coloque tokens no frontend nem os publique no repositório.

## Roleta configurável

Comandos de staff/dev: `.roletaconfig ver`, `.roletaconfig coins 0,1,5,10`, `.roletaconfig cargo ID_DO_CARGO`, `.roletaconfig dinheiro 10,00`, `.roletaconfig admincargo ID_DO_CARGO` e `.roletaconfig canal ID_DO_CANAL`. A configuração é salva em `roulette-config.json` ao lado do bot; mantenha o disco persistente no host ou faça backup desse arquivo. Prêmios em dinheiro criam solicitação de conferência manual, não efetuam transferência automática. A entrega de cargos exige permissão e hierarquia de cargos adequada no Discord.
