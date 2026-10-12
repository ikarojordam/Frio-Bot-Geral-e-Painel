# Sistema Anti-Raid — BACK BOT

## Requisitos e permissões
- Node.js 22.x e discord.js 14.16.3 (já usados pelo bot).
- Ative no Discord Developer Portal os intents **Server Members Intent** e **Message Content Intent**.
- Dê ao bot apenas as permissões necessárias para os recursos usados: Ver canais, Enviar mensagens, Ler histórico, Gerenciar mensagens, Expulsar membros, Banir membros, Moderar membros e Gerenciar cargos. A hierarquia do bot precisa estar acima dos cargos que ele vai moderar.
- Configure um canal com `.antiraid logs #canal`.

## Ativação inicial
O sistema começa **desativado por segurança** em cada servidor. Execute `.antiraid status`, configure os logs e então `.antiraid on`.

## Comandos
- `.antiraid ajuda` — ajuda.
- `.antiraid on` / `.antiraid off` — ativar/desativar.
- `.antiraid status` — estado, limites e módulos.
- `.antiraid logs #canal` — canal de logs.
- `.antiraid modulo join|spam|mentions|invites|antinuke|antiwebhook|antibot on|off` — controlar módulos.
- `.antiraid limite join|spam|mentions|nuke 2-100` — alterar limites.
- `.antiraid acao join|spam|invites|mentions|antinuke|antibot kick|ban|timeout|strip|delete|none` — ações por módulo.
- `.antiraid whitelist add|remove @usuário` ou `@cargo` — exceções.
- `.antiraid regra criar <nome> on|off` e `.antiraid regra excluir <nome>` — criar/remover regras personalizadas armazenadas. Regras personalizadas são registros de configuração, não novos gatilhos automáticos.
- `.antiraid reset` — restaura padrão e deixa o sistema desligado.

## Proteções incluídas
- Detecção de entrada em massa e registro de contas muito recentes.
- Detecção de spam, excesso de menções e convites do Discord.
- Alertas de bots adicionados.
- Auditoria de criação/remoção de canais e cargos e mudanças de webhooks.
- Detecção de ações destrutivas repetidas usando logs de auditoria e aplicação opcional de ação contra o executor.
- Configuração por servidor persistida em `antiraid-config.json`, com logs e whitelist.

## Limitações importantes
Nenhum anti-raid pode garantir proteção absoluta. O Discord pode limitar eventos e logs de auditoria, e ações automáticas dependem das permissões/hierarquia do bot. Teste primeiro em um servidor de teste. O módulo não apaga/restaura automaticamente canais ou cargos removidos; ele registra e pode aplicar a ação configurada ao executor.
