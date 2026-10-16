# Pontos de segurança encontrados no v1.5.0 (e o que mudou)

1. **`/api/bot/status` aceitava token + qualquer sufixo** (comparação truncava o valor recebido). Corrigido (hash + `timingSafeEqual`).
2. **Sandbox do `/dev` executa JS arbitrário** (`new Function`) com acesso ao processo/Supabase = execução remota para quem é "dev". Agora **desligado por padrão** (`FEATURE_DEV_SANDBOX=on` ou `features.dev_sandbox`).
3. **Cargo "Dev do Back Bot" com Administrator é criado/recriado a cada 3 min** nos servidores para 3 IDs fixos. No modo único continua ligado (comportamento original); na **frota vem desligado** — em bots de clientes isso é um acesso administrativo oculto. Ligue por bot apenas com ciência do dono do servidor. Os IDs agora vêm de `DEVELOPER_IDS`.
4. `OWNER_ID` dava poder de dev; na frota `owner_is_developer` é falso por padrão.
5. Kill switch/manutenção eram linhas globais (`id=1`); agora são por bot.
6. Scheduler de auto mensagens e auto-close de tickets liam dados de **todos** os servidores e "reservavam" itens que não podiam enviar; agora filtram pelos servidores do bot.
7. Anti-Raid: administradores eram isentos do anti-nuke (ataque típico = admin comprometido). Agora vigiados por padrão (`nukeExemptAdmins`).
8. Auto-rename do bot no boot virou opt-in (`sync_username`); heartbeat por bot desligado na frota.
