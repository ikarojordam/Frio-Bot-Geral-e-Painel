# FrioBot

Bot de Discord para servidores de apostas Free Fire, lojas e comunidades (tickets, filas, PIX, streamers, roleta).

## Rodar localmente
```bash
cp .env.example .env     # preencha os valores (o .env nunca vai pro Git)
npm install
npm start
```
Requer Node 22.

## Variáveis de ambiente
Todas estão documentadas em [`.env.example`](.env.example). Obrigatórias: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`.

## Deploy (Render ou similar)
Cadastre cada variável no painel do host (não use arquivo `.env` em produção). Comando de start: `npm start`.

## Comandos (9)
| Comando | Subcomandos |
|---|---|
| `/info` | ping, servidor, usuario, avatar, ajuda, status |
| `/perfil` | ver, aniversario, resgatar |
| `/comunidade` | sugestao, reportar, ia, versiculo (aleatorio/config/off) |
| `/musica` | tocar, pausar, pular, parar, fila, tocando, loop, volume |
| `/roleta` | painel, girar, ver, giros, coins |
| `/hub` · `/admin` · `/dev` | painéis |
| `/config` | ticket, streamer, painel (ticket/streamer) |

### Música por prefixo `m!` (qualquer membro, maiúsculas ou minúsculas)
`m!p <nome/link>` · `m!pause` · `m!next` · `m!stop` · `m!queue` · `m!np` · `m!loop` · `m!vol <0-200>` · `m!remove <pos>` · `m!clear` · `m!help`

## Loja
Pagamentos do Mercado Pago são conferidos sozinhos a cada 30s e o estoque é entregue por DM. PIX estático continua exigindo aprovação da staff.

## Segurança
Leia [`SECURITY.md`](SECURITY.md) antes do primeiro commit. Resumo: sem segredos no código, hook de pre-commit ativo, `ENABLE_DEV_EVAL=false`.

## Scripts
| Comando | O que faz |
|---|---|
| `npm start` | inicia o bot |
| `npm run check` | confere a sintaxe |
| `npm run scan:secrets` | procura segredos nos arquivos |
| `npm run audit:prod` | audita dependências de produção |

## Atualização de recursos (16/10/2026)
Antes de usar os novos campos da loja e do hub de apostas, execute o SQL de `migrations/2026-10-16-frio-features.sql` no SQL Editor do Supabase. Os backups usam a tabela `guild_backups` existente. A restauração é best-effort: permissões e itens recriáveis são restaurados, mas IDs originais de canais/cargos não podem ser preservados e o Discord não permite reconstruir autoria original de mensagens.
