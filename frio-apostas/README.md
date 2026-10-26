# FrioBots — Discloud | Frio Mortal Developer

Pacote independente para um bot Discord de uso geral. **Não contém os módulos de apostas do arquivo original.**

## Configurar
1. Preencha `DISCORD_TOKEN`, `SERVER_URL`, `SITE_URL` nas variáveis de ambiente; para envio via ZIP na Discloud, você pode criar um arquivo `.env` na raiz copiando `.env.example`, preenchendo-o antes do envio. **Não compartilhe esse ZIP preenchido com terceiros.**
2. A raiz do ZIP deve conter `discloud.config`, `index.js`, `package.json` e `.env` (quando for necessário usar `.env`).
3. Envie o arquivo ZIP no painel Discloud. O `START=npm start` inicia o programa.
4. O bot precisa estar cadastrado no Discord Developer Portal. A atualização de descrição usa a rota oficial de edição da aplicação e pode depender das permissões/restrições da API.

## Perfil
No início e a cada 6 horas, o programa sincroniza a **descrição da aplicação** com os links configurados. Não altera o campo "Sobre mim" da conta do bot. Atualizações nas variáveis exigem reinício da aplicação.

Assinatura: **Frio Mortal Developer**.
