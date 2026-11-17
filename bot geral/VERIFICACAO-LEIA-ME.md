# FrioBot — verificação personalizada

1. Execute `verification-panels.sql` no SQL Editor do Supabase. O bot necessita da chave `service_role` apenas no backend (jamais exponha em código frontend).
2. Configure `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_KEY`, conforme implementação atual), `VERIFY_SECRET` e `REDIRECT_URI`.
3. Configure no Discord Developer Portal o **exato** REDIRECT_URI público HTTPS terminando em `/callback`.
4. Abra `/admin` → Gerenciamento → Painéis → Verif para escolher visual, texto, URL de imagem, cargo, logs e publicação no canal.
5. O cargo só é entregue após o desafio ser validado **no servidor**. O botão não concede cargo. Necessário que o bot tenha `Gerenciar Cargos` e que o cargo esteja abaixo do cargo do bot.
6. O backend de OAuth/captcha requer servidor HTTP público acessível. A modalidade bot isolada da Discloud pode não publicar as rotas `/callback` e `/verify`; nesse caso hospede esse serviço web em uma instância com HTTP público e use o endereço na configuração.
7. O painel de desenvolvimento permite selecionar quantidade de usuários OAuth autorizados a tentar incluir no servidor. Não garante o número final: usuários já presentes, autorizações revogadas e limites do Discord afetam o total.

## Segurança
O teste antes era resolvido somente no navegador. Agora a resposta é conferida no backend, limitada a 5 tentativas, vinculada ao usuário autenticado e ao servidor. O `state` OAuth é assinado e expira em 10 minutos. Os desafios estão em memória: reiniciar o processo durante a verificação exige reiniciar o teste.
