# FrioBots Store V5

Extensões aditivas no painel: identidade da loja, campanhas com ativação/pausa (registro e planejamento, sem descontos automáticos), ajustes manuais de pontos, listagem de avaliações e alternância de status dos produtos via API. Herda todas as funções V4 e anteriores.

## Instalação
1. Crie backup do banco.
2. Execute `FrioBots-Store-SQL-V5.sql` no Supabase SQL Editor.
3. Faça deploy do bot e do painel.
4. Teste permissões, estoque, cupons e checkout em um servidor privado.

## Limites
Nem todos os recursos das plataformas comerciais foram implementados. Não foi feita execução end-to-end no Discord, Supabase ou gateway. Pontos e campanhas ainda não são aplicados automaticamente à compra. É necessária revisão de segurança antes da produção.
