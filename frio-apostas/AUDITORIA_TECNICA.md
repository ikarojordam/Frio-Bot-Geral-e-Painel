# Auditoria técnica — v1.6.0
Data: 2026-10-15

## Verificações executadas
- `node --check apostas.js`: aprovado.
- `node --check anti-raid-system.js`: aprovado.
- `node --check ecosystem.config.cjs`: aprovado.
- Leitura de `package.json` como JSON: aprovada.

## Correções desta entrega
- Isolamento dos arquivos de configuração locais por `BOT_INSTANCE_ID`.
- Escrita de configuração Anti-Raid com arquivo temporário e rename para reduzir risco de arquivo parcialmente gravado.
- Comparação segura do segredo da API do painel com verificação explícita do comprimento.
- Endpoint `/readyz` que sinaliza indisponibilidade do Gateway com HTTP 503.
- PM2 dinâmico para configurar a quantidade de processos por `BOT_COUNT`.
- Documentação e exemplos de implantação atualizados.

## Limitações que precisam ficar claras
Esta é uma revisão estática e uma melhoria de infraestrutura, não uma garantia de que todos os fluxos de botões funcionem em ambiente real. Não foi possível testar interações contra Discord/Supabase reais nem simular permissões, hierarquia de cargos, rate limits, falhas de rede ou esquema de banco. Os componentes ainda precisam de testes manuais e de integração em um servidor de teste.

O projeto principal continua concentrado em `apostas.js`, arquivo extenso com múltiplos listeners. Uma reorganização automática em módulos menores poderia quebrar dependências e handlers; por isso não foi feita sem uma suíte de testes. O isolamento de arquivos locais não compartilha Anti-Raid entre hospedagens. Para uma frota distribuída, migre configurações/contadores para Postgres/Redis com operações atômicas e atribuição de cada servidor a um único worker responsável.

`BOT_COUNT=100` gera 100 processos, mas não prova que a hospedagem suporta 100 bots. Cada processo precisa de token/aplicação próprios, recursos suficientes, portas ou serviços adequados, e respeito aos limites do Discord. A capacidade deve ser demonstrada por testes progressivos de carga.
