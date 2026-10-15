# Anti-Raid interativo — Frio Bot

Digite `.antiraid` para abrir o painel em embed. Nele, administradores podem:
- ativar/desativar o sistema;
- ativar/desativar módulos;
- editar limites principais;
- definir ações automáticas;
- selecionar o canal de logs;
- restaurar a configuração padrão.

As alterações são gravadas em `antiraid-config.json` ao lado do código e por servidor. Faça backup desse arquivo e mantenha o disco persistente no host.

## Permissões do bot
Recomenda-se conceder apenas as permissões necessárias: Ver canais, Enviar mensagens, Incorporar links, Gerenciar mensagens, Expulsar membros, Banir membros, Moderar membros e Gerenciar cargos conforme as ações configuradas. O cargo do bot deve estar acima dos cargos que ele precisa moderar. Ative o Anti-Raid apenas após revisar os limites e ações no servidor de teste.

A seleção dos módulos no menu define exatamente quais módulos ficam ativados. Os controles de configuração só aceitam o dono do servidor ou administradores.
