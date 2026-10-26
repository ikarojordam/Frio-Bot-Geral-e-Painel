// ═══════════════════════════════════════════════════════════
// FRIO PAINEL — app.js v3.1.0
// + Editar meu perfil (cliente)
// + Botão Editar em cada usuário (dev)
// ═══════════════════════════════════════════════════════════
'use strict';

// ═══════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════
const APP = {
  user: null,
  admin: null,
  csrf: null,
  currentPage: 'dashboard',
  currentParams: null,
  notifications: [],
  unread: 0,
  servers: [],
  currentServer: null,
  charts: {},
  auditPage: 0,
  auditLimit: 100,
  currentServerActions: null,
  currentUserSessions: null,
  booted: false,
  booting: false,
  notifTimer: null,
};

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
const ROLES_LABEL = { dev:'Dev', admin:'Admin', funcionario:'Funcionário', cliente:'Cliente', pending:'Pendente' };
const PLANS_LABEL = { basic:'Basic', premium:'Premium', ultra:'Ultra', unlimited:'Unlimited', none:'Nenhum' };

const CMDK_ITEMS = [
  { label:'Dashboard',           icon:'layout-dashboard', page:'dashboard',           roles:['dev','admin','funcionario','cliente'] },
  { label:'Meus Servidores',     icon:'server',           page:'servers',             roles:['dev','admin','funcionario','cliente'] },
  { label:'Minhas Keys',         icon:'key-round',        page:'my-keys',             roles:['dev','admin','funcionario','cliente'] },
  { label:'Notificações',        icon:'bell',             page:'notifications',       roles:['dev','admin','funcionario','cliente'] },
  { label:'Conta & Sessões',     icon:'user',             page:'account',             roles:['dev','admin','funcionario','cliente'] },
  { label:'Keys (staff)',        icon:'key',              page:'keys',                roles:['dev','admin','funcionario'] },
  { label:'Packs (dev)',         icon:'package',          page:'packs',               roles:['dev'] },
  { label:'Tickets Global',      icon:'ticket',           page:'tickets-global',      roles:['dev','admin'] },
  { label:'Financeiro',          icon:'wallet',           page:'financial',           roles:['dev','admin'] },
  { label:'Gerenciar Servidores',icon:'radar',            page:'dev-servers',         roles:['dev'] },
  { label:'Buscar Servidor',     icon:'search',           page:'dev-server-search',   roles:['dev'] },
  { label:'Kill Switch',         icon:'siren',            page:'kill-switch',         roles:['dev'] },
  { label:'Manutenção',          icon:'wrench',           page:'maintenance',         roles:['dev'] },
  { label:'Force Premium',       icon:'gem',              page:'force-premium',       roles:['dev'] },
  { label:'Broadcast',           icon:'megaphone',        page:'broadcast',           roles:['dev'] },
  { label:'Backup & Sync',       icon:'database',         page:'backup',              roles:['dev'] },
  { label:'Usuários',            icon:'users',            page:'usuarios',            roles:['dev'] },
  { label:'Aprovações',          icon:'user-check',       page:'pending',             roles:['dev'] },
  { label:'Auditoria',           icon:'scroll-text',      page:'audit',               roles:['dev'] },
];

// ═══════════════════════════════════════════════════════════
// HELPERS — DOM / STRINGS
// ═══════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);
const $first = (sel, root = document) => root.querySelector(sel);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function initials(str) {
  const s = String(str || '').trim();
  if (!s) return '–';
  const parts = s.split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return s[0].toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ═══════════════════════════════════════════════════════════
// HELPERS — DATAS / NÚMEROS
// ═══════════════════════════════════════════════════════════
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR');
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
}
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '—';
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return fmtDateShort(iso);
}
function fmtNumber(v) { return Number(v || 0).toLocaleString('pt-BR'); }
function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
function maskEmail(email) {
  if (!email) return '—';
  const [name, domain] = String(email).split('@');
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.slice(-1)}@${domain}`;
}
function maskId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length <= 8 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// ═══════════════════════════════════════════════════════════
// ÍCONES / TOAST / MSG / MODAIS
// ═══════════════════════════════════════════════════════════
function icon(name, className = '') { return `<i data-lucide="${escapeHtml(name)}" class="${className}"></i>`; }
function refreshIcons(root = document) {
  if (window.lucide?.createIcons) { try { window.lucide.createIcons({ root }); } catch {} }
}

let _toastT = null;
function toast(text, type = 'ok') {
  const el = $('toast');
  if (!el) return;
  const im = { ok:'check-circle-2', error:'x-circle', warn:'alert-triangle', info:'info' };
  el.innerHTML = `${icon(im[type] || 'info')}<span>${escapeHtml(text)}</span>`;
  el.className = `toast ${type} active`;
  refreshIcons(el);
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('active'), 3400);
}

function setMsg(id, text, type = 'error') {
  const el = typeof id === 'string' ? $(id) : id;
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.textContent = ''; el.className = 'msg'; return; }
  el.textContent = text;
  el.className = `msg ${type}`;
  el.style.display = 'block';
}
function clearMsg(...ids) { ids.forEach(id => setMsg(id, '')); }

function openModal(id) {
  const m = typeof id === 'string' ? $(id) : id;
  if (!m) return;
  m.classList.add('active');
  document.body.classList.add('no-scroll');
  refreshIcons(m);
  setTimeout(() => {
    const f = m.querySelector('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    f?.focus();
  }, 60);
}
function closeModal(id) {
  const m = typeof id === 'string' ? $(id) : id;
  if (!m) return;
  m.classList.remove('active');
  if (!document.querySelector('.modal.active') && !document.querySelector('.drawer.active')) document.body.classList.remove('no-scroll');
}
function closeAllModals() {
  $$('.modal.active').forEach(m => m.classList.remove('active'));
  document.body.classList.remove('no-scroll');
}

// ═══════════════════════════════════════════════════════════
// CSRF / API
// ═══════════════════════════════════════════════════════════
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function readCsrf() {
  const c = getCookie('frio_csrf');
  if (c) APP.csrf = c;
  return APP.csrf;
}

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (['POST','PATCH','PUT','DELETE'].includes(method)) {
    const csrf = readCsrf();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  try {
    const res = await fetch(path, {
      credentials: 'include', method, headers,
      body: opts.body !== undefined
        ? (opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body))
        : undefined,
    });
    let data;
    try { data = await res.json(); } catch { data = { ok:false, error:'Resposta inválida.' }; }
    if (!data || typeof data !== 'object') data = { ok:false, error:'Resposta inválida.' };
    if (!res.ok && data.ok === undefined) data.ok = false;
    data._status = res.status;
    // sessão vencida/encerrada no meio do uso: volta ao login em vez de ficar com telas vazias
    if (res.status === 401 && !path.startsWith('/api/auth/') && !APP.sessionExpired) {
      APP.sessionExpired = true;
      toast('Sua sessão expirou. Entre novamente.', 'warn');
      setTimeout(() => window.location.replace('/login'), 1500);
    }
    return data;
  } catch (e) {
    return { ok:false, error:'Erro de conexão.', _status:0, _error:e };
  }
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR / TOPBAR
// ═══════════════════════════════════════════════════════════
function openSidebar() {
  $('sidebar')?.classList.add('open');
  $('sidebarOverlay')?.classList.add('active');
  document.body.classList.add('no-scroll');
}
function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('active');
  if (!document.querySelector('.modal.active') && !document.querySelector('.drawer.active')) document.body.classList.remove('no-scroll');
}
function toggleSidebar() {
  const s = $('sidebar');
  if (!s) return;
  if (s.classList.contains('open')) closeSidebar();
  else openSidebar();
}

// ═══════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════
const PAGE_LOADERS = {};

async function navigate(page, params = null) {
  if (!page) page = 'dashboard';
  if (!$(`page-${page}`)) { console.warn('[nav] não existe:', page); page = 'dashboard'; }

  $$('.page').forEach(p => p.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  $$('.nav-link[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page));

  APP.currentPage = page;
  APP.currentParams = params;
  closeSidebar();
  window.scrollTo({ top:0, behavior:'smooth' });

  try {
    const hash = params ? `#${page}/${encodeURIComponent(params)}` : `#${page}`;
    history.replaceState(null, '', hash);
  } catch {}

  const loader = PAGE_LOADERS[page];
  if (typeof loader === 'function') {
    try { await loader(params); }
    catch (e) { console.error(`[nav/${page}]`, e); toast('Erro ao carregar a página.', 'error'); }
  }
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
async function loadNotifications(silent = false) {
  const r = await api('/api/notifications?limit=30');
  if (!r.ok) { if (!silent) console.warn('[notif]', r.error); return; }
  APP.notifications = r.notifications || [];
  APP.unread = Number(r.unread || 0);
  updateNotificationBadges();
}
function updateNotificationBadges() {
  [$('bellBadge'), $('navNotifBadge')].forEach(b => {
    if (!b) return;
    if (APP.unread > 0) { b.textContent = APP.unread > 99 ? '99+' : String(APP.unread); b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  });
}
function renderDrawerNotifications() {
  const body = $('drawerBody');
  if (!body) return;
  const list = APP.notifications || [];
  if (!list.length) {
    body.innerHTML = `<div class="empty"><div class="empty-icon">${icon('bell-off')}</div><h3>Sem notificações</h3><p>Você está em dia.</p></div>`;
    refreshIcons(body);
    return;
  }
  body.innerHTML = list.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${escapeHtml(n.id)}">
      <div class="notif-title">${escapeHtml(n.title || 'Notificação')}</div>
      <div class="notif-body">${escapeHtml(n.content || '')}</div>
      <div class="notif-time">${timeAgo(n.created_at)}</div>
    </div>`).join('');
  refreshIcons(body);
  body.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.notifId;
      if (!id) return;
      await api(`/api/notifications/${id}/read`, { method:'PATCH' });
      el.classList.remove('unread');
      await loadNotifications(true);
      if (APP.currentPage === 'notifications') PAGE_LOADERS.notifications?.();
    });
  });
}
async function markAllNotifsRead() {
  await api('/api/notifications/read-all', { method:'POST' });
  await loadNotifications(true);
  renderDrawerNotifications();
  if (APP.currentPage === 'notifications') PAGE_LOADERS.notifications?.();
  toast('Notificações marcadas como lidas.');
}
function openNotifDrawer() {
  const d = $('notifDrawer');
  if (!d) return;
  d.style.visibility = 'visible';
  d.style.pointerEvents = 'auto';
  d.setAttribute('aria-hidden', 'false');
  d.classList.add('active');
  document.body.classList.add('no-scroll');
  renderDrawerNotifications();
  loadNotifications(true);
}
function closeNotifDrawer() {
  const d = $('notifDrawer');
  if (!d) return;
  d.classList.remove('active');
  d.setAttribute('aria-hidden', 'true');
  d.style.visibility = 'hidden';
  d.style.pointerEvents = 'none';
  if (!document.querySelector('.modal.active')) document.body.classList.remove('no-scroll');
}

// ═══════════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════════
let cmdkIdx = 0, cmdkFiltered = [];
function getRole() { return APP.admin?.role || 'cliente'; }

function filterCmdk(query) {
  const role = getRole(), q = String(query || '').toLowerCase().trim();
  return CMDK_ITEMS.filter(it => it.roles.includes(role)).filter(it => !q || it.label.toLowerCase().includes(q));
}
function renderCmdk(query) {
  cmdkFiltered = filterCmdk(query); cmdkIdx = 0;
  const wrap = $('cmdResults');
  if (!wrap) return;
  if (!cmdkFiltered.length) {
    wrap.innerHTML = `<div style="padding:28px;text-align:center;color:var(--txt-3);font-size:13px">Nada encontrado.</div>`;
    return;
  }
  wrap.innerHTML = cmdkFiltered.map((it, i) =>
    `<div class="cmd-item ${i === 0 ? 'active' : ''}" data-idx="${i}">${icon(it.icon)}<span>${escapeHtml(it.label)}</span></div>`
  ).join('');
  refreshIcons(wrap);
  wrap.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('mouseenter', () => { cmdkIdx = Number(el.dataset.idx); highlightCmdk(); });
    el.addEventListener('click', () => {
      const it = cmdkFiltered[Number(el.dataset.idx)];
      if (it) { closeCmdk(); navigate(it.page); }
    });
  });
}
function highlightCmdk() {
  $$('#cmdResults .cmd-item').forEach((el, i) => el.classList.toggle('active', i === cmdkIdx));
  $first(`#cmdResults .cmd-item[data-idx="${cmdkIdx}"]`)?.scrollIntoView({ block:'nearest' });
}
function openCmdk() {
  const c = $('cmdPalette');
  if (!c) return;
  c.classList.add('active');
  document.body.classList.add('no-scroll');
  const input = $('cmdInput'); if (input) input.value = '';
  renderCmdk('');
  setTimeout(() => input?.focus(), 50);
}
function closeCmdk() {
  const c = $('cmdPalette');
  if (!c) return;
  c.classList.remove('active');
  if (!document.querySelector('.modal.active') && !document.querySelector('.drawer.active')) document.body.classList.remove('no-scroll');
}
function bindCmdk() {
  const input = $('cmdInput');
  input?.addEventListener('input', () => renderCmdk(input.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkIdx = Math.min(cmdkIdx + 1, cmdkFiltered.length - 1); highlightCmdk(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkIdx = Math.max(cmdkIdx - 1, 0); highlightCmdk(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = cmdkFiltered[cmdkIdx]; if (it) { closeCmdk(); navigate(it.page); } }
    else if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
  });
  $('cmdPalette')?.addEventListener('click', (e) => { if (e.target.id === 'cmdPalette') closeCmdk(); });
  $('btnCmdk')?.addEventListener('click', openCmdk);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('cmdPalette')?.classList.contains('active')) closeCmdk(); else openCmdk();
    }
    if (e.key === 'Escape') {
      if ($('cmdPalette')?.classList.contains('active')) closeCmdk();
      else if (document.querySelector('.modal.active')) closeAllModals();
      else if ($('notifDrawer')?.classList.contains('active')) closeNotifDrawer();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// USUÁRIO — render
// ═══════════════════════════════════════════════════════════
function renderUserInfo() {
  const email = APP.user?.email || '—';
  const role = ROLES_LABEL[APP.admin?.role] || APP.admin?.role || '—';
  const plan = PLANS_LABEL[APP.admin?.plan] || '—';
  const ini = initials(email.split('@')[0]);

  const setTxt = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  setTxt('chipEmail', email);
  setTxt('chipRole', `${role} · ${plan}`);
  setTxt('chipInitials', ini);
  setTxt('sideEmail', email);
  setTxt('sideRole', `${role} · ${plan}`);
  setTxt('accEmail', email);
  setTxt('accRole', role);
  setTxt('accPlan', plan);
  setTxt('accDiscordId', APP.admin?.discord_id || '—');

  const sideAv = $('sideAvatar');
  if (sideAv) sideAv.innerHTML = `<span>${escapeHtml(ini)}</span>`;

  document.body.dataset.plan = APP.admin?.plan || 'none';
  document.body.dataset.role = APP.admin?.role || 'cliente';
}

function applyRoleVisibility() {
  const role = getRole();
  $$('[data-roles]').forEach(el => {
    const roles = String(el.dataset.roles).split(',').map(s => s.trim());
    el.classList.toggle('hidden', !roles.includes(role));
  });
}

function bindNav() {
  $$('.nav-link[data-nav]').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.dataset.nav); });
  });
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-nav-go]');
    if (link) { e.preventDefault(); navigate(link.dataset.navGo); }
  });
}

// ═══════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════
async function doLogout(skipConfirm = false) {
  if (!skipConfirm && !window.confirm('Sair da sua conta?')) return;
  try { await api('/api/auth/logout', { method:'POST' }); } catch {}
  window.location.replace('/login');
}

// ═══════════════════════════════════════════════════════════
// BOOT — telas
// ═══════════════════════════════════════════════════════════
function showBoot() {
  $('bootScreen')?.classList.remove('hidden');
  $('blockedScreen')?.classList.add('hidden');
  $('appShell')?.classList.add('hidden');
  document.body.classList.add('no-scroll');
}
function showBlocked(title, text, code = '') {
  $('bootScreen')?.classList.add('hidden');
  $('appShell')?.classList.add('hidden');
  const b = $('blockedScreen');
  if (!b) return;
  b.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  const t = $('blockedTitle'), p = $('blockedText');
  if (t) t.textContent = title || 'Acesso bloqueado';
  if (p) {
    if (code === 'PENDING') p.innerHTML = 'Sua conta está aguardando <strong>aprovação do desenvolvedor</strong>. Você será notificado assim que liberar.';
    else if (code === 'BANNED') p.innerHTML = 'Esta conta foi <strong>banida</strong> da plataforma.';
    else if (code === 'INACTIVE') p.innerHTML = 'Esta conta está <strong>desativada</strong>.';
    else p.textContent = text || '';
  }
}
function showApp() {
  // Nunca mostrar o painel com o menu mobile aberto após autenticação/retorno do navegador.
  closeSidebar();
  $('bootScreen')?.classList.add('hidden');
  $('blockedScreen')?.classList.add('hidden');
  $('appShell')?.classList.remove('hidden');
  document.body.classList.remove('no-scroll');
}

// ═══════════════════════════════════════════════════════════
// BOOT PRINCIPAL
// ═══════════════════════════════════════════════════════════
async function bootApp() {
  if (APP.booting) return;
  APP.booting = true;
  showBoot();
  try {
    const r = await api('/api/auth/me');
    if (!r.ok) {
      if (r._status === 401) return window.location.replace('/login');
      if (r.code === 'PENDING') { showBlocked('Aguardando aprovação', '', 'PENDING'); return; }
      if (/banid/i.test(r.error || '')) { showBlocked('Conta banida', '', 'BANNED'); return; }
      if (/desativad/i.test(r.error || '')) { showBlocked('Conta desativada', '', 'INACTIVE'); return; }
      if (r._status === 403) { showBlocked('Sem acesso', r.error || 'Você não tem permissão.'); return; }
      showBlocked('Erro ao carregar', r.error || 'Não foi possível carregar sua conta.');
      return;
    }

    APP.user = r.user;
    APP.admin = r.admin;
    readCsrf();
    renderUserInfo();
    applyRoleVisibility();
    showApp();
    APP.booted = true;

    const hash = (location.hash || '').replace(/^#/, '');
    let startPage = 'dashboard', startParam = null;
    if (hash) {
      const [p, param] = hash.split('/');
      const requestedPage = p ? decodeURIComponent(p) : '';
      // Não reabrir a tela de notificações por causa de um hash antigo salvo no navegador.
      // Links diretos para outras áreas continuam funcionando normalmente.
      if (requestedPage && requestedPage !== 'notifications') {
        startPage = requestedPage;
        if (param) startParam = decodeURIComponent(param);
      }
    }
    // Remova o hash antigo de notificações para que o painel abra no Dashboard nas próximas visitas.
    if (startPage === 'dashboard' && location.hash === '#notifications') {
      history.replaceState(null, '', location.pathname + location.search);
    }

    closeNotifDrawer();
    refreshIcons();
    await navigate(startPage, startParam);
    loadNotifications(true);

    clearInterval(APP.notifTimer);
    APP.notifTimer = setInterval(() => { if (!document.hidden) loadNotifications(true); }, 30000);
    if (!APP.visBound) {
      APP.visBound = true;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNotifications(true); });
    }
  } catch (e) {
    console.error('[boot]', e);
    showBlocked('Erro inesperado', 'Não foi possível carregar o painel.');
  } finally {
    APP.booting = false;
  }
}

// ═══════════════════════════════════════════════════════════
// BIND GLOBAL
// ═══════════════════════════════════════════════════════════
function bindGlobal() {
  $('btnBurger')?.addEventListener('click', toggleSidebar);
  $('sidebarOverlay')?.addEventListener('click', closeSidebar);
  // iOS Safari nem sempre dispara "click" em área sem conteúdo: fecha por qualquer toque fora do menu.
  const outsideClose = (e) => {
    const sb = $('sidebar');
    if (!sb || !sb.classList.contains('open')) return;
    if (e.target.closest && (e.target.closest('#sidebar') || e.target.closest('#btnBurger'))) return;
    closeSidebar();
  };
  document.addEventListener('pointerdown', outsideClose, true);
  document.addEventListener('touchstart', outsideClose, { capture: true, passive: true });
  // navegação sempre fecha o menu e destrava a rolagem, mesmo se algo falhar no meio
  window.addEventListener('pagehide', () => { closeSidebar(); closeAllModals(); });
  $('btnLogout')?.addEventListener('click', () => doLogout());
  $('btnLogoutSide')?.addEventListener('click', () => doLogout());

  $('btnBell')?.addEventListener('click', openNotifDrawer);
  $('btnCloseDrawer')?.addEventListener('click', closeNotifDrawer);
  $('btnMarkAllReadDrawer')?.addEventListener('click', markAllNotifsRead);

  document.addEventListener('pointerdown', (e) => {
    const closeButton = e.target.closest && e.target.closest('#btnCloseDrawer');
    if (closeButton) {
      e.preventDefault();
      closeNotifDrawer();
    }
  }, { passive: false });
  document.addEventListener('click', (e) => {
    // Fechamento delegado para o drawer funcionar também em Safari/iOS.
    const closeDrawerButton = e.target.closest('#btnCloseDrawer');
    if (closeDrawerButton) {
      e.preventDefault();
      e.stopPropagation();
      closeNotifDrawer();
      return;
    }
    const drawer = $('notifDrawer');
    if (drawer && e.target === drawer) closeNotifDrawer();
    const closer = e.target.closest('[data-close]');
    if (closer) { e.preventDefault(); closeModal(closer.dataset.close); return; }
    if (e.target.classList?.contains('modal') && e.target.classList.contains('active')) {
      e.target.classList.remove('active');
      if (!document.querySelector('.modal.active')) document.body.classList.remove('no-scroll');
    }
  });
  $('notifDrawer')?.addEventListener('click', (e) => { if (e.target.id === 'notifDrawer') closeNotifDrawer(); });
  $('btnUserChip')?.addEventListener('click', () => navigate('account'));

  $('btnOpenForgotFromAccount')?.addEventListener('click', () => {
    const inp = $('forgotEmail');
    if (inp) inp.value = APP.user?.email || '';
    clearMsg('forgotMsg');
    openModal('modalForgot');
  });

  window.addEventListener('hashchange', () => {
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const [p, param] = raw.split('/');
    if (!p || p === APP.currentPage) return;
    navigate(decodeURIComponent(p), param ? decodeURIComponent(param) : null);
  });

  bindCmdk();
  if (window.top !== window.self) {
    try { window.top.location = window.self.location; } catch {}
  }
}

// ═══════════════════════════════════════════════════════════
// REGISTRO DE PÁGINAS
// ═══════════════════════════════════════════════════════════
function registerPage(page, loaderFn) { PAGE_LOADERS[page] = loaderFn; }

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  loadBotStatus();
  loadDashStats();
  renderQuickActions();

  if (['dev','admin','funcionario'].includes(getRole())) {
    loadQuickStats();
    loadDashCharts();
    loadRecentActivity();
    loadKeysExpiring();
  } else {
    $('dashQuickStats')?.classList.add('hidden');
    $('dashCharts')?.classList.add('hidden');
    $('cardKeysExpiring')?.classList.add('hidden');
    const ra = $('recentActivity');
    if (ra) ra.innerHTML = '<div class="empty-sm">Disponível apenas para a equipe.</div>';
  }

  $('btnRefreshDashboard')?.addEventListener('click', () => { toast('Atualizando…'); loadDashboard(); }, { once:true });
}

async function loadBotStatus() {
  const dot = $('botStatusDot');
  const lbl = $('botStatusLabel');
  const ping = $('botStatusPing');
  const up = $('botStatusUptime');
  const gd = $('botStatusGuilds');
  const warnBox = $('statusWarnings');
  if (!dot) return;

  const r = await api('/api/dashboard/bot-status');
  if (!r.ok) { dot.className = 'status-dot error'; lbl.textContent = 'Status indisponível'; return; }

  const { bot, kill_switch, maintenance } = r;
  if (bot?.configured === false) {
    dot.className = 'status-dot offline';
    lbl.textContent = 'Monitoramento do bot não configurado';
    ping.textContent = '– ms'; up.textContent = '–'; gd.textContent = '– guilds';
  } else if (bot?.offline || !bot?.ok) {
    dot.className = 'status-dot offline';
    lbl.textContent = 'Bot offline';
    ping.textContent = '– ms';
    up.textContent = '–';
    gd.textContent = '– guilds';
  } else {
    dot.className = 'status-dot online pulse';
    lbl.textContent = `Bot online (${bot.version || 'v?'})`;
    ping.textContent = `${bot.ping || 0} ms`;
    up.textContent = bot.uptimeHuman || fmtDuration(bot.uptime || 0);
    gd.textContent = `${fmtNumber(bot.guilds || 0)} guilds`;
  }

  const warns = [];
  if (kill_switch?.active) warns.push(`Kill switch ATIVO — ${escapeHtml(kill_switch.reason || 'sem motivo')}`);
  if (maintenance?.active) warns.push(`Manutenção ATIVA — ${escapeHtml(maintenance.reason || 'sem motivo')}`);

  if (warns.length && warnBox) {
    warnBox.innerHTML = warns.map(w => `<div class="alert danger" style="margin-bottom:8px">${icon('siren')}<div class="alert-body"><div class="alert-text">${w}</div></div></div>`).join('');
    refreshIcons(warnBox);
    warnBox.classList.remove('hidden');
  } else warnBox?.classList.add('hidden');
}

async function loadDashStats() {
  const wrap = $('dashStats');
  if (!wrap) return;
  wrap.innerHTML = `<div class="stat-card"><div class="stat-icon blue">${icon('loader-2','spin')}</div><div class="stat-body"><div class="stat-value">–</div><div class="stat-label">Carregando…</div></div></div>`;
  refreshIcons(wrap);

  const r = await api('/api/dashboard/stats');
  if (!r.ok) {
    wrap.innerHTML = `<div class="card">${icon('x-circle')} ${escapeHtml(r.error || 'Erro')}</div>`;
    refreshIcons(wrap);
    return;
  }
  const s = r.stats || {};
  const isStaff = ['dev','admin','funcionario'].includes(getRole());

  const cards = isStaff ? [
    { i:'server',    l:'Servidores',      v:fmtNumber(s.guilds),         c:'blue',   nav:'dev-servers' },
    { i:'users',     l:'Usuários',        v:fmtNumber(s.users),          c:'green',  nav:'usuarios' },
    { i:'key',       l:'Keys ativas',     v:fmtNumber(s.active_keys),    c:'amber',  nav:'keys' },
    { i:'gift',      l:'Resgates',        v:fmtNumber(s.redemptions),    c:'purple', nav:'keys' },
    { i:'clock',     l:'Pendentes',       v:fmtNumber(s.pending),        c:'red',    nav:'pending' },
    { i:'user-check',l:'Membros totais',  v:fmtNumber(s.total_members),  c:'green',  nav:'dev-servers' },
  ] : [
    { i:'server', l:'Meus servidores', v:fmtNumber(s.servers), c:'blue',   nav:'servers' },
    { i:'key',    l:'Minhas keys',     v:fmtNumber(s.keys),    c:'amber',  nav:'my-keys' },
    { i:'bell',   l:'Não lidas',       v:fmtNumber(s.notifs),  c:'red',    nav:'notifications' },
  ];

  wrap.innerHTML = cards.map(c => `
    <div class="stat-card clickable" data-nav-go="${c.nav}">
      <div class="stat-icon ${c.c}">${icon(c.i)}</div>
      <div class="stat-body">
        <div class="stat-value">${escapeHtml(c.v)}</div>
        <div class="stat-label">${escapeHtml(c.l)}</div>
      </div>
    </div>`).join('');
  refreshIcons(wrap);
}

async function loadQuickStats() {
  const wrap = $('dashQuickStats');
  if (!wrap) return;
  wrap.classList.remove('hidden');
  const r = await api('/api/dashboard/quick-stats');
  if (!r.ok) { wrap.innerHTML = ''; return; }
  const q = r.quick || {};
  wrap.innerHTML = `
    <div class="stat-card"><div class="stat-icon green">${icon('log-in')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(q.logins_24h)}</div><div class="stat-label">Logins 24h</div></div></div>
    <div class="stat-card"><div class="stat-icon red">${icon('shield-x')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(q.logins_failed_24h)}</div><div class="stat-label">Falhas 24h</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">${icon('key')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(q.keys_generated_24h)}</div><div class="stat-label">Keys geradas 24h</div></div></div>
    <div class="stat-card"><div class="stat-icon purple">${icon('gift')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(q.redemptions_7d)}</div><div class="stat-label">Resgates 7d</div></div></div>`;
  refreshIcons(wrap);
}

async function loadDashCharts() {
  const wrap = $('dashCharts');
  if (!wrap) return;
  const rc = await api('/api/dashboard/charts');
  if (!rc.ok) { wrap.innerHTML = ''; wrap.classList.add('hidden'); return; }

  const c = rc.charts || {};
  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="chart-card"><h4>${icon('line-chart')} Keys por dia (30d)</h4><canvas id="chartKeysByDay"></canvas></div>
    <div class="chart-card"><h4>${icon('pie-chart')} Keys por tier</h4><canvas id="chartKeysTier"></canvas></div>
    <div class="chart-card"><h4>${icon('users')} Usuários por função</h4><canvas id="chartUsersRole"></canvas></div>
    <div class="chart-card"><h4>${icon('bar-chart-3')} Planos ativos</h4><canvas id="chartUsersPlan"></canvas></div>
    <div class="chart-card" style="grid-column:1/-1"><h4>${icon('trophy')} Top 10 servidores</h4><canvas id="chartTopServers"></canvas></div>`;
  refreshIcons(wrap);

  const destroy = (id) => { if (APP.charts[id]) { APP.charts[id].destroy(); delete APP.charts[id]; } };
  const baseOpts = { responsive:true, plugins:{ legend:{ labels:{ color:'#9ca3af' } } }, scales:{ y:{ ticks:{ color:'#9ca3af' } }, x:{ ticks:{ color:'#9ca3af' } } } };

  try {
    if (c.keys_by_day?.length) {
      destroy('chartKeysByDay');
      APP.charts.chartKeysByDay = new Chart($('chartKeysByDay'), {
        type: 'line',
        data: { labels: c.keys_by_day.map(d => d.date), datasets:[{ label:'Keys', data:c.keys_by_day.map(d => d.count), borderColor:'#5865F2', backgroundColor:'rgba(88,101,242,.15)', fill:true, tension:.35, pointRadius:3 }] },
        options: { ...baseOpts, plugins:{ legend:{ display:false } } },
      });
    }
    if (c.keys_by_tier) {
      destroy('chartKeysTier');
      APP.charts.chartKeysTier = new Chart($('chartKeysTier'), {
        type:'doughnut',
        data:{ labels:['Basic','Premium','Ultra','Unlimited'], datasets:[{ data:[c.keys_by_tier.basic, c.keys_by_tier.premium, c.keys_by_tier.ultra, c.keys_by_tier.unlimited], backgroundColor:['#CD7F32','#C0C0C0','#FFD700','#8B5CF6'] }] },
        options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ color:'#9ca3af' } } } },
      });
    }
    if (c.users_by_role) {
      destroy('chartUsersRole');
      APP.charts.chartUsersRole = new Chart($('chartUsersRole'), {
        type:'doughnut',
        data:{ labels:['Dev','Admin','Funcionário','Cliente','Pendente'], datasets:[{ data:[c.users_by_role.dev, c.users_by_role.admin, c.users_by_role.funcionario, c.users_by_role.cliente, c.users_by_role.pending], backgroundColor:['#FFD700','#ED4245','#9B59B6','#57F287','#808080'] }] },
        options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ color:'#9ca3af' } } } },
      });
    }
    if (c.users_by_plan) {
      destroy('chartUsersPlan');
      APP.charts.chartUsersPlan = new Chart($('chartUsersPlan'), {
        type:'bar',
        data:{ labels:['Basic','Premium','Ultra','Unlimited','Nenhum'], datasets:[{ data:[c.users_by_plan.basic, c.users_by_plan.premium, c.users_by_plan.ultra, c.users_by_plan.unlimited, c.users_by_plan.none], backgroundColor:['#CD7F32','#C0C0C0','#FFD700','#8B5CF6','#6b7280'] }] },
        options:{ ...baseOpts, plugins:{ legend:{ display:false } } },
      });
    }
    if (c.top_servers?.length) {
      destroy('chartTopServers');
      APP.charts.chartTopServers = new Chart($('chartTopServers'), {
        type:'bar',
        data:{ labels:c.top_servers.map(s => s.name), datasets:[{ label:'Membros', data:c.top_servers.map(s => s.member_count), backgroundColor:'rgba(88,101,242,.7)' }] },
        options:{ indexAxis:'y', responsive:true, plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true, ticks:{ color:'#9ca3af' } }, y:{ ticks:{ color:'#9ca3af' } } } },
      });
    }
  } catch (e) { console.error('[charts]', e); }
}

async function loadRecentActivity() {
  const wrap = $('recentActivity');
  if (!wrap) return;
  const r = await api('/api/dashboard/recent-activity');
  if (!r.ok) { wrap.innerHTML = '<div class="empty-sm">Erro ao carregar</div>'; return; }
  const list = r.activity || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty-sm">Nenhuma atividade registrada.</div>'; return; }

  const iconMap = {
    login:'log-in', login_failed:'shield-x', logout:'log-out',
    register_pending:'user-plus', password_reset:'key',
    generate_keys:'key', send_key:'send', delete_key:'trash-2',
    nuke_guild:'bomb', force_leave_guild:'log-out', force_rename_guild:'pencil',
    kill_switch_on:'siren', kill_switch_off:'check-circle-2',
    maintenance_on:'wrench', maintenance_off:'check-circle-2',
    force_premium_add:'gem', force_premium_remove:'trash-2',
    broadcast_global:'megaphone', approve_user:'user-check', update_user:'pencil',
    access_denied:'ban', take_members:'user-plus', refresh_guild:'refresh-cw',
    self_update_profile:'user-cog',
  };

  wrap.innerHTML = list.map(a => {
    const ic = iconMap[a.action] || 'activity';
    const fail = a.success === false;
    return `
      <div class="activity-item ${fail ? 'fail' : ''}">
        <div class="activity-icon">${icon(ic)}</div>
        <div class="activity-info">
          <div class="activity-title"><span class="activity-action">${escapeHtml(a.action)}</span></div>
          <div class="activity-meta">
            <span>${icon('user')} ${escapeHtml(a.actor_email || a.actor_id || 'system')}</span>
            ${a.ip ? `<span>${icon('globe')} ${escapeHtml(a.ip)}</span>` : ''}
            ${a.browser ? `<span>${icon('monitor')} ${escapeHtml(a.browser)}</span>` : ''}
          </div>
        </div>
        <div class="activity-time">${timeAgo(a.created_at)}</div>
      </div>`;
  }).join('');
  refreshIcons(wrap);
}

async function loadKeysExpiring() {
  const wrap = $('keysExpiring');
  const card = $('cardKeysExpiring');
  if (!wrap || !card) return;
  const r = await api('/api/dashboard/keys-expiring');
  if (!r.ok) { card.classList.add('hidden'); return; }
  const keys = r.keys || [];
  card.classList.remove('hidden');
  if (!keys.length) { wrap.innerHTML = `<div class="empty-sm">${icon('check-circle-2')} Nenhuma key expirando em 7 dias</div>`; refreshIcons(wrap); return; }
  wrap.innerHTML = keys.map(k => {
    const dias = Math.ceil((new Date(k.expira_em) - Date.now()) / 86400000);
    const cls = dias <= 2 ? 'danger' : dias <= 4 ? 'warn' : '';
    return `
      <div class="list-item no-hover">
        <div class="list-icon ${cls}">${icon('key')}</div>
        <div class="list-info">
          <div class="list-title"><code>${escapeHtml(k.key_code)}</code> <span class="tag tag-info">${escapeHtml(PLANS_LABEL[k.tier] || k.tier)}</span></div>
          <div class="list-sub">${k.sent_to ? 'Enviada' : 'Disponível'} · expira em ${dias}d</div>
        </div>
      </div>`;
  }).join('');
  refreshIcons(wrap);
}

function renderQuickActions() {
  const wrap = $('quickActions');
  if (!wrap) return;
  const role = getRole();
  const actions = [
    { label:'Gerar Key',             icon:'key',           nav:'keys',              roles:['dev','admin','funcionario'] },
    { label:'Novo Usuário',          icon:'user-plus',     nav:'usuarios',          roles:['dev'], action:'novoUser' },
    { label:'Aprovações',            icon:'user-check',    nav:'pending',           roles:['dev'] },
    { label:'Gerenciar Servidores',  icon:'radar',         nav:'dev-servers',       roles:['dev'] },
    { label:'Kill Switch',           icon:'siren',         nav:'kill-switch',       roles:['dev'] },
    { label:'Broadcast',             icon:'megaphone',     nav:'broadcast',         roles:['dev'] },
    { label:'Auditoria',             icon:'scroll-text',   nav:'audit',             roles:['dev'] },
    { label:'Meus Servidores',       icon:'server',        nav:'servers',           roles:['dev','admin','funcionario','cliente'] },
    { label:'Minhas Keys',           icon:'key-round',     nav:'my-keys',           roles:['dev','admin','funcionario','cliente'] },
    { label:'Conta & Sessões',       icon:'user',          nav:'account',           roles:['dev','admin','funcionario','cliente'] },
    { label:'Notificações',          icon:'bell',          nav:'notifications',     roles:['dev','admin','funcionario','cliente'] },
    { label:'Financeiro',            icon:'wallet',        nav:'financial',         roles:['dev','admin'] },
  ].filter(a => a.roles.includes(role));

  wrap.innerHTML = actions.map(a => `
    <button class="quick-action" data-nav-go="${a.nav}" data-action="${a.action || ''}">
      ${icon(a.icon)}
      <span class="qa-label">${escapeHtml(a.label)}</span>
    </button>`).join('');
  refreshIcons(wrap);

  wrap.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.navGo;
      const action = btn.dataset.action;
      navigate(nav);
      if (action === 'novoUser') setTimeout(() => $('btnNovoUsuario')?.click(), 400);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: MEUS SERVIDORES
// ═══════════════════════════════════════════════════════════
async function loadServers() {
  const wrap = $('serversGrid');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('loader-2','spin')}</div><p>Carregando…</p></div>`;
  refreshIcons(wrap);

  const r = await api('/api/me/servers');
  if (!r.ok) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('x-circle')}</div><h3>Erro</h3><p>${escapeHtml(r.error || 'Não foi possível carregar.')}</p></div>`;
    refreshIcons(wrap);
    return;
  }
  APP.servers = r.servers || [];
  renderServersGrid();

  $('btnRefreshServers')?.addEventListener('click', loadServers, { once:true });
  $('serverSearch')?.addEventListener('input', renderServersGrid, { once:true });
  $('serverSort')?.addEventListener('change', renderServersGrid, { once:true });
}

function renderServersGrid() {
  const wrap = $('serversGrid');
  if (!wrap) return;
  const q = ($('serverSearch')?.value || '').toLowerCase().trim();
  const sort = $('serverSort')?.value || 'members_desc';

  let list = [...APP.servers];
  if (q) list = list.filter(s => String(s.name || '').toLowerCase().includes(q) || String(s.guild_id || '').includes(q));

  list.sort((a, b) => {
    if (sort === 'members_desc') return (b.member_count || 0) - (a.member_count || 0);
    if (sort === 'members_asc') return (a.member_count || 0) - (b.member_count || 0);
    if (sort === 'name_asc') return String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''));
    return 0;
  });

  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="empty-icon">${icon('server-off')}</div>
        <h3>Nenhum servidor encontrado</h3>
        <p>Só aparecem servidores onde você é dono, admin ou possui acesso concedido.</p>
      </div>`;
    refreshIcons(wrap);
    return;
  }

  wrap.innerHTML = list.map(s => `
    <div class="server-card" data-guild-id="${escapeHtml(s.guild_id)}">
      <div class="server-icon">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : icon('server')}</div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name || 'Sem nome')}</div>
        <div class="server-id">${escapeHtml(s.guild_id)}</div>
        <div class="server-meta">
          <span>${icon('users')} ${fmtNumber(s.member_count || 0)}</span>
          ${s.is_premium ? `<span class="tag tag-gold">${icon('gem')} Premium</span>` : ''}
        </div>
      </div>
    </div>`).join('');
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-guild-id]').forEach(el => {
    el.addEventListener('click', () => openServerDetail(el.dataset.guildId));
  });
}

async function openServerDetail(gid) {
  const isDev = getRole() === 'dev';
  let r = isDev ? await api(`/api/dev/servers/${gid}/full`) : null;
  if (!r || !r.ok) r = await api(`/api/me/servers/${gid}/stats`);
  if (!r.ok) return toast(r.error || 'Erro', 'error');

  const g = r.guild || {};
  const c = r.counts || {};
  const st = r.stats || {};

  const body = $('serverDetail');
  if (!body) return;

  body.innerHTML = `
    <h2 style="display:flex;align-items:center;gap:10px">${icon('server')} ${escapeHtml(g.name || 'Servidor')}</h2>
    <p class="modal-sub">${escapeHtml(g.guild_id || gid)}</p>
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card"><div class="stat-icon blue">${icon('users')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(g.member_count || st.members || 0)}</div><div class="stat-label">Membros</div></div></div>
      <div class="stat-card"><div class="stat-icon green">${icon('ticket')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(c.tickets_open || st.tickets_open || 0)}</div><div class="stat-label">Tickets abertos</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">${icon('gamepad-2')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(c.bets_total || st.bets_30d || 0)}</div><div class="stat-label">Apostas</div></div></div>
    </div>
    ${r.force_premium ? `<p class="hint" style="margin-top:14px">${icon('gem')} Force Premium: <strong>${r.force_premium.permanent ? 'Permanente' : fmtDate(r.force_premium.expires_at)}</strong></p>` : ''}
    ${isDev ? `
      <div style="margin-top:18px;display:flex;gap:8px">
        <button class="btn btn-primary" id="btnOpenDevServerActions">
          ${icon('zap')} Ações DEV
        </button>
      </div>` : ''}`;
  refreshIcons(body);
  mountFrioStore(body,gid);
  mountFrioStoreExtras(body,gid);

  $('btnOpenDevServerActions')?.addEventListener('click', () => {
    closeModal('modalServer');
    openDevServerActions(gid);
  });

  openModal('modalServer');
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: MINHAS KEYS (cliente)
// ═══════════════════════════════════════════════════════════
async function loadMyKeys() {
  const wrap = $('myKeysList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api('/api/me/keys-sent');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const keys = r.keys || [];
  if (!keys.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('key-round')}</div><h3>Nenhuma key recebida</h3><p>Quando a staff enviar uma key, ela aparece aqui.</p></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = keys.map(k => `
    <div class="list-item no-hover">
      <div class="list-icon amber">${icon('key')}</div>
      <div class="list-info">
        <div class="list-title">
          <code>${escapeHtml(k.key_code)}</code>
          ${k.is_pack ? `<span class="tag tag-info">Pack</span>` : ''}
          <span class="tag tag-ok">${escapeHtml(PLANS_LABEL[k.tier] || k.tier)}</span>
        </div>
        <div class="list-sub">
          <span>${icon('calendar')} ${fmtDate(k.sent_at)}</span>
          <span>${k.duracao_dias === 0 ? 'Permanente' : `${k.duracao_dias} dias`}</span>
        </div>
      </div>
    </div>`).join('');
  refreshIcons(wrap);

  $('btnRefreshMyKeys')?.addEventListener('click', loadMyKeys, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
async function loadNotifPage() {
  await loadNotifications();
  const wrap = $('notifList');
  if (!wrap) return;
  const list = APP.notifications || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('bell-off')}</div><h3>Sem notificações</h3><p>Você está em dia.</p></div>`;
    refreshIcons(wrap); return;
  }
  const iconFor = (t) => t === 'key_received' ? 'key' : t === 'alert' ? 'alert-triangle' : 'megaphone';
  wrap.innerHTML = list.map(n => `
    <div class="list-item ${n.read ? '' : 'unread'}">
      <div class="list-icon">${icon(iconFor(n.type))}</div>
      <div class="list-info">
        <div class="list-title">${escapeHtml(n.title)}</div>
        <div class="list-sub">${escapeHtml(n.content || '')}</div>
        <div class="list-sub text-mut" style="margin-top:4px">${icon('clock')} ${timeAgo(n.created_at)}</div>
      </div>
    </div>`).join('');
  refreshIcons(wrap);

  $('btnMarkAllRead')?.addEventListener('click', markAllNotifsRead, { once:true });
  $('btnRefreshNotifs')?.addEventListener('click', loadNotifPage, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: CONTA & SESSÕES
// ═══════════════════════════════════════════════════════════
async function loadAccount() {
  renderUserInfo();
  await loadSessions();
  $('btnRefreshSessions')?.addEventListener('click', loadSessions, { once:true });
  $('btnLogoutAll')?.addEventListener('click', async () => {
    if (!confirm('Encerrar TODAS as sessões exceto a atual?')) return;
    const r = await api('/api/me/sessions', { method:'DELETE' });
    if (r.ok) { toast('Sessões encerradas.'); loadSessions(); }
    else toast(r.error || 'Erro', 'error');
  }, { once:true });
}

async function loadSessions() {
  const wrap = $('sessionsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api('/api/me/sessions');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const list = r.sessions || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('monitor')}</div><h3>Nenhuma sessão ativa</h3></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = list.map(s => {
    const isMobile = s.device_type === 'mobile';
    return `
      <div class="list-item no-hover">
        <div class="list-icon">${icon(isMobile ? 'smartphone' : 'monitor')}</div>
        <div class="list-info">
          <div class="list-title">
            <span class="tag tag-info">${escapeHtml(s.device_type || '?')}</span>
            <span class="tag tag-ok">${escapeHtml(s.browser || '?')}</span>
            <span class="tag tag-neutral">${escapeHtml(s.os || '?')}</span>
          </div>
          <div class="list-sub">
            <span>${icon('globe')} <code>${escapeHtml(s.ip || '—')}</code></span>
            ${s.country ? `<span>${icon('map-pin')} ${escapeHtml(s.country)}</span>` : ''}
            <span>${icon('clock')} ${timeAgo(s.last_seen || s.created_at)}</span>
          </div>
        </div>
        <button class="btn btn-danger btn-sm" data-revoke-session="${escapeHtml(s.id)}">
          ${icon('ban')} Revogar
        </button>
      </div>`;
  }).join('');
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-revoke-session]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Revogar esta sessão?')) return;
      const r = await api(`/api/me/sessions/${b.dataset.revokeSession}`, { method:'DELETE' });
      if (r.ok) { toast('Sessão revogada.'); loadSessions(); }
      else toast(r.error || 'Erro', 'error');
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: KEYS (staff)
// ═══════════════════════════════════════════════════════════
async function loadKeys() {
  await Promise.allSettled([loadKeysTable(), loadRedemptions()]);

  $('genForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('genResult');
    const r = await api('/api/keys/generate', {
      method:'POST',
      body:{
        tier:$('genTier').value,
        duracao_dias:Number($('genDuracao').value),
        quantidade:Number($('genQtd').value),
        max_usos:Number($('genMaxUsos').value),
        validade_key_dias:Number($('genValidade').value),
        motivo:($('genMotivo').value || '').trim() || null,
      },
    });
    if (!r.ok) return setMsg('genResult', r.error || 'Erro', 'error');
    setMsg('genResult', `${r.keys.length} keys geradas!`, 'ok');
    toast(`${r.keys.length} keys geradas`);
    loadKeysTable();
  }, { once:true });

  $('btnRefreshKeys')?.addEventListener('click', loadKeysTable, { once:true });
  $('filterStatus')?.addEventListener('change', loadKeysTable, { once:true });
  $('filterTier')?.addEventListener('change', loadKeysTable, { once:true });
  $('btnEnviarKey')?.addEventListener('click', openSendKeyModal, { once:true });
}

async function loadKeysTable() {
  const wrap = $('keysTable');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const params = new URLSearchParams();
  if ($('filterStatus')?.value) params.set('status', $('filterStatus').value);
  if ($('filterTier')?.value) params.set('tier', $('filterTier').value);
  const r = await api('/api/keys?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const keys = r.keys || [];
  if (!keys.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('key')}</div><h3>Nenhuma key</h3></div>`;
    refreshIcons(wrap); return;
  }
  const isDev = getRole() === 'dev';
  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Key</th><th>Tier</th><th>Duração</th><th>Usos</th><th>Status</th><th>Criada</th><th></th></tr></thead>
      <tbody>
        ${keys.map(k => `
          <tr>
            <td><code>${escapeHtml(k.key_code)}</code></td>
            <td>${escapeHtml(PLANS_LABEL[k.tier] || k.tier)}</td>
            <td>${k.duracao_dias === 0 ? '∞' : k.duracao_dias + 'd'}</td>
            <td>${k.usos_atuais}/${k.max_usos}</td>
            <td>${k.ativo ? '<span class="tag tag-ok">Ativa</span>' : '<span class="tag tag-bad">Esgotada</span>'}</td>
            <td class="text-mut">${timeAgo(k.created_at)}</td>
            <td>${isDev ? `<button class="btn btn-danger btn-xs" data-del-key="${escapeHtml(k.id)}">${icon('trash-2')}</button>` : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-del-key]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Excluir esta key?')) return;
      const r = await api(`/api/keys/${b.dataset.delKey}`, { method:'DELETE' });
      if (r.ok) { toast('Key excluída.'); loadKeysTable(); }
      else toast(r.error || 'Erro', 'error');
    });
  });
}

async function loadRedemptions() {
  const wrap = $('redemptionsTable');
  if (!wrap) return;
  const r = await api('/api/redemptions?limit=30');
  if (!r.ok) { wrap.innerHTML = ''; return; }
  const list = r.redemptions || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('gift')}</div><h3>Nenhum resgate</h3></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Key</th><th>Servidor</th><th>Por</th><th>Tier</th><th>Quando</th></tr></thead>
      <tbody>${list.map(x => `
        <tr>
          <td><code>${escapeHtml(x.key_code)}</code></td>
          <td>${escapeHtml(x.guild_name || x.guild_id || '—')}</td>
          <td>${escapeHtml(x.resgatado_por_tag || x.resgatado_por || '—')}</td>
          <td>${escapeHtml(PLANS_LABEL[x.tier] || x.tier)}</td>
          <td class="text-mut">${timeAgo(x.created_at)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);
}

async function openSendKeyModal() {
  clearMsg('sendKeyMsg');
  const [kR, uR] = await Promise.all([
    api('/api/keys?status=active&limit=200'),
    api('/api/dev/usuarios/clientes'),
  ]);
  const keys = kR.keys || [];
  const users = uR.clientes || [];
  if (!keys.length) return toast('Nenhuma key ativa.', 'error');
  if (!users.length) return toast('Nenhum cliente cadastrado.', 'error');
  $('sendKeyId').innerHTML = keys.map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.key_code)} — ${escapeHtml(PLANS_LABEL[k.tier] || k.tier)}</option>`).join('');
  $('sendKeyUser').innerHTML = users.map(u => `<option value="${escapeHtml(u.user_id)}">${escapeHtml(u.email)}${u.nome ? ` (${escapeHtml(u.nome)})` : ''}</option>`).join('');
  openModal('modalSendKey');
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: PACKS (dev)
// ═══════════════════════════════════════════════════════════
async function loadPacks() {
  await loadPacksTable();

  $('btnGerarPack')?.addEventListener('click', async () => {
    clearMsg('packResult');
    const r = await api('/api/keys/generate-pack', {
      method:'POST',
      body:{
        quantidade:Number($('packQtd').value) || 1,
        motivo:($('packMotivo').value || '').trim() || null,
      },
    });
    if (!r.ok) return setMsg('packResult', r.error || 'Erro', 'error');
    setMsg('packResult', `${r.packs.length} pack(s) gerado(s).`, 'ok');
    toast('Packs gerados');
    loadPacksTable();
  }, { once:true });

  $('btnRefreshPacks')?.addEventListener('click', loadPacksTable, { once:true });
}

async function loadPacksTable() {
  const wrap = $('packsTable');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api('/api/keys/packs');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const packs = r.packs || [];
  if (!packs.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('package')}</div><h3>Nenhum pack</h3></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Pack</th><th>Status</th><th>Motivo</th><th>Criado</th><th></th></tr></thead>
      <tbody>${packs.map(p => `
        <tr>
          <td><code>${escapeHtml(p.key_code)}</code></td>
          <td>${p.ativo ? '<span class="tag tag-ok">Disponível</span>' : '<span class="tag tag-bad">Usado</span>'}</td>
          <td>${escapeHtml(p.motivo || '—')}</td>
          <td class="text-mut">${timeAgo(p.created_at)}</td>
          <td>${p.ativo ? `<button class="btn btn-primary btn-xs" data-redeem="${escapeHtml(p.id)}">${icon('gift')} Resgatar</button>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-redeem]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Resgatar este pack? Gera 60 keys.')) return;
      b.disabled = true;
      const r = await api('/api/keys/redeem-pack', { method:'POST', body:{ key_id:Number(b.dataset.redeem) } });
      if (r.ok) { toast(`${r.total} keys geradas.`); loadPacksTable(); }
      else { toast(r.error || 'Erro', 'error'); b.disabled = false; }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: TICKETS GLOBAL
// ═══════════════════════════════════════════════════════════
async function loadTicketsGlobal() {
  const wrap = $('ticketsGlobalTable');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api('/api/admin/tickets-global');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const list = r.tickets || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('ticket')}</div><h3>Nenhum ticket aberto</h3></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Thread</th><th>Servidor</th><th>Usuário</th><th>Tipo</th><th>Aberto</th></tr></thead>
      <tbody>${list.map(t => `
        <tr>
          <td><code>${escapeHtml(String(t.thread_id || '—').slice(0, 14))}</code></td>
          <td><code>${escapeHtml(t.guild_id)}</code></td>
          <td><code>${escapeHtml(t.user_id)}</code></td>
          <td>${escapeHtml(t.type_id || '—')}</td>
          <td class="text-mut">${timeAgo(t.opened_at)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);

  $('btnRefreshTicketsGlobal')?.addEventListener('click', loadTicketsGlobal, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: FINANCEIRO
// ═══════════════════════════════════════════════════════════
async function loadFinancial() {
  const wrap = $('financialStats');
  if (!wrap) return;
  wrap.innerHTML = `<div class="stat-card"><div class="stat-icon green">${icon('loader-2','spin')}</div><div class="stat-body"><div class="stat-value">–</div><div class="stat-label">Carregando…</div></div></div>`;
  refreshIcons(wrap);

  const r = await api('/api/admin/financial');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }

  wrap.innerHTML = `
    <div class="stat-card"><div class="stat-icon green">${icon('wallet')}</div><div class="stat-body"><div class="stat-value">${fmtBRL(r.total)}</div><div class="stat-label">Total 30d</div></div></div>
    <div class="stat-card"><div class="stat-icon blue">${icon('receipt')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(r.count)}</div><div class="stat-label">Pedidos entregues</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">${icon('bar-chart-3')}</div><div class="stat-body"><div class="stat-value">${fmtBRL(r.avg)}</div><div class="stat-label">Ticket médio</div></div></div>`;
  refreshIcons(wrap);

  if (APP.charts.chartFinancial) { APP.charts.chartFinancial.destroy(); delete APP.charts.chartFinancial; }
  const canvas = $('chartFinancial');
  if (canvas && r.daily?.length) {
    APP.charts.chartFinancial = new Chart(canvas, {
      type:'line',
      data:{ labels:r.daily.map(d => d.date), datasets:[{ label:'R$', data:r.daily.map(d => d.value), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.15)', fill:true, tension:.35, pointRadius:3 }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ color:'#9ca3af' } }, x:{ ticks:{ color:'#9ca3af' } } } },
    });
  }

  $('btnRefreshFinancial')?.addEventListener('click', loadFinancial, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — SERVIDORES
// ═══════════════════════════════════════════════════════════
async function loadDevServers() {
  const wrap = $('devServersList');
  const stats = $('devServersStats');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';

  const params = new URLSearchParams();
  if ($('devServersSearch')?.value) params.set('search', $('devServersSearch').value);
  if ($('devServersMinMembers')?.value) params.set('min_members', $('devServersMinMembers').value);
  if ($('devServersPremium')?.value) params.set('has_premium', $('devServersPremium').value);

  const r = await api('/api/dev/servers?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }

  const servers = r.servers || [];
  const prem = servers.filter(s => s.is_premium).length;
  const members = servers.reduce((a, s) => a + (s.member_count || 0), 0);

  if (stats) {
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon blue">${icon('server')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(r.total || servers.length)}</div><div class="stat-label">Servidores</div></div></div>
      <div class="stat-card"><div class="stat-icon gold">${icon('gem')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(prem)}</div><div class="stat-label">Premium</div></div></div>
      <div class="stat-card"><div class="stat-icon green">${icon('users')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(members)}</div><div class="stat-label">Membros totais</div></div></div>`;
    refreshIcons(stats);
  }

  if (!servers.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('radar')}</div><h3>Nenhum servidor</h3></div>`;
    refreshIcons(wrap); return;
  }

  wrap.innerHTML = servers.map(s => `
    <div class="server-card" data-dev-guild="${escapeHtml(s.guild_id)}">
      <div class="server-icon">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : icon('server')}</div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name || '?')}</div>
        <div class="server-id">${escapeHtml(s.guild_id)}</div>
        <div class="server-meta">
          <span>${icon('users')} ${fmtNumber(s.member_count || 0)}</span>
          ${s.is_premium ? `<span class="tag tag-gold">${icon('gem')} Premium</span>` : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" data-actions="${escapeHtml(s.guild_id)}" title="Ações">
        ${icon('zap')}
      </button>
    </div>`).join('');
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-dev-guild]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-actions]')) return;
      openServerDetail(el.dataset.devGuild);
    });
  });
  wrap.querySelectorAll('[data-actions]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openDevServerActions(b.dataset.actions);
    });
  });

  $('btnRefreshDevServers')?.addEventListener('click', loadDevServers, { once:true });
  $('devServersSearch')?.addEventListener('input', debounce(loadDevServers, 500), { once:true });
  $('devServersMinMembers')?.addEventListener('input', debounce(loadDevServers, 500), { once:true });
  $('devServersPremium')?.addEventListener('change', loadDevServers, { once:true });
  $('btnForceSyncAll')?.addEventListener('click', async () => {
    const r = await api('/api/dev/sync-servers', { method:'POST' });
    if (r.ok) toast(r.message || 'Sync agendado.');
    else toast(r.error || 'Erro', 'error');
  }, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — BUSCAR SERVIDOR
// ═══════════════════════════════════════════════════════════
async function loadDevServerSearch() {
  $('btnDevServerLookup')?.addEventListener('click', async () => {
    const gid = ($('devServerLookupId')?.value || '').trim();
    if (!/^\d{15,25}$/.test(gid)) return toast('ID inválido.', 'error');
    const wrap = $('devServerLookupResult');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-sm">Buscando…</div>';

    const r = await api(`/api/dev/servers/${gid}/full`);
    if (!r.ok) {
      wrap.innerHTML = `<div class="card">${icon('x-circle')} ${escapeHtml(r.error || 'Não encontrado.')}</div>`;
      refreshIcons(wrap); return;
    }
    const g = r.guild || {};
    const c = r.counts || {};
    wrap.innerHTML = `
      <div class="card">
        <h3 class="flex-start gap-sm">${icon('server')} ${escapeHtml(g.name || '?')}</h3>
        <p class="hint" style="margin-top:6px">${escapeHtml(g.guild_id || gid)}</p>
        <div class="stats-grid" style="margin-top:14px">
          <div class="stat-card"><div class="stat-icon blue">${icon('users')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(g.member_count || 0)}</div><div class="stat-label">Membros</div></div></div>
          <div class="stat-card"><div class="stat-icon green">${icon('ticket')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(c.tickets_open || 0)}</div><div class="stat-label">Tickets abertos</div></div></div>
          <div class="stat-card"><div class="stat-icon amber">${icon('gamepad-2')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(c.bets_total || 0)}</div><div class="stat-label">Apostas</div></div></div>
          <div class="stat-card"><div class="stat-icon purple">${icon('shopping-cart')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(c.products || 0)}</div><div class="stat-label">Produtos</div></div></div>
        </div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" id="btnLookupActions">${icon('zap')} Ações DEV</button>
        </div>
      </div>`;
    refreshIcons(wrap);
    $('btnLookupActions')?.addEventListener('click', () => openDevServerActions(gid), { once:true });
  }, { once:true });
}

// ═══════════════════════════════════════════════════════════
// MODAL — AÇÕES DO SERVIDOR (DEV)
// ═══════════════════════════════════════════════════════════
function openDevServerActions(gid) {
  APP.currentServerActions = gid;
  const el = $('devServerActionsId');
  if (el) el.textContent = gid;
  clearMsg('devServerActionsMsg');
  openModal('modalDevServerActions');
}

function bindDevServerActionsModal() {
  $('actRename')?.addEventListener('click', async () => {
    const name = prompt('Novo nome do servidor (máx 100):');
    if (!name) return;
    const r = await api(`/api/dev/servers/${APP.currentServerActions}/rename`, { method:'POST', body:{ name } });
    setMsg('devServerActionsMsg', r.ok ? 'Servidor renomeado.' : (r.error || 'Erro'), r.ok ? 'ok' : 'error');
  });

  $('actRefresh')?.addEventListener('click', async () => {
    const r = await api(`/api/dev/servers/${APP.currentServerActions}/refresh`, { method:'POST' });
    setMsg('devServerActionsMsg', r.ok ? 'Dados atualizados.' : (r.error || 'Erro'), r.ok ? 'ok' : 'error');
  });

  $('actForcePremium')?.addEventListener('click', async () => {
    const raw = prompt('Dias de premium (0 = permanente):', '30');
    if (raw === null) return; // Cancelar não pode virar "0 = permanente"
    const days = Number(raw);
    if (!Number.isFinite(days) || days < 0) return toast('Valor de dias inválido.', 'error');
    const r = await api('/api/dev/force-premium', {
      method:'POST',
      body:{ scope:'guild', target_id:APP.currentServerActions, days, reason:'Aplicado via painel DEV' },
    });
    setMsg('devServerActionsMsg', r.ok ? 'Force Premium aplicado.' : (r.error || 'Erro'), r.ok ? 'ok' : 'error');
  });

  $('actSyncMembers')?.addEventListener('click', async () => {
    if (!confirm('Levar membros verificados via OAuth para este servidor?')) return;
    const r = await api(`/api/me/servers/${APP.currentServerActions}/take-members`, { method:'POST', body:{ limit:50 } });
    setMsg('devServerActionsMsg', r.ok ? `${r.added} enviados, ${r.failed} falharam.` : (r.error || 'Erro'), r.ok ? 'ok' : 'error');
  });

  $('actLeave')?.addEventListener('click', async () => {
    if (!confirm('Fazer o bot sair deste servidor?')) return;
    const r = await api(`/api/dev/servers/${APP.currentServerActions}/leave`, { method:'POST' });
    if (r.ok) { toast('Bot saiu do servidor.'); closeModal('modalDevServerActions'); }
    else setMsg('devServerActionsMsg', r.error || 'Erro', 'error');
  });

  $('actNuke')?.addEventListener('click', async () => {
    const c = prompt('Digite CONFIRMAR (em maiúsculas) para apagar TODOS os canais e cargos:');
    if (c !== 'CONFIRMAR') return toast('Cancelado.', 'info');
    const r = await api(`/api/dev/servers/${APP.currentServerActions}/nuke`, { method:'POST', body:{ confirm:'CONFIRMAR' } });
    setMsg('devServerActionsMsg', r.ok ? `Nuke concluído: ${r.deletedChannels} canais, ${r.deletedRoles} cargos.` : (r.error || 'Erro'), r.ok ? 'ok' : 'error');
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — KILL SWITCH
// ═══════════════════════════════════════════════════════════
async function loadKillSwitch() {
  const wrap = $('ksStatus');
  if (!wrap) return;
  const r = await api('/api/dev/kill-switch');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }

  wrap.innerHTML = r.active
    ? `<div class="status-bad">${icon('siren')}<div><strong>Kill switch ATIVO</strong><br><span style="font-size:12.5px;opacity:.85">${escapeHtml(r.reason || 'sem motivo informado')}</span></div></div>`
    : `<div class="status-ok">${icon('check-circle-2')}<div><strong>Operacional</strong><br><span style="font-size:12.5px;opacity:.85">Bot respondendo normalmente.</span></div></div>`;
  refreshIcons(wrap);
}

function bindKillSwitch() {
  $('btnKillOn')?.addEventListener('click', async () => {
    const reason = ($('ksReason')?.value || '').trim();
    if (!reason) return toast('Informe o motivo.', 'error');
    if (!confirm('Ativar kill switch? Isso bloqueia todos os comandos do bot na rede.')) return;
    const r = await api('/api/dev/kill-switch', { method:'POST', body:{ active:true, reason } });
    if (r.ok) { toast('Kill switch ativado.', 'warn'); loadKillSwitch(); }
    else setMsg('ksMsg', r.error || 'Erro', 'error');
  });

  $('btnKillOff')?.addEventListener('click', async () => {
    if (!confirm('Desativar kill switch? O bot voltará a responder para todos.')) return;
    const r = await api('/api/dev/kill-switch', { method:'POST', body:{ active:false } });
    if (r.ok) { toast('Kill switch desativado.'); loadKillSwitch(); }
    else setMsg('ksMsg', r.error || 'Erro', 'error');
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — MANUTENÇÃO
// ═══════════════════════════════════════════════════════════
async function loadMaintenance() {
  const wrap = $('mtStatus');
  if (!wrap) return;
  const r = await api('/api/dev/maintenance');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }

  wrap.innerHTML = r.active
    ? `<div class="status-bad">${icon('wrench')}<div><strong>Manutenção ATIVA</strong><br><span style="font-size:12.5px;opacity:.85">${escapeHtml(r.reason || 'sem motivo informado')}</span></div></div>`
    : `<div class="status-ok">${icon('check-circle-2')}<div><strong>Operacional</strong><br><span style="font-size:12.5px;opacity:.85">Sem manutenção em andamento.</span></div></div>`;
  refreshIcons(wrap);
}

function bindMaintenance() {
  $('btnMtOn')?.addEventListener('click', async () => {
    const reason = ($('mtReason')?.value || '').trim();
    if (!confirm('Ativar manutenção global? Todos os usuários (exceto devs) serão bloqueados.')) return;
    const r = await api('/api/dev/maintenance', { method:'POST', body:{ active:true, reason } });
    if (r.ok) { toast('Manutenção ativada.', 'warn'); loadMaintenance(); }
    else setMsg('mtMsg', r.error || 'Erro', 'error');
  });

  $('btnMtOff')?.addEventListener('click', async () => {
    if (!confirm('Desativar manutenção?')) return;
    const r = await api('/api/dev/maintenance', { method:'POST', body:{ active:false } });
    if (r.ok) { toast('Manutenção desativada.'); loadMaintenance(); }
    else setMsg('mtMsg', r.error || 'Erro', 'error');
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — FORCE PREMIUM
// ═══════════════════════════════════════════════════════════
async function loadForcePremium() {
  const wrap = $('fpList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api('/api/dev/force-premium');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const list = r.items || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('gem')}</div><h3>Nenhum force premium</h3></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Escopo</th><th>ID alvo</th><th>Expira</th><th>Motivo</th><th></th></tr></thead>
      <tbody>${list.map(f => `
        <tr>
          <td><span class="tag tag-info">${escapeHtml(f.scope)}</span></td>
          <td><code>${escapeHtml(f.target_id)}</code></td>
          <td>${f.permanent ? 'Permanente' : timeAgo(f.expires_at)}</td>
          <td>${escapeHtml(f.reason || '—')}</td>
          <td><button class="btn btn-danger btn-xs" data-del-fp="${escapeHtml(f.id)}">${icon('trash-2')}</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-del-fp]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Remover este force premium?')) return;
      const r = await api(`/api/dev/force-premium/${b.dataset.delFp}`, { method:'DELETE' });
      if (r.ok) { toast('Removido.'); loadForcePremium(); }
      else toast(r.error || 'Erro', 'error');
    });
  });
}

function bindForcePremium() {
  $('btnFpAdd')?.addEventListener('click', async () => {
    const body = {
      scope: $('fpScope').value,
      target_id: ($('fpTarget').value || '').trim(),
      days: Number($('fpDays').value) || 0,
      reason: ($('fpReason').value || '').trim() || null,
    };
    if (!body.target_id) return toast('Informe o ID alvo.', 'error');
    const r = await api('/api/dev/force-premium', { method:'POST', body });
    if (r.ok) { toast('Force premium adicionado.'); loadForcePremium(); }
    else setMsg('fpMsg', r.error || 'Erro', 'error');
  });

  $('btnRefreshFp')?.addEventListener('click', loadForcePremium);
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — BROADCAST
// ═══════════════════════════════════════════════════════════
async function loadBroadcast() {
  $('btnBcSend')?.addEventListener('click', async () => {
    clearMsg('bcMsg');
    const title = ($('bcTitle').value || '').trim();
    const content = ($('bcContent').value || '').trim();
    const role = $('bcRole').value;
    if (!title || !content) return setMsg('bcMsg', 'Preencha título e conteúdo.', 'error');
    if (!confirm(`Enviar broadcast para ${role || 'todos os usuários'}?`)) return;

    const r = await api('/api/dev/broadcast', { method:'POST', body:{ title, content, role: role || undefined } });
    if (r.ok) {
      setMsg('bcMsg', `Enviado para ${r.sent} usuário(s).`, 'ok');
      toast('Broadcast enviado.');
      $('bcTitle').value = ''; $('bcContent').value = '';
    } else setMsg('bcMsg', r.error || 'Erro', 'error');
  }, { once:true });

  $('btnForceUpdate')?.addEventListener('click', async () => {
    clearMsg('fuMsg');
    if (!confirm('Resetar o marcador de broadcast de update?')) return;
    const r = await api('/api/dev/force-update', { method:'POST' });
    if (r.ok) setMsg('fuMsg', 'Marcador resetado.', 'ok');
    else setMsg('fuMsg', r.error || 'Erro', 'error');
  }, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — BACKUP
// ═══════════════════════════════════════════════════════════
async function loadBackup() {
  $('btnDownloadBackup')?.addEventListener('click', () => {
    window.open('/api/dev/backup', '_blank');
    toast('Baixando backup…');
  }, { once:true });

  $('btnForceSync')?.addEventListener('click', async () => {
    clearMsg('syncMsg');
    const r = await api('/api/dev/sync-servers', { method:'POST' });
    if (r.ok) setMsg('syncMsg', r.message || 'Sync agendado.', 'ok');
    else setMsg('syncMsg', r.error || 'Erro', 'error');
  }, { once:true });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — USUÁRIOS (com botão Editar)
// ═══════════════════════════════════════════════════════════
async function loadUsuarios() {
  const wrap = $('usersTable');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';

  const params = new URLSearchParams();
  if ($('userSearch')?.value) params.set('search', $('userSearch').value);
  if ($('userFilterRole')?.value) params.set('role', $('userFilterRole').value);
  if ($('userFilterPlan')?.value) params.set('plan', $('userFilterPlan').value);
  if ($('userFilterAtivo')?.value) params.set('ativo', $('userFilterAtivo').value);

  const r = await api('/api/dev/usuarios?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const list = r.usuarios || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('users')}</div><h3>Nenhum usuário</h3></div>`;
    refreshIcons(wrap); return;
  }

  const roleTag = (role) => {
    const map = { dev:'tag-gold', admin:'tag-bad', funcionario:'tag-info', cliente:'tag-ok', pending:'tag-warn' };
    return `<span class="tag ${map[role] || 'tag-neutral'}">${escapeHtml(ROLES_LABEL[role] || role)}</span>`;
  };

  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>E-mail</th><th>Discord</th><th>Função</th><th>Plano</th><th>Status</th><th>Criado</th><th></th></tr></thead>
      <tbody>${list.map(u => `
        <tr>
          <td>${escapeHtml(u.email)}</td>
          <td><code>${escapeHtml(u.discord_id || '—')}</code></td>
          <td>${roleTag(u.role)}</td>
          <td>${escapeHtml(PLANS_LABEL[u.plan] || '—')}</td>
          <td>${u.ativo ? '<span class="tag tag-ok">Ativo</span>' : '<span class="tag tag-bad">Inativo</span>'}</td>
          <td class="text-mut">${timeAgo(u.created_at)}</td>
          <td>
            <button class="btn btn-ghost btn-xs" data-user-edit="${escapeHtml(u.user_id)}" title="Editar">
              ${icon('pencil')}
            </button>
            <button class="btn btn-ghost btn-xs" data-user-sessions="${escapeHtml(u.user_id)}" data-user-email="${escapeHtml(u.email)}" title="Sessões">
              ${icon('monitor')}
            </button>
            <button class="btn btn-danger btn-xs" data-user-disable="${escapeHtml(u.user_id)}" title="Desativar">
              ${icon('ban')}
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-user-edit]').forEach(b => {
    b.addEventListener('click', () => {
      const uid = b.dataset.userEdit;
      const user = list.find(x => x.user_id === uid);
      if (user) openNewUserModal(user);
    });
  });
  wrap.querySelectorAll('[data-user-sessions]').forEach(b => {
    b.addEventListener('click', () => openUserSessions(b.dataset.userSessions, b.dataset.userEmail));
  });
  wrap.querySelectorAll('[data-user-disable]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Desativar esta conta?')) return;
      const r = await api(`/api/dev/usuarios/${b.dataset.userDisable}`, { method:'DELETE' });
      if (r.ok) { toast('Conta desativada.'); loadUsuarios(); }
      else toast(r.error || 'Erro', 'error');
    });
  });

  $('btnRefreshUsers')?.addEventListener('click', loadUsuarios, { once:true });
  $('userSearch')?.addEventListener('input', debounce(loadUsuarios, 500), { once:true });
  ['userFilterRole','userFilterPlan','userFilterAtivo'].forEach(id => {
    $(id)?.addEventListener('change', loadUsuarios, { once:true });
  });
  $('btnNovoUsuario')?.addEventListener('click', () => openNewUserModal(null), { once:true });
}

function openNewUserModal(editUser = null) {
  clearMsg('modalUserMsg');
  $('modalUserId').value = editUser?.user_id || '';
  $('modalUserEmail').value = editUser?.email || '';
  $('modalUserDiscord').value = editUser?.discord_id || '';
  $('modalUserNome').value = editUser?.nome || '';
  $('modalUserRole').value = editUser?.role || 'cliente';
  $('modalUserPlan').value = editUser?.plan || 'basic';
  $('modalUserPassword').value = '';
  $('modalUserGuilds').value = (editUser?.assigned_guilds || []).join(', ');
  $('modalUserNotes').value = editUser?.notes || '';
  $('modalUserTitle').textContent = editUser ? 'Editar usuário' : 'Novo usuário';
  $('modalUserSub').textContent = editUser
    ? 'Altere os dados do usuário.'
    : 'Crie uma conta diretamente pelo painel.';
  $('fieldPassword').style.display = editUser ? 'none' : '';
  openModal('modalUser');
}

function bindUserModal() {
  $('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('modalUserMsg');

    const id = $('modalUserId').value;
    const body = {
      email: ($('modalUserEmail').value || '').trim(),
      discord_id: ($('modalUserDiscord').value || '').trim(),
      nome: ($('modalUserNome').value || '').trim() || undefined,
      role: $('modalUserRole').value,
      plan: $('modalUserPlan').value,
      assigned_guilds: ($('modalUserGuilds').value || '').split(',').map(s => s.trim()).filter(Boolean),
      notes: ($('modalUserNotes').value || '').trim() || null,
    };

    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) {
      return setMsg('modalUserMsg', 'E-mail inválido.', 'error');
    }
    if (!body.discord_id) {
      return setMsg('modalUserMsg', 'ID do Discord é obrigatório.', 'error');
    }
    if (!/^\d{15,25}$/.test(body.discord_id)) {
      return setMsg('modalUserMsg', 'ID do Discord inválido.', 'error');
    }

    if (!id) {
      const pwd = ($('modalUserPassword').value || '').trim();
      if (pwd) body.password = pwd;
    }

    const r = id
      ? await api(`/api/dev/usuarios/${id}`, { method: 'PATCH', body })
      : await api('/api/dev/usuarios', { method: 'POST', body });

    if (!r.ok) {
      let msg = r.error || 'Erro.';
      if (r.code === 'EMAIL_TAKEN') msg = 'E-mail já cadastrado em outra conta.';
      if (r.code === 'DISCORD_ID_TAKEN') msg = 'Discord ID já cadastrado em outra conta.';
      return setMsg('modalUserMsg', msg, 'error');
    }

    if (r.temp_password) {
      setMsg('modalUserMsg', `Usuário criado. Senha temporária: ${r.temp_password}`, 'ok');
    } else {
      setMsg('modalUserMsg', 'Salvo com sucesso.', 'ok');
    }
    toast('Salvo.');
    loadUsuarios();
    if (!r.temp_password) setTimeout(() => closeModal('modalUser'), 1200);
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — APROVAÇÕES
// ═══════════════════════════════════════════════════════════
async function loadPending() {
  const wrap = $('pendingList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api('/api/dev/usuarios/pending');
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const list = r.pendentes || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('user-check')}</div><h3>Nenhum pendente</h3><p>Todas as contas foram revisadas.</p></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = list.map(u => `
    <div class="list-item">
      <div class="list-icon amber">${icon('clock')}</div>
      <div class="list-info">
        <div class="list-title">${escapeHtml(u.email)}</div>
        <div class="list-sub">
          <span>${icon('message-circle')} <code>${escapeHtml(u.discord_id || '—')}</code></span>
          <span>${icon('clock')} ${timeAgo(u.created_at)}</span>
        </div>
      </div>
      <button class="btn btn-success btn-sm" data-approve-user="${escapeHtml(u.user_id)}" data-approve-email="${escapeHtml(u.email)}">
        ${icon('user-check')} Aprovar
      </button>
    </div>`).join('');
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-approve-user]').forEach(b => {
    b.addEventListener('click', () => {
      $('approveUserId').value = b.dataset.approveUser;
      $('approveEmail').textContent = b.dataset.approveEmail;
      $('approveRole').value = 'cliente';
      $('approvePlan').value = 'basic';
      $('approveGuilds').value = '';
      $('approveNotes').value = '';
      clearMsg('approveMsg');
      openModal('modalApprove');
    });
  });

  $('btnRefreshPending')?.addEventListener('click', loadPending, { once:true });
}

function bindApproveModal() {
  $('approveForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('approveMsg');
    const uid = $('approveUserId').value;
    const body = {
      role: $('approveRole').value,
      plan: $('approvePlan').value,
      assigned_guilds: ($('approveGuilds').value || '').split(',').map(s => s.trim()).filter(Boolean),
      notes: ($('approveNotes').value || '').trim() || null,
    };
    const r = await api(`/api/dev/usuarios/${uid}/approve`, { method:'POST', body });
    if (!r.ok) return setMsg('approveMsg', r.error || 'Erro', 'error');
    toast('Usuário aprovado.');
    closeModal('modalApprove');
    loadPending();
  });
}

// ═══════════════════════════════════════════════════════════
// MODAL — SESSÕES DO USUÁRIO
// ═══════════════════════════════════════════════════════════
function openUserSessions(userId, email) {
  APP.currentUserSessions = userId;
  $('userSessionsTarget').textContent = email;
  openModal('modalUserSessions');
  loadUserSessions();
}

async function loadUserSessions() {
  const wrap = $('userSessionsList');
  if (!wrap || !APP.currentUserSessions) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';
  const r = await api(`/api/dev/user/${APP.currentUserSessions}/sessions`);
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const list = r.sessions || [];
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('monitor')}</div><h3>Nenhuma sessão</h3></div>`;
    refreshIcons(wrap); return;
  }
  wrap.innerHTML = list.map(s => {
    const isMobile = s.device_type === 'mobile';
    return `
      <div class="list-item no-hover">
        <div class="list-icon">${icon(isMobile ? 'smartphone' : 'monitor')}</div>
        <div class="list-info">
          <div class="list-title">
            <span class="tag tag-info">${escapeHtml(s.device_type || '?')}</span>
            <span class="tag tag-ok">${escapeHtml(s.browser || '?')}</span>
            <span class="tag tag-neutral">${escapeHtml(s.os || '?')}</span>
          </div>
          <div class="list-sub">
            <span><code>${escapeHtml(s.ip || '—')}</code></span>
            ${s.country ? `<span>${icon('map-pin')} ${escapeHtml(s.country)}</span>` : ''}
            <span>${icon('clock')} ${timeAgo(s.last_seen || s.created_at)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  refreshIcons(wrap);
}

function bindUserSessionsModal() {
  $('btnRefreshUserSessions')?.addEventListener('click', loadUserSessions);
  $('btnRevokeAllUserSessions')?.addEventListener('click', async () => {
    if (!APP.currentUserSessions) return;
    if (!confirm('Revogar TODAS as sessões deste usuário?')) return;
    const r = await api(`/api/dev/user/${APP.currentUserSessions}/sessions`, { method:'DELETE' });
    if (r.ok) { toast('Sessões revogadas.'); loadUserSessions(); }
    else toast(r.error || 'Erro', 'error');
  });
}

// ═══════════════════════════════════════════════════════════
// ➤ PÁGINA: DEV — AUDITORIA
// ═══════════════════════════════════════════════════════════
async function loadAudit() {
  await loadAuditStats();
  APP.auditPage = 0;
  await loadAuditTable();

  $('btnAuditFilter')?.addEventListener('click', () => { APP.auditPage = 0; loadAuditTable(); }, { once:true });
  $('btnAuditRefresh')?.addEventListener('click', loadAudit, { once:true });
  $('btnAuditClear')?.addEventListener('click', () => {
    ['auditFilterAction','auditFilterIp','auditFilterFrom','auditFilterTo'].forEach(id => { const e = $(id); if (e) e.value = ''; });
    if ($('auditFilterSuccess')) $('auditFilterSuccess').value = '';
    loadAudit();
  }, { once:true });
  $('btnAuditExport')?.addEventListener('click', () => {
    const p = new URLSearchParams();
    if ($('auditFilterAction')?.value) p.set('action', $('auditFilterAction').value);
    if ($('auditFilterFrom')?.value) p.set('from', new Date($('auditFilterFrom').value).toISOString());
    if ($('auditFilterTo')?.value) p.set('to', new Date($('auditFilterTo').value).toISOString());
    window.open('/api/dev/audit/export?' + p, '_blank');
  }, { once:true });
  $('btnAuditPrev')?.addEventListener('click', () => { if (APP.auditPage > 0) { APP.auditPage--; loadAuditTable(); } }, { once:true });
  $('btnAuditNext')?.addEventListener('click', () => { APP.auditPage++; loadAuditTable(); }, { once:true });
}

async function loadAuditStats() {
  const wrap = $('auditStats');
  if (!wrap) return;
  const r = await api('/api/dev/audit/stats');
  if (!r.ok) { wrap.innerHTML = ''; return; }
  const s = r.stats || {};
  wrap.innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">${icon('scroll-text')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(s.total)}</div><div class="stat-label">Total eventos</div></div></div>
    <div class="stat-card"><div class="stat-icon red">${icon('x-circle')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(s.failed)}</div><div class="stat-label">Falhas</div></div></div>
    <div class="stat-card"><div class="stat-icon green">${icon('log-in')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(s.logins_7d)}</div><div class="stat-label">Logins 7d</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">${icon('alert-triangle')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(s.logins_failed_7d)}</div><div class="stat-label">Falhas login 7d</div></div></div>
    <div class="stat-card"><div class="stat-icon red">${icon('ban')}</div><div class="stat-body"><div class="stat-value">${fmtNumber(s.access_denied_7d)}</div><div class="stat-label">Acessos negados 7d</div></div></div>`;
  refreshIcons(wrap);
}

async function loadAuditTable() {
  const wrap = $('auditTable');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-sm">Carregando…</div>';

  const params = new URLSearchParams();
  if ($('auditFilterAction')?.value) params.set('action', $('auditFilterAction').value);
  if ($('auditFilterIp')?.value) params.set('ip', $('auditFilterIp').value);
  if ($('auditFilterFrom')?.value) params.set('from', new Date($('auditFilterFrom').value).toISOString());
  if ($('auditFilterTo')?.value) params.set('to', new Date($('auditFilterTo').value).toISOString());
  if ($('auditFilterSuccess')?.value) params.set('success', $('auditFilterSuccess').value);
  const limit = Number($('auditFilterLimit')?.value) || 100;
  APP.auditLimit = limit;
  params.set('limit', limit);
  params.set('offset', APP.auditPage * limit);

  const r = await api('/api/dev/audit?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="empty-sm">${escapeHtml(r.error || 'Erro')}</div>`; return; }
  const logs = r.logs || [];
  if (!logs.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${icon('scroll-text')}</div><h3>Nenhum evento</h3><p>Nada corresponde aos filtros.</p></div>`;
    refreshIcons(wrap);
    const info = $('auditPaginationInfo'); if (info) info.textContent = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(r.total / limit));
  const info = $('auditPaginationInfo');
  if (info) info.textContent = `Página ${APP.auditPage + 1} de ${totalPages} · ${fmtNumber(r.total)} eventos`;
  if ($('btnAuditPrev')) $('btnAuditPrev').disabled = APP.auditPage === 0;
  if ($('btnAuditNext')) $('btnAuditNext').disabled = APP.auditPage >= totalPages - 1;

  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Quando</th><th>Ação</th><th>Ator</th><th>IP</th><th>Dispositivo</th><th>Status</th></tr></thead>
      <tbody>${logs.map(l => `
        <tr class="clickable ${l.success === false ? 'row-fail' : ''}" data-audit-id="${escapeHtml(l.id)}">
          <td class="text-mut">${timeAgo(l.created_at)}</td>
          <td><span class="tag tag-info">${escapeHtml(l.action)}</span></td>
          <td class="text-mut">${escapeHtml(l.actor_email || l.actor_id || '—')}</td>
          <td><code>${escapeHtml(l.ip || '—')}</code></td>
          <td>
            <span class="tag tag-info">${escapeHtml(l.device_type || '?')}</span>
            <span class="tag tag-ok">${escapeHtml(l.browser || '?')}</span>
          </td>
          <td>${l.success !== false ? '<span class="tag tag-ok">OK</span>' : `<span class="tag tag-bad">${escapeHtml(l.error_reason || 'FALHA')}</span>`}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  refreshIcons(wrap);

  wrap.querySelectorAll('[data-audit-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      const log = logs.find(x => String(x.id) === tr.dataset.auditId);
      if (log) showAuditDetail(log);
    });
  });
}

function showAuditDetail(log) {
  const body = $('auditDetailBody');
  if (!body) return;
  const row = (l, v) => `<div class="detail-row"><div class="detail-l">${escapeHtml(l)}</div><div class="detail-v">${v}</div></div>`;
  body.innerHTML = `
    <div class="detail-sec">Identificação</div>
    ${row('ID', `<code>${escapeHtml(log.id)}</code>`)}
    ${row('Ação', `<code>${escapeHtml(log.action)}</code>`)}
    ${row('Data', fmtDate(log.created_at))}
    ${row('Sucesso', log.success !== false ? 'Sim' : 'Não')}
    ${log.error_reason ? row('Erro', escapeHtml(log.error_reason)) : ''}

    <div class="detail-sec">Usuário</div>
    ${row('Actor ID', `<code>${escapeHtml(log.actor_id || '—')}</code>`)}
    ${row('Actor E-mail', escapeHtml(log.actor_email || '—'))}
    ${log.target_id ? row('Target ID', `<code>${escapeHtml(log.target_id)}</code>`) : ''}

    <div class="detail-sec">Rede</div>
    ${row('IP', `<code>${escapeHtml(log.ip || '—')}</code>`)}
    ${log.country ? row('País', escapeHtml(log.country)) : ''}
    ${row('Dispositivo', escapeHtml(log.device_type || '—'))}
    ${row('Navegador', escapeHtml(log.browser || '—'))}
    ${row('Sistema', escapeHtml(log.os || '—'))}
    ${row('User Agent', escapeHtml(log.user_agent || '—'))}
    ${log.duration_ms ? row('Duração', log.duration_ms + ' ms') : ''}

    ${log.metadata && Object.keys(log.metadata).length ? `
      <div class="detail-sec">Metadata</div>
      <pre>${escapeHtml(JSON.stringify(log.metadata, null, 2))}</pre>
    ` : ''}`;
  openModal('modalAuditDetail');
}

// ═══════════════════════════════════════════════════════════
// MODAL — ESQUECI SENHA
// ═══════════════════════════════════════════════════════════
function bindForgotModal() {
  $('btnSendForgot')?.addEventListener('click', async () => {
    clearMsg('forgotMsg');
    const email = ($('forgotEmail').value || '').trim();
    if (!email) return setMsg('forgotMsg', 'Informe o e-mail.', 'error');
    const r = await api('/api/auth/forgot', { method:'POST', body:{ email } });
    if (r.ok) {
      setMsg('forgotMsg', 'Se o e-mail estiver cadastrado, enviaremos as instruções.', 'ok');
      setTimeout(() => closeModal('modalForgot'), 3000);
    } else setMsg('forgotMsg', r.error || 'Erro', 'error');
  });
}

// ═══════════════════════════════════════════════════════════
// ⚡ MODAL — EDITAR MEU PERFIL (cliente)
// ═══════════════════════════════════════════════════════════
function bindProfileModal() {
  $('btnEditProfile')?.addEventListener('click', () => {
    const emailInput = $('profileEmail');
    const discordInput = $('profileDiscord');
    if (emailInput) emailInput.value = APP.user?.email || '';
    if (discordInput) discordInput.value = APP.admin?.discord_id || '';
    clearMsg('profileMsg');
    openModal('modalProfile');
  });

  $('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('profileMsg');

    const email = ($('profileEmail').value || '').trim();
    const discord_id = ($('profileDiscord').value || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return setMsg('profileMsg', 'E-mail inválido.', 'error');
    }
    if (!/^\d{15,25}$/.test(discord_id)) {
      return setMsg('profileMsg', 'ID do Discord inválido (15–25 dígitos).', 'error');
    }

    const btn = $('btnSaveProfile');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icon('loader-2','spin')}<span>Salvando…</span>`;
    refreshIcons(btn);

    const r = await api('/api/me/profile', {
      method: 'PATCH',
      body: { email, discord_id },
    });

    btn.disabled = false;
    btn.innerHTML = orig;
    refreshIcons(btn);

    if (!r.ok) {
      let msg = r.error || 'Erro ao salvar.';
      if (r.code === 'EMAIL_TAKEN') msg = 'Este e-mail já está em uso.';
      if (r.code === 'DISCORD_ID_TAKEN') msg = 'Este ID do Discord já está cadastrado.';
      return setMsg('profileMsg', msg, 'error');
    }

    if (r.admin) {
      APP.user = { ...APP.user, email: r.admin.email || APP.user.email };
      APP.admin = { ...APP.admin, discord_id: r.admin.discord_id ?? APP.admin.discord_id };
      renderUserInfo();
    }

    setMsg('profileMsg', 'Perfil atualizado com sucesso.', 'ok');
    toast('Perfil atualizado.');
    setTimeout(() => closeModal('modalProfile'), 1200);
  });
}

// ═══════════════════════════════════════════════════════════
// REGISTRO DE PÁGINAS
// ═══════════════════════════════════════════════════════════
registerPage('dashboard',           loadDashboard);
registerPage('servers',             loadServers);
registerPage('my-keys',             loadMyKeys);
registerPage('notifications',       loadNotifPage);
registerPage('account',             loadAccount);
registerPage('keys',                loadKeys);
registerPage('packs',               loadPacks);
registerPage('tickets-global',      loadTicketsGlobal);
registerPage('financial',           loadFinancial);
registerPage('dev-servers',         loadDevServers);
registerPage('dev-server-search',   loadDevServerSearch);
registerPage('kill-switch',         loadKillSwitch);
registerPage('maintenance',         loadMaintenance);
registerPage('force-premium',       loadForcePremium);
registerPage('broadcast',           loadBroadcast);
registerPage('backup',              loadBackup);
registerPage('usuarios',            loadUsuarios);
registerPage('pending',             loadPending);
registerPage('audit',               loadAudit);

// ═══════════════════════════════════════════════════════════
// BIND DE MODAIS
// ═══════════════════════════════════════════════════════════
function bindAllModals() {
  bindUserModal();
  bindApproveModal();
  bindUserSessionsModal();
  bindDevServerActionsModal();
  bindForgotModal();
  bindKillSwitch();
  bindMaintenance();
  bindForcePremium();
  bindProfileModal();   // ← NOVO
}

// ═══════════════════════════════════════════════════════════
// BOOT FINAL
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Estado inicial seguro: menu lateral fechado e sem bloqueio de rolagem.
  $('sidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('active');
  document.body.classList.remove('no-scroll');
  refreshIcons();
  bindGlobal();
  bindNav();
  bindAllModals();
  bootApp();
});

window.addEventListener('pageshow', (e) => {
  // Safari/iOS pode restaurar classes visuais da página a partir do cache BFCache.
  closeSidebar();
  if (e.persisted && !APP.user) {
    window.location.reload();
  }
});

if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}


// Preferências do usuário: idioma, tema e foto de perfil.
(function initUserPreferences(){
  const $id = (id) => document.getElementById(id);
  const dictionaries = {
    en: {
      'Geral':'General','Dashboard':'Dashboard','Meus Servidores':'My Servers','Minhas Keys':'My Keys','Notificações':'Notifications','Conta & Sessões':'Account & Sessions',
      'Operacional':'Operations','Keys':'Keys','Packs':'Packs','Tickets Global':'Global Tickets','Financeiro':'Finance','Servidores (DEV)':'Servers (DEV)','Gerenciar Servidores':'Manage Servers','Buscar Servidor':'Find Server','DEV TOOLS':'DEV TOOLS',
      'Dados da conta':'Account details','Editar perfil':'Edit profile','Função':'Role','Plano':'Plan','ID do Discord':'Discord ID','Segurança':'Security','Alterar senha':'Change password','Encerrar todas as sessões':'Sign out all sessions',
      'Preferências':'Preferences','Personalize sua foto, idioma e aparência do painel.':'Customize your profile photo, language, and dashboard appearance.',
      'Foto do perfil':'Profile photo','Trocar foto':'Change photo','Remover':'Remove','PNG, JPG, WEBP ou GIF; até 2 MB.':'PNG, JPG, WEBP, or GIF; up to 2 MB.','Idioma':'Language','Tema':'Theme','Escuro':'Dark','Claro':'Light',
      'E-mail':'Email','Dashboard':'Dashboard','Minha conta':'My account','Sair':'Sign out'
    },
    es: {
      'Geral':'General','Dashboard':'Panel','Meus Servidores':'Mis servidores','Minhas Keys':'Mis claves','Notificações':'Notificaciones','Conta & Sessões':'Cuenta y sesiones',
      'Operacional':'Operaciones','Keys':'Claves','Packs':'Paquetes','Tickets Global':'Tickets globales','Financeiro':'Finanzas','Servidores (DEV)':'Servidores (DEV)','Gerenciar Servidores':'Administrar servidores','Buscar Servidor':'Buscar servidor','DEV TOOLS':'HERRAMIENTAS DEV',
      'Dados da conta':'Datos de la cuenta','Editar perfil':'Editar perfil','Função':'Rol','Plano':'Plan','ID do Discord':'ID de Discord','Segurança':'Seguridad','Alterar senha':'Cambiar contraseña','Encerrar todas as sessões':'Cerrar todas las sesiones',
      'Preferências':'Preferencias','Personalize sua foto, idioma e aparência do painel.':'Personaliza tu foto, idioma y apariencia del panel.',
      'Foto do perfil':'Foto de perfil','Trocar foto':'Cambiar foto','Remover':'Eliminar','PNG, JPG, WEBP ou GIF; até 2 MB.':'PNG, JPG, WEBP o GIF; hasta 2 MB.','Idioma':'Idioma','Tema':'Tema','Escuro':'Oscuro','Claro':'Claro',
      'E-mail':'Correo electrónico','Minha conta':'Mi cuenta','Sair':'Salir'
    }
  };
  function prefGet(key, fallback=''){ try { return localStorage.getItem('frio_pref_'+key) || fallback; } catch { return fallback; } }
  function prefSet(key, value){ try { localStorage.setItem('frio_pref_'+key, value); } catch {} }
  function applyLanguage(lang){
    const dict=dictionaries[lang]||{};
    document.documentElement.lang=lang==='en'?'en':lang==='es'?'es':'pt-BR';
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key=el.dataset.i18n;
      const source=({preferences:'Preferências',preferences_desc:'Personalize sua foto, idioma e aparência do painel.',profile_photo:'Foto do perfil',change_photo:'Trocar foto',remove_photo:'Remover',photo_hint:'PNG, JPG, WEBP ou GIF; até 2 MB.',language:'Idioma',appearance:'Tema',dark:'Escuro',light:'Claro'})[key];
      if(source) el.textContent=dict[source]||source;
    });
    if(lang!=='pt'){
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node=>{
        if(!node.nodeValue.trim() || node.parentElement?.closest('script,style,option,[data-no-translate]')) return;
        const raw=node.nodeValue, trimmed=raw.trim();
        if(dict[trimmed]) node.nodeValue=raw.replace(trimmed,dict[trimmed]);
      });
      document.querySelectorAll('#languageSelect option').forEach((o)=>{ if(o.value==='pt')o.textContent='Português'; if(o.value==='en')o.textContent='English'; if(o.value==='es')o.textContent='Español'; });
    }
  }
  function applyTheme(theme){
    document.documentElement.dataset.theme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f4f7fb':'#0a0f18');
  }
  function applyAvatar(data){
    ['chipAvatar','preferencesAvatar','sideAvatar'].forEach(id=>{
      const el=$id(id); if(!el)return;
      if(data){el.innerHTML=`<img src="${data}" alt="Foto do perfil" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;}
      else if(id==='chipAvatar'||id==='sideAvatar'){
        const initial=($id('chipInitials')?.textContent||'?').trim();
        el.innerHTML=`<span>${initial}</span>`;
      } else el.innerHTML='<span>?</span>';
    });
  }
  const langSelect=$id('languageSelect'), themeSelect=$id('themeSelect'), avatarInput=$id('avatarUpload');
  const lang=prefGet('language','pt'), theme=prefGet('theme','dark'), avatar=prefGet('avatar','');
  if(langSelect)langSelect.value=lang;
  if(themeSelect)themeSelect.value=theme;
  applyLanguage(lang); applyTheme(theme); applyAvatar(avatar);
  langSelect?.addEventListener('change',()=>{prefSet('language',langSelect.value);applyLanguage(langSelect.value);});
  themeSelect?.addEventListener('change',()=>{prefSet('theme',themeSelect.value);applyTheme(themeSelect.value);});
  avatarInput?.addEventListener('change',()=>{
    const file=avatarInput.files?.[0]; if(!file)return;
    const msg=$id('preferencesMsg');
    if(file.size>2*1024*1024){if(msg)msg.textContent='A imagem deve ter no máximo 2 MB.';avatarInput.value='';return;}
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){if(msg)msg.textContent='Formato de imagem não suportado.';return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas'), max=256, scale=Math.min(1,max/Math.max(img.width,img.height));
        canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL('image/jpeg',.82);
        try{prefSet('avatar',data);applyAvatar(data);if(msg)msg.textContent='Foto atualizada.';}
        catch{if(msg)msg.textContent='Não foi possível salvar a foto neste navegador.';}
      }; img.src=reader.result;
    }; reader.readAsDataURL(file);
  });
  $id('removeAvatar')?.addEventListener('click',()=>{try{localStorage.removeItem('frio_pref_avatar')}catch{}applyAvatar('');if($id('preferencesMsg'))$id('preferencesMsg').textContent='Foto removida.';});
  // Recupera a gaveta mobile caso uma interação anterior tenha deixado o painel bloqueado.
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){ $id('sidebar')?.classList.remove('open');$id('sidebarOverlay')?.classList.remove('active');if(!document.querySelector('.modal.active')&&!document.querySelector('.drawer.active'))document.body.classList.remove('no-scroll');}});
  $id('sidebarOverlay')?.addEventListener('click',()=>{ $id('sidebar')?.classList.remove('open');$id('sidebarOverlay')?.classList.remove('active');document.body.classList.remove('no-scroll');});
})();

// Loja FrioBots: conteúdo adicionado à modal de servidor; não substitui páginas existentes.
async function mountFrioStore(body,gid){
 const root=document.createElement('section');root.style.marginTop='22px';root.innerHTML=`<h3>FrioBots Store · Gestão web</h3><p class="hint">Produtos, estoque, cupons, categorias e pedidos sincronizados com o bot.</p><div id="frioStoreContent">Carregando...</div>`;body.appendChild(root);
 const esc=escapeHtml;
 const load=async()=>{
  const r=await api(`/api/me/servers/${gid}/store/overview`);
  const target=root.querySelector('#frioStoreContent');if(!r.ok){target.textContent=r.error||'Não foi possível carregar a loja';return;}
  target.innerHTML=`<div class="stats-grid"><div class="stat-card"><div class="stat-body"><div class="stat-value">${r.products.length}</div><div class="stat-label">Produtos</div></div></div><div class="stat-card"><div class="stat-body"><div class="stat-value">${r.metrics.orders}</div><div class="stat-label">Pedidos recentes</div></div></div><div class="stat-card"><div class="stat-body"><div class="stat-value">R$ ${r.metrics.revenue.toFixed(2)}</div><div class="stat-label">Receita de pedidos entregues (amostra)</div></div></div></div>
  <h4>Catálogo</h4><div style="max-height:260px;overflow:auto">${r.products.map(x=>`<p><strong>#${x.id} · ${esc(x.name)}</strong> · R$ ${Number(x.price).toFixed(2)} · disponíveis: ${x.stock.available||0} · ${x.active?'Ativo':'Inativo'}</p>`).join('')||'<p>Sem produtos.</p>'}</div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button class="btn btn-primary" data-store="product">Novo produto</button><button class="btn" data-store="category">Nova categoria</button><button class="btn" data-store="stock">Adicionar estoque</button><button class="btn" data-store="coupon">Criar cupom</button><button class="btn" data-store="refresh">Atualizar</button></div>
  <h4 style="margin-top:16px">Pedidos recentes</h4><div style="max-height:180px;overflow:auto">${r.orders.slice(0,20).map(x=>`<p>#${esc(String(x.id))} · ${esc(x.status)} · R$ ${Number(x.total||0).toFixed(2)}</p>`).join('')||'<p>Sem pedidos.</p>'}</div>`;
  target.querySelectorAll('[data-store]').forEach(btn=>btn.addEventListener('click',async()=>{
   const mode=btn.dataset.store;if(mode==='refresh')return load();let path='',body={};
   if(mode==='product') {const name=prompt('Nome do produto:');if(!name)return;const price=prompt('Preço em reais (ex.: 9.90):');if(price===null)return;const description=prompt('Descrição:')||'';body={name,price:Number(price.replace(',','.')),description};path='products';}
   if(mode==='category'){const name=prompt('Nome da categoria:');if(!name)return;body={name};path='categories';}
   if(mode==='stock'){const product_id=prompt('ID do produto (visível na central do bot):');if(!product_id)return;const items=prompt('Itens do estoque, um por linha:');if(!items)return;body={product_id,items};path='stock';}
   if(mode==='coupon'){const code=prompt('Código do cupom:');if(!code)return;const value=prompt('Desconto em porcentagem (1–100):');if(value===null)return;body={code,value:Number(value.replace(',','.')),type:'percent'};path='coupons';}
   const resp=await api(`/api/me/servers/${gid}/store/${path}`,{method:'POST',body});if(!resp.ok)return toast(resp.error||'Falha ao salvar','error');toast('Alteração salva','success');await load();
  }));
 };
 await load();
}

// Extensões web: identidade, campanhas, fidelidade e avaliações.
async function mountFrioStoreExtras(body,gid){
 const div=document.createElement('section');div.style.marginTop='22px';div.innerHTML='<h3>FrioBots · Identidade, marketing e fidelidade</h3><div data-frio-extras>Carregando...</div>';body.appendChild(div);
 const load=async()=>{
 const data=await api(`/api/me/servers/${gid}/store/extras`);const el=div.querySelector('[data-frio-extras]');
 if(!data.ok){el.textContent=data.error||'Falha ao carregar (aplique o SQL V5).';return;}
 const safe=escapeHtml, profile=data.profile||{};
 el.innerHTML=`<div class="card" style="padding:15px;margin-bottom:12px"><h4>Identidade da loja</h4><p><strong>${safe(profile.display_name||'Minha Loja')}</strong> · ${safe(profile.brand_color||'#69C9FF')}</p><p>${safe(profile.description||'Sem descrição')}</p><button class="btn" data-fs="profile">Editar identidade</button></div>
 <div class="card" style="padding:15px;margin-bottom:12px"><h4>Campanhas de marketing</h4><p>Campanhas cadastradas para organização e planejamento; descontos não são aplicados automaticamente ao checkout.</p>${data.campaigns.slice(0,12).map(x=>`<p><strong>${safe(x.title)}</strong> · ${Number(x.discount_percent)}% · ${x.active?'Ativa':'Pausada'} <button class="btn" data-toggle-campaign="${x.id}" data-next="${!x.active}">${x.active?'Pausar':'Ativar'}</button></p>`).join('')||'<p>Sem campanhas.</p>'}<button class="btn" data-fs="campaign">Criar campanha</button></div>
 <div class="card" style="padding:15px;margin-bottom:12px"><h4>Programa de pontos</h4>${data.loyalty.slice(0,10).map(x=>`<p>${safe(x.user_id)} · ${Number(x.points)} pontos · ${Number(x.purchases)} compras</p>`).join('')||'<p>Sem clientes cadastrados.</p>'}<button class="btn" data-fs="loyalty">Ajustar pontos</button></div>
 <div class="card" style="padding:15px"><h4>Avaliações registradas</h4>${data.reviews.slice(0,20).map(x=>`<p>${'★'.repeat(Math.min(5,Number(x.rating)||0))} · pedido ${safe(String(x.order_id))} · ${safe(x.comment||'Sem comentário')}</p>`).join('')||'<p>Ainda não há avaliações.</p>'}</div>`;
 el.querySelectorAll('[data-fs]').forEach(btn=>btn.onclick=async()=>{
 const mode=btn.dataset.fs;let path='',payload={};
 if(mode==='profile') {const display_name=prompt('Nome da loja:',profile.display_name||'');if(display_name===null)return;const description=prompt('Descrição da loja:',profile.description||'');if(description===null)return;const brand_color=prompt('Cor hexadecimal:',profile.brand_color||'#69C9FF');if(brand_color===null)return;path='profile';payload={display_name,description,brand_color};}
 if(mode==='campaign'){const title=prompt('Nome da campanha:');if(!title)return;const discount_percent=prompt('Desconto percentual (planejado):');if(discount_percent===null)return;const starts_at=prompt('Início ISO (ex.: 2026-12-01T12:00:00-03:00):');if(!starts_at)return;const ends_at=prompt('Fim ISO:');if(!ends_at)return;path='campaigns';payload={title,discount_percent:Number(discount_percent),starts_at,ends_at};}
 if(mode==='loyalty'){const user_id=prompt('ID Discord do cliente:');if(!user_id)return;const delta=prompt('Quantidade de pontos (negativo para reduzir):');if(delta===null)return;path='loyalty/adjust';payload={user_id,delta:Number(delta)};}
 const r=await api(`/api/me/servers/${gid}/store/${path}`,{method:'POST',body:payload});if(!r.ok)return toast(r.error||'Erro ao salvar','error');toast('Atualizado','success');await load();
 });
 el.querySelectorAll('[data-toggle-campaign]').forEach(btn=>btn.onclick=async()=>{const r=await api(`/api/me/servers/${gid}/store/campaigns/${btn.dataset.toggleCampaign}/status`,{method:'POST',body:{active:btn.dataset.next==='true'}});if(!r.ok)return toast(r.error||'Erro','error');await load();});
 };await load();
}
