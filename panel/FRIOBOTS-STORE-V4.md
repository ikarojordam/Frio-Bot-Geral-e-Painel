# FrioBots Store V4

Atualização aditiva do painel web: gestão de produtos, criação de categorias, inclusão de estoque, cupons, visão geral de pedidos e receita amostral.

Os demais recursos existentes no painel foram mantidos. O bot preserva a central de loja V3 e os fluxos de compra, pagamento e entrega já presentes.

## Instalação
1. Faça backup do Supabase e dos ZIPs anteriores.
2. Execute o SQL separado (extensões futuras; não muda as tabelas existentes).
3. Faça deploy do bot e painel atualizados.
4. No painel, abra **Meus Servidores** > selecione o servidor > **FrioBots Store**.
5. Verifique o vínculo Discord do usuário e teste com um servidor de homologação.

## Limitações
Não é uma cópia idêntica das plataformas comerciais. O SQL adiciona bases de fidelidade, avaliações e auditoria, mas ainda não implementa suas rotinas de uso. O gerenciamento web atual utiliza formulários básicos e não edita todas as opções do bot. Verificação de sintaxe não substitui testes de ponta a ponta no Discord, no Supabase e em gateways de pagamento.
