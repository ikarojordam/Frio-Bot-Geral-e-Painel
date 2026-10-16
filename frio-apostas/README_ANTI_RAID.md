# Anti-Raid interativo — v2.0.0
`.antiraid` abre o painel (ativar, módulos, limites de entrada/spam e de nuke/conta, ações, canal de logs, whitelist, admins no anti-nuke).
Config salva por (bot, servidor) na tabela `antiraid_configs` (fallback: `data/antiraid-<bot>.json`). **Proteção parcial**: cobre canais, cargos, bans/kicks em massa, webhooks e @everyone com permissões perigosas; regras personalizadas não têm gatilho.
Permissões úteis: Ver Log de Auditoria, Gerenciar Mensagens/Webhooks/Cargos, Expulsar/Banir/Moderar Membros; cargo do bot acima dos que ele modera. Teste em servidor de staging antes de ligar.
