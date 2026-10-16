# Auditoria técnica — FrioBot Anti-Raid Multibot v1.5.0

Data da revisão: 2026-10-14

## Escopo e limites

Foi feita revisão estática dos arquivos JavaScript, package.json, configuração PM2, exemplos de ambiente, SQL e documentação do pacote. `node --check apostas.js` e `node --check anti-raid-system.js` passaram. Não foi possível confirmar comportamento real com Discord/Supabase nem realizar uma auditoria CVE online de dependências nesta revisão. Portanto, isto não é uma certificação de segurança nem garantia de ausência de falhas.

## Achados prioritários

### P1 — Várias réplicas podem executar a mesma automação

O projeto contém tarefas agendadas e listeners de eventos Discord. Se duas hospedagens iniciarem a mesma identidade de bot (mesmo token), isso não é uma estratégia válida de balanceamento do Gateway; pode causar sessões concorrentes, desconexões e comportamento duplicado. Se várias identidades de bot estiverem no mesmo servidor, cada uma poderá processar o mesmo evento e executar ações repetidas.

**Correção arquitetural:** definir quais tokens atendem quais servidores/funcionalidades; não repetir token entre processos; garantir idempotência no banco para apostas, pagamentos, tarefas agendadas e ações críticas. Para tarefas partilhadas, usar lock/lease transacional no banco ou fila central, não apenas memória local.

### P1 — Estado local não é compartilhado entre hospedagens

`anti-raid-system.js` persiste configurações em `antiraid-config.json` no disco local. Outros recursos também guardam dados em arquivos locais, como configurações da roleta. Hospedagens efêmeras podem apagar esses arquivos em redeploy; instâncias diferentes terão cópias divergentes.

**Correção:** mover configuração operacional para Supabase/Postgres com chave por `guild_id` e `bot_id`, ou garantir volume persistente por instância e backups. Para uma frota de 500 bots, banco central é preferível.

### P1 — Anti-nuke é cobertura parcial, não proteção total

O módulo observa `channelCreate`, `channelDelete`, `roleCreate`, `roleDelete` e `webhookUpdate`. Não cobre todas as ações destrutivas possíveis (por exemplo, bans em massa, mudanças de permissões/cargos e outras alterações de servidor). O `webhookUpdate` registra eventos, mas não remove automaticamente um webhook malicioso. Logs de auditoria também podem não identificar o executor imediatamente; escolher a primeira entrada recente pode atribuir uma ação ao usuário errado em rajadas concorrentes.

**Correção:** descrever como proteção parcial; correlacionar entrada de auditoria com alvo/tipo e janela curta; adicionar eventos de risco necessários, com limites conservadores, allowlist e testes em servidor isolado.

### P1 — A proteção Anti-Raid não tem armazenamento distribuído nem coordenação

Os contadores de entrada, spam e auditoria são Maps em memória. Reiniciar o processo zera os contadores; em várias instâncias, cada processo vê apenas parte dos eventos. A proteção contra raid fica menos eficaz e pode tomar decisões inconsistentes.

**Correção:** centralizar contadores/janelas com Redis ou Postgres atômico, ou garantir que cada servidor seja processado por uma única instância responsável.

### P2 — O exemplo PM2 não equivale a uma implantação de 500 bots

`ecosystem.config.cjs` contém somente dois processos de exemplo. A capacidade depende de memória/CPU, limites de identificação e rate limits do Discord, conexões do banco, limites da hospedagem e volume de eventos. Não há benchmark de 500 bots neste pacote.

**Correção:** medir carga gradualmente (1, 5, 20, 50...), separar workers por função/identidade, limitar concorrência, adicionar métricas/alertas e planejar sharding quando aplicável. 500 bots diferentes exigem 500 identidades/tokens e configuração de aplicação apropriada; 500 réplicas com o mesmo token não é equivalente.

### P2 — Endpoint `/health` pode responder 200 com Discord desconectado

O endpoint inclui `online: Boolean(client?.isReady?.())`, mas responde JSON normal independentemente desse valor. Alguns monitores interpretam qualquer HTTP 200 como saúde completa.

**Mitigação operacional:** monitorar também o campo `online` e alertar quando falso; idealmente separar liveness (processo vivo) e readiness (Discord/Supabase prontos).

### P2 — Variáveis sensíveis e dados operacionais precisam de gestão centralizada

Cada instância deve ter seu próprio `DISCORD_TOKEN`, `PORT` e configuração, e não deve versionar `.env.*`. Segredos do Supabase com privilégios elevados só devem existir no backend e devem ter permissões mínimas. Não reutilizar `PANEL_API_TOKEN` fraco entre ambientes.

**Correção:** secret manager da hospedagem, rotação de tokens expostos, `.gitignore`, chaves distintas por ambiente e políticas/RLS adequadas no banco.

### P2 — Dependências não foram verificadas contra CVEs atuais

`package.json` fixa `discord.js` em 14.16.3 e usa intervalos sem lockfile incluído no ZIP. A revisão estática não confirma se essas versões têm avisos de segurança atuais. Não atualizar às cegas: criar lockfile, rodar `npm audit`, testar compatibilidade e atualizar de forma controlada.

### P3 — Whitelist e limites têm restrições de usabilidade

A whitelist consulta `guild.members.cache`; um usuário não presente no cache pode não ser aceito por ID. O modal de limites não expõe todos os parâmetros disponíveis (por exemplo, idade mínima da conta e janela/limite anti-nuke). Regras personalizadas são armazenadas, mas o código informa corretamente que não têm gatilho de execução.

**Correção:** buscar membros por ID quando necessário; completar o painel de limites; não apresentar regras personalizadas como proteção ativa enquanto não executarem ações.

## Checklist obrigatório antes de produção

- [ ] Executar `npm ci` com lockfile controlado e `npm audit` em ambiente de build.
- [ ] Configurar intents privilegiados no Developer Portal: `Guild Members` e `Message Content`, se forem necessários para as funções ativadas.
- [ ] Testar cada permissão/hierarquia do bot em servidor de staging.
- [ ] Testar entrada em massa, spam, menções, convites, webhook e anti-nuke sem usuários reais em risco.
- [ ] Validar migrations SQL e políticas/RLS do Supabase; nunca presumir que tabelas/colunas existem.
- [ ] Testar falhas de rede, limites do Discord, erros do banco, reinício e redeploy.
- [ ] Garantir idempotência para PIX, apostas, filas, pagamentos e tarefas agendadas.
- [ ] Garantir que apenas uma instância processe cada identidade de bot e que tarefas compartilhadas usem locks distribuídos.
- [ ] Configurar alertas para latência, memória, erros, reconnects, rate limits, fila e saúde do Supabase.
- [ ] Manter backups e procedimento de rollback.

## Conclusão

O pacote passa na verificação sintática, mas ainda não está comprovado para 500 bots em produção. O principal trabalho restante é arquitetura distribuída, persistência centralizada, idempotência, testes de carga e validação de permissões/segurança. Não há como garantir falhas futuras inexistentes; é possível reduzir riscos com testes, monitoramento e atualizações regulares.
