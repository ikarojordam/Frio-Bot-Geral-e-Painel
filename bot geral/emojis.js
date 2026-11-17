// ═══════════════════════════════════════════════════════════
// emojis.js — Central de custom emojis do FrioBot
// v3 — TODOS os IDs conferidos com a lista de emojis do servidor.
// Para trocar um emoji do bot inteiro, mude só a linha aqui.
// Formato: '<:nome:id>' (fixo) ou '<a:nome:id>' (animado).
// ═══════════════════════════════════════════════════════════
const E = {

  // ───────── CHECK / X / SETAS ─────────
  check:        '<:certo_froid:1550644903455756339>',
  checkAlt:     '<:36_V:1532466851127361729>',
  checkAnim:    '<a:checkmark:1542212475649396806>',
  x:            '<:35_X:1532467009181454557>',
  xAlt:         '<:4702discordcrossemoji:1550644905037135992>',
  negativo:     '<:negativo:1311011528501104723>',
  seta:         '<:setinha:1535354476829999114>',
  setinha:      '<:setinha:1535354476829999114>',
  setaAlt:      '<:seta_ghost:1536012641170882671>',
  setaGhost:    '<:seta_ghost:1548712677650464771>',
  voltar:       '<:left:1425679402070704208>',
  proximo:      '<:right:1425679399595937802>',
  setaAnim:     '<a:FARM_ASETA8:1465662166559494207>',

  // ───────── AÇÕES GENÉRICAS ─────────
  entrar:       '<:membro:1548712679475122326>',
  sair:         '<:left:1425679402070704208>',
  adicionar:    '<:add:1425692169443741729>',
  remover:      '<:remove:1425692171654266922>',
  salvar:       '<:download:1425674035940954162>',
  download:     '<:download:1425674035940954162>',
  copiar:       '<:copiar:1445806733112119498>',
  editar:       '<:copiar:1445806733112119498>',
  ferramenta:   '<:30_configuracoes:1532467012901801996>',
  lixo:         '<:11_lixo:1532466836183056444>',
  lupa:         '<:12_lupa:1532467007671500973>',
  grafico:      '<:analytics:1425675454907547770>',
  analytics:    '<:analytics:1425675454907547770>',
  lista:        '<:lista:1425689472078577694>',
  mapa:         '<:mapa:1425690643610734623>',
  config:       '<:30_configuracoes:1532467012901801996>',
  modo:         '<:modo_1:1550206370392055818>',
  caixa:        '<:10_caixa:1532467084334858260>',
  chat:         '<:33_chat:1532467014042517554>',
  comentarios:  '<:comentarios:1427748669259518163>',
  megafone:     '<:megafone:1427748671445012530>',
  carregando:   '<a:Carregando:1503556089243893810>',
  relogio:      '<a:Carregando:1503556089243893810>',
  caminhao:     '<:40_caminhao:1532464073734619297>',
  cartao:       '<:3_cartao:1532467082527113328>',
  carrinho:     '<:carrinho:1546588205107646645>',
  pessoal:      '<:pessoal:1425690646617915402>',
  obg:          '<:jesus:1548711229961404610>',
  jesus:        '<:jesus:1548711229961404610>',

  // ───────── PAGAMENTOS ─────────
  pix:          '<:pix:1536469531755815094>',
  mercadopago:  '<:mercadopago:1536469538730811454>',
  nubank:       '<:nubank:1547866072714059838>',
  ifood:        '<:ifood:1555472156316667974>',
  dinheiro:     '<:whitemoney:1538246799364591656>',
  valor:        '<:whitemoney:1538246799364591656>',

  // ───────── TICKETS / SUPORTE ─────────
  suporte:      '<:suporte:1535864974348652584>',
  suporteAlt:   '<:49suporte:1535354550343434250>',
  reembolso:    '<:REEMBOLSO:1536012636347568219>',
  duvida:       '<:49suporte:1535354550343434250>',
  presente:     '<a:Nitro_Fantastic_Animated:1547992679999348776>',
  nitro:        '<a:Nitro_Fantastic_Animated:1547992679999348776>',
  impulso:      '<a:Impulso:1547863907320864808>',
  regras:       '<:25_regras:1532467011399979229>',
  entrega:      '<:entrega:1548713872951738370>',

  // ───────── CARGOS / STAFF ─────────
  staff:        '<:Staff:1464525238988705802>',
  helper:       '<:Staff:1464525238988705802>',
  mod:          '<:Mod:1464525237256327387>',
  escudo:       '<:escudo_branco:1535865118007500820>',
  verificado:   '<a:verificado:1548713875149422622>',
  verificadoBranco: '<a:verificado_branco_eh68:1536469542396493924>',
  visto:        '<:certo_froid:1550644903455756339>',
  cliente:      '<:cliente:1493673913430053045>',
  membro:       '<:membro:1548712679475122326>',

  // ───────── COROAS / PREMIUM ─────────
  coroaOwner:   '<a:coroa_vermelha:1548705829774032936>',
  coroaDiretor: '<a:coroa_blue:1548705832001077249>',
  coroaGerente: '<a:coroa_cinza:1548705838145867878>',
  coroa:        '<a:Coroa:1548705828549296218>',
  coroaAlt:     '<a:coroa:1548705839479783514>',
  coroaOld:     '<a:coroa_old11:1548705842445025351>',
  vip:          '<a:c_VIPTKF:1548710214629331014>',
  gold:         '<a:golddddddd:1548712681199116378>',
  president:    '<a:Coroa:1548705828549296218>',

  // ───────── RANKING / CONQUISTAS ─────────
  trofeu:       '<:trofeus_1:1538246805714894898>',
  trofeuAlt:    '<:trofeu:1449868370106122370>',
  cemHoras:     '<:100hs:1500979766495281192>',

  // ───────── APOSTAS / FREE FIRE ─────────
  gel:          '<:gel_normal:1294507785995948042>',
  gelNormal:    '<:gel_normal:1294507785995948042>',
  granada:      '<:gel_normal:1294507785995948042>',
  ump:          '<:UMP:1535865090316828712>',
  legendApostas:'<:LEGENDAPOSTAS:1535865058590982234>',
  royalApostas: '<a:ROYALAPOSTAS:1464501263323627652>',

  // ───────── EVENTOS / MISC ─────────
  evento:       '<:lista:1425689472078577694>',
  discord:      '<:discord:1527188455023448114>',
  tiktok:       '<:Tiktok:1465662216874361098>',
  emote8k:      '<a:whitertx:1463792974982021164>',
};

module.exports = E;
