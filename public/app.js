// ============================================================================
// EBONGIU — SELLER & CTV SYSTEM (AUTHKIT FROSTED GLASS + SIDEBAR MENU)
// ============================================================================

import { createToolViews } from './tools.js';

const previousToken = sessionStorage.getItem('bonglee_token') || sessionStorage.getItem('znplay_token');
if (previousToken && !sessionStorage.getItem('ebongiu_token')) {
  sessionStorage.setItem('ebongiu_token', previousToken);
}
sessionStorage.removeItem('bonglee_token');
localStorage.removeItem('bonglee_token');
sessionStorage.removeItem('bonglee_catalog_cache');
sessionStorage.removeItem('znplay_token');
localStorage.removeItem('znplay_token');
sessionStorage.removeItem('znplay_catalog_cache');

const state = {
  token: sessionStorage.getItem('ebongiu_token') || '',
  user: null,
  catalogData: null,
  lastFullPricingVersion: null,
  catalogWarning: '',
  ordersWarning: '',
  loadingCatalog: false,
  loadingOrders: false,
  lastOrdersSig: '',
  lastCatalogSig: '',
  remoteSummaries: {},

  // Active Sidebar View
  currentView: 'fruit_coin', // default to 'fruit_coin' (Trái cây) or 'dashboard'

  // Filters on Order Pages
  orderSearch: '',
  orderActiveFilter: 'all', // 'all' | '1' | '0'
  orderProgressFilter: 'all', // 'all' | 'running' | 'completed'

  // Orders & Admin Data
  orders: [],
  adminOverview: null,
  adminMonitor: null,
  pricingCtvId: '',
  pricingCatalog: null,
  pricingLoadError: '',
  adminPricingTab: 'categories', // 'categories' | 'packages' | 'fruits'
  adminPkgCatFilter: 'all',
  adminFruitFilter: 'all', // 'all' | 'custom'
  adminFruitSearch: '',

  // Modal Create Order State
  modalOrder: {
    category: 'fruit_coin',
    fruitOrderType: 'by_coin', // 'by_coin' | 'by_fruit'
    customer: null, // { customerId, gameProfileId, nickname, suid, region, photoUrl }
    customerTab: 'ingame', // 'ingame' | 'roleid' | 'saved'

    coin_price_package_id: null,
    min_coin_filter: 400000,

    fruit_item_id: 1,
    fruit_total_cnt: 10,
    fruit_variant_mode: 'regular', // 'regular' | 'specify'
    fruit_mutation_list: [],
    fruit_preview_price: 0,
    fruit_preview_admin: null,

    price_package_id: null,
    guest_book_message: '',
    gift_id: null,
    gift_plant_id: null,
    mail_message: 'Cảm ơn quý khách',
  },
};
localStorage.removeItem('ebongiu_token');

const { renderIdentityToolsHtml, bindIdentityToolsEvents, loadIdentityClientStatus, loadAdminMonitor, renderAdminMonitorHtml, bindAdminMonitorEvents } =
  createToolViews({ state, apiFetch, createRequestKey, escapeHtml, showToast, formatVnd, formatDateVi, renderCurrentView, loadOrders });

function createRequestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

const VIEW_TITLES = {
  dashboard: 'Bảng điều khiển tổng quan',
  farm_gift: 'Đơn quà nông trại',
  mail_gift: 'Đơn quà thư',
  guestbook: 'Đơn bài viết lưu bút',
  buff_tim: 'Đơn Buff Tim',
  buff_sao: 'Đơn Buff Sao',
  weather_buff: 'Đơn Buff Thời Tiết',
  fruit_coin: 'Đơn Trái cây & Xu nông trại',
  weekly_settlements: 'Đối soát tuần & Lịch sử số dư',
  order_history: 'Lịch sử đơn hàng',
  identity_tools: 'Trích xuất ID Game / Tên nhân vật',
  admin_monitor: 'Quản trị: Giám sát hoạt động & đối soát CTV',
  admin_pricing: 'Quản trị: Tùy chỉnh Giá từng Sản phẩm & Danh mục',
  admin_ctv: 'Quản trị: Quản lý Tài khoản CTV đặt đơn',
  admin_system: 'Quản trị: Cấu hình kết nối Nguồn API',
};

const ORDER_VIEWS = [
  'farm_gift',
  'mail_gift',
  'guestbook',
  'buff_tim',
  'buff_sao',
  'weather_buff',
  'fruit_coin',
];

// ============================================================================
// UTILITIES
// ============================================================================
function formatVnd(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return '0đ';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

function formatCompactVnd(amount) {
  const n = Number(amount || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}đ`;
}

function formatNum(num) {
  const n = Number(num || 0);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}

function formatDateVi(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="btn-frost" style="padding:3px 8px;font-size:11px;">Đóng</button>
  `;
  el.querySelector('button').addEventListener('click', () => el.remove());
  container.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, duration);
}

async function apiFetch(url, method = 'GET', body = null, timeoutMs = 0) {
  const requestToken = state.token;
  const headers = { 'Accept': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  const opts = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let controller = null;
  let timer = null;
  if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    opts.signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const sec = timeoutMs > 0 ? (timeoutMs / 1000).toFixed(1).replace(/\.0$/, '') : '6.5';
      throw Object.assign(new Error(`Tải dữ liệu quá thời gian (quá ${sec} giây). Vui lòng bấm Thử lại.`), { code: 'TIMEOUT', status: 504 });
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (requestToken && state.token !== requestToken) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
  }
  if (res.status === 401 && requestToken && state.token === requestToken) {
    clearAuthState();
    updateShellAuthUI();
  }
  if (res.status === 503 && (data?.code === 'MAINTENANCE' || data?.maintenance) && state.token && state.user?.role !== 'admin') {
    setCtvMaintenanceOverlay(true, data?.message || 'Hệ thống ebongiu đang bảo trì');
  }
  if (!data || typeof data !== 'object') throw new Error('Máy chủ chưa trả về dữ liệu. Vui lòng thử lại.');
  if (!res.ok && !data.needs_confirmation) {
    throw Object.assign(new Error(data.message || `Lỗi kết nối (${res.status})`), { code: data.code, status: res.status });
  }
  return data;
}

function setCtvMaintenanceOverlay(active, message = 'Hệ thống ebongiu đang bảo trì') {
  if (state.user?.role === 'admin') active = false;
  state.maintenanceLocked = Boolean(active);
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('ebongiuMaintenanceOverlay');
  if (!active) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'ebongiuMaintenanceOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,6,15,0.94);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:24px;';
    el.innerHTML = `
      <div style="max-width:440px;width:100%;background:#fff;border:1px solid rgba(251,191,36,0.45);border-radius:18px;padding:30px 26px;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;gap:14px;">
        <img src="/kitty-shop.jpg" alt="ebongiu" class="brand-logo-img brand-logo-lg" />
        <span class="badge-tag amber" style="font-size:12px;">🛠️ ĐANG BẢO TRÌ</span>
        <h2 id="ebongiuMaintenanceTitle" style="margin:0;color:var(--color-pure-white);font-size:22px;font-weight:700;">${escapeHtml(message)}</h2>
        <p style="margin:0;color:var(--color-moon-mist);font-size:13.5px;line-height:1.6;">
          Hệ thống đang được quản trị viên bảo trì để cập nhật. Trang sẽ tự động mở lại ngay khi hoàn tất.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px;">
          <button type="button" class="btn-violet" id="btnRetryMaintenanceCheck">↻ Kiểm tra lại</button>
          <button type="button" class="btn-frost" id="btnLogoutFromMaintenance">Đăng xuất</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#btnRetryMaintenanceCheck')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      b.textContent = '⏳ Đang kiểm tra...';
      try {
        const p = await fetch('/api/ping', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
        if (p && !p.maintenance) {
          setCtvMaintenanceOverlay(false);
          await initAuth();
          if (state.user) await loadInitialAppData();
          return;
        }
        showToast('Hệ thống ebongiu vẫn đang bảo trì. Vui lòng chờ thêm ít phút.');
      } finally {
        if (document.getElementById('ebongiuMaintenanceOverlay')) {
          b.disabled = false;
          b.textContent = '↻ Kiểm tra lại';
        }
      }
    });
    el.querySelector('#btnLogoutFromMaintenance')?.addEventListener('click', () => {
      logout();
    });
  } else {
    const titleEl = el.querySelector('#ebongiuMaintenanceTitle');
    if (titleEl) titleEl.textContent = message;
  }
}

function setCtvUpdateBanner(visible) {
  if (state.user?.role === 'admin') visible = false;
  if (typeof document === 'undefined' || !document.body) return;
  let bar = document.getElementById('ebongiuCtvUpdateBanner');
  if (!visible) {
    if (bar) bar.remove();
    return;
  }
  if (bar) return;
  bar = document.createElement('button');
  bar.id = 'ebongiuCtvUpdateBanner';
  bar.type = 'button';
  bar.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;background:linear-gradient(90deg,#b72f66,#c8487d);color:white;border:1px solid rgba(196,181,253,0.75);border-radius:999px;padding:10px 22px;font-size:13.5px;font-weight:700;cursor:pointer;box-shadow:0 12px 32px rgba(79,70,229,0.55);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);text-align:center;';
  bar.textContent = '🔄 Có cập nhật từ ebongiu, vui lòng bấm vào dòng này';
  bar.addEventListener('click', () => {
    try { sessionStorage.removeItem('ebongiu_catalog_cache'); } catch {}
    window.location.reload();
  });
  document.body.appendChild(bar);
}

// ============================================================================
// AUTHENTICATION & SESSION GATE
// ============================================================================
function clearAuthState() {
  state.token = '';
  state.user = null;
  state.catalogData = null;
  state.lastFullPricingVersion = null;
  state.pricingCtvId = '';
  state.pricingCatalog = null;
  state.pricingLoadError = '';
  state.catalogWarning = '';
  state.ordersWarning = '';
  state.loadingCatalog = false;
  state.loadingOrders = false;
  state.lastOrdersSig = '';
  state.lastCatalogSig = '';
  state.lastScopeSyncAt = {};
  state.remoteSummaries = {};
  state.orders = [];
  state.adminOverview = null;
  state.adminMonitor = null;
  state.adminMonitorCtvId = null;
  state.adminMonitorCtvDetail = null;
  state.adminMonitorCtvTab = 'orders';
  state.adminMonitorCtvOrderSearch = '';
  state.adminMonitorCtvCatFilter = 'all';
  setCtvMaintenanceOverlay(false);
  setCtvUpdateBanner(false);
  state.seenUpdateVersion = null;
  state.currentView = 'fruit_coin';
  state.modalOrder.customer = null;
  state.modalOrder.fruit_preview_admin = null;
  localStorage.removeItem('ebongiu_token');
  sessionStorage.removeItem('ebongiu_token');
  sessionStorage.removeItem('ebongiu_catalog_cache');
  const container = document.getElementById('mainViewContainer');
  if (container) container.innerHTML = '';
  const modal = document.getElementById('appModalOverlay');
  if (modal) modal.style.display = 'none';
  const modalBody = document.getElementById('appModalBody');
  if (modalBody) modalBody.innerHTML = '';
  const adminSection = document.getElementById('sidebarAdminSection');
  if (adminSection) adminSection.style.display = 'none';
}

function hydrateCachedCatalog() {
  // Always load fresh prices from server RAM (<5ms) so CTV never sees outdated prices after Admin edits.
  return false;
}

function saveCachedCatalog(data) {
  if (!state.user || !data) return;
  try {
    sessionStorage.setItem('ebongiu_catalog_cache', JSON.stringify({
      userId: state.user.id,
      role: state.user.role,
      cachedAt: Date.now(),
      data,
    }));
  } catch {}
}

function isUserTypingOrModalOpen() {
  if (state.currentView === 'admin_pricing' && document.querySelector?.('[data-cat-card][data-dirty="1"]')) return true;
  const modal = document.getElementById('appModalOverlay');
  if (modal && modal.style.display !== 'none') return true;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
  return false;
}

async function loadInitialAppData() {
  if (!state.user) return;
  hydrateCachedCatalog();
  renderCurrentView();
  const catTask = loadCatalog(false).then(() => {
    if (state.user && !isUserTypingOrModalOpen()) renderCurrentView();
  });
  const ordTask = loadOrders(false).then(() => {
    if (state.user && !isUserTypingOrModalOpen()) renderCurrentView();
  });
  await Promise.all([catTask, ordTask]);
}

async function initAuth() {
  const requestToken = state.token;
  if (state.token) {
    try {
      const r = await apiFetch('/api/auth/me');
      if (r.success && r.user) {
        state.user = r.user;
        if (r.updateVersion !== undefined && state.seenUpdateVersion == null) {
          state.seenUpdateVersion = Number(r.updateVersion || 0);
        }
        updateShellAuthUI();
        return;
      }
    } catch (err) {
      if (state.token !== requestToken) return;
      if (err.code === 'MAINTENANCE') {
        setCtvMaintenanceOverlay(true, err.message || 'Hệ thống ebongiu đang bảo trì');
        return;
      }
      if (err.status !== 401) {
        const message = document.getElementById('gateLoginError');
        message.textContent = 'Chưa kiểm tra được phiên đăng nhập. Tải lại trang khi kết nối ổn định.';
        message.style.display = 'block';
        updateShellAuthUI();
        return;
      }
    }
  }
  clearAuthState();
  updateShellAuthUI();
}

async function loginWithCredentials(identifier, password) {
  const r = await apiFetch('/api/auth/login', 'POST', { identifier, password });
  if (r.success && r.token) {
    clearAuthState();
    state.token = r.token;
    state.user = r.user;
    if (r.updateVersion !== undefined) {
      state.seenUpdateVersion = Number(r.updateVersion || 0);
    }
    sessionStorage.setItem('ebongiu_token', r.token);
    const passwordInput = document.getElementById('gateLoginPw');
    if (passwordInput) passwordInput.value = '';
    showToast(`Chào mừng ${r.user.name}!`);
    updateShellAuthUI();
    await loadInitialAppData();
  }
}

async function logout() {
  const logoutRequest = apiFetch('/api/auth/logout', 'POST');
  clearAuthState();
  updateShellAuthUI();
  try {
    await logoutRequest;
  } catch {}
}

function updateShellAuthUI() {
  const gate = document.getElementById('authGateScreen');
  const shell = document.getElementById('appShell');

  if (!state.user) {
    if (gate) gate.style.display = 'flex';
    if (shell) shell.style.display = 'none';
    return;
  }

  if (gate) gate.style.display = 'none';
  if (shell) shell.style.display = 'flex';

  const isAdmin = state.user.role === 'admin';
  const roleBadge = document.getElementById('sidebarRoleBadge');
  const adminSec = document.getElementById('sidebarAdminSection');
  const userBadge = document.getElementById('topUserNameBadge');
  const walletPill = document.getElementById('topWalletPill');
  const walletText = document.getElementById('topWalletText');

  if (roleBadge) {
    roleBadge.textContent = isAdmin ? 'ADMIN' : 'CTV';
    roleBadge.className = `badge-tag ${isAdmin ? 'violet' : 'green'}`;
  }
  // CTV NEVER sees the Admin menu section!
  if (adminSec) {
    adminSec.style.display = isAdmin ? 'flex' : 'none';
  }
  if (userBadge) {
    userBadge.textContent = state.user.name;
  }

  if (walletPill && walletText) {
    if (isAdmin) {
      const wl = state.catalogData?.weeklyLimit;
      if (wl) {
        walletPill.className = 'wallet-pill-box';
        walletText.innerHTML = `Đã dùng: <strong style="color:#895d0a;">${formatCompactVnd(wl.spent)}</strong> · Hạn mức: <strong style="color:#28754e;">${formatCompactVnd(wl.limit)}</strong>`;
      } else {
        walletPill.className = 'wallet-pill-box';
        walletText.innerHTML = `Quyền: <strong style="color:#28754e;">Quản trị viên (Admin)</strong>`;
      }
    } else {
      const bal = Number(state.user.balance || 0);
      walletPill.className = `wallet-pill-box ${bal <= 0 ? 'is-empty' : ''}`;
      walletText.innerHTML = `Số dư ví CTV: <strong style="color:${bal > 0 ? '#28754e' : '#ab334a'};">${formatVnd(bal)}</strong>`;
    }
  }
}

// ============================================================================
// LOAD CATALOG, SYSTEM STATUS DOTS & FLASH SALE MARQUEE
// ============================================================================
function applyCatalogSideEffects(r) {
  const st = r?.systemStatus || {};
  const updateDot = (id, working) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-loading');
    el.classList.toggle('is-off', !working);
    el.title = working ? 'Đang hoạt động' : 'Không hoạt động';
  };
  updateDot('dot_farm_gift', st.farm_gift);
  updateDot('dot_mail_gift', st.mail_gift);
  updateDot('dot_guestbook', st.guestbook);
  updateDot('dot_buff_tim', st.buff_tim);
  updateDot('dot_buff_sao', st.buff_sao);
  updateDot('dot_weather_buff', st.weather_buff);
  updateDot('dot_fruit_coin', st.fruit_coin);

  updateShellAuthUI();
}

function expandCompactFruitMutations(data, fallbackMutations = null) {
  const fruits = data?.catalog?.fruit_by_fruit;
  const mutMeta = data?.mutations || fallbackMutations || {};
  if (!Array.isArray(fruits)) return;
  for (const f of fruits) {
    if (Array.isArray(f.mp) && !Array.isArray(f.mutation_prices)) {
      f.mutation_prices = f.mp.map(([mk, price]) => {
        const meta = mutMeta[mk] || mutMeta[String(mk)] || {};
        return {
          mutation_key: Number(mk),
          mutation_name: meta.name || `Đột biến #${mk}`,
          mutation_abbr: meta.abbr || '',
          mutation_color: meta.color || '#9b3765',
          unit_price: Number(price || 0),
        };
      });
      delete f.mp;
    }
  }
}

async function loadCatalog(forceRefresh = false, scope = '', timeoutMs = 6500) {
  if (!state.user) return false;
  const requestToken = state.token;
  state.loadingCatalog = true;
  try {
    const qs = new URLSearchParams();
    if (forceRefresh) qs.set('refresh', '1');
    if (scope) qs.set('scope', scope);
    if (state.user.role !== 'admin') qs.set('compact', '1');
    const url = `/api/catalog${qs.toString() ? `?${qs.toString()}` : ''}`;
    const r = await apiFetch(url, 'GET', null, timeoutMs);
    if (!r.success || state.token !== requestToken) return false;

    const prev = state.catalogData;
    if (prev && r.pricingVersion < prev.pricingVersion) return false;
    if (!r.partialScope) state.lastFullPricingVersion = r.pricingVersion;
    const merged = r.partialScope && prev
      ? {
          ...prev,
          syncedAt: r.syncedAt || prev.syncedAt,
          pricingVersion: r.pricingVersion ?? prev.pricingVersion,
          fruitOrderFee: r.fruitOrderFee ?? prev.fruitOrderFee,
          systemStatus: r.systemStatus || prev.systemStatus,
          hnSettings: r.hnSettings || prev.hnSettings,
          coinStock: r.coinStock !== undefined ? r.coinStock : prev.coinStock,
          coinTiers: r.coinTiers !== undefined ? r.coinTiers : prev.coinTiers,
          mutations: r.mutations || prev.mutations,
          catalog: {
            ...(prev.catalog || {}),
            ...(r.catalog || {}),
          },
        }
      : r;

    expandCompactFruitMutations(merged, prev?.mutations);

    const sig = JSON.stringify({
      pv: merged.pricingVersion,
      s: merged.systemStatus,
      wl: merged.weeklyLimit,
      fc: (merged.catalog?.fruit_coin || []).map(p => [p.id, p.total_price, p.is_on_sale, p.sale?.slots_remaining]),
      fb: (merged.catalog?.fruit_by_fruit || []).map(f => [f.id, f.unit_price, f.stock_quantity]),
      bt: (merged.catalog?.buff_tim || []).map(p => [p.id, p.total_price, p.is_on_sale, p.sale?.slots_remaining]),
      bs: (merged.catalog?.buff_sao || []).map(p => [p.id, p.total_price]),
      gb: (merged.catalog?.guestbook || []).map(p => [p.id, p.total_price]),
      wb: (merged.catalog?.weather_buff || []).map(p => [p.id, p.total_price, p.is_on_sale, p.sale?.slots_remaining]),
      fg: (merged.catalog?.farm_gift || []).map(g => [g.id, (g.packages || []).map(p => [p.id, p.total_price])]),
      mg: (merged.catalog?.mail_gift || []).map(g => [g.id, (g.packages || []).map(p => [p.id, p.total_price])]),
      cs: merged.coinStock?.quantity,
    });
    const changed = sig !== state.lastCatalogSig || !state.catalogData;
    state.lastCatalogSig = sig;
    state.catalogData = merged;
    state.catalogWarning = '';
    if (!state.lastScopeSyncAt) state.lastScopeSyncAt = {};
    if (scope) state.lastScopeSyncAt[scope] = Date.now();
    else state.lastScopeSyncAt.all = Date.now();
    saveCachedCatalog(merged);
    applyCatalogSideEffects(merged);
    return changed;
  } catch (err) {
    if (state.token === requestToken) {
      state.catalogWarning = err?.code === 'TIMEOUT'
        ? err.message
        : 'Chưa đồng bộ được bảng giá nguồn. Bấm Làm mới dữ liệu để thử lại.';
    }
    return false;
  } finally {
    if (state.token === requestToken) state.loadingCatalog = false;
  }
}

// ============================================================================
// LOAD ORDERS & ADMIN OVERVIEW
// ============================================================================
async function loadOrders(forceRefresh = false, timeoutMs = 6500) {
  if (!state.user) return false;
  const requestToken = state.token;
  state.loadingOrders = true;
  try {
    const r = await apiFetch(`/api/orders?category=all${forceRefresh ? '&refresh=1' : ''}`, 'GET', null, timeoutMs);
    if (r.success && state.token === requestToken) {
      const nextOrders = r.orders || [];
      const sig = `${nextOrders.length}:${nextOrders.map(o => `${o.id}:${o.status}:${o.isActive}:${o.completedCnt}:${o.sendingCnt}:${o.failedCnt}:${o.cancelRequested ? 1 : 0}:${o.weatherDeleteAt || ''}`).join('|')}`;
      const changed = sig !== state.lastOrdersSig;
      state.lastOrdersSig = sig;
      state.orders = nextOrders;
      state.remoteSummaries = r.remoteSummaries || {};
      state.ordersWarning = r.partial ? 'Một phần danh sách đơn chưa đồng bộ được với nguồn.' : '';
      const activeCount = state.orders.filter((o) => o.status !== 'completed' && o.isActive).length;
      const badge = document.getElementById('sidebarActiveOrdersCount');
      if (badge) badge.textContent = String(activeCount);
      return changed;
    }
  } catch (err) {
    if (state.token === requestToken) state.ordersWarning = 'Chưa cập nhật được danh sách đơn.';
  } finally {
    if (state.token === requestToken) state.loadingOrders = false;
  }
  return false;
}

async function loadAdminOverview() {
  if (!state.user || state.user.role !== 'admin') return;
  const requestToken = state.token;
  try {
    const r = await apiFetch('/api/admin/overview');
    if (r.success && state.token === requestToken && state.user?.role === 'admin') {
      state.adminOverview = r;
    }
  } catch (err) {
    console.error('Error loading admin overview:', err);
  }
}

// ============================================================================
// VIEW ROUTER & RENDERER
// ============================================================================
function setMobileMenuOpen(open) {
  document.getElementById('appSidebar')?.classList.toggle('is-open', open);
  document.getElementById('sidebarBackdrop')?.classList.toggle('is-open', open);
  const toggle = document.getElementById('btnToggleMobileSidebar');
  if (toggle) toggle.ariaExpanded = String(open);
}

function switchView(viewKey) {
  if (!state.user) return;
  if (!Object.hasOwn(VIEW_TITLES, viewKey) || (viewKey.startsWith('admin_') && state.user.role !== 'admin')) {
    viewKey = 'fruit_coin';
  }
  state.currentView = viewKey;
  document.querySelectorAll('.sidebar-item[data-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewKey);
  });
  const titleEl = document.getElementById('topNavbarViewTitle');
  if (titleEl) {
    titleEl.textContent = VIEW_TITLES[viewKey] || 'ebongiu';
  }
  setMobileMenuOpen(false);

  if (['admin_ctv', 'admin_system', 'admin_pricing'].includes(viewKey) && !state.adminOverview) {
    const container = document.getElementById('mainViewContainer');
    container.textContent = 'Đang tải dữ liệu quản trị…';
    loadAdminOverview().then(() => {
      if (state.currentView !== viewKey || state.user?.role !== 'admin') return;
      if (state.adminOverview) renderCurrentView();
      else container.textContent = 'Chưa tải được dữ liệu quản trị. Chọn lại mục này để thử lại.';
    });
    return;
  }
  renderCurrentView();
  if (viewKey === 'identity_tools') loadIdentityClientStatus();
  if (viewKey === 'admin_monitor') loadAdminMonitor();
}

function renderCurrentView() {
  const container = document.getElementById('mainViewContainer');
  if (!container || !state.user) return;
  if (state.currentView.startsWith('admin_') && state.user.role !== 'admin') {
    switchView('fruit_coin');
    return;
  }

  const view = state.currentView;

  // Show zero-balance warning banner at top of page if CTV has 0đ
  const isCtvZeroBalance = state.user.role !== 'admin' && Number(state.user.balance || 0) <= 0;
  const zeroBannerHtml = isCtvZeroBalance
    ? `
      <div class="glass-panel" style="background:rgba(228,109,76,0.16);box-shadow:rgba(228,109,76,0.45) 0 0 0 1px inset;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-weight:600;color:#ab334a;font-size:14px;">⚠️ Tài khoản CTV của bạn chưa có số dư (0đ)</div>
          <div style="font-size:12px;color:var(--color-moon-mist);margin-top:2px;">
            Bạn vẫn có thể dùng công cụ tra cứu. Để đặt đơn, cần có đủ số dư và hệ thống lưu trữ ví an toàn. Liên hệ Admin khi cần nạp ví.
          </div>
        </div>
        <span class="badge-tag red">Cần nạp ví để thao tác</span>
      </div>
    `
    : '';

  if (ORDER_VIEWS.includes(view)) {
    container.innerHTML = zeroBannerHtml + renderOrderCategoryPageHtml(view);
    bindOrderCategoryPageEvents(view);
  } else if (view === 'dashboard') {
    container.innerHTML = zeroBannerHtml + renderDashboardOverviewHtml();
    bindDashboardEvents();
  } else if (view === 'weekly_settlements') {
    container.innerHTML = zeroBannerHtml + `<div class="glass-panel">Đang tải dữ liệu đối soát tuần...</div>`;
    renderWeeklySettlementsView(container, zeroBannerHtml);
  } else if (view === 'order_history') {
    container.innerHTML = zeroBannerHtml + renderOrderHistoryHtml();
    bindOrderHistoryEvents();
  } else if (view === 'identity_tools') {
    container.innerHTML = zeroBannerHtml + renderIdentityToolsHtml();
    bindIdentityToolsEvents();
  } else if (view === 'admin_monitor' && state.user.role === 'admin') {
    container.innerHTML = renderAdminMonitorHtml();
    bindAdminMonitorEvents();
  } else if (view === 'admin_pricing' && state.user.role === 'admin') {
    container.innerHTML = renderAdminPricingPageHtml();
    bindAdminPricingEvents();
  } else if (view === 'admin_ctv' && state.user.role === 'admin') {
    container.innerHTML = renderAdminCtvPageHtml();
    bindAdminCtvEvents();
  } else if (view === 'admin_system' && state.user.role === 'admin') {
    container.innerHTML = renderAdminSystemPageHtml();
    bindAdminSystemEvents();
  }
}

// ============================================================================
// 1. RENDER ORDER CATEGORY PAGE (MATCHES SCREENSHOT 1 EXACTLY)
// ============================================================================
function renderOrderCategoryPageHtml(catKey) {
  const r = state.catalogData;
  const isWorking = !!(r?.systemStatus?.[catKey]);
  const rates = r?.processingRates || {};

  const rateKeyMap = {
    farm_gift: 'farm_gift_order',
    mail_gift: 'mail_gift_order',
    guestbook: 'guest_book_order',
    buff_tim: 'buff_tim_order',
    buff_sao: 'buff_sao_order',
    weather_buff: 'weather_buff_order',
    fruit_coin: 'fruit_order',
  };
  const rateObj = rates[rateKeyMap[catKey]] || { assigned_rate: 0, completed_rate: 0, cooldown_second: 180 };

  // Filter orders belonging to this category
  const catOrders = state.orders.filter((o) =>
    catKey === 'fruit_coin'
      ? o.category === 'fruit_coin' || o.category === 'fruit_by_fruit'
      : o.category === catKey
  );

  // Admin uses HoanNguyen's live summary totals when available so numbers match source 100%.
  const remSum = state.user?.role === 'admin' ? state.remoteSummaries?.[catKey] : null;

  const totalOrders = remSum ? Number(remSum.total_orders ?? catOrders.length) : catOrders.length;
  const completedOrders = remSum ? Number(remSum.completed_orders ?? 0) : catOrders.filter((o) => o.status === 'completed').length;
  const activeOrdersCount = remSum ? Number(remSum.active_orders ?? 0) : catOrders.filter((o) => o.status !== 'completed' && o.isActive).length;
  const inactiveOrdersCount = remSum ? Number(remSum.inactive_orders ?? 0) : catOrders.filter((o) => o.status !== 'completed' && !o.isActive).length;

  const totalUnits = remSum ? Number(remSum.total_units ?? 0) : catOrders.reduce((s, o) => s + Number(o.totalCnt || 0), 0);
  const completedUnits = remSum ? Number(remSum.completed_units ?? 0) : catOrders.reduce((s, o) => s + Number(o.completedCnt || 0), 0);
  const activeRemainingUnits = remSum
    ? Number(remSum.active_units ?? 0)
    : catOrders
        .filter((o) => o.status !== 'completed' && o.isActive)
        .reduce((s, o) => s + Math.max(0, Number(o.totalCnt || 0) - Number(o.completedCnt || 0)), 0);
  const pausedRemainingUnits = remSum
    ? Number(remSum.inactive_units ?? 0)
    : catOrders
        .filter((o) => o.status !== 'completed' && !o.isActive)
        .reduce((s, o) => s + Math.max(0, Number(o.totalCnt || 0) - Number(o.completedCnt || 0)), 0);

  const syncedTimeText = r?.syncedAt
    ? new Date(r.syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  const unitLabelMap = {
    farm_gift: 'quà',
    mail_gift: 'thư',
    guestbook: 'bài viết',
    buff_tim: 'tim',
    buff_sao: 'sao',
    weather_buff: 'lần',
    fruit_coin: 'trái / xu',
  };
  const unitName = unitLabelMap[catKey] || 'đơn vị';

  // Apply search/status filters
  const filteredOrders = catOrders.filter((o) => {
    if (state.orderActiveFilter === '1' && !o.isActive) return false;
    if (state.orderActiveFilter === '0' && o.isActive) return false;
    if (state.orderProgressFilter === 'running' && ['completed', 'cancelled'].includes(o.status)) return false;
    if (state.orderProgressFilter === 'completed' && o.status !== 'completed') return false;
    if (state.orderSearch.trim()) {
      const q = state.orderSearch.trim().toLowerCase();
      const matchName = String(o.customer?.nickname || '').toLowerCase().includes(q);
      const matchSuid = String(o.customer?.suid || '').toLowerCase().includes(q);
      const matchId = String(o.remoteOrderId || o.id).toLowerCase().includes(q);
      if (!matchName && !matchSuid && !matchId) return false;
    }
    return true;
  });

  // Extra footer buttons inside Stats Panel (Kho trái cây / Kho xu / Bảng giá)
  let footerButtonsHtml = '';
  if (catKey === 'fruit_coin') {
    footerButtonsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <button type="button" class="btn-frost" id="btnViewFruitWarehouse">📦 Xem kho trái cây</button>
        <button type="button" class="btn-frost" id="btnViewCoinWarehouse">🪙 Xem kho xu</button>
        <button type="button" class="btn-frost" id="btnViewCategoryPrices">🏷️ Xem bảng giá gói xu</button>
      </div>
    `;
  } else if (['buff_tim', 'buff_sao', 'guestbook', 'mail_gift', 'farm_gift', 'weather_buff'].includes(catKey)) {
    footerButtonsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <button type="button" class="btn-frost" id="btnViewCategoryPrices">🏷️ Xem bảng giá ${escapeHtml(VIEW_TITLES[catKey])}</button>
      </div>
    `;
  }

  return `
    ${[state.catalogWarning, state.ordersWarning].filter(Boolean).map(msg => `<p role="status" class="tool-warning">${escapeHtml(msg)}</p>`).join('')}
    <div class="glass-panel">
      <div class="panel-title-row">
        <div class="panel-title-left">
          <span class="panel-title-text">${escapeHtml(VIEW_TITLES[catKey])}</span>
          <span class="system-status-chip ${!r ? '' : isWorking ? 'is-working' : 'is-not-working'}">
            ● ${state.catalogWarning ? 'Chưa đồng bộ' : !r ? 'Đang kiểm tra...' : isWorking ? 'Đang hoạt động' : 'Không hoạt động'}
          </span>
          ${syncedTimeText ? `<span style="font-size:11px;color:var(--color-fog-veil);">Đồng bộ: ${escapeHtml(syncedTimeText)}</span>` : ''}
        </div>
        <button type="button" class="btn-frost" id="btnRefreshCatPage" style="font-size:12px;">
          ↻ Làm mới dữ liệu
        </button>
      </div>

      <div class="stats-three-grid">
        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box blue">📋</div>
            <span>Đơn hàng</span>
          </div>
          <div class="stat-main-metric">
            <span>Đã hoàn thành:</span>
            <strong>${completedOrders}</strong>
            <span>/ ${totalOrders}</span>
          </div>
          <hr class="stat-divider" />
          <div class="stat-meta-row">
            <span><span style="color:#28754e;">▶ Đang bật</span> <strong>${activeOrdersCount}</strong></span>
            <span><span style="color:#a8304c;">⏸ Đang tắt</span> <strong>${inactiveOrdersCount}</strong></span>
          </div>
        </div>

        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box amber">🎁</div>
            <span>Tiến độ ${escapeHtml(unitName)}</span>
          </div>
          <div class="stat-main-metric">
            <span>Đã gửi thành công:</span>
            <strong>${formatNum(completedUnits)}</strong>
            <span>/ ${formatNum(totalUnits)}</span>
          </div>
          <hr class="stat-divider" />
          <div class="stat-meta-row">
            <span><span style="color:#28754e;">↗ Đang chạy</span> <strong>${formatNum(activeRemainingUnits)}</strong></span>
            <span><span style="color:#a8304c;">⏹ Tạm dừng</span> <strong>${formatNum(pausedRemainingUnits)}</strong></span>
          </div>
        </div>

        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box violet">⚡</div>
            <span>Tốc độ xử lý</span>
          </div>
          <div class="stat-meta-row">
            <span>☁️ Tốc độ gửi:</span>
            <strong style="color:var(--color-pure-white);">${Number(rateObj.assigned_rate || 0).toFixed(1)} ${escapeHtml(unitName)}/phút</strong>
          </div>
          <div class="stat-meta-row">
            <span>✓ Thành công:</span>
            <strong style="color:#28754e;">${Number(rateObj.completed_rate || 0).toFixed(1)} ${escapeHtml(unitName)}/phút</strong>
          </div>
          <div class="stat-meta-row">
            <span>🕒 Chờ sau lỗi:</span>
            <strong style="color:var(--color-pure-white);">${rateObj.cooldown_second ?? 180} giây</strong>
          </div>
        </div>
      </div>

      ${footerButtonsHtml}
    </div>

    ${
      catKey === 'weather_buff'
        ? `
      <div class="glass-panel" style="padding:14px 18px;border-left:3px solid #9b3765;">
        <div style="font-size:13px;font-weight:700;color:#95436c;margin-bottom:6px;">📌 Lưu ý quy tắc Buff Thời Tiết:</div>
        <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--color-moon-mist);line-height:1.7;">
          <li><strong>Bước 1:</strong> Bấm <strong>+ Thêm Đơn Hàng</strong> để mua gói số lần thời tiết trước (chưa cần chọn khách khi tạo gói).</li>
          <li><strong>Bước 2:</strong> Sau khi tạo đơn, hệ thống tự trả <strong>Link theo dõi công khai</strong> ở cột <strong>LINK</strong> — bấm <strong>📋 Copy link</strong> gửi cho khách tự xem & chỉnh, hoặc bấm <strong>👤 Gán khách</strong> + <strong>☁️ Chọn thời tiết</strong> trực tiếp trên bảng rồi bật công tắc chạy.</li>
          <li>Sau khi bật đơn vẫn có thể <strong>Đổi khách</strong> — khách mới sẽ nhận phần thời tiết còn lại. Phần thời tiết đã chạy xong sẽ cố định không đổi được.</li>
        </ul>
      </div>
    `
        : ''
    }

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Quản lý đơn hàng</span>
        <button type="button" class="btn-violet" id="btnOpenAddOrderModal">
          + Thêm Đơn Hàng
        </button>
      </div>

      <div class="filters-grid">
        <div>
          <input
            type="text"
            id="catOrderSearchInput"
            class="input-box"
            placeholder="🔍 Tìm kiếm theo tên, SUID, mã đơn..."
            value="${escapeHtml(state.orderSearch)}"
          />
        </div>
        <div>
          <select id="catOrderActiveSelect" class="input-box">
            <option value="all" ${state.orderActiveFilter === 'all' ? 'selected' : ''}>Lọc theo trạng thái: Tất cả</option>
            <option value="1" ${state.orderActiveFilter === '1' ? 'selected' : ''}>Đang bật (Active)</option>
            <option value="0" ${state.orderActiveFilter === '0' ? 'selected' : ''}>Đang tắt (Paused)</option>
          </select>
        </div>
        <div>
          <select id="catOrderProgressSelect" class="input-box">
            <option value="all" ${state.orderProgressFilter === 'all' ? 'selected' : ''}>Lọc theo tiến trình: Tất cả</option>
            <option value="running" ${state.orderProgressFilter === 'running' ? 'selected' : ''}>Đang chạy</option>
            <option value="completed" ${state.orderProgressFilter === 'completed' ? 'selected' : ''}>Đã hoàn thành</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>${catKey === 'weather_buff' ? 'GÓI / THỜI TIẾT' : 'GÓI / VẬT PHẨM'}</th>
              <th>SỐ LƯỢNG</th>
              <th>GIÁ</th>
              ${
                catKey === 'weather_buff'
                  ? ''
                  : `
                    <th>TIẾN ĐỘ</th>
                  `
              }
              <th>TRẠNG THÁI</th>
              <th>BẬT/TẮT</th>
              <th>TẠO LÚC</th>
              ${catKey === 'weather_buff' ? '<th>LINK</th>' : state.user?.role === 'admin' ? '<th>THAO TÁC</th>' : ''}
            </tr>
          </thead>
          <tbody id="catOrdersTbody">
            ${renderCatOrdersTbodyHtml(catKey)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getFilteredCatOrders(catKey) {
  const catOrders = state.orders.filter((o) =>
    catKey === 'fruit_coin'
      ? o.category === 'fruit_coin' || o.category === 'fruit_by_fruit'
      : o.category === catKey
  );
  const q = state.orderSearch.trim().toLowerCase();
  return catOrders.filter((o) => {
    if (state.orderActiveFilter === '1' && !o.isActive) return false;
    if (state.orderActiveFilter === '0' && o.isActive) return false;
    if (state.orderProgressFilter === 'running' && ['completed', 'cancelled'].includes(o.status)) return false;
    if (state.orderProgressFilter === 'completed' && o.status !== 'completed') return false;
    if (q) {
      const matchName = String(o.customer?.nickname || '').toLowerCase().includes(q);
      const matchSuid = String(o.customer?.suid || '').toLowerCase().includes(q);
      const matchId = String(o.remoteOrderId || o.id).toLowerCase().includes(q);
      const matchLink = String(o.weather?.trackUrl || '').toLowerCase().includes(q);
      if (!matchName && !matchSuid && !matchId && !matchLink) return false;
    }
    return true;
  });
}

function renderCatOrdersTbodyHtml(catKey) {
  const filteredOrders = getFilteredCatOrders(catKey);
  const colSpan = catKey === 'weather_buff' ? 8 : state.user?.role === 'admin' ? 9 : 8;
  if (filteredOrders.length === 0) {
    return `
      <tr>
        <td colspan="${colSpan}" style="text-align:center;padding:32px;color:var(--color-fog-veil);">
          ${state.loadingOrders ? '<span class="loading-inline"><span class="loading-dot"></span>Đang đồng bộ danh sách đơn hàng...</span>' : 'Không có dữ liệu'}
        </td>
      </tr>
    `;
  }
  return filteredOrders.map((o) => renderOrderTableRowHtml(o)).join('');
}

function renderOrderTableRowHtml(o) {
  const isAdmin = state.user?.role === 'admin';
  const pct =
    o.totalCnt > 0
      ? Math.min(100, Math.round((Number(o.completedCnt || 0) / Number(o.totalCnt)) * 100))
      : 0;

  const statusBadge =
    o.status === 'cancelled' ? `<span class="badge-tag red">Đã hủy</span>` : o.status === 'completed'
      ? `<span class="badge-tag green">Hoàn thành</span>`
      : `<span class="badge-tag violet">${escapeHtml(o.status || 'assigned')}</span>`;

  // Admin sees cost & profit tooltip; CTV ONLY sees o.sellPrice!
  const adminNote =
    isAdmin && o.costPrice !== undefined && o.markupAmount > 0
      ? `<div style="font-size:10px;color:#28754e;">Lãi: +${formatVnd(o.markupAmount)}</div>`
      : '';

  const isWeather = o.category === 'weather_buff';
  const canEditWeather = isWeather && o.remoteOrderId && !['completed', 'cancelled'].includes(o.status) && !o.requiresReview && !o.cancelRequested;
  const wbSlots = isWeather ? (o.weather?.slots || []) : [];
  const wbHasCust = isWeather ? wbSlots.some(s => s.customer_id || s.customer) || Boolean(o.customer?.customerId) : true;
  const wbLines = isWeather ? (o.weather?.weathers || []) : [];
  const wbTotalQty = wbLines.reduce((s, w) => s + Number(w.quantity || 0), 0);
  const wbPkgQty = Number(o.weather?.packageQuantity || o.totalCnt || 0);
  const wbReadyToRun = !isWeather || (wbHasCust && wbTotalQty > 0 && (wbPkgQty <= 0 || wbTotalQty <= wbPkgQty));

  const customerCellHtml = isWeather
    ? `
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${
          wbHasCust
            ? `<div style="font-weight:600;color:var(--color-pure-white);">${escapeHtml(o.customer?.nickname || '—')}</div>
               <div style="font-size:11px;color:var(--color-fog-veil);">#${escapeHtml(o.remoteOrderId || o.id)} · SUID: ${escapeHtml(o.customer?.suid || '—')}</div>`
            : `<div><span class="badge-tag amber">⚠️ Chưa gán khách</span></div>
               <div style="font-size:11px;color:var(--color-fog-veil);">Đơn #${escapeHtml(o.remoteOrderId || o.id)}</div>`
        }
        ${
          canEditWeather
            ? `<div><button type="button" class="${wbHasCust ? 'btn-frost' : 'btn-violet'}" style="padding:3px 9px;font-size:11px;" data-weather-slot-order="${escapeHtml(o.remoteOrderId)}">${wbHasCust ? '✏️ Đổi khách' : '👤 Gán khách'}</button></div>`
            : ''
        }
      </div>
    `
    : `
      <div style="font-weight:600;color:var(--color-pure-white);">${escapeHtml(o.customer?.nickname || '—')}</div>
      <div style="font-size:11px;color:var(--color-fog-veil);">
        #${escapeHtml(o.remoteOrderId || o.id)} · SUID: ${escapeHtml(o.customer?.suid || '—')}
      </div>
    `;

  const packageCellHtml = isWeather
    ? `
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${
          wbLines.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${wbLines
                  .map(
                    (w) => `
                  <span class="badge-tag" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;">
                    ${w.icon ? `<img src="${escapeHtml(w.icon)}" alt="" style="width:14px;height:14px;object-fit:contain;" />` : '☁️'}
                    ${escapeHtml(w.name)}: <strong>${formatNum(w.completed_cnt || 0)}/${formatNum(w.quantity || 0)}</strong>
                  </span>
                `
                  )
                  .join('')}
              </div>`
            : `<div><span class="badge-tag amber">⚠️ Chưa chọn thời tiết</span> <span style="font-size:11px;color:var(--color-fog-veil);">(Gói ${formatNum(wbPkgQty)} lần)</span></div>`
        }
        ${
          canEditWeather
            ? `<div><button type="button" class="${wbLines.length > 0 ? 'btn-frost' : 'btn-violet'}" style="padding:3px 9px;font-size:11px;" data-weather-config-order="${escapeHtml(o.remoteOrderId)}">${wbLines.length > 0 ? '✏️ Sửa thời tiết' : '☁️ Chọn thời tiết'}</button></div>`
            : ''
        }
      </div>
    `
    : `<span class="badge-tag">${escapeHtml(o.summary)}</span>`;

  const wbTrackUrl = isWeather ? String(o.weather?.trackUrl || '') : '';
  const lastCellHtml = isWeather
    ? `
      <td>
        <div style="display:flex;flex-direction:column;gap:5px;min-width:128px;">
          ${
            o.remoteOrderId && o.status !== 'cancelled'
              ? `
                <div style="display:flex;align-items:center;gap:5px;">
                  <button type="button" class="btn-violet" style="padding:5px 10px;font-size:11px;white-space:nowrap;" data-copy-weather-link="${escapeHtml(o.remoteOrderId)}" data-track-url="${escapeHtml(wbTrackUrl)}">
                    📋 Copy link
                  </button>
                  ${
                    wbTrackUrl
                      ? `<a href="${escapeHtml(wbTrackUrl)}" target="_blank" rel="noopener noreferrer" class="btn-frost" style="padding:5px 8px;font-size:11px;text-decoration:none;" title="Mở link theo dõi">↗</a>`
                      : ''
                  }
                </div>
                ${
                  wbTrackUrl
                    ? `<div style="font-size:10px;color:var(--color-fog-veil);max-width:165px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(wbTrackUrl)}">${escapeHtml(wbTrackUrl.replace(/^https?:\/\//, ''))}</div>`
                    : ''
                }
              `
              : '—'
          }
          ${
            isAdmin && o.remoteOrderId && o.status !== 'cancelled'
              ? `<div><button type="button" class="btn-frost" style="padding:3px 8px;font-size:10px;color:#ab334a;" data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="weather_buff">Hủy tại nguồn</button></div>`
              : !isAdmin && o.weatherDeleteAt
              ? `<div><button type="button" class="btn-frost" disabled data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="weather_buff" data-unlock-at="${Number(o.weatherDeleteAt)}">Xóa đơn</button></div>`
              : ''
          }
        </div>
      </td>
    `
    : isAdmin
    ? `
      <td>
        ${
          o.remoteOrderId && o.status !== 'cancelled'
            ? `<button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;color:#ab334a;" data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}">Hủy tại nguồn</button>`
            : '—'
        }
      </td>
    `
    : '';

  return `
    <tr>
      <td>${customerCellHtml}</td>
      <td>${packageCellHtml}</td>
      <td><strong>${formatNum(o.totalCnt || 0)}</strong></td>
      <td>
        <div style="font-weight:600;color:#895d0a;">${formatVnd(o.sellPrice)}</div>
        ${adminNote}
      </td>
      ${
        isWeather
          ? ''
          : `
            <td>
              <div style="font-size:12px;font-weight:600;">${pct}%</div>
            </td>
          `
      }
      <td>${statusBadge}</td>
      <td>
        ${
          o.remoteOrderId && !['completed', 'cancelled'].includes(o.status) && !o.requiresReview && !o.cancelRequested
            ? `<button type="button" class="switch-btn ${o.isActive ? 'is-on' : ''}" role="switch" aria-checked="${Boolean(o.isActive)}" data-toggle-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}" title="${!wbReadyToRun && !o.isActive ? 'Cần gán khách và chọn thời tiết trước khi bật' : 'Bật/Tắt đơn'}"></button>`
            : '—'
        }
      </td>
      <td style="font-size:12px;color:var(--color-fog-veil);white-space:nowrap;">
        ${formatDateVi(o.createdAt)}
      </td>
      ${lastCellHtml}
    </tr>
  `;
}

let catFilterTimer = null;
function bindOrderCategoryPageEvents(catKey) {
  document.getElementById('btnRefreshCatPage')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshCatPage');
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = '↻ Đang tải...'; }
    showToast('Đang đồng bộ dữ liệu mới nhất...');
    try {
      const scope = state.user?.role === 'admin' ? '' : (catKey === 'fruit_coin' ? 'fruit_all' : catKey);
      await Promise.all([loadCatalog(true, scope, 6500), loadOrders(true, 6500)]);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '↻ Làm mới'; }
      renderCurrentView();
    }
  });

  document.getElementById('btnOpenAddOrderModal')?.addEventListener('click', () => {
    openCreateOrderModal(catKey);
  });

  document.getElementById('btnViewFruitWarehouse')?.addEventListener('click', openFruitWarehouseModal);
  document.getElementById('btnViewCoinWarehouse')?.addEventListener('click', openCoinWarehouseModal);
  document.getElementById('btnViewCategoryPrices')?.addEventListener('click', () => {
    openCategoryPriceListModal(catKey);
  });

  const updateTbodyOnly = () => {
    const tbody = document.getElementById('catOrdersTbody');
    if (!tbody) return;
    tbody.innerHTML = renderCatOrdersTbodyHtml(catKey);
    bindOrderRowActionButtons();
  };

  const searchIn = document.getElementById('catOrderSearchInput');
  searchIn?.addEventListener('input', (e) => {
    state.orderSearch = e.target.value;
    if (catFilterTimer && typeof clearTimeout === 'function') clearTimeout(catFilterTimer);
    catFilterTimer = setTimeout(updateTbodyOnly, 80);
  });

  document.getElementById('catOrderActiveSelect')?.addEventListener('change', (e) => {
    state.orderActiveFilter = e.target.value;
    updateTbodyOnly();
  });

  document.getElementById('catOrderProgressSelect')?.addEventListener('change', (e) => {
    state.orderProgressFilter = e.target.value;
    updateTbodyOnly();
  });

  bindOrderRowActionButtons();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

function bindOrderRowActionButtons() {
  document.querySelectorAll('[data-toggle-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.toggleOrder;
      const cat = btn.dataset.orderCat;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/orders/${cat}/${remId}/toggle-active`, 'PUT');
        showToast(res.message || 'Đã cập nhật trạng thái đơn hàng');
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-weather-slot-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const remId = btn.dataset.weatherSlotOrder;
      const ord = state.orders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === String(remId));
      if (ord) openWeatherSlotModal(ord);
    });
  });

  document.querySelectorAll('[data-weather-config-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const remId = btn.dataset.weatherConfigOrder;
      const ord = state.orders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === String(remId));
      if (ord) openWeatherConfigModal(ord);
    });
  });

  document.querySelectorAll('[data-copy-weather-link]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.copyWeatherLink;
      let url = String(btn.dataset.trackUrl || '').trim();
      const origLabel = btn.textContent;
      btn.disabled = true;
      try {
        if (!url) {
          btn.textContent = '⏳ Đang lấy link...';
          const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/share-link`, 'POST');
          url = String(res?.url || '').trim();
          if (!url) throw new Error('Không lấy được link theo dõi.');
          btn.dataset.trackUrl = url;
          const ord = state.orders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === String(remId));
          if (ord) {
            ord.weather = { ...(ord.weather || {}), trackUrl: url };
          }
        }
        const copied = await copyTextToClipboard(url);
        if (copied) {
          showToast('Đã copy link theo dõi thời tiết!');
          btn.textContent = '✓ Đã copy';
          setTimeout(() => { btn.textContent = origLabel; btn.disabled = false; }, 1600);
        } else {
          window.prompt('Copy link theo dõi thời tiết:', url);
          btn.textContent = origLabel;
          btn.disabled = false;
        }
      } catch (err) {
        showToast(err.message || 'Không copy được link.');
        btn.textContent = origLabel;
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-delete-order]').forEach((btn) => {
    if (btn.dataset.unlockAt) {
      const tick = () => {
        if (!btn.isConnected) return;
        const remaining = Number(btn.dataset.unlockAt) - Date.now();
        btn.disabled = remaining > 0;
        btn.textContent = remaining > 0 ? `Xóa sau ${Math.ceil(remaining / 1000)} giây` : 'Xóa đơn';
        if (remaining > 0) setTimeout(tick, Math.min(1000, remaining));
      };
      tick();
    }
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.deleteOrder;
      const cat = btn.dataset.orderCat;
      const ord = state.orders.find((o) => o.category === cat && String(o.remoteOrderId) === String(remId));
      let confirmMsg = `Hủy & xóa đơn #${remId} tại nguồn?`;
      if (state.user?.role === 'ctv') {
        if (!ord?.weatherDeleteAt) return;
        confirmMsg = `Xóa đơn Buff Thời Tiết #${remId} và hoàn ${formatVnd(ord.sellPrice)} vào ví của bạn?`;
      } else if (ord?.placedBy?.role === 'ctv') {
        if (ord.status === 'completed') {
          confirmMsg = `Xóa đơn #${remId} đã hoàn thành khỏi hệ thống? (Đơn đã giao đủ nên không hoàn tiền ví CTV.)`;
        } else if (Number(ord.completedCnt || 0) > 0 && Number(ord.totalCnt || 0) > 0) {
          confirmMsg = `Hủy & xóa đơn #${remId} tại nguồn (đã chạy ${ord.completedCnt}/${ord.totalCnt})? Hệ thống sẽ xóa đơn và tự động hoàn phần chưa chạy vào ví CTV "${ord.placedBy.name}".`;
        } else {
          confirmMsg = `Hủy & xóa đơn #${remId} tại nguồn? Sau khi nguồn xóa thành công, đơn sẽ mất khỏi bảng và tự động hoàn lại ${formatVnd(ord.sellPrice)} vào ví CTV "${ord.placedBy.name}".`;
        }
      }
      if (!confirm(confirmMsg)) return;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/orders/${cat}/${remId}`, 'DELETE', {
          deletion_note: 'Xóa đơn từ ebongiu',
        });
        showToast(res.message || 'Đã hủy & xóa đơn hàng');
        if (res.userBalance != null && state.user?.role === 'ctv') {
          state.user.balance = res.userBalance;
          updateShellAuthUI();
        }
        state.orders = state.orders.filter(o => o !== ord);
        await Promise.all([loadOrders(true), loadAdminOverview()]);
        renderCurrentView();
      } catch (err) {
        showToast(`Không thể xóa: ${err.message}`);
        btn.disabled = false;
        if (await loadOrders(true)) renderCurrentView();
      }
    });
  });
}

function renderSyncLoadingHtml(message = 'Đang cập nhật bảng giá từ ebongiu...', sub = 'Đang đồng bộ trạng thái hoạt động và giá gốc mới nhất từ hệ thống để đảm bảo chính xác tuyệt đối.') {
  return `
    <div class="sync-loading-screen">
      <div class="sync-spinner-ring" aria-hidden="true"></div>
      <div class="sync-loading-title">${escapeHtml(message)}</div>
      <div class="sync-loading-sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

// ============================================================================
// 2. MODAL: + THÊM ĐƠN HÀNG (CREATE ORDER DIALOG — LIVE SYNC BEFORE ORDER!)
// ============================================================================
let createOrderModalSeq = 0;
async function openCreateOrderModal(catKey, presetOptions = null) {
  // Check CTV wallet balance first!
  if (state.user.role !== 'admin' && Number(state.user.balance || 0) <= 0) {
    showToast('Số dư ví CTV của bạn là 0đ. Vui lòng nạp tiền vào ví trước khi tạo đơn!');
    return;
  }

  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const mySeq = ++createOrderModalSeq;
  box.className = 'modal-box';
  title.textContent = `+ Thêm mới: ${VIEW_TITLES[catKey] || 'Đơn hàng'}`;
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ ebongiu...');
  overlay.style.display = 'flex';

  // ALWAYS sync ONLY the exact category being opened (2-3 tiny API calls, < 2s typical, hard 6.5s ceiling < 7s!)
  const targetScope =
    presetOptions?.category === 'fruit_by_fruit' || presetOptions?.fruitOrderType === 'by_fruit'
      ? 'fruit_by_fruit'
      : catKey;
  await loadCatalog(true, targetScope, 6500);
  if (mySeq !== createOrderModalSeq || overlay.style.display === 'none' || !state.user) return;

  const r = state.catalogData;
  if (!r || state.catalogWarning) {
    body.innerHTML = `
      <div class="sync-loading-screen" style="padding:28px 16px;">
        <div style="font-size:28px;">⚠️</div>
        <div class="sync-loading-title" style="color:#ab334a;">Không thể cập nhật bảng giá mới nhất từ ebongiu</div>
        <div class="sync-loading-sub">${escapeHtml(state.catalogWarning || 'Hệ thống nguồn tạm thời không phản hồi. Để tránh sai giá, vui lòng thử cập nhật lại trước khi đặt đơn.')}</div>
        <button type="button" class="btn-violet" id="btnRetryModalCatalogSync">↻ Thử cập nhật lại</button>
      </div>
    `;
    body.querySelector('#btnRetryModalCatalogSync')?.addEventListener('click', () => openCreateOrderModal(catKey, presetOptions));
    return;
  }

  state.modalOrder.category = presetOptions?.category || (catKey === 'fruit_coin' ? 'fruit_coin' : catKey);
  state.modalOrder.requestKey = null;
  state.modalOrder.requestSignature = null;
  state.modalOrder.quotedPrice = 0;
  state.modalOrder.fruitOrderType = presetOptions?.fruitOrderType || 'by_coin';
  if (presetOptions?.fruit_item_id) state.modalOrder.fruit_item_id = Number(presetOptions.fruit_item_id);

  const cat = r.catalog || {};
  if (cat.fruit_coin?.length && !cat.fruit_coin.some(p => Number(p.id) === Number(state.modalOrder.coin_price_package_id))) {
    state.modalOrder.coin_price_package_id = cat.fruit_coin[0].id;
  }
  if (cat.buff_tim?.length && catKey === 'buff_tim') {
    state.modalOrder.price_package_id = cat.buff_tim[0].id;
  } else if (cat.buff_sao?.length && catKey === 'buff_sao') {
    state.modalOrder.price_package_id = cat.buff_sao[0].id;
  } else if (cat.guestbook?.length && catKey === 'guestbook') {
    state.modalOrder.price_package_id = cat.guestbook[0].id;
  } else if (cat.weather_buff?.length && catKey === 'weather_buff') {
    state.modalOrder.price_package_id = cat.weather_buff[0].id;
  } else if (catKey === 'mail_gift' && cat.mail_gift?.length) {
    state.modalOrder.gift_id = cat.mail_gift[0].id;
    state.modalOrder.gift_plant_id = cat.mail_gift[0].packages?.[0]?.id || null;
  } else if (catKey === 'farm_gift' && cat.farm_gift?.length) {
    state.modalOrder.gift_id = cat.farm_gift[0].id;
    state.modalOrder.gift_plant_id = cat.farm_gift[0].packages?.[0]?.id || null;
  }

  renderCreateOrderModalBody();
  if (state.modalOrder.category === 'fruit_by_fruit') triggerModalFruitPreview();
}

function renderCreateOrderModalBody() {
  const body = document.getElementById('appModalBody');
  const r = state.catalogData;
  if (!body || !r) return;

  const catKey = state.modalOrder.category;
  const isWorking = !!(r.systemStatus?.[catKey]);
  const cust = state.modalOrder.customer;

  // Build Category Specific Form Controls
  let categoryFormHtml = '';
  const catalog = r.catalog || {};

  if (catKey === 'fruit_coin' || catKey === 'fruit_by_fruit') {
    const isByCoin = state.modalOrder.fruitOrderType === 'by_coin';
    const coinPkgs = catalog.fruit_coin || [];
    const tiers = r.coinTiers || [];
    const fruits = catalog.fruit_by_fruit || [];
    const curFruit = fruits.find((f) => Number(f.id) === Number(state.modalOrder.fruit_item_id)) || fruits[0];
    const availMuts = curFruit?.mutation_prices || [];

    categoryFormHtml = `
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Hình thức đặt đơn Trái cây:</label>
        <div class="order-mode-options">
          <button type="button" class="btn-frost ${isByCoin ? 'is-active' : ''}" id="modalTabByCoin" style="flex:1;">
            🪙 Gửi Xu Nông Trại (Theo Gói)
          </button>
          <button type="button" class="btn-frost ${!isByCoin ? 'is-active' : ''}" id="modalTabByFruit" style="flex:1;">
            🍎 Gửi Trái Cây (Theo Số Lượng & Đột Biến)
          </button>
        </div>
      </div>

      ${
        isByCoin
          ? `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn gói số lượng Xu:</label>
          <div class="pkg-picker-list">
            ${coinPkgs
              .map((p) => {
                const isSel = Number(state.modalOrder.coin_price_package_id) === Number(p.id);
                const tObj = p.prices_by_tier?.[state.modalOrder.min_coin_filter] || p;
                return `
                  <button type="button" aria-pressed="${isSel}" class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-coin-pkg="${p.id}">
                    <span style="display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:var(--color-pure-white);font-size:14px;">${formatNum(p.coin_quantity || p.quantity)} Xu</strong>
                      ${p.is_on_sale ? `<span class="badge-tag amber">Sale</span>` : ''}
                    </span>
                    <span style="display:flex;align-items:baseline;gap:8px;">
                      <span style="font-weight:700;color:#236f60;font-size:15px;">${formatVnd(tObj.total_price)}</span>
                      ${p.is_on_sale ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(tObj.original_price)}</span>` : ''}
                    </span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Lọc giá trị trái tối thiểu:</label>
          <select id="modalCoinTierSelect" class="input-box">
            ${tiers
              .map(
                (t) => `
              <option value="${t.min_coin}" ${Number(state.modalOrder.min_coin_filter) === Number(t.min_coin) ? 'selected' : ''}>
                Trái từ ${formatNum(t.min_coin)} Xu trở lên ${t.markup_percent > 0 ? `(+${t.markup_percent}%)` : '(Mặc định)'} — Kho còn: ${formatNum(t.quantity)} Xu
              </option>
            `
              )
              .join('')}
          </select>
        </div>
      `
          : `
        <div class="fruit-order-fields">
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn loại trái cây (${fruits.length} loại):</label>
            <select id="modalFruitItemSelect" class="input-box">
              ${fruits
                .map(
                  (f) => `
                <option value="${f.id}" ${Number(f.id) === Number(curFruit?.id) ? 'selected' : ''}>
                  ${escapeHtml(f.name)} — Đơn giá: ${formatVnd(f.unit_price)}/trái (Kho: ${formatNum(f.stock_quantity)})
                </option>
              `
                )
                .join('')}
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Số lượng trái:</label>
            <input type="number" id="modalFruitQtyInput" class="input-box" min="1" max="1500" value="${state.modalOrder.fruit_total_cnt}" />
          </div>
        </div>

        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chế độ đột biến:</label>
          <div class="order-mode-options">
            <button type="button" class="btn-frost ${state.modalOrder.fruit_variant_mode === 'regular' ? 'is-active' : ''}" id="modalFruitModeReg" style="flex:1;">
              Chỉ trái thường
            </button>
            <button type="button" class="btn-frost ${state.modalOrder.fruit_variant_mode === 'specify' ? 'is-active' : ''}" id="modalFruitModeSpec" style="flex:1;">
              Chọn hệ đột biến (${state.modalOrder.fruit_mutation_list.length})
            </button>
          </div>
        </div>

        ${
          state.modalOrder.fruit_variant_mode === 'specify'
            ? `
          <div class="mutation-grid">
            ${availMuts
              .map((m) => {
                const isSel = state.modalOrder.fruit_mutation_list.includes(Number(m.mutation_key));
                return `
                  <button type="button" class="mutation-tile ${isSel ? 'is-selected' : ''}" data-modal-mut="${m.mutation_key}">
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <span style="width:8px;height:8px;border-radius:999px;background:${m.mutation_color};"></span>
                      <span>${escapeHtml(m.mutation_name)}</span>
                    </span>
                    <span style="font-size:11px;color:#895d0a;">${formatVnd(m.unit_price)}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        `
            : ''
        }
      `
      }
    `;
  } else if (catKey === 'buff_tim' || catKey === 'buff_sao' || catKey === 'guestbook' || catKey === 'weather_buff') {
    const pkgs = catalog[catKey] || [];
    const unitTxt = catKey === 'buff_tim' ? 'Tim' : catKey === 'buff_sao' ? 'Sao' : catKey === 'weather_buff' ? 'Lần' : 'Bài viết';

    categoryFormHtml = `
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn gói số lượng${catKey === 'weather_buff' ? ' (Buff Thời Tiết)' : ''}:</label>
        ${
          pkgs.length === 0
            ? `<div style="padding:14px;background:rgba(228,109,76,0.14);border-radius:8px;color:#ab334a;">Hiện chưa có gói giá đang mở cho danh mục này.</div>`
            : `
          <div class="pkg-picker-list">
            ${pkgs
              .map((p) => {
                const isSel = Number(state.modalOrder.price_package_id) === Number(p.id);
                return `
                  <button type="button" aria-pressed="${isSel}" class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-std-pkg="${p.id}">
                    <span style="display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:var(--color-pure-white);font-size:14px;">${catKey === 'weather_buff' ? '☁️ ' : ''}${formatNum(p.quantity)} ${unitTxt}</strong>
                      ${p.is_on_sale && p.sale ? `<span class="badge-tag amber">Còn ${p.sale.slots_remaining} slot</span>` : ''}
                    </span>
                    <span style="display:flex;align-items:baseline;gap:8px;">
                      <span style="font-weight:700;color:#236f60;font-size:15px;">${formatVnd(p.total_price)}</span>
                      ${p.is_on_sale ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(p.original_price)}</span>` : ''}
                    </span>
                  </button>
                `;
              })
              .join('')}
          </div>
        `
        }
      </div>
      ${
        catKey === 'guestbook'
          ? `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Nội dung bài viết lưu bút (*):</label>
          <input type="text" id="modalGuestbookMsgInput" class="input-box" maxlength="100" value="${escapeHtml(state.modalOrder.guest_book_message)}" placeholder="Nhập lời nhắn lưu bút..." />
        </div>
      `
          : ''
      }
    `;
  } else if (catKey === 'farm_gift' || catKey === 'mail_gift') {
    const gifts = catalog[catKey] || [];
    if (gifts.length === 0) {
      categoryFormHtml = `
        <div style="padding:16px;background:rgba(228,109,76,0.14);border-radius:10px;color:#ab334a;">
          Hiện tại danh mục <strong>${escapeHtml(VIEW_TITLES[catKey])}</strong> không có vật phẩm nào đang mở bán trên máy chủ.
        </div>
      `;
    } else {
      const curGift = gifts.find((g) => Number(g.id) === Number(state.modalOrder.gift_id)) || gifts[0];
      const pkgs = curGift?.packages || [];
      categoryFormHtml = `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn quà tặng:</label>
          <select id="modalGiftSelect" class="input-box">
            ${gifts
              .map(
                (g) => `<option value="${g.id}" ${Number(g.id) === Number(curGift?.id) ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="pkg-picker-list">
          ${pkgs
            .map((p) => {
              const isSel = Number(state.modalOrder.gift_plant_id) === Number(p.id);
              return `
                <div class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-gift-pkg="${p.id}">
                  <strong style="color:var(--color-pure-white);">Số lượng: ${formatNum(p.quantity)}</strong>
                  <span style="font-weight:700;color:#236f60;">${formatVnd(p.total_price)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }
  } else {
    categoryFormHtml = `
      <div style="padding:16px;background:rgba(228,109,76,0.14);border-radius:10px;color:#ab334a;">
        Danh mục này hiện đang tạm ngưng nhận đơn mới.
      </div>
    `;
  }

  body.innerHTML = `
    ${
      !isWorking
        ? `
      <div style="padding:12px 14px;background:rgba(228,109,76,0.18);border-radius:8px;color:#ab334a;font-size:13px;">
        ⚠️ Hệ thống chạy đơn <strong>${escapeHtml(VIEW_TITLES[catKey])}</strong> hiện đang ở trạng thái <strong>Không hoạt động</strong> trên máy chủ.
      </div>
    `
        : ''
    }

    ${
      catKey === 'weather_buff'
        ? `
      <div style="padding:11px 14px;background:rgba(139,92,246,0.14);border-radius:10px;border:1px solid rgba(167,139,250,0.3);color:#723651;font-size:12.5px;line-height:1.55;">
        ☁️ <strong>Quy tắc Buff Thời Tiết:</strong> Chọn gói số lần và bấm <strong>Xác Nhận</strong> để tạo đơn trước (chưa cần chọn khách ngay lúc này). Sau khi tạo xong, bấm <strong>👤 Gán khách</strong> và <strong>☁️ Chọn thời tiết</strong> trên bảng đơn rồi bật chạy!
      </div>
    `
        : `
      <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:12px;box-shadow:var(--shadow-subtle);display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <strong style="color:var(--color-pure-white);font-size:13px;">1. Chọn khách hàng Play Together</strong>
          <div class="action-row">
            <button type="button" class="btn-frost ${state.modalOrder.customerTab === 'ingame' ? 'is-active' : ''}" data-mcust-tab="ingame" style="padding:4px 10px;font-size:11px;">
              Tìm theo Tên (Trong Game)
            </button>
            <button type="button" class="btn-frost ${state.modalOrder.customerTab === 'roleid' ? 'is-active' : ''}" data-mcust-tab="roleid" style="padding:4px 10px;font-size:11px;">
              Theo Role ID
            </button>
            ${state.user.role === 'admin' ? `<button type="button" class="btn-frost ${state.modalOrder.customerTab === 'saved' ? 'is-active' : ''}" data-mcust-tab="saved" style="padding:4px 10px;font-size:11px;">
              Khách đã lưu
            </button>` : ''}
          </div>
        </div>

        ${
          cust
            ? `
          <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;background:rgba(102,58,243,0.18);padding:10px 14px;border-radius:8px;box-shadow:rgba(156,127,249,0.5) 0 0 0 1px inset;">
            <div>
              <div style="font-weight:600;color:var(--color-pure-white);font-size:14px;">✓ ${escapeHtml(cust.nickname)}</div>
              <div style="font-size:11px;color:var(--color-moon-mist);">SUID: ${escapeHtml(cust.suid || '—')} ${cust.region ? `· ${escapeHtml(cust.region)}` : ''}</div>
            </div>
            <button type="button" class="btn-frost" id="btnModalClearCust" style="padding:4px 10px;font-size:11px;">Đổi khách</button>
          </div>
        `
            : `
          <div style="display:flex;gap:8px;">
            <input
              type="text"
              id="modalCustSearchInput"
              class="input-box"
              placeholder="${
                state.modalOrder.customerTab === 'ingame'
                  ? 'Nhập tên nhân vật cần tìm trong game...'
                  : state.modalOrder.customerTab === 'roleid'
                  ? 'Nhập mã Role ID (XXXX-XXXX-XXXX)...'
                  : 'Nhập tên hoặc SUID khách quen...'
              }"
            />
            <button type="button" class="btn-violet" id="btnModalSearchCust">Tìm</button>
          </div>
          <div id="modalCustSearchStatus" style="font-size:12px;color:var(--color-fog-veil);"></div>
          <div id="modalCustSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;"></div>
        `
        }
      </div>
    `
    }

    <div style="display:flex;flex-direction:column;gap:12px;">
      ${categoryFormHtml}
    </div>

    <div style="background:#ffeff5;padding:14px 16px;border-radius:10px;box-shadow:var(--shadow-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng tiền thanh toán:</div>
        <div style="font-size:22px;font-weight:700;color:#895d0a;" id="modalTotalPriceText">0đ</div>
      </div>
      <div class="action-row order-submit-actions">
        <button type="button" class="btn-frost" id="btnModalCancel">Hủy</button>
        <button type="button" class="btn-violet" id="btnModalSaveOrder" ${!isWorking ? 'disabled' : ''}>
          ${catKey === 'weather_buff' ? 'Xác Nhận Tạo Gói →' : 'Lưu & Chạy Đơn Hàng →'}
        </button>
      </div>
    </div>
  `;

  bindCreateOrderModalEvents();
  updateCreateOrderModalPrice();
}

function bindCreateOrderModalEvents() {
  const body = document.getElementById('appModalBody');
  if (!body) return;

  body.querySelectorAll('[data-mcust-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.modalOrder.customerTab = btn.dataset.mcustTab;
      renderCreateOrderModalBody();
      if (state.modalOrder.customerTab === 'saved') {
        runModalCustomerSearch();
      }
    });
  });

  body.querySelector('#btnModalClearCust')?.addEventListener('click', () => {
    state.modalOrder.customer = null;
    renderCreateOrderModalBody();
  });

  body.querySelector('#btnModalSearchCust')?.addEventListener('click', runModalCustomerSearch);
  body.querySelector('#modalCustSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runModalCustomerSearch();
    }
  });

  // Fruit Order Type Tabs (by_coin vs by_fruit)
  body.querySelector('#modalTabByCoin')?.addEventListener('click', () => {
    state.modalOrder.fruitOrderType = 'by_coin';
    state.modalOrder.category = 'fruit_coin';
    renderCreateOrderModalBody();
  });
  body.querySelector('#modalTabByFruit')?.addEventListener('click', async () => {
    state.modalOrder.fruitOrderType = 'by_fruit';
    state.modalOrder.category = 'fruit_by_fruit';
    const lastFruitSync = state.lastScopeSyncAt?.fruit_by_fruit || 0;
    const hasFruits = (state.catalogData?.catalog?.fruit_by_fruit || []).length > 0;
    if (!hasFruits || Date.now() - lastFruitSync > 30000) {
      body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá Trái cây từ ebongiu...', 'Đang lấy tồn kho & đơn giá trái cây mới nhất.');
      await loadCatalog(true, 'fruit_by_fruit', 6500);
      const overlay = document.getElementById('appModalOverlay');
      if (!overlay || overlay.style.display === 'none') return;
    }
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });

  // Coin Package & Tier selection
  body.querySelectorAll('[data-modal-coin-pkg]').forEach((card) => {
    card.addEventListener('click', () => {
      state.modalOrder.coin_price_package_id = Number(card.dataset.modalCoinPkg);
      renderCreateOrderModalBody();
    });
  });
  body.querySelector('#modalCoinTierSelect')?.addEventListener('change', (e) => {
    state.modalOrder.min_coin_filter = Number(e.target.value);
    renderCreateOrderModalBody();
  });

  // By Fruit controls
  body.querySelector('#modalFruitItemSelect')?.addEventListener('change', (e) => {
    state.modalOrder.fruit_item_id = Number(e.target.value);
    state.modalOrder.fruit_mutation_list = [];
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });
  body.querySelector('#modalFruitQtyInput')?.addEventListener('input', (e) => {
    state.modalOrder.fruit_total_cnt = Math.max(1, Number(e.target.value || 1));
    triggerModalFruitPreview();
  });
  body.querySelector('#modalFruitModeReg')?.addEventListener('click', () => {
    state.modalOrder.fruit_variant_mode = 'regular';
    state.modalOrder.fruit_mutation_list = [];
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });
  body.querySelector('#modalFruitModeSpec')?.addEventListener('click', () => {
    state.modalOrder.fruit_variant_mode = 'specify';
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });
  body.querySelectorAll('[data-modal-mut]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = Number(btn.dataset.modalMut);
      const idx = state.modalOrder.fruit_mutation_list.indexOf(k);
      if (idx >= 0) state.modalOrder.fruit_mutation_list.splice(idx, 1);
      else state.modalOrder.fruit_mutation_list.push(k);
      renderCreateOrderModalBody();
      triggerModalFruitPreview();
    });
  });

  // Standard packages (Buff Tim, Buff Sao, Guestbook)
  body.querySelectorAll('[data-modal-std-pkg]').forEach((card) => {
    card.addEventListener('click', () => {
      state.modalOrder.price_package_id = Number(card.dataset.modalStdPkg);
      renderCreateOrderModalBody();
    });
  });
  body.querySelector('#modalGuestbookMsgInput')?.addEventListener('input', (e) => {
    state.modalOrder.guest_book_message = e.target.value;
  });

  // Gift packages
  body.querySelector('#modalGiftSelect')?.addEventListener('change', (e) => {
    const gid = Number(e.target.value);
    state.modalOrder.gift_id = gid;
    const gList = state.catalogData?.catalog?.[state.modalOrder.category] || [];
    const gObj = gList.find((x) => Number(x.id) === gid);
    state.modalOrder.gift_plant_id = gObj?.packages?.[0]?.id || null;
    renderCreateOrderModalBody();
  });
  body.querySelectorAll('[data-modal-gift-pkg]').forEach((card) => {
    card.addEventListener('click', () => {
      state.modalOrder.gift_plant_id = Number(card.dataset.modalGiftPkg);
      renderCreateOrderModalBody();
    });
  });

  body.querySelector('#btnModalCancel')?.addEventListener('click', () => {
    document.getElementById('appModalOverlay').style.display = 'none';
  });
  body.querySelector('#btnModalSaveOrder')?.addEventListener('click', () => {
    submitModalOrder(false);
  });
}

function estimateFruitOrderPriceLocally(fruitItem, qty, muts) {
  if (!fruitItem) return 0;
  const base = Number(fruitItem.unit_price || 0);
  const cleanQty = Math.max(1, Math.floor(Number(qty || 1)));
  const orderFee = Number(state.catalogData?.fruitOrderFee ?? 0);
  if (!muts || muts.length === 0) return cleanQty * base + orderFee;
  let sumMut = 0;
  for (const mk of muts) {
    const m = (fruitItem.mutation_prices || []).find(x => Number(x.mutation_key) === Number(mk));
    sumMut += Number(m?.unit_price ?? base);
  }
  const combined = Math.max(base, sumMut - (muts.length - 1) * base);
  return cleanQty * combined + orderFee;
}

let modalPreviewTimer = null;
function triggerModalFruitPreview() {
  if (modalPreviewTimer && typeof clearTimeout === 'function') clearTimeout(modalPreviewTimer);
  state.modalOrder.fruit_preview_price = 0;
  state.modalOrder.quotedPrice = 0;
  const muts = state.modalOrder.fruit_variant_mode === 'specify' ? state.modalOrder.fruit_mutation_list : [];
  const signature = JSON.stringify([state.modalOrder.fruit_item_id, state.modalOrder.fruit_total_cnt, state.modalOrder.fruit_variant_mode, state.modalOrder.fruit_mutation_list]);
  const priceEl = document.getElementById('modalTotalPriceText');
  const fi = (state.catalogData?.catalog?.fruit_by_fruit || []).find(f => Number(f.id) === Number(state.modalOrder.fruit_item_id));
  const localEst = estimateFruitOrderPriceLocally(fi, state.modalOrder.fruit_total_cnt, muts);
  if (priceEl) priceEl.textContent = localEst > 0 ? `~${formatVnd(localEst)}` : 'Đang tính...';

  modalPreviewTimer = setTimeout(async () => {
    try {
      const r = await apiFetch('/api/catalog/preview-fruit', 'POST', {
        fruit_item_id: state.modalOrder.fruit_item_id,
        total_cnt: state.modalOrder.fruit_total_cnt,
        mutation_list: muts,
      });
      const currentSignature = JSON.stringify([state.modalOrder.fruit_item_id, state.modalOrder.fruit_total_cnt, state.modalOrder.fruit_variant_mode, state.modalOrder.fruit_mutation_list]);
      if (r.success && r.data && signature === currentSignature) {
        state.modalOrder.fruit_preview_price = r.data.total_price;
        state.modalOrder.fruit_preview_admin = r.data._admin || null;
        updateCreateOrderModalPrice();
      }
    } catch {
      if (priceEl) priceEl.textContent = 'Lỗi tính giá';
    }
  }, 150);
}

function updateCreateOrderModalPrice() {
  const priceEl = document.getElementById('modalTotalPriceText');
  if (!priceEl || !state.catalogData) return;

  const cat = state.modalOrder.category;
  const catalog = state.catalogData.catalog || {};
  let price = 0;

  if (cat === 'fruit_coin') {
    const pkg = (catalog.fruit_coin || []).find(
      (p) => Number(p.id) === Number(state.modalOrder.coin_price_package_id)
    );
    const tObj = pkg?.prices_by_tier?.[state.modalOrder.min_coin_filter] || pkg;
    price = tObj?.total_price || 0;
  } else if (cat === 'fruit_by_fruit') {
    price = state.modalOrder.fruit_preview_price || 0;
  } else if (cat === 'buff_tim' || cat === 'buff_sao' || cat === 'guestbook' || cat === 'weather_buff') {
    const pkg = (catalog[cat] || []).find((p) => Number(p.id) === Number(state.modalOrder.price_package_id));
    price = pkg?.total_price || 0;
  } else if (cat === 'farm_gift' || cat === 'mail_gift') {
    const gObj = (catalog[cat] || []).find((g) => Number(g.id) === Number(state.modalOrder.gift_id));
    const pObj = (gObj?.packages || []).find((p) => Number(p.id) === Number(state.modalOrder.gift_plant_id));
    price = pObj?.total_price || 0;
  }

  priceEl.textContent = formatVnd(price);
  state.modalOrder.quotedPrice = Number(price);
}

async function runModalCustomerSearch() {
  const input = document.getElementById('modalCustSearchInput');
  const statusEl = document.getElementById('modalCustSearchStatus');
  const resultsEl = document.getElementById('modalCustSearchResults');
  if (!statusEl || !resultsEl) return;

  const q = String(input?.value || '').trim();
  const mode = state.modalOrder.customerTab;

  if (mode === 'ingame') {
    if (!q) {
      showToast('Vui lòng nhập tên nhân vật cần tìm.');
      return;
    }
    statusEl.textContent = '⏳ Đang kết nối máy chủ Play Together tìm nhân vật...';
    resultsEl.innerHTML = '';
    try {
      const r = await apiFetch('/api/customer/search-ingame', 'POST', { nickname: q });
      const list = r.profiles || [];
      statusEl.textContent = `Tìm thấy ${list.length} kết quả:`;
      resultsEl.innerHTML = list
        .map(
          (p, i) => `
          <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
            <div>
              <strong style="color:var(--color-pure-white);">${escapeHtml(p.Nickname)}</strong>
              <span class="badge-tag violet" style="margin-left:6px;">${escapeHtml(p.RegionName || p.Region || 'VN')}</span>
              <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(p.suid)} · ${escapeHtml(p.Online_Status || '')}</div>
            </div>
            <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-pick-ingame="${i}">Chọn</button>
          </div>
        `
        )
        .join('');

      resultsEl.querySelectorAll('[data-pick-ingame]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const prof = list[Number(btn.dataset.pickIngame)];
          btn.disabled = true;
          btn.textContent = 'Đang lưu...';
          try {
            const sel = await apiFetch('/api/customer/select-ingame', 'POST', { profile: prof });
            if (sel.success && sel.customer) {
              state.modalOrder.customer = sel.customer;
              renderCreateOrderModalBody();
            }
          } catch (err) {
            showToast(err.message);
            btn.disabled = false;
            btn.textContent = 'Chọn';
          }
        });
      });
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  } else if (mode === 'roleid') {
    if (!q) {
      showToast('Vui lòng nhập Role ID.');
      return;
    }
    statusEl.textContent = '⏳ Đang kiểm tra Role ID...';
    try {
      const r = await apiFetch('/api/customer/resolve-role-id', 'POST', { role_id: q });
      if (r.success && r.customer) {
        state.modalOrder.customer = r.customer;
        renderCreateOrderModalBody();
      }
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  } else if (mode === 'saved') {
    statusEl.textContent = '⏳ Đang tải danh sách khách hàng...';
    try {
      const r = await apiFetch(`/api/customer/saved?q=${encodeURIComponent(q)}`);
      const list = r.customers || [];
      statusEl.textContent = `Hiển thị ${list.length} khách hàng:`;
      resultsEl.innerHTML = list
        .map(
          (c) => `
          <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
            <div>
              <strong style="color:var(--color-pure-white);">${escapeHtml(c.nickname || `Khách #${c.id}`)}</strong>
              <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(c.suid || '—')}</div>
            </div>
            <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-pick-saved="${c.id}">Chọn</button>
          </div>
        `
        )
        .join('');

      resultsEl.querySelectorAll('[data-pick-saved]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const det = await apiFetch(`/api/customer/saved/${btn.dataset.pickSaved}`);
            if (det.success && det.customer) {
              state.modalOrder.customer = det.customer;
              renderCreateOrderModalBody();
            }
          } catch (err) {
            showToast(err.message);
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  }
}

async function submitModalOrder(confirmDuplicate = false) {
  const m = state.modalOrder;
  const isWeather = m.category === 'weather_buff';
  if (!isWeather && !m.customer?.customerId) {
    showToast('Vui lòng tìm và chọn khách hàng trước khi lưu đơn!');
    return;
  }
  if (!Number.isSafeInteger(m.quotedPrice) || m.quotedPrice <= 0) {
    showToast('Vui lòng đợi giá hợp lệ trước khi đặt đơn.');
    return;
  }

  const payload = {
    category: m.category,
    customer_id: isWeather ? null : m.customer.customerId,
    game_profile_id: isWeather ? null : m.customer.gameProfileId,
    customer_snapshot: isWeather ? null : m.customer,
    confirm_duplicate_customer: confirmDuplicate,
    expected_price: m.quotedPrice,
  };

  if (m.category === 'fruit_coin') {
    payload.coin_price_package_id = m.coin_price_package_id;
    payload.min_coin_filter = m.min_coin_filter;
  } else if (m.category === 'fruit_by_fruit') {
    payload.fruit_item_id = m.fruit_item_id;
    payload.total_cnt = m.fruit_total_cnt;
    payload.variant_mode = 'select';
    payload.mutation_list = m.fruit_variant_mode === 'specify' ? m.fruit_mutation_list : [];
  } else if (m.category === 'buff_tim' || m.category === 'buff_sao' || m.category === 'guestbook' || m.category === 'weather_buff') {
    payload.price_package_id = m.price_package_id;
    payload.expect_sale = true;
    if (m.category === 'guestbook') {
      payload.guest_book_message = m.guest_book_message;
    }
  } else if (m.category === 'farm_gift' || m.category === 'mail_gift') {
    payload.gift_id = m.gift_id;
    payload.gift_plant_id = m.gift_plant_id;
    payload.message = m.mail_message;
    payload.expect_sale = true;
  }

  const btn = document.getElementById('btnModalSaveOrder');
  const signature = JSON.stringify(payload);
  if (m.requestSignature !== signature) {
    m.requestSignature = signature;
    m.requestKey = createRequestKey();
  }
  payload.idempotency_key = m.requestKey;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang xác thực giá & gửi đơn...';
  }

  try {
    const r = await apiFetch('/api/orders/place', 'POST', payload);
    if (r.needs_confirmation && r.code === 'duplicate_customer') {
      if (
        confirm(
          `Khách hàng "${m.customer.nickname}" hiện đang có đơn hàng đang chạy. Bạn có chắc chắn muốn tạo thêm đơn mới không?`
        )
      ) {
        await submitModalOrder(true);
      } else if (btn) {
        btn.disabled = false;
        btn.textContent = isWeather ? 'Xác Nhận Tạo Gói →' : 'Lưu & Chạy Đơn Hàng →';
      }
      return;
    }

    if (r.success) {
      showToast(r.message || 'Tạo đơn hàng thành công!');
      if (r.userBalance !== undefined && state.user) {
        state.user.balance = r.userBalance;
        updateShellAuthUI();
      }
      const wbUrl = isWeather ? r.order?.weather?.trackUrl : '';
      if (isWeather && wbUrl) {
        const title = document.getElementById('appModalTitle');
        const body = document.getElementById('appModalBody');
        if (title) title.textContent = `✓ Đã tạo đơn Buff Thời Tiết #${r.order?.remoteOrderId || ''}`;
        if (body) {
          body.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="font-size:13px;color:var(--color-moon-mist);line-height:1.6;">
                Đơn gói <strong>${formatNum(r.order?.totalCnt || 0)} lần</strong> đã tạo thành công! Gửi link theo dõi bên dưới cho khách tự chọn nhân vật & thời tiết, hoặc chỉnh trực tiếp trên bảng đơn:
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <input type="text" class="input-box" id="createdWbLinkInput" readonly value="${escapeHtml(wbUrl)}" />
                <button type="button" class="btn-violet" id="btnCopyCreatedWbLink" style="white-space:nowrap;">📋 Copy link</button>
              </div>
              <div class="action-row align-end">
                <a href="${escapeHtml(wbUrl)}" target="_blank" rel="noopener noreferrer" class="btn-frost" style="text-decoration:none;">↗ Mở link</a>
                <button type="button" class="btn-violet" id="btnDoneCreatedWb">Xong</button>
              </div>
            </div>
          `;
          body.querySelector('#btnCopyCreatedWbLink')?.addEventListener('click', async (ev) => {
            const ok = await copyTextToClipboard(wbUrl);
            if (ok) {
              showToast('Đã copy link theo dõi thời tiết!');
              ev.currentTarget.textContent = '✓ Đã copy';
            }
          });
          body.querySelector('#btnDoneCreatedWb')?.addEventListener('click', () => {
            document.getElementById('appModalOverlay').style.display = 'none';
          });
        }
      } else {
        document.getElementById('appModalOverlay').style.display = 'none';
      }
      await loadOrders(true);
      renderCurrentView();
    }
  } catch (err) {
    showToast(err.message);
    if (err.code === 'PRICE_CHANGED') {
      await loadCatalog(true, m.category, 6500);
      if (m.category === 'fruit_by_fruit') triggerModalFruitPreview();
      else renderCreateOrderModalBody();
    }
    if (err.code === 'ORDER_REVIEW_REQUIRED') {
      const current = await apiFetch('/api/auth/me').catch(() => null);
      if (current?.user) { state.user = current.user; updateShellAuthUI(); }
      if (btn) { btn.disabled = true; btn.textContent = 'Chờ admin đối soát'; }
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = isWeather ? 'Xác Nhận Tạo Gói →' : 'Lưu & Chạy Đơn Hàng →';
    }
  }
}

// ============================================================================
// 2B. WEATHER BUFF MODALS: ASSIGN/CHANGE CUSTOMER SLOT & CONFIGURE WEATHERS
// ============================================================================
function openWeatherSlotModal(order) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  let tab = 'ingame';
  const remId = order.remoteOrderId;
  const hasCust = Boolean(order.customer?.customerId || order.weather?.slots?.some(s => s.customer_id || s.customer));
  const canClear = hasCust && !order.weather?.remoteRef && !order.isActive && Number(order.completedCnt || 0) === 0;

  box.className = 'modal-box';
  title.textContent = `${hasCust ? '✏️ Đổi khách hàng' : '👤 Gán khách hàng'} — Đơn Buff Thời Tiết #${remId}`;

  const renderSlotBody = () => {
    body.innerHTML = `
      ${
        hasCust
          ? `
        <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:rgba(102,58,243,0.16);border-radius:10px;border:1px solid rgba(167,139,250,0.35);">
          <div>
            <div style="font-size:11px;color:var(--color-moon-mist);">Khách hiện tại:</div>
            <div style="font-weight:600;color:var(--color-pure-white);">${escapeHtml(order.customer?.nickname || '—')} <span style="font-weight:400;font-size:11px;color:var(--color-fog-veil);">(SUID: ${escapeHtml(order.customer?.suid || '—')})</span></div>
          </div>
          ${canClear ? `<button type="button" class="btn-frost" id="btnWbClearSlot" style="color:#ab334a;font-size:11px;padding:5px 10px;">🗑️ Gỡ khách</button>` : ''}
        </div>
      `
          : ''
      }
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn-frost ${tab === 'ingame' ? 'is-active' : ''}" data-wb-cust-tab="ingame" style="padding:5px 11px;font-size:12px;">Tìm theo Tên (Trong Game)</button>
        <button type="button" class="btn-frost ${tab === 'roleid' ? 'is-active' : ''}" data-wb-cust-tab="roleid" style="padding:5px 11px;font-size:12px;">Theo Role ID</button>
        ${state.user?.role === 'admin' ? `<button type="button" class="btn-frost ${tab === 'saved' ? 'is-active' : ''}" data-wb-cust-tab="saved" style="padding:5px 11px;font-size:12px;">Khách đã lưu</button>` : ''}
      </div>
      <div style="display:flex;gap:8px;">
        <input type="text" id="wbCustSearchInput" class="input-box" placeholder="${tab === 'ingame' ? 'Nhập tên nhân vật trong game...' : tab === 'roleid' ? 'Nhập Role ID (XXXX-XXXX-XXXX)...' : 'Nhập tên hoặc SUID khách quen...'}" />
        <button type="button" class="btn-violet" id="btnWbCustSearch">Tìm</button>
      </div>
      <div id="wbCustSearchStatus" style="font-size:12px;color:var(--color-fog-veil);"></div>
      <div id="wbCustSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;"></div>
    `;

    const assignCustomerId = async (customerId) => {
      const stEl = body.querySelector('#wbCustSearchStatus');
      if (stEl) stEl.textContent = '⏳ Đang gán khách vào đơn Buff Thời Tiết...';
      try {
        const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/slots/0`, 'PUT', {
          customer_id: Number(customerId),
        });
        showToast(res.message || 'Đã gán khách hàng thành công!');
        overlay.style.display = 'none';
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
        if (stEl) stEl.textContent = `Lỗi: ${err.message}`;
      }
    };

    const runSearch = async () => {
      const q = String(body.querySelector('#wbCustSearchInput')?.value || '').trim();
      const stEl = body.querySelector('#wbCustSearchStatus');
      const resEl = body.querySelector('#wbCustSearchResults');
      if (!stEl || !resEl) return;

      if (tab === 'ingame') {
        if (!q) { showToast('Vui lòng nhập tên nhân vật cần tìm.'); return; }
        stEl.textContent = '⏳ Đang tìm nhân vật trong game...';
        resEl.innerHTML = '';
        try {
          const r = await apiFetch('/api/customer/search-ingame', 'POST', { nickname: q });
          const list = r.profiles || [];
          stEl.textContent = `Tìm thấy ${list.length} nhân vật:`;
          resEl.innerHTML = list.map((p, i) => `
            <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
              <div>
                <strong style="color:var(--color-pure-white);">${escapeHtml(p.Nickname)}</strong>
                <span class="badge-tag violet" style="margin-left:6px;">${escapeHtml(p.RegionName || p.Region || 'VN')}</span>
                <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(p.suid)} · ${escapeHtml(p.Online_Status || '')}</div>
              </div>
              <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-wb-pick-ingame="${i}">Gán khách</button>
            </div>
          `).join('');
          resEl.querySelectorAll('[data-wb-pick-ingame]').forEach((b) => {
            b.addEventListener('click', async () => {
              const prof = list[Number(b.dataset.wbPickIngame)];
              b.disabled = true;
              b.textContent = 'Đang gán...';
              try {
                const sel = await apiFetch('/api/customer/select-ingame', 'POST', { profile: prof });
                if (sel.success && sel.customer?.customerId) {
                  await assignCustomerId(sel.customer.customerId);
                }
              } catch (err) {
                showToast(err.message);
                b.disabled = false;
                b.textContent = 'Gán khách';
              }
            });
          });
        } catch (err) {
          stEl.textContent = `Lỗi: ${err.message}`;
        }
      } else if (tab === 'roleid') {
        if (!q) { showToast('Vui lòng nhập Role ID.'); return; }
        stEl.textContent = '⏳ Đang kiểm tra Role ID...';
        try {
          const r = await apiFetch('/api/customer/resolve-role-id', 'POST', { role_id: q });
          if (r.success && r.customer?.customerId) {
            await assignCustomerId(r.customer.customerId);
          }
        } catch (err) {
          stEl.textContent = `Lỗi: ${err.message}`;
        }
      } else if (tab === 'saved') {
        stEl.textContent = '⏳ Đang tải danh sách khách hàng...';
        try {
          const r = await apiFetch(`/api/customer/saved?q=${encodeURIComponent(q)}`);
          const list = r.customers || [];
          stEl.textContent = `Hiển thị ${list.length} khách hàng:`;
          resEl.innerHTML = list.map((c) => `
            <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
              <div>
                <strong style="color:var(--color-pure-white);">${escapeHtml(c.nickname || `Khách #${c.id}`)}</strong>
                <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(c.suid || '—')}</div>
              </div>
              <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-wb-pick-saved="${c.id}">Gán khách</button>
            </div>
          `).join('');
          resEl.querySelectorAll('[data-wb-pick-saved]').forEach((b) => {
            b.addEventListener('click', async () => {
              b.disabled = true;
              b.textContent = 'Đang gán...';
              await assignCustomerId(Number(b.dataset.wbPickSaved));
            });
          });
        } catch (err) {
          stEl.textContent = `Lỗi: ${err.message}`;
        }
      }
    };

    body.querySelectorAll('[data-wb-cust-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        tab = b.dataset.wbCustTab;
        renderSlotBody();
        if (tab === 'saved') runSearch();
      });
    });
    body.querySelector('#btnWbCustSearch')?.addEventListener('click', runSearch);
    body.querySelector('#wbCustSearchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });
    body.querySelector('#btnWbClearSlot')?.addEventListener('click', async () => {
      if (!confirm('Gỡ khách hàng khỏi đơn Buff Thời Tiết này?')) return;
      try {
        const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/slots/0`, 'DELETE');
        showToast(res.message || 'Đã gỡ khách hàng khỏi đơn.');
        overlay.style.display = 'none';
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
      }
    });
  };

  overlay.style.display = 'flex';
  renderSlotBody();
}

async function openWeatherConfigModal(order) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const remId = order.remoteOrderId;
  box.className = 'modal-box';
  title.textContent = `☁️ Chọn loại thời tiết — Đơn #${remId}`;
  overlay.style.display = 'flex';

  if (!Array.isArray(state.catalogData?.catalog?.weather_buff_types) || state.catalogData.catalog.weather_buff_types.length === 0) {
    body.innerHTML = renderSyncLoadingHtml('Đang tải danh sách thời tiết từ ebongiu...', 'Đang đồng bộ các loại thời tiết đang hỗ trợ.');
    await loadCatalog(true, 'weather_buff', 6500);
    if (overlay.style.display === 'none') return;
  }

  const activeTypes = state.catalogData?.catalog?.weather_buff_types || [];
  if (activeTypes.length === 0) {
    body.innerHTML = `<div style="padding:16px;color:#ab334a;">Không tải được danh sách loại thời tiết. Vui lòng thử làm mới dữ liệu.</div>`;
    return;
  }

  const pkgQty = Math.max(1, Number(order.weather?.packageQuantity || order.totalCnt || 1));
  const isLockedMode = Boolean(
    order.isActive ||
    order.weather?.remoteRef ||
    order.status === 'assigned' ||
    order.status === 'completed' ||
    (order.weather?.weathers || []).some(w => Number(w.completed_cnt || 0) > 0) ||
    order.weather?.casting
  );

  // Build draft rows following HoanNguyen's exact split rule for partially completed weather lines
  let seq = 1;
  const draft = [];
  for (const w of (order.weather?.weathers || [])) {
    const qty = Math.max(1, Number(w.quantity || 1));
    const done = Math.max(0, Number(w.completed_cnt || 0));
    if (isLockedMode && done > 0 && done < qty) {
      draft.push({ key: `d-${seq++}`, id: w.id || null, weather_type_id: w.weather_type_id, name: w.name, icon: w.icon, quantity: done, completed_cnt: done, locked: true });
      draft.push({ key: `d-${seq++}`, id: null, weather_type_id: w.weather_type_id, name: w.name, icon: w.icon, quantity: qty - done, completed_cnt: 0, locked: false });
    } else {
      draft.push({ key: `d-${seq++}`, id: w.id || null, weather_type_id: w.weather_type_id, name: w.name, icon: w.icon, quantity: Math.max(qty, done), completed_cnt: done, locked: done > 0 });
    }
  }

  let selectedTypeId = activeTypes[0].id;
  let addQty = Math.max(1, pkgQty - draft.reduce((s, d) => s + d.quantity, 0));

  const renderConfigBody = () => {
    const totalUsed = draft.reduce((s, d) => s + Number(d.quantity || 0), 0);
    const remaining = Math.max(0, pkgQty - totalUsed);
    const isOver = totalUsed > pkgQty;
    if (addQty > remaining && remaining > 0) addQty = remaining;

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;border-radius:10px;background:${isOver ? 'rgba(239,68,68,0.16)' : 'rgba(16,185,129,0.12)'};border:1px solid ${isOver ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.3)'};">
        <div style="font-size:13px;color:var(--color-pure-white);">
          Gói đã mua: <strong>${formatNum(pkgQty)} lần</strong> · Đã chọn: <strong style="color:${isOver ? '#ab334a' : '#28754e'};">${formatNum(totalUsed)}</strong> / ${formatNum(pkgQty)}
        </div>
        <div style="font-size:12px;color:${isOver ? '#ab334a' : 'var(--color-moon-mist)'};">
          ${isOver ? `Vượt gói ${formatNum(totalUsed - pkgQty)} lần!` : `Còn trống: ${formatNum(remaining)} lần`}
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:12px;color:var(--color-moon-mist);font-weight:600;">Thêm loại thời tiết vào danh sách chạy:</div>
        <div class="weather-add-fields">
          <select id="wbTypeSelect" class="input-box">
            ${activeTypes.map(t => `<option value="${t.id}" ${Number(t.id) === Number(selectedTypeId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
          </select>
          <input type="number" id="wbAddQtyInput" class="input-box" min="1" max="${Math.max(1, remaining)}" value="${Math.max(1, addQty)}" />
          <button type="button" class="btn-violet" id="btnWbAddLine" ${remaining <= 0 ? 'disabled' : ''}>+ Thêm</button>
        </div>
        ${
          remaining > 0
            ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${[1, 5, 10, 50].filter(n => n <= remaining).map(n => `<button type="button" class="btn-frost" style="padding:3px 9px;font-size:11px;" data-wb-quick-qty="${n}">${n} lần</button>`).join('')}
                <button type="button" class="btn-frost" style="padding:3px 9px;font-size:11px;color:#236f60;" data-wb-quick-qty="${remaining}">Điền hết (${formatNum(remaining)} lần)</button>
              </div>`
            : ''
        }
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;">
        ${
          draft.length === 0
            ? `<div style="text-align:center;padding:20px;color:var(--color-fog-veil);font-size:12.5px;">Chưa chọn loại thời tiết nào. Hãy chọn loại thời tiết và bấm <strong>+ Thêm</strong> ở trên.</div>`
            : draft.map((line, idx) => `
              <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:rgba(255,255,255,0.04);border-radius:9px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  ${line.icon ? `<img src="${escapeHtml(line.icon)}" alt="" style="width:22px;height:22px;object-fit:contain;" />` : '<span>☁️</span>'}
                  <div>
                    <div style="font-weight:600;color:var(--color-pure-white);font-size:13px;">${escapeHtml(line.name)}</div>
                    ${line.locked ? `<div style="font-size:11px;color:#28754e;">Đã chạy ${formatNum(line.completed_cnt)} lần (Cố định)</div>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  ${
                    line.locked
                      ? `<span class="badge-tag green">${formatNum(line.quantity)} lần</span>`
                      : `
                        <input type="number" class="input-box" style="width:82px;padding:5px 8px;text-align:center;" min="1" max="${pkgQty}" value="${line.quantity}" data-wb-line-qty="${idx}" />
                        <button type="button" class="btn-frost" style="padding:4px 9px;font-size:11px;color:#ab334a;" data-wb-line-del="${idx}">✕</button>
                      `
                  }
                </div>
              </div>
            `).join('')
        }
      </div>

      <div class="action-row align-end" style="padding-top:6px;">
        <button type="button" class="btn-frost" id="btnWbCancelConfig">Hủy</button>
        <button type="button" class="btn-violet" id="btnWbSaveConfig" ${draft.length === 0 || isOver ? 'disabled' : ''}>💾 Lưu cấu hình thời tiết</button>
      </div>
    `;

    body.querySelector('#wbTypeSelect')?.addEventListener('change', (e) => {
      selectedTypeId = Number(e.target.value);
    });
    body.querySelector('#wbAddQtyInput')?.addEventListener('input', (e) => {
      addQty = Math.max(1, Math.floor(Number(e.target.value || 1)));
    });
    body.querySelectorAll('[data-wb-quick-qty]').forEach((b) => {
      b.addEventListener('click', () => {
        addQty = Number(b.dataset.wbQuickQty);
        const inp = body.querySelector('#wbAddQtyInput');
        if (inp) inp.value = String(addQty);
      });
    });
    body.querySelector('#btnWbAddLine')?.addEventListener('click', () => {
      const t = activeTypes.find(x => Number(x.id) === Number(selectedTypeId));
      const qty = Math.max(1, Math.floor(Number(body.querySelector('#wbAddQtyInput')?.value || addQty || 1)));
      if (!t || qty <= 0 || qty > remaining) {
        showToast(`Số lượng thêm vượt mức còn trống (${remaining} lần).`);
        return;
      }
      const existing = draft.find(d => !d.locked && Number(d.weather_type_id) === Number(t.id));
      if (existing) {
        existing.quantity += qty;
      } else {
        draft.push({ key: `d-${seq++}`, id: null, weather_type_id: t.id, name: t.name, icon: t.icon, quantity: qty, completed_cnt: 0, locked: false });
      }
      addQty = Math.max(1, pkgQty - draft.reduce((s, d) => s + d.quantity, 0));
      renderConfigBody();
    });
    body.querySelectorAll('[data-wb-line-qty]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = Number(inp.dataset.wbLineQty);
        if (!draft[idx] || draft[idx].locked) return;
        draft[idx].quantity = Math.max(1, Math.floor(Number(e.target.value || 1)));
        renderConfigBody();
      });
    });
    body.querySelectorAll('[data-wb-line-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.wbLineDel);
        if (!draft[idx] || draft[idx].locked) return;
        draft.splice(idx, 1);
        renderConfigBody();
      });
    });
    body.querySelector('#btnWbCancelConfig')?.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    body.querySelector('#btnWbSaveConfig')?.addEventListener('click', async () => {
      const saveBtn = body.querySelector('#btnWbSaveConfig');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang lưu...'; }
      try {
        const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/weathers`, 'PUT', {
          weathers: draft.map(d => ({
            id: d.id,
            weather_type_id: Number(d.weather_type_id),
            quantity: Number(d.quantity),
          })),
        });
        showToast(res.message || 'Đã lưu cấu hình thời tiết!');
        overlay.style.display = 'none';
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu cấu hình thời tiết'; }
      }
    });
  };

  renderConfigBody();
}

// ============================================================================
// 3. MODALS: FRUIT WAREHOUSE, COIN WAREHOUSE, CATEGORY PRICE LIST
// ============================================================================
let infoModalSeq = 0;

function renderModalSyncErrorHtml(body, retryFn, customMsg = '') {
  body.innerHTML = `
    <div class="sync-loading-screen" style="padding:28px 16px;">
      <div style="font-size:28px;">⚠️</div>
      <div class="sync-loading-title" style="color:#ab334a;">Không thể tải dữ liệu mới nhất từ ebongiu</div>
      <div class="sync-loading-sub">${escapeHtml(customMsg || state.catalogWarning || 'Hệ thống nguồn tạm thời phản hồi chậm. Vui lòng thử tải lại.')}</div>
      <button type="button" class="btn-violet" id="btnRetryInfoModalSync">↻ Thử tải lại</button>
    </div>
  `;
  body.querySelector('#btnRetryInfoModalSync')?.addEventListener('click', retryFn);
}

async function openFruitWarehouseModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const mySeq = ++infoModalSeq;
  box.className = 'modal-box wide';
  title.textContent = '📦 Kho Trái Cây Trực Tuyến';
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ ebongiu...', 'Đang lấy tồn kho & đơn giá trái cây mới nhất từ hệ thống.');
  overlay.style.display = 'flex';

  await loadCatalog(true, 'fruit_by_fruit', 6500);
  if (mySeq !== infoModalSeq || overlay.style.display === 'none' || !state.user) return;
  if (!state.catalogData || state.catalogWarning) {
    renderModalSyncErrorHtml(body, openFruitWarehouseModal);
    return;
  }

  const fruits = (state.catalogData.catalog?.fruit_by_fruit || [])
    .slice()
    .sort((a, b) => b.stock_quantity - a.stock_quantity);

  body.innerHTML = `
    <input type="text" id="whFruitFilterInput" class="input-box" placeholder="🔍 Tìm tên trái cây trong kho (${fruits.length} loại)..." />
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;max-height:420px;overflow-y:auto;padding:2px;" id="whFruitGrid"></div>
  `;

  const grid = body.querySelector('#whFruitGrid');
  const renderList = (q = '') => {
    const cq = q.trim().toLowerCase();
    const list = cq ? fruits.filter((f) => f.name.toLowerCase().includes(cq)) : fruits;
    grid.innerHTML = list
      .map(
        (f) => `
        <div class="pkg-picker-card" data-wh-fruit="${f.id}">
          <div style="display:flex;align-items:center;gap:10px;">
            ${f.icon ? `<img src="${escapeHtml(f.icon)}" loading="lazy" decoding="async" style="width:36px;height:36px;object-fit:contain;" alt="" />` : '🍎'}
            <div>
              <div style="font-weight:600;color:var(--color-pure-white);font-size:13px;">${escapeHtml(f.name)}</div>
              <div style="font-size:11px;color:#28754e;">Tồn kho: ${formatNum(f.stock_quantity)}</div>
              <div style="font-size:11px;color:#895d0a;">Giá: ${formatVnd(f.unit_price)}/trái</div>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    grid.querySelectorAll('[data-wh-fruit]').forEach((card) => {
      card.addEventListener('click', () => {
        openCreateOrderModal('fruit_coin', {
          fruitOrderType: 'by_fruit',
          category: 'fruit_by_fruit',
          fruit_item_id: Number(card.dataset.whFruit),
        });
      });
    });
  };

  renderList('');
  let whTimer = null;
  body.querySelector('#whFruitFilterInput')?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (whTimer && typeof clearTimeout === 'function') clearTimeout(whTimer);
    whTimer = setTimeout(() => renderList(val), 80);
  });
}

async function openCoinWarehouseModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const mySeq = ++infoModalSeq;
  box.className = 'modal-box';
  title.textContent = '🪙 Kho Xu Nông Trại Trực Tuyến';
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ ebongiu...', 'Đang đồng bộ trữ lượng Kho Xu mới nhất từ hệ thống.');
  overlay.style.display = 'flex';

  await loadCatalog(true, 'fruit_coin', 6500);
  if (mySeq !== infoModalSeq || overlay.style.display === 'none' || !state.user) return;
  if (!state.catalogData || state.catalogWarning) {
    renderModalSyncErrorHtml(body, openCoinWarehouseModal);
    return;
  }

  const coin = state.catalogData.coinStock || {};
  const tiers = state.catalogData.coinTiers || [];

  body.innerHTML = `
    <div style="background:rgba(38,150,132,0.16);padding:16px;border-radius:12px;box-shadow:var(--shadow-subtle);">
      <div style="font-size:12px;color:var(--color-moon-mist);">Tổng trữ lượng Xu sẵn sàng giao:</div>
      <div style="font-size:26px;font-weight:700;color:#28754e;margin-top:4px;">${formatNum(coin.quantity || 0)} Xu</div>
      <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">Tốc độ sản xuất ước tính: ~${formatNum(coin.estimated_per_hour || 0)} Xu/giờ</div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Phân khúc giá trái</th>
            <th>Phụ phí chọn lọc</th>
            <th>Trữ lượng khả dụng</th>
          </tr>
        </thead>
        <tbody>
          ${tiers
            .map(
              (t) => `
            <tr>
              <td>Trái từ <strong>${formatNum(t.min_coin)} Xu</strong> trở lên</td>
              <td><span class="badge-tag ${t.markup_percent > 0 ? 'amber' : 'green'}">+${t.markup_percent}%</span></td>
              <td><strong>${formatNum(t.quantity)} Xu</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openCategoryPriceListModal(catKey) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const mySeq = ++infoModalSeq;
  box.className = 'modal-box';
  title.textContent = `🏷️ Bảng giá: ${VIEW_TITLES[catKey] || catKey}`;
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ ebongiu...');
  overlay.style.display = 'flex';

  await loadCatalog(true, catKey, 6500);
  if (mySeq !== infoModalSeq || overlay.style.display === 'none' || !state.user) return;
  if (!state.catalogData || state.catalogWarning) {
    renderModalSyncErrorHtml(body, () => openCategoryPriceListModal(catKey));
    return;
  }

  const items = state.catalogData.catalog?.[catKey] || [];
  const isGiftCat = catKey === 'farm_gift' || catKey === 'mail_gift';

  if (!items.length) {
    body.innerHTML = `<div style="color:var(--color-fog-veil);padding:16px 0;">Hiện chưa có gói giá nào đang mở bán cho danh mục này.</div>`;
  } else if (isGiftCat) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;max-height:440px;overflow-y:auto;">
        ${items
          .map(
            (g) => `
          <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;">
            <div style="font-weight:600;color:var(--color-pure-white);margin-bottom:8px;">${escapeHtml(g.name)}</div>
            <div class="pkg-picker-list" style="max-height:none;">
              ${(g.packages || [])
                .map(
                  (p) => `
                <div class="pkg-picker-card">
                  <div style="display:flex;justify-content:space-between;gap:6px;">
                    <strong style="color:var(--color-pure-white);">Số lượng ${formatNum(p.quantity)}</strong>
                    ${p.is_on_sale && p.sale ? `<span class="badge-tag amber">Sale còn ${p.sale.slots_remaining}</span>` : ''}
                  </div>
                  <div style="display:flex;align-items:baseline;gap:8px;">
                    <span style="font-size:16px;font-weight:700;color:#236f60;">${formatVnd(p.total_price)}</span>
                    ${p.is_on_sale && p.original_price > p.total_price ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(p.original_price)}</span>` : ''}
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  } else {
    const unitMap = { fruit_coin: 'Xu', buff_tim: 'Tim', buff_sao: 'Sao', guestbook: 'Bài viết', weather_buff: 'Lần' };
    const unit = unitMap[catKey] || '';
    body.innerHTML = `
      <div class="pkg-picker-list" style="max-height:420px;">
        ${items
          .map(
            (p) => `
          <div class="pkg-picker-card">
            <div style="display:flex;justify-content:space-between;gap:6px;">
              <strong style="color:var(--color-pure-white);">Gói ${formatNum(p.quantity || p.coin_quantity)} ${unit}</strong>
              ${p.is_on_sale && p.sale ? `<span class="badge-tag amber">Sale còn ${p.sale.slots_remaining} slot</span>` : ''}
            </div>
            <div style="display:flex;align-items:baseline;gap:8px;">
              <span style="font-size:16px;font-weight:700;color:#236f60;">${formatVnd(p.total_price)}</span>
              ${p.is_on_sale && p.original_price > p.total_price ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(p.original_price)}</span>` : ''}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }
  overlay.style.display = 'flex';
}

// ============================================================================
// 4. BẢNG ĐIỀU KHIỂN (DASHBOARD OVERVIEW)
// ============================================================================
function renderDashboardOverviewHtml() {
  const r = state.catalogData;
  const st = r?.systemStatus || {};
  const coinQty = r?.coinStock?.quantity || 0;
  const totalFruits = (r?.catalog?.fruit_by_fruit || []).reduce((s, f) => s + Number(f.stock_quantity || 0), 0);
  const activeOrders = state.orders.filter((o) => o.status !== 'completed' && o.isActive).length;

  const catCards = [
    { key: 'farm_gift', icon: '🏪', name: 'Quà nông trại', working: st.farm_gift },
    { key: 'mail_gift', icon: '✉️', name: 'Quà thư', working: st.mail_gift },
    { key: 'guestbook', icon: '📰', name: 'Bài viết', working: st.guestbook },
    { key: 'buff_tim', icon: '🤍', name: 'Buff Tim', working: st.buff_tim },
    { key: 'buff_sao', icon: '☆', name: 'Buff Sao', working: st.buff_sao },
    { key: 'weather_buff', icon: '☁️', name: 'Buff Thời Tiết', working: st.weather_buff },
    { key: 'fruit_coin', icon: '🪙', name: 'Trái cây & Xu', working: st.fruit_coin },
  ];

  return `
    <div class="stats-three-grid">
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Trữ lượng Kho Xu Nông Trại</div>
        <div style="font-size:24px;font-weight:700;color:#28754e;margin-top:6px;">${formatNum(coinQty)} Xu</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">Kho trái cây: ${formatNum(totalFruits)} trái sẵn sàng</div>
      </div>

      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Đơn hàng đang chạy</div>
        <div style="font-size:24px;font-weight:700;color:var(--color-pure-white);margin-top:6px;">${activeOrders} đơn đang bật</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">Tổng số đơn: ${state.orders.length} đơn</div>
      </div>

      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">${state.user.role === 'admin' ? 'Trạng thái Quản trị Admin' : 'Số dư Ví CTV của bạn'}</div>
        <div style="font-size:24px;font-weight:700;color:#895d0a;margin-top:6px;">
          ${state.user.role === 'admin' ? 'Đã đồng bộ API' : formatVnd(state.user.balance)}
        </div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">
          ${state.user.role === 'admin' ? 'Bấm mục Quản trị bên trái để chỉnh giá CTV' : 'Đảm bảo có số dư để tạo đơn hàng'}
        </div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Danh mục Chạy Đơn (Đồng bộ trạng thái thực tế)</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">
        ${catCards
          .map(
            (c) => `
          <button type="button" class="stat-subcard dashboard-category" data-dash-goto="${c.key}">
            <span style="display:flex;align-items:center;justify-content:space-between;">
              <strong style="color:var(--color-pure-white);font-size:15px;">${c.icon} ${escapeHtml(c.name)}</strong>
              <span class="system-status-chip ${c.working ? 'is-working' : 'is-not-working'}" style="font-size:11px;padding:2px 8px;">
                ● ${c.working ? 'Hoạt động' : 'Tạm ngưng'}
              </span>
            </span>
            <span style="display:flex;justify-content:flex-end;margin-top:6px;">
              <span class="btn-frost" style="padding:5px 12px;font-size:11px;">Mở danh mục →</span>
            </span>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function bindDashboardEvents() {
  document.querySelectorAll('[data-dash-goto]').forEach((card) => {
    card.addEventListener('click', () => {
      switchView(card.dataset.dashGoto);
    });
  });
}

// ============================================================================
// 5. ĐỐI SOÁT TUẦN & LỊCH SỬ ĐƠN HÀNG & KHÁCH HÀNG
// ============================================================================
async function renderWeeklySettlementsView(container, zeroBannerHtml) {
  try {
    const r = await apiFetch('/api/settlements');
    if (state.currentView !== 'weekly_settlements') return;
    const isAdmin = state.user.role === 'admin';
    const trxList = r.transactions || [];

    let summaryHtml = '';
    if (isAdmin) {
      const wl = r.hnSettlement?.weekly_limit;
      summaryHtml = !wl ? '<p class="tool-warning">Chưa có dữ liệu hạn mức tuần từ nguồn.</p>' : `
        <div class="stats-three-grid">
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Hạn mức tuần nguồn</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-pure-white);">${formatVnd(wl.limit)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Đã sử dụng trong tuần</div>
            <div style="font-size:22px;font-weight:700;color:#895d0a;">${formatVnd(wl.spent)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Hạn mức còn lại</div>
            <div style="font-size:22px;font-weight:700;color:#28754e;">${formatVnd(wl.remaining)}</div>
          </div>
        </div>
      `;
    } else {
      const s = r.summary || { orderCount: 0, totalSpent: 0, currentBalance: state.user.balance };
      summaryHtml = `
        <div class="stats-three-grid">
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Số dư ví hiện tại</div>
            <div style="font-size:22px;font-weight:700;color:#28754e;">${formatVnd(s.currentBalance)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Tổng đơn đã đặt</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-pure-white);">${s.orderCount} đơn</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Tổng tiền đã thanh toán</div>
            <div style="font-size:22px;font-weight:700;color:#895d0a;">${formatVnd(s.totalSpent)}</div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      ${zeroBannerHtml}
      <div class="glass-panel">
        <div class="panel-title-row">
          <span class="panel-title-text">💲 Đối soát tuần & Biến động số dư (${escapeHtml(r.weekStart || '')})</span>
        </div>
        ${summaryHtml}
      </div>

      <div class="glass-panel">
        <div class="panel-title-row">
          <span class="panel-title-text">Lịch sử giao dịch & Trừ ví</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>MÃ GD</th>
                <th>TÀI KHOẢN</th>
                <th>SỐ TIỀN</th>
                <th>SỐ DƯ SAU GD</th>
                <th>NỘI DUNG</th>
                <th>THỜI GIAN</th>
              </tr>
            </thead>
            <tbody>
              ${
                trxList.length === 0
                  ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-fog-veil);">Chưa có giao dịch nào.</td></tr>`
                  : trxList
                      .map(
                        (t) => `
                    <tr>
                      <td><strong>${escapeHtml(t.id)}</strong></td>
                      <td>${escapeHtml(t.userName)}</td>
                      <td style="font-weight:700;color:${t.amount >= 0 ? '#28754e' : '#ab334a'};">
                        ${t.amount >= 0 ? `+${formatVnd(t.amount)}` : formatVnd(t.amount)}
                      </td>
                      <td>${formatVnd(t.balanceAfter)}</td>
                      <td>${escapeHtml(t.note)}</td>
                      <td>${formatDateVi(t.createdAt)}</td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    if (state.currentView !== 'weekly_settlements' || !state.user) return;
    container.innerHTML = `<div class="glass-panel">Lỗi tải đối soát: ${escapeHtml(err.message)}</div>`;
  }
}

function renderOrderHistoryHtml() {
  return `
    ${state.ordersWarning ? `<p class="tool-warning" role="status">${escapeHtml(state.ordersWarning)}</p>` : ''}
    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">📄 Toàn bộ Lịch sử đơn hàng (${state.orders.length} đơn)</span>
        <input type="text" id="histSearchInput" class="input-box" style="max-width:280px;" placeholder="🔍 Tìm tên khách, mã đơn, SUID..." value="${escapeHtml(state.orderSearch)}" />
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>GÓI / VẬT PHẨM</th>
              <th>SỐ LƯỢNG</th>
              <th>GIÁ</th>
              <th>TIẾN ĐỘ</th>
              <th>TRẠNG THÁI</th>
              <th>BẬT/TẮT</th>
              <th>TẠO LÚC</th>
              ${state.user?.role === 'admin' ? '<th>THAO TÁC</th>' : ''}
            </tr>
          </thead>
          <tbody id="histOrdersTbody">
            ${renderOrderHistoryTbodyHtml()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrderHistoryTbodyHtml() {
  const q = state.orderSearch.trim().toLowerCase();
  const list = state.orders.filter((o) => {
    if (!q) return true;
    return (
      String(o.customer?.nickname || '').toLowerCase().includes(q) ||
      String(o.customer?.suid || '').toLowerCase().includes(q) ||
      String(o.remoteOrderId || o.id).toLowerCase().includes(q)
    );
  });
  const colSpan = state.user?.role === 'admin' ? 9 : 8;
  if (list.length === 0) {
    return `<tr><td colspan="${colSpan}" style="text-align:center;padding:28px;color:var(--color-fog-veil);">${state.loadingOrders ? '<span class="loading-inline"><span class="loading-dot"></span>Đang đồng bộ lịch sử đơn...</span>' : 'Không có dữ liệu'}</td></tr>`;
  }
  return list.map((o) => renderOrderTableRowHtml(o)).join('');
}

let histFilterTimer = null;
function bindOrderHistoryEvents() {
  const input = document.getElementById('histSearchInput');
  input?.addEventListener('input', (e) => {
    state.orderSearch = e.target.value;
    if (histFilterTimer && typeof clearTimeout === 'function') clearTimeout(histFilterTimer);
    histFilterTimer = setTimeout(() => {
      const tbody = document.getElementById('histOrdersTbody');
      if (!tbody) return;
      tbody.innerHTML = renderOrderHistoryTbodyHtml();
      bindOrderRowActionButtons();
    }, 80);
  });
  bindOrderRowActionButtons();
}

// ============================================================================
// 6. ADMIN PAGE: TÙY CHỈNH GIÁ TỪNG DANH MỤC, GÓI & SẢN PHẨM (VNĐ + %)
// ============================================================================
const PRICING_CATEGORIES = [
  { key: 'fruit_coin', icon: '🪙', label: '01. Gói Xu Nông Trại', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 3000, 5000, 10000] },
  { key: 'fruit_by_fruit', icon: '🍎', label: '02. Trái cây lẻ & 19 Đột biến', unitHint: 'trái', isFruitUnit: true, stepFixed: 10, presetsFixed: [20, 40, 50, 100] },
  { key: 'buff_tim', icon: '🤍', label: '03. Gói Buff Tim', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 3000, 5000, 10000] },
  { key: 'buff_sao', icon: '☆', label: '04. Gói Buff Sao', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000, 20000] },
  { key: 'guestbook', icon: '📰', label: '05. Gói Bài viết lưu bút', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  { key: 'mail_gift', icon: '✉️', label: '06. Gói Quà thư', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  { key: 'farm_gift', icon: '🏪', label: '07. Gói Quà nông trại', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  { key: 'weather_buff', icon: '☁️', label: '08. Gói Buff Thời Tiết', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
];

function computePreviewSell(cost, mode, fixedVal, pctVal) {
  const c = Math.max(0, Number(cost || 0));
  if (mode === 'percent') {
    const p = Math.max(0, Math.min(500, Number(pctVal || 0)));
    return Math.max(c, Math.round(c * (100 + p) / 100));
  }
  return Math.max(c, Math.round(c + Math.max(0, Number(fixedVal || 0))));
}

function getCategorySampleItem(catKey, catalog) {
  if (!catalog) return null;
  if (catKey === 'fruit_by_fruit') {
    const f = (catalog.fruit_by_fruit || [])[0];
    if (!f) return null;
    return { name: `${f.name} (1 trái)`, cost: f._admin?.cost_unit_price ?? f.unit_price };
  }
  if (catKey === 'farm_gift' || catKey === 'mail_gift') {
    const g = (catalog[catKey] || [])[0];
    const p = g?.packages?.[0];
    if (!g || !p) return null;
    return { name: `${g.name} × ${formatNum(p.quantity)}`, cost: p._admin?.cost_effective ?? p.total_price };
  }
  const p = (catalog[catKey] || [])[0];
  if (!p) return null;
  const uMap = { fruit_coin: 'Xu', buff_tim: 'Tim', buff_sao: 'Sao', guestbook: 'Bài viết', weather_buff: 'Lần' };
  return { name: `Gói ${formatNum(p.quantity || p.coin_quantity)} ${uMap[catKey] || ''}`, cost: p._admin?.cost_effective ?? p.total_price };
}

function getAllAdminFixedPackages(r) {
  const fixedPackages = [];
  const pushPkgs = (arr, catKey, catLabel, unitLabel) => {
    for (const p of arr || []) {
      fixedPackages.push({
        key: `${catKey}:${p.id}`,
        catKey,
        catLabel,
        id: p.id,
        name: `Gói ${formatNum(p.quantity || p.coin_quantity)} ${unitLabel}`,
        isOnSale: !!p.is_on_sale,
        costPrice: p._admin?.cost_effective ?? p.total_price,
        costOriginal: p._admin?.cost_original ?? p._admin?.cost_effective ?? p.total_price,
        sellPrice: p.total_price,
        profit: p._admin?.profit ?? 0,
        hasOverride: p._admin?.has_custom_override ?? false,
      });
    }
  };
  pushPkgs(r?.catalog?.fruit_coin, 'fruit_coin', 'Xu Nông Trại', 'Xu');
  pushPkgs(r?.catalog?.buff_tim, 'buff_tim', 'Buff Tim', 'Tim');
  pushPkgs(r?.catalog?.buff_sao, 'buff_sao', 'Buff Sao', 'Sao');
  pushPkgs(r?.catalog?.guestbook, 'guestbook', 'Bài Viết', 'Bài viết');
  pushPkgs(r?.catalog?.weather_buff, 'weather_buff', 'Buff Thời Tiết', 'Lần');
  for (const [catKey, catLabel] of [['farm_gift', 'Quà nông trại'], ['mail_gift', 'Quà thư']]) {
    for (const g of r?.catalog?.[catKey] || []) {
      for (const p of g.packages || []) {
        fixedPackages.push({
          key: `${catKey}:${p.id}`,
          catKey,
          catLabel,
          id: p.id,
          name: `${g.name} × ${formatNum(p.quantity)}`,
          isOnSale: !!p.is_on_sale,
          costPrice: p._admin?.cost_effective ?? p.total_price,
          costOriginal: p._admin?.cost_original ?? p._admin?.cost_effective ?? p.total_price,
          sellPrice: p.total_price,
          profit: p._admin?.profit ?? 0,
          hasOverride: p._admin?.has_custom_override ?? false,
        });
      }
    }
  }
  return fixedPackages;
}

function adminPricingCatalog() {
  return state.pricingCtvId ? state.pricingCatalog : state.catalogData;
}

let pricingLoadVersion = 0;
async function loadCtvPricing(ctvId, refresh = false) {
  const version = ++pricingLoadVersion;
  state.pricingCatalog = null;
  state.pricingLoadError = '';
  if (state.currentView === 'admin_pricing') renderCurrentView();
  if (!ctvId) return;
  try {
    const result = await apiFetch('/api/catalog?ctvId=' + encodeURIComponent(ctvId) + (refresh ? '&refresh=1' : ''), 'GET', null, 6500);
    if (version === pricingLoadVersion && ctvId === state.pricingCtvId) state.pricingCatalog = result;
  } catch (err) {
    if (version === pricingLoadVersion && ctvId === state.pricingCtvId) state.pricingLoadError = err.message;
  }
  if (version === pricingLoadVersion && state.currentView === 'admin_pricing') renderCurrentView();
}

function renderAdminPricingPageHtml() {
  const r = adminPricingCatalog();
  const adm = state.adminOverview;
  const personal = Boolean(state.pricingCtvId);
  const ctvs = (adm?.ctvs || []).filter(u => !u.archivedAt);
  const missingCtv = personal && !ctvs.some(u => u.id === state.pricingCtvId);
  const selector = `<div style="margin-bottom:16px;">
    <label for="pricingCtvSelect">Áp dụng bảng giá cho</label>
    <select class="input-box" id="pricingCtvSelect" style="display:block;max-width:360px;margin-top:6px;">
      <option value="">Bảng giá chung</option>
      ${missingCtv ? '<option selected disabled>CTV không còn trong danh sách</option>' : ''}
      ${ctvs.map(u => `<option value="${escapeHtml(u.id)}" ${u.id === state.pricingCtvId ? 'selected' : ''}>${escapeHtml(u.name)} (@${escapeHtml(u.username)})</option>`).join('')}
    </select>
  </div>`;
  if (missingCtv) return `<div class="glass-panel">${selector}</div>`;
  if (personal && !r) {
    return `<div class="glass-panel">${selector}<div role="status">${escapeHtml(state.pricingLoadError || 'Đang tải bảng giá CTV…')}</div>
      ${state.pricingLoadError ? '<button type="button" class="btn-frost" id="btnRefreshAdminPricing">Thử lại</button>' : ''}</div>`;
  }
  const fruits = r?.catalog?.fruit_by_fruit || [];
  const defaultFruitMarkup = adm?.settings?.defaultFruitUnitMarkup ?? 40;
  const cm = adm?.settings?.categoryMarkups || {};
  const modes = adm?.settings?.categoryMarkupModes || {};
  const percents = adm?.settings?.categoryMarkupPercents || {};
  const pkgOverrides = adm?.settings?.packagePriceOverrides || {};
  const fruitOverrideCount = personal ? fruits.filter(f => f._admin?.has_custom_override).length : Object.keys(adm?.settings?.fruitUnitPrices || {}).length;
  const sysStatus = r?.systemStatus || {};

  const fixedPackages = getAllAdminFixedPackages(r);
  const filteredPackages = state.adminPkgCatFilter === 'all'
    ? fixedPackages
    : fixedPackages.filter((p) => p.catKey === state.adminPkgCatFilter);

  const qFruit = state.adminFruitSearch.trim().toLowerCase();
  const filteredFruits = fruits.filter((f) => {
    if (state.adminFruitFilter === 'custom' && !f._admin?.has_custom_override) return false;
    if (qFruit && !f.name.toLowerCase().includes(qFruit)) return false;
    return true;
  });

  const fruitMode = modes.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const fruitPercent = Number(percents.fruit_by_fruit ?? 0);
  const syncedText = r?.syncedAt
    ? new Date(r.syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Chưa đồng bộ';

  const pkgCatCounts = { all: fixedPackages.length };
  for (const p of fixedPackages) pkgCatCounts[p.catKey] = (pkgCatCounts[p.catKey] || 0) + 1;

  return `
    <div class="glass-panel">
      <div class="panel-title-row">
        <div>
          <span class="panel-title-text">🏷️ Tùy chỉnh Giá bán CTV cho từng Danh mục & Sản phẩm</span>
          <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">
            ${personal ? 'CTV dùng giá sản phẩm riêng trước, sau đó đến giá danh mục riêng. Các mục còn lại dùng bảng giá chung.' : `Đồng bộ nguồn API lúc <strong style="color:#236f60;">${escapeHtml(syncedText)}</strong> · Hỗ trợ chỉnh <strong>+VNĐ (thủ công)</strong> hoặc <strong>+% (phần trăm)</strong> cho từng danh mục và từng gói riêng lẻ.`}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn-frost" id="btnRefreshAdminPricing">↻ Làm mới giá nguồn</button>
          <button type="button" class="btn-violet" id="btnSaveAllAdminPricing">
            💾 Cập nhật tất cả thay đổi
          </button>
        </div>
      </div>

      ${selector}
      <!-- Sub-navigation tabs -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
        <button type="button" class="btn-frost ${state.adminPricingTab === 'categories' ? 'is-active' : ''}" data-adm-ptab="categories">
          ⚙️ 1. Chỉnh giá từng Danh mục (VNĐ / %) — 8 danh mục
        </button>
        <button type="button" class="btn-frost ${state.adminPricingTab === 'packages' ? 'is-active' : ''}" data-adm-ptab="packages">
          📦 2. Chỉnh từng Gói cố định (${fixedPackages.length} gói)
        </button>
        <button type="button" class="btn-frost ${state.adminPricingTab === 'fruits' ? 'is-active' : ''}" data-adm-ptab="fruits">
          🍎 3. Chỉnh từng loại Trái cây & 19 Đột biến (${fruits.length} loại)
        </button>
      </div>

      ${
        state.adminPricingTab === 'categories'
          ? `
        <div class="pricing-cat-grid">
          ${PRICING_CATEGORIES.map((cat) => {
            const rule = r?.categoryPricing?.[cat.key];
            const mode = rule?.mode ?? (modes[cat.key] === 'percent' ? 'percent' : 'fixed');
            const fixedVal = rule?.fixed ?? (cat.isFruitUnit ? defaultFruitMarkup : Number(cm[cat.key] ?? 5000));
            const pctVal = rule?.percent ?? Number(percents[cat.key] ?? 0);
            const orderFeeVal = rule?.orderFee ?? Number(cm.fruit_by_fruit ?? 0);
            const isWorking = !!sysStatus[cat.key];
            const overrideCount = rule?.productCount ?? (cat.isFruitUnit
              ? fruitOverrideCount
              : Object.keys(pkgOverrides).filter((k) => k.startsWith(`${cat.key}:`)).length);
            const sample = getCategorySampleItem(cat.key, r?.catalog);
            const sampleSell = sample ? computePreviewSell(sample.cost, mode, fixedVal, pctVal) : 0;
            const sampleProfit = sample ? sampleSell - sample.cost : 0;

            return `
              <div class="pricing-cat-card" data-cat-card="${cat.key}">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <strong style="color:var(--color-pure-white);font-size:14px;">${cat.icon} ${escapeHtml(cat.label)}</strong>
                  <span class="system-status-chip ${isWorking ? 'is-working' : 'is-not-working'}" style="font-size:11px;padding:2px 8px;">
                    ● ${isWorking ? 'Hoạt động' : 'Tạm ngưng'}
                  </span>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <div class="pricing-mode-switch">
                    <button type="button" class="pricing-mode-btn ${mode === 'fixed' ? 'is-active' : ''}" data-cat-mode-btn="${cat.key}" data-mode="fixed">+VNĐ thủ công</button>
                    <button type="button" class="pricing-mode-btn ${mode === 'percent' ? 'is-active' : ''}" data-cat-mode-btn="${cat.key}" data-mode="percent">+% Phần trăm</button>
                  </div>
                  ${personal ? `<span class="badge-tag ${rule?.personal ? 'amber' : 'green'}">${rule?.personal ? 'Danh mục riêng' : 'Theo bảng giá chung'}</span>` : overrideCount > 0 ? `<span class="badge-tag amber">${overrideCount} giá riêng</span>` : `<span class="badge-tag green">Tự động</span>`}
                </div>

                <div data-cat-fixed-wrap="${cat.key}" style="display:${mode === 'fixed' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="number" id="admCatFixed_${cat.key}" class="input-box adm-cat-fixed-input" data-cat-key="${cat.key}" value="${fixedVal}" step="${cat.stepFixed}" min="0" />
                    <span style="font-size:12px;color:var(--color-moon-mist);white-space:nowrap;">đ / ${cat.unitHint}</span>
                  </div>
                  <div class="pricing-preset-row">
                    ${cat.presetsFixed.map((v) => `<button type="button" class="pricing-preset-chip" data-preset-cat="${cat.key}" data-preset-mode="fixed" data-preset-val="${v}">+${formatVnd(v)}</button>`).join('')}
                  </div>
                </div>

                <div data-cat-percent-wrap="${cat.key}" style="display:${mode === 'percent' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="number" id="admCatPct_${cat.key}" class="input-box adm-cat-pct-input" data-cat-key="${cat.key}" value="${pctVal}" step="0.01" min="0" max="500" />
                    <span style="font-size:12px;color:var(--color-moon-mist);white-space:nowrap;">% trên giá gốc</span>
                  </div>
                  <div class="pricing-preset-row">
                    ${[5, 10, 15, 20, 30, 50].map((v) => `<button type="button" class="pricing-preset-chip" data-preset-cat="${cat.key}" data-preset-mode="percent" data-preset-val="${v}">+${v}%</button>`).join('')}
                  </div>
                </div>

                ${
                  cat.isFruitUnit
                    ? `
                  <div style="display:flex;align-items:center;gap:8px;padding-top:4px;border-top:1px solid rgba(186,215,247,0.08);">
                    <label style="font-size:11.5px;color:var(--color-fog-veil);white-space:nowrap;" for="admCatFruitOrderFee">Phí cố định / đơn:</label>
                    <input type="number" id="admCatFruitOrderFee" class="input-box" style="max-width:120px;padding:6px 10px;" value="${orderFeeVal}" step="1000" min="0" />
                    <span style="font-size:11.5px;color:var(--color-fog-veil);">đ</span>
                  </div>
                `
                    : ''
                }

                <div class="pricing-preview-line" id="admCatPreview_${cat.key}" data-sample-name="${escapeHtml(sample?.name || '')}" data-sample-cost="${sample?.cost || 0}">
                  ${
                    sample
                      ? `VD: <strong>${escapeHtml(sample.name)}</strong> · gốc ${formatVnd(sample.cost)} → bán CTV <strong style="color:#236f60;">${formatVnd(sampleSell)}</strong> <span style="color:#28754e;">(+${formatVnd(sampleProfit)})</span>`
                      : `Hiện nguồn chưa mở gói mẫu cho danh mục này; mức cộng sẽ tự áp dụng ngay khi nguồn mở bán.`
                  }
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:4px;flex-wrap:wrap;">
                  ${
                    overrideCount > 0
                      ? `<label style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#895d0a;cursor:pointer;">
                          <input type="checkbox" id="admCatApplyOvr_${cat.key}" ${personal ? '' : 'checked'} />
                          <span>Áp dụng luôn cho ${overrideCount} giá riêng</span>
                        </label>`
                      : `<span style="font-size:11px;color:var(--color-fog-veil);">Tất cả đang chạy tự động</span>`
                  }
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    ${rule?.personal ? `<button type="button" class="btn-frost" style="padding:5px 8px;font-size:11px;" data-inherit-category="${cat.key}">Dùng lại giá danh mục chung</button>` : ''}
                    ${overrideCount > 0 ? `<button type="button" class="btn-frost" style="padding:5px 8px;font-size:11px;" data-reset-cat-overrides="${cat.key}">↺ Gỡ giá riêng</button>` : ''}
                    <button type="button" class="btn-violet" style="padding:6px 14px;font-size:12px;" data-save-single-cat="${cat.key}">
                      ✓ Cập nhật
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button type="button" class="btn-violet" id="btnSaveAllCatsBottom">${personal ? 'Lưu các danh mục đã chỉnh' : '💾 Cập nhật tất cả 8 danh mục'}</button>
        </div>
      `
          : state.adminPricingTab === 'packages'
          ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          ${[
            ['all', 'Tất cả'],
            ['fruit_coin', '🪙 Xu Nông Trại'],
            ['buff_tim', '🤍 Buff Tim'],
            ['buff_sao', '☆ Buff Sao'],
            ['guestbook', '📰 Bài Viết'],
            ['weather_buff', '☁️ Buff Thời Tiết'],
            ['farm_gift', '🏪 Quà nông trại'],
            ['mail_gift', '✉️ Quà thư'],
          ]
            .map(
              ([k, label]) => `
            <button type="button" class="btn-frost ${state.adminPkgCatFilter === k ? 'is-active' : ''}" style="padding:6px 12px;font-size:12px;" data-adm-pkg-filter="${k}">
              ${label} (${pkgCatCounts[k] || 0})
            </button>
          `
            )
            .join('')}
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>DANH MỤC</th>
                <th>TÊN GÓI DỊCH VỤ</th>
                <th>GIÁ GỐC NGUỒN</th>
                <th>GIÁ BÁN CHO CTV (VNĐ)</th>
                <th>LÃI ADMIN / ĐƠN</th>
                <th>CẬP NHẬT</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredPackages.length === 0
                  ? `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--color-fog-veil);">Hiện nguồn API chưa mở gói nào cho danh mục này.</td></tr>`
                  : filteredPackages
                      .map((p) => {
                        const pctProfit = p.costPrice > 0 ? Math.round((p.profit / p.costPrice) * 100) : 0;
                        return `
                <tr>
                  <td><span class="badge-tag violet">${escapeHtml(p.catLabel)}</span></td>
                  <td>
                    <strong style="color:var(--color-pure-white);">${escapeHtml(p.name)}</strong>
                    ${p.isOnSale ? `<span class="badge-tag amber" style="margin-left:6px;">Sale</span>` : ''}
                    <div style="font-size:10.5px;color:${p.hasOverride ? '#895d0a' : '#236f60'};margin-top:2px;">
                      ${p.hasOverride ? 'Giá cố định riêng' : personal ? (r.categoryPricing?.[p.catKey]?.personal ? 'Theo danh mục riêng' : 'Theo bảng giá chung') : modes[p.catKey] === 'percent' ? `Tự động (+${percents[p.catKey] ?? 0}%)` : `Tự động (+${formatVnd(cm[p.catKey] ?? 5000)})`}
                    </div>
                  </td>
                  <td>
                    <strong>${formatVnd(p.costPrice)}</strong>
                    ${p.isOnSale && p.costOriginal > p.costPrice ? `<div style="font-size:11px;text-decoration:line-through;color:var(--color-fog-veil);">${formatVnd(p.costOriginal)}</div>` : ''}
                  </td>
                  <td style="min-width:170px;max-width:210px;">
                    <input
                      type="number"
                      class="input-box adm-pkg-override-input"
                      data-pkg-key="${p.key}"
                      data-cost="${p.costPrice}"
                      data-has-override="${p.hasOverride ? '1' : '0'}"
                      value="${p.sellPrice}"
                      step="1000"
                      min="0"
                    />
                  </td>
                  <td>
                    <span class="badge-tag ${p.profit >= 0 ? 'green' : 'red'}" id="admPkgProfit_${p.key.replace(':', '_')}">
                      ${p.profit >= 0 ? `+${formatVnd(p.profit)}` : formatVnd(p.profit)} (${pctProfit >= 0 ? `+${pctProfit}%` : `${pctProfit}%`})
                    </span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11.5px;" data-save-pkg-row="${p.key}">✓ Cập nhật</button>
                      ${p.hasOverride ? `<button type="button" class="btn-frost" style="padding:5px 10px;font-size:11px;" data-reset-pkg-override="${p.key}">↺ Tự động</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      `
          : `
        <div style="background:rgba(102,58,243,0.12);padding:14px 16px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          ${personal ? '' : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:13px;color:var(--color-pure-white);font-weight:600;">Mức chung cho trái chưa chỉnh riêng:</span>
            <div class="pricing-mode-switch">
              <button type="button" class="pricing-mode-btn ${fruitMode === 'fixed' ? 'is-active' : ''}" id="btnFruitBarModeFixed">+VNĐ/trái</button>
              <button type="button" class="pricing-mode-btn ${fruitMode === 'percent' ? 'is-active' : ''}" id="btnFruitBarModePct">+%</button>
            </div>
            <input type="number" id="admFruitGeneralValInput" class="input-box" style="width:110px;" value="${fruitMode === 'percent' ? fruitPercent : defaultFruitMarkup}" step="${fruitMode === 'percent' ? 1 : 10}" min="0" max="${fruitMode === 'percent' ? 500 : 1000000}" />
            <span id="admFruitGeneralUnit" style="font-size:12px;color:var(--color-moon-mist);">${fruitMode === 'percent' ? '%' : 'đ / trái'}</span>
            ${
              fruitOverrideCount > 0
                ? `<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#895d0a;cursor:pointer;">
                    <input type="checkbox" id="admFruitApplyAllOverrides" checked />
                    <span>Áp dụng luôn cho ${fruitOverrideCount} trái đang đặt giá riêng</span>
                  </label>`
                : ''
            }
            <button type="button" class="btn-violet" id="btnSaveFruitGeneral" style="padding:7px 14px;font-size:12px;">✓ Cập nhật mức chung</button>
          </div>`}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="admFruitFilterSelect" class="input-box" style="width:auto;">
              <option value="all" ${state.adminFruitFilter === 'all' ? 'selected' : ''}>Tất cả (${fruits.length})</option>
              <option value="custom" ${state.adminFruitFilter === 'custom' ? 'selected' : ''}>Đang đặt giá riêng (${fruitOverrideCount})</option>
            </select>
            <input type="text" id="admFruitSearchInput" class="input-box" style="width:230px;" placeholder="🔍 Tìm trái cây: Nhân sâm..." value="${escapeHtml(state.adminFruitSearch)}" />
          </div>
        </div>

        <div class="table-wrap" style="max-height:540px;overflow-y:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>TRÁI CÂY</th>
                <th>TỒN KHO</th>
                <th>GIÁ GỐC NGUỒN</th>
                <th>GIÁ BÁN CHO CTV (VNĐ)</th>
                <th>LÃI ADMIN / TRÁI</th>
                <th>CẬP NHẬT / 19 ĐỘT BIẾN</th>
              </tr>
            </thead>
            <tbody id="admFruitTbody">
              ${renderAdminFruitRowsHtml(filteredFruits)}
            </tbody>
          </table>
        </div>
      `
      }
    </div>
  `;
}

function renderAdminFruitRowsHtml(fruits) {
  const adm = state.adminOverview;
  const fruitMode = adm?.settings?.categoryMarkupModes?.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const fruitPct = Number(adm?.settings?.categoryMarkupPercents?.fruit_by_fruit ?? 0);
  const defMk = Number(adm?.settings?.defaultFruitUnitMarkup ?? 40);

  if (fruits.length === 0) {
    return `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--color-fog-veil);">Không tìm thấy trái cây phù hợp.</td></tr>`;
  }

  return fruits
    .map((f) => {
      const cost = f._admin?.cost_unit_price ?? 0;
      const sell = f.unit_price;
      const profit = sell - cost;
      const pctProf = cost > 0 ? Math.round((profit / cost) * 100) : 0;
      const hasOverride = !!f._admin?.has_custom_override;
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              ${f.icon ? `<img src="${escapeHtml(f.icon)}" loading="lazy" decoding="async" style="width:30px;height:30px;object-fit:contain;" alt="" />` : '🍎'}
              <div>
                <strong style="color:var(--color-pure-white);">${escapeHtml(f.name)}</strong>
                <div style="font-size:10.5px;color:${hasOverride ? '#895d0a' : '#236f60'};">
                  ${hasOverride ? 'Giá cố định riêng' : state.pricingCtvId ? (state.pricingCatalog?.categoryPricing?.fruit_by_fruit?.personal ? 'Theo danh mục riêng' : 'Theo bảng giá chung') : fruitMode === 'percent' ? `Tự động (+${fruitPct}%)` : `Tự động (+${formatVnd(defMk)})`}
                </div>
              </div>
            </div>
          </td>
          <td>${formatNum(f.stock_quantity)} trái</td>
          <td><strong style="color:var(--color-moon-mist);">${formatVnd(cost)}</strong></td>
          <td style="min-width:140px;max-width:170px;">
            <input
              type="number"
              class="input-box adm-fruit-unit-input"
              data-fruit-id="${f.id}"
              data-cost="${cost}"
              data-has-override="${hasOverride ? '1' : '0'}"
              value="${sell}"
              step="10"
              min="0"
            />
          </td>
          <td>
            <span class="badge-tag ${profit >= 0 ? 'green' : 'red'}" id="admFruitProfit_${f.id}">
              ${profit >= 0 ? `+${formatVnd(profit)}` : formatVnd(profit)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})
            </span>
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn-violet" style="padding:5px 10px;font-size:11px;" data-save-fruit-row="${f.id}">✓ Cập nhật</button>
              ${hasOverride ? `<button type="button" class="btn-frost" style="padding:5px 8px;font-size:11px;" data-reset-fruit-override="${f.id}">↺ Tự động</button>` : ''}
              <button type="button" class="btn-frost" style="padding:5px 9px;font-size:11px;" data-open-mut-pricing="${f.id}">
                19 đột biến
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function savePricingSettingsAndReload(payload, successMsg) {
  const ctvId = state.pricingCtvId;
  if (ctvId) {
    await apiFetch('/api/admin/ctv/' + encodeURIComponent(ctvId) + '/pricing', 'PUT', payload);
    const ctv = state.adminOverview?.ctvs?.find(u => u.id === ctvId);
    showToast('Đã lưu bảng giá của ' + (ctv?.username || 'CTV') + '.');
    if (ctvId === state.pricingCtvId) await loadCtvPricing(ctvId);
    return;
  }
  const r = await apiFetch('/api/admin/settings', 'PUT', payload);
  showToast(successMsg || r.message || 'Đã cập nhật bảng giá thành công!');
  await Promise.all([loadCatalog(true), loadAdminOverview()]);
  renderCurrentView();
}

function bindAdminFruitRowEvents() {
  document.querySelectorAll('.adm-fruit-unit-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      const fid = inp.dataset.fruitId;
      const cost = Number(inp.dataset.cost || 0);
      const sell = Number(inp.value || 0);
      const prof = sell - cost;
      const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
      const badge = document.getElementById(`admFruitProfit_${fid}`);
      if (badge) {
        badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})`;
        badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector(`[data-save-fruit-row="${inp.dataset.fruitId}"]`)?.click();
      }
    });
  });

  document.querySelectorAll('[data-save-fruit-row]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fid = btn.dataset.saveFruitRow;
      const inp = document.querySelector(`.adm-fruit-unit-input[data-fruit-id="${fid}"]`);
      if (!inp) return;
      const val = Number(inp.value);
      const cost = Number(inp.dataset.cost || 0);
      if (!Number.isFinite(val) || val < 0) {
        showToast('Giá bán phải là số nguyên không âm.');
        return;
      }
      if (val < cost) {
        showToast(`Lưu ý: Giá nhập (${formatVnd(val)}) thấp hơn giá gốc (${formatVnd(cost)}) — hệ thống tự giữ tối thiểu bằng giá gốc.`);
      }
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
      try {
        await savePricingSettingsAndReload({ fruitUnitPrices: { [fid]: Math.round(val) } }, 'Đã cập nhật giá bán trái cây!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
        btn.textContent = '✓ Cập nhật';
      }
    });
  });

  document.querySelectorAll('[data-reset-fruit-override]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fid = btn.dataset.resetFruitOverride;
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload({ fruitUnitPrices: { [fid]: null } }, 'Đã đưa giá trái cây về chế độ tự động!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-open-mut-pricing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openAdminMutationPricingModal(Number(btn.dataset.openMutPricing));
    });
  });
}

function updateCategoryCardPreview(catKey) {
  const card = document.querySelector(`[data-cat-card="${catKey}"]`);
  const previewEl = document.getElementById(`admCatPreview_${catKey}`);
  if (!card || !previewEl) return;
  const sampleName = previewEl.dataset.sampleName;
  const sampleCost = Number(previewEl.dataset.sampleCost || 0);
  if (!sampleName) return;
  const activeModeBtn = card.querySelector('.pricing-mode-btn.is-active');
  const mode = activeModeBtn?.dataset.mode === 'percent' ? 'percent' : 'fixed';
  const fixedVal = Number(document.getElementById(`admCatFixed_${catKey}`)?.value || 0);
  const pctVal = Number(document.getElementById(`admCatPct_${catKey}`)?.value || 0);
  const sell = computePreviewSell(sampleCost, mode, fixedVal, pctVal);
  const profit = sell - sampleCost;
  previewEl.innerHTML = `VD: <strong>${escapeHtml(sampleName)}</strong> · gốc ${formatVnd(sampleCost)} → bán CTV <strong style="color:#236f60;">${formatVnd(sell)}</strong> <span style="color:#28754e;">(+${formatVnd(profit)})</span>`;
}

function buildCategoryPayload(catKey) {
  const card = document.querySelector(`[data-cat-card="${catKey}"]`);
  if (!card) return null;
  const mode = card.querySelector('.pricing-mode-btn.is-active')?.dataset.mode === 'percent' ? 'percent' : 'fixed';
  const applyOvr = document.getElementById(`admCatApplyOvr_${catKey}`);
  if (state.pricingCtvId) {
    const fixed = document.getElementById(`admCatFixed_${catKey}`).valueAsNumber;
    const percent = document.getElementById(`admCatPct_${catKey}`).valueAsNumber;
    const rule = { mode, fixed, percent };
    if (catKey === 'fruit_by_fruit') rule.orderFee = document.getElementById('admCatFruitOrderFee').valueAsNumber;
    const amounts = catKey === 'fruit_by_fruit' ? [fixed, rule.orderFee] : [fixed];
    if (amounts.some(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12) ||
        !Number.isFinite(percent) || percent < 0 || percent > 500 || Math.round(percent * 100) / 100 !== percent) {
      showToast('Nhập mức cộng và phí bằng số nguyên không âm. Phần trăm từ 0 đến 500%, tối đa 2 chữ số thập phân.');
      return null;
    }
    return { categoryRules: { [catKey]: rule }, ...(applyOvr?.checked && { resetCategoryOverrides: [catKey] }) };
  }
  const fixedVal = Math.max(0, Math.round(Number(document.getElementById(`admCatFixed_${catKey}`)?.value || 0)));
  const pctVal = Math.max(0, Math.min(500, Number(document.getElementById(`admCatPct_${catKey}`)?.value || 0)));
  const payload = {
    categoryMarkupModes: { [catKey]: mode },
    categoryMarkupPercents: { [catKey]: pctVal },
  };
  if (catKey === 'fruit_by_fruit') {
    payload.defaultFruitUnitMarkup = fixedVal;
    const feeEl = document.getElementById('admCatFruitOrderFee');
    if (feeEl) payload.categoryMarkups = { fruit_by_fruit: Math.max(0, Math.round(Number(feeEl.value || 0))) };
  } else {
    payload.categoryMarkups = { [catKey]: fixedVal };
  }
  if (applyOvr && applyOvr.checked) {
    payload.resetCategoryOverrides = [catKey];
  }
  return payload;
}

let admFruitSearchTimer = null;
function bindAdminPricingEvents() {
  document.getElementById('pricingCtvSelect')?.addEventListener('change', e => {
    const select = e.currentTarget;
    if (select.closest('.glass-panel')?.querySelector('[data-dirty="1"]') && !window.confirm('Bỏ thay đổi chưa lưu để chuyển bảng giá?')) {
      select.value = state.pricingCtvId;
      return;
    }
    state.pricingCtvId = select.value;
    loadCtvPricing(select.value);
  });
  document.getElementById('btnRefreshAdminPricing')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshAdminPricing');
    if (btn) { btn.disabled = true; btn.textContent = '↻ Đang tải...'; }
    if (state.pricingCtvId) return loadCtvPricing(state.pricingCtvId, true);
    showToast('Đang tải giá gốc mới nhất từ nguồn API...');
    await Promise.all([loadCatalog(true), loadAdminOverview()]);
    renderCurrentView();
  });

  document.querySelectorAll('[data-adm-ptab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPricingTab = btn.dataset.admPtab;
      renderCurrentView();
    });
  });

  // --- TAB 1: CATEGORY PRICING (FIXED VNĐ + PERCENT %) ---
  document.querySelectorAll('[data-cat-card]').forEach(card => {
    card.addEventListener('input', () => { card.dataset.dirty = '1'; });
  });
  document.querySelectorAll('[data-inherit-category]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload({ categoryRules: { [btn.dataset.inheritCategory]: null } });
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });
  document.querySelectorAll('[data-cat-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catKey = btn.dataset.catModeBtn;
      const mode = btn.dataset.mode;
      const card = document.querySelector(`[data-cat-card="${catKey}"]`);
      if (!card) return;
      card.dataset.dirty = '1';
      card.querySelectorAll('[data-cat-mode-btn]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
      const fWrap = card.querySelector(`[data-cat-fixed-wrap="${catKey}"]`);
      const pWrap = card.querySelector(`[data-cat-percent-wrap="${catKey}"]`);
      if (fWrap) fWrap.style.display = mode === 'fixed' ? 'flex' : 'none';
      if (pWrap) pWrap.style.display = mode === 'percent' ? 'flex' : 'none';
      updateCategoryCardPreview(catKey);
    });
  });

  document.querySelectorAll('[data-preset-cat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const catKey = chip.dataset.presetCat;
      const mode = chip.dataset.presetMode;
      const val = chip.dataset.presetVal;
      const inp = document.getElementById(mode === 'percent' ? `admCatPct_${catKey}` : `admCatFixed_${catKey}`);
      if (inp) {
        inp.value = val;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  document.querySelectorAll('.adm-cat-fixed-input, .adm-cat-pct-input').forEach((inp) => {
    inp.addEventListener('input', () => updateCategoryCardPreview(inp.dataset.catKey));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector(`[data-save-single-cat="${inp.dataset.catKey}"]`)?.click();
      }
    });
  });

  document.querySelectorAll('[data-save-single-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catKey = btn.dataset.saveSingleCat;
      const payload = buildCategoryPayload(catKey);
      if (!payload) return;
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
      try {
        await savePricingSettingsAndReload(payload, 'Đã cập nhật giá danh mục thành công!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
        btn.textContent = '✓ Cập nhật';
      }
    });
  });

  document.querySelectorAll('[data-reset-cat-overrides]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catKey = btn.dataset.resetCatOverrides;
      if (!confirm('Gỡ toàn bộ giá cố định riêng của danh mục này để chạy theo cấu hình tự động?')) return;
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload({ resetCategoryOverrides: [catKey] }, 'Đã gỡ toàn bộ giá riêng của danh mục!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  const saveAllCategories = async (triggerBtn) => {
    const categoryMarkups = {};
    const categoryMarkupModes = {};
    const categoryMarkupPercents = {};
    const categoryRules = {};
    const resetCategoryOverrides = [];
    let defaultFruitUnitMarkup;
    for (const cat of PRICING_CATEGORIES) {
      if (state.pricingCtvId && !document.querySelector(`[data-cat-card="${cat.key}"][data-dirty="1"]`)) continue;
      const sub = buildCategoryPayload(cat.key);
      if (!sub) return;
      Object.assign(categoryRules, sub.categoryRules);
      Object.assign(categoryMarkupModes, sub.categoryMarkupModes);
      Object.assign(categoryMarkupPercents, sub.categoryMarkupPercents);
      if (sub.categoryMarkups) Object.assign(categoryMarkups, sub.categoryMarkups);
      if (sub.defaultFruitUnitMarkup !== undefined) defaultFruitUnitMarkup = sub.defaultFruitUnitMarkup;
      if (sub.resetCategoryOverrides?.length) resetCategoryOverrides.push(...sub.resetCategoryOverrides);
    }
    if (state.pricingCtvId && !Object.keys(categoryRules).length) {
      showToast('Chưa có thay đổi giá danh mục cần lưu.');
      return;
    }
    const originalLabel = triggerBtn?.textContent;
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = 'Đang cập nhật...'; }
    try {
      const body = state.pricingCtvId ? { categoryRules } : { categoryMarkups, categoryMarkupModes, categoryMarkupPercents, defaultFruitUnitMarkup };
      if (resetCategoryOverrides.length > 0) body.resetCategoryOverrides = resetCategoryOverrides;
      await savePricingSettingsAndReload(
        body,
        'Đã cập nhật giá cho toàn bộ 8 danh mục!'
      );
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = originalLabel; }
    }
  };
  document.getElementById('btnSaveAllCatsBottom')?.addEventListener('click', (e) => saveAllCategories(e.currentTarget));

  // --- TAB 2: FIXED PACKAGES ---
  document.querySelectorAll('[data-adm-pkg-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPkgCatFilter = btn.dataset.admPkgFilter;
      renderCurrentView();
    });
  });

  document.querySelectorAll('.adm-pkg-override-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      const key = inp.dataset.pkgKey;
      const cost = Number(inp.dataset.cost || 0);
      const sell = Number(inp.value || 0);
      const prof = sell - cost;
      const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
      const badge = document.getElementById(`admPkgProfit_${key.replace(':', '_')}`);
      if (badge) {
        badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})`;
        badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector(`[data-save-pkg-row="${inp.dataset.pkgKey}"]`)?.click();
      }
    });
  });

  document.querySelectorAll('[data-save-pkg-row]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.savePkgRow;
      const inp = document.querySelector(`.adm-pkg-override-input[data-pkg-key="${key}"]`);
      if (!inp) return;
      const val = Number(inp.value);
      const cost = Number(inp.dataset.cost || 0);
      if (!Number.isFinite(val) || val <= 0) {
        showToast('Giá bán gói phải lớn hơn 0đ (hoặc bấm ↺ Tự động để gỡ giá riêng).');
        return;
      }
      if (val < cost) {
        showToast(`Lưu ý: Giá nhập (${formatVnd(val)}) thấp hơn giá gốc (${formatVnd(cost)}) — hệ thống tự giữ tối thiểu bằng giá gốc.`);
      }
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
      try {
        await savePricingSettingsAndReload({ packagePriceOverrides: { [key]: Math.round(val) } }, 'Đã cập nhật giá gói thành công!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
        btn.textContent = '✓ Cập nhật';
      }
    });
  });

  document.querySelectorAll('[data-reset-pkg-override]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.resetPkgOverride;
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload({ packagePriceOverrides: { [key]: null } }, 'Đã đặt lại gói về chế độ giá tự động!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  // --- TAB 3: FRUITS ---
  let activeFruitBarMode = state.adminOverview?.settings?.categoryMarkupModes?.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const switchFruitBarMode = (mode) => {
    activeFruitBarMode = mode;
    document.getElementById('btnFruitBarModeFixed')?.classList.toggle('is-active', mode === 'fixed');
    document.getElementById('btnFruitBarModePct')?.classList.toggle('is-active', mode === 'percent');
    const inp = document.getElementById('admFruitGeneralValInput');
    const unitEl = document.getElementById('admFruitGeneralUnit');
    if (inp) {
      inp.value = mode === 'percent'
        ? Number(state.adminOverview?.settings?.categoryMarkupPercents?.fruit_by_fruit ?? 0)
        : Number(state.adminOverview?.settings?.defaultFruitUnitMarkup ?? 40);
      inp.step = mode === 'percent' ? '1' : '10';
    }
    if (unitEl) unitEl.textContent = mode === 'percent' ? '%' : 'đ / trái';
  };
  document.getElementById('btnFruitBarModeFixed')?.addEventListener('click', () => switchFruitBarMode('fixed'));
  document.getElementById('btnFruitBarModePct')?.addEventListener('click', () => switchFruitBarMode('percent'));
  document.getElementById('btnSaveFruitGeneral')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const val = Number(document.getElementById('admFruitGeneralValInput')?.value || 0);
    const payload = { categoryMarkupModes: { fruit_by_fruit: activeFruitBarMode } };
    if (activeFruitBarMode === 'percent') payload.categoryMarkupPercents = { fruit_by_fruit: Math.max(0, Math.min(500, val)) };
    else payload.defaultFruitUnitMarkup = Math.max(0, Math.round(val));
    const applyAllOvr = document.getElementById('admFruitApplyAllOverrides');
    if (applyAllOvr && applyAllOvr.checked) {
      payload.resetCategoryOverrides = ['fruit_by_fruit'];
    }
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      await savePricingSettingsAndReload(payload, 'Đã cập nhật mức cộng chung cho tất cả trái cây!');
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '✓ Cập nhật mức chung';
    }
  });

  document.getElementById('admFruitFilterSelect')?.addEventListener('change', (e) => {
    state.adminFruitFilter = e.target.value;
    renderCurrentView();
  });

  const searchIn = document.getElementById('admFruitSearchInput');
  searchIn?.addEventListener('input', (e) => {
    state.adminFruitSearch = e.target.value;
    if (admFruitSearchTimer && typeof clearTimeout === 'function') clearTimeout(admFruitSearchTimer);
    admFruitSearchTimer = setTimeout(() => {
      const tbody = document.getElementById('admFruitTbody');
      if (!tbody) return;
      const fruits = adminPricingCatalog()?.catalog?.fruit_by_fruit || [];
      const q = state.adminFruitSearch.trim().toLowerCase();
      const filtered = fruits.filter((f) => {
        if (state.adminFruitFilter === 'custom' && !f._admin?.has_custom_override) return false;
        if (q && !f.name.toLowerCase().includes(q)) return false;
        return true;
      });
      tbody.innerHTML = renderAdminFruitRowsHtml(filtered);
      bindAdminFruitRowEvents();
    }, 80);
  });

  bindAdminFruitRowEvents();

  // --- TOP MASTER SAVE BUTTON (Works across ALL 3 tabs!) ---
  document.getElementById('btnSaveAllAdminPricing')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (state.adminPricingTab === 'categories') {
      await saveAllCategories(btn);
      return;
    }

    const payload = {};
    if (state.adminPricingTab === 'fruits') {
      const genInput = document.getElementById('admFruitGeneralValInput');
      if (genInput) {
        const val = Number(genInput.value || 0);
        payload.categoryMarkupModes = { fruit_by_fruit: activeFruitBarMode };
        if (activeFruitBarMode === 'percent') payload.categoryMarkupPercents = { fruit_by_fruit: Math.max(0, Math.min(500, val)) };
        else payload.defaultFruitUnitMarkup = Math.max(0, Math.round(val));
      }
      const fruitUnitPrices = {};
      document.querySelectorAll('.adm-fruit-unit-input[data-dirty="1"]').forEach((inp) => {
        fruitUnitPrices[inp.dataset.fruitId] = inp.value === '' ? null : Math.round(Number(inp.value));
      });
      if (Object.keys(fruitUnitPrices).length > 0) {
        payload.fruitUnitPrices = fruitUnitPrices;
      } else if (document.getElementById('admFruitApplyAllOverrides')?.checked) {
        payload.resetCategoryOverrides = ['fruit_by_fruit'];
      }
    } else if (state.adminPricingTab === 'packages') {
      const packagePriceOverrides = {};
      document.querySelectorAll('.adm-pkg-override-input[data-dirty="1"]').forEach((inp) => {
        packagePriceOverrides[inp.dataset.pkgKey] = inp.value === '' ? null : Math.round(Number(inp.value));
      });
      if (Object.keys(packagePriceOverrides).length > 0) payload.packagePriceOverrides = packagePriceOverrides;
    }

    if (Object.keys(payload).length === 0) {
      showToast('Chưa có thay đổi giá nào cần lưu.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      await savePricingSettingsAndReload(payload, 'Đã cập nhật toàn bộ thay đổi bảng giá!');
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '💾 Cập nhật tất cả thay đổi';
    }
  });
}

function openAdminMutationPricingModal(fruitId) {
  const f = (adminPricingCatalog()?.catalog?.fruit_by_fruit || []).find((x) => Number(x.id) === Number(fruitId));
  if (!f) return;

  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box wide';
  const ctv = state.adminOverview?.ctvs?.find(u => u.id === state.pricingCtvId);
  title.textContent = `Chỉnh giá 19 Hệ Đột Biến: ${f.name}${ctv ? ' · @' + ctv.username : ''}`;
  const muts = f.mutation_prices || [];

  body.innerHTML = `
    <div style="background:rgba(102,58,243,0.12);padding:12px 14px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--color-pure-white);font-weight:600;">Áp nhanh cả 19 hệ:</span>
        <input type="number" id="mutBulkPctInput" class="input-box" style="width:90px;padding:6px 8px;" placeholder="%" value="20" min="0" max="500" />
        <button type="button" class="btn-frost" id="btnApplyMutBulkPct" style="padding:6px 10px;font-size:12px;">Áp dụng +%</button>
        <input type="number" id="mutBulkVndInput" class="input-box" style="width:110px;padding:6px 8px;" placeholder="VNĐ" value="500" step="100" min="0" />
        <button type="button" class="btn-frost" id="btnApplyMutBulkVnd" style="padding:6px 10px;font-size:12px;">Áp dụng +VNĐ</button>
      </div>
      <button type="button" class="btn-frost" id="btnResetAllMutAuto" style="padding:6px 10px;font-size:11.5px;color:#ab334a;">↺ Đặt lại tất cả về tự động</button>
    </div>

    <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>HỆ ĐỘT BIẾN</th>
            <th>GIÁ GỐC NGUỒN</th>
            <th>GIÁ BÁN CHO CTV (VNĐ)</th>
            <th>LÃI / TRÁI</th>
          </tr>
        </thead>
        <tbody>
          ${muts
            .map((m) => {
              const cost = m._admin?.cost_unit_price ?? m.unit_price;
              const prof = m.unit_price - cost;
              const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
              const hasOvr = !!m._admin?.has_custom_override;
              return `
            <tr>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <span style="width:10px;height:10px;border-radius:999px;background:${m.mutation_color};"></span>
                  <strong style="color:var(--color-pure-white);">${escapeHtml(m.mutation_name)}</strong>
                </span>
                <div style="font-size:10px;color:${hasOvr ? '#895d0a' : '#236f60'};margin-top:2px;">${hasOvr ? 'Giá cố định riêng' : 'Tự động'}</div>
              </td>
              <td>${formatVnd(cost)}</td>
              <td style="max-width:170px;">
                <input
                  type="number"
                  class="input-box adm-mut-price-input"
                  data-mut-key="${f.id}:${m.mutation_key}"
                  data-cost="${cost}"
                  value="${m.unit_price}"
                  step="100"
                  min="0"
                />
              </td>
              <td>
                <span class="badge-tag ${prof >= 0 ? 'green' : 'red'}" id="admMutProf_${f.id}_${m.mutation_key}">
                  ${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})
                </span>
              </td>
            </tr>
          `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="action-row align-end">
      <button type="button" class="btn-frost" id="btnCloseMutModal">Đóng</button>
      <button type="button" class="btn-violet" id="btnSaveMutPrices">✓ Cập nhật giá đột biến</button>
    </div>
  `;

  const updateMutRowBadge = (inp) => {
    const cost = Number(inp.dataset.cost || 0);
    const sell = Number(inp.value || 0);
    const prof = sell - cost;
    const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
    const badge = document.getElementById(`admMutProf_${inp.dataset.mutKey.replace(':', '_')}`);
    if (badge) {
      badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})`;
      badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
    }
  };

  body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      updateMutRowBadge(inp);
    });
  });

  body.querySelector('#btnApplyMutBulkPct')?.addEventListener('click', () => {
    const pct = Math.max(0, Math.min(500, Number(body.querySelector('#mutBulkPctInput')?.value || 0)));
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      const cost = Number(inp.dataset.cost || 0);
      inp.value = Math.round(cost * (100 + pct) / 100);
      inp.dataset.dirty = '1';
      updateMutRowBadge(inp);
    });
    showToast(`Đã điền thử +${pct}% cho cả 19 hệ — bấm "✓ Cập nhật giá đột biến" để lưu.`);
  });

  body.querySelector('#btnApplyMutBulkVnd')?.addEventListener('click', () => {
    const add = Math.max(0, Math.round(Number(body.querySelector('#mutBulkVndInput')?.value || 0)));
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      const cost = Number(inp.dataset.cost || 0);
      inp.value = cost + add;
      inp.dataset.dirty = '1';
      updateMutRowBadge(inp);
    });
    showToast(`Đã điền thử +${formatVnd(add)} cho cả 19 hệ — bấm "✓ Cập nhật giá đột biến" để lưu.`);
  });

  body.querySelector('#btnResetAllMutAuto')?.addEventListener('click', async () => {
    const fruitMutationPrices = {};
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      fruitMutationPrices[inp.dataset.mutKey] = null;
    });
    try {
      overlay.style.display = 'none';
      await savePricingSettingsAndReload({ fruitMutationPrices }, `Đã đưa 19 hệ đột biến của ${f.name} về tự động!`);
    } catch (err) {
      showToast(err.message);
    }
  });

  body.querySelector('#btnCloseMutModal')?.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  body.querySelector('#btnSaveMutPrices')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const fruitMutationPrices = {};
    body.querySelectorAll('.adm-mut-price-input[data-dirty="1"]').forEach((inp) => {
      fruitMutationPrices[inp.dataset.mutKey] = inp.value === '' ? null : Math.round(Number(inp.value));
    });
    if (Object.keys(fruitMutationPrices).length === 0) {
      showToast('Chưa có thay đổi giá đột biến nào cần lưu.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      overlay.style.display = 'none';
      await savePricingSettingsAndReload({ fruitMutationPrices }, `Đã cập nhật giá đột biến cho ${f.name}!`);
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
      btn.textContent = '✓ Cập nhật giá đột biến';
    }
  });

  overlay.style.display = 'flex';
}

// ============================================================================
// 7. ADMIN PAGE: QUẢN LÝ TÀI KHOẢN CTV & CẤU HÌNH HỆ THỐNG
// ============================================================================
function renderAdminCtvPageHtml() {
  const ctvs = state.adminOverview?.ctvs || [];
  const stats = state.adminOverview?.stats || {};
  const storage = state.adminOverview?.storage || {};
  const isMaintenance = Boolean(state.adminOverview?.settings?.maintenanceMode);
  const ephemeralBanner = storage.isRender && !storage.persistent
    ? `
      <div class="tool-warning" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span>⚠️ Đang chạy trên ổ tạm Render Free (chưa gắn PostgreSQL miễn phí). Tài khoản CTV và số dư sẽ bị mất khi Render tắt/redeploy — hãy gắn <strong>Neon PostgreSQL miễn phí</strong> trong mục <strong>Cấu hình Nguồn API</strong>.</span>
        <button type="button" class="btn-frost" id="btnGotoStorageSetup" style="font-size:12px;">Xem hướng dẫn gắn DB miễn phí →</button>
      </div>
    `
    : '';

  const maintenanceBanner = `
    <div class="glass-panel" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;border:1px solid ${isMaintenance ? 'rgba(248,113,113,0.55)' : 'rgba(167,139,250,0.3)'};background:${isMaintenance ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'};">
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong style="color:var(--color-pure-white);font-size:15px;">🛠️ Chế độ Bảo trì CTV</strong>
          <span class="badge-tag ${isMaintenance ? 'red' : 'green'}">${isMaintenance ? '● ĐANG BẢO TRÌ' : '● Đang hoạt động'}</span>
        </div>
        <div style="font-size:12.5px;color:var(--color-moon-mist);">
          ${
            isMaintenance
              ? 'Toàn bộ tài khoản CTV đang đăng nhập hiện đang thấy màn hình <strong>"Hệ thống ebongiu đang bảo trì"</strong> và tạm khóa đặt đơn. Tài khoản Admin vẫn truy cập bình thường.'
              : 'Khi bật nút <strong>Bảo trì</strong>, tất cả các tài khoản CTV đang đăng nhập sẽ ngay lập tức hiển thị <strong>"Hệ thống ebongiu đang bảo trì"</strong> (Admin vẫn dùng bình thường).'
          }
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn-violet" id="btnNotifyCtvUpdate" style="padding:9px 16px;font-size:13px;font-weight:700;">
          🔄 Cập nhật cho CTV
        </button>
        <button type="button" class="${isMaintenance ? 'btn-violet' : 'btn-frost'}" id="btnToggleMaintenanceMode" style="padding:9px 18px;font-size:13px;font-weight:700;${isMaintenance ? '' : 'border-color:rgba(251,191,36,0.5);color:#895d0a;'}">
          ${isMaintenance ? '✓ Tắt bảo trì (Mở lại cho CTV)' : '🛠️ Bảo trì'}
        </button>
      </div>
    </div>
  `;

  return `
    ${ephemeralBanner}
    ${maintenanceBanner}
    <div class="stats-three-grid">
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng số tài khoản CTV</div>
        <div style="font-size:24px;font-weight:700;color:var(--color-pure-white);margin-top:4px;">${ctvs.length} CTV</div>
      </div>
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng doanh thu CTV đặt đơn</div>
        <div style="font-size:24px;font-weight:700;color:#895d0a;margin-top:4px;">${formatVnd(stats.totalRevenue || 0)}</div>
      </div>
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng lợi nhuận chênh lệch Admin</div>
        <div style="font-size:24px;font-weight:700;color:#28754e;margin-top:4px;">+${formatVnd(stats.totalProfit || 0)}</div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">+ Tạo Tài Khoản Mới Cho CTV Đặt Đơn</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;align-items:end;">
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Họ tên / Biệt danh CTV (*)</label>
          <input type="text" id="newCtvName" class="input-box" placeholder="VD: CTV Hoàng Nam" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Tên đăng nhập (*)</label>
          <input type="text" id="newCtvUsername" class="input-box" placeholder="VD: ctvnam01" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Mật khẩu (*)</label>
          <input type="password" id="newCtvPassword" class="input-box" autocomplete="new-password" minlength="12" maxlength="128" placeholder="Mật khẩu riêng, tối thiểu 12 ký tự" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">SĐT / Zalo</label>
          <input type="text" id="newCtvPhone" class="input-box" placeholder="09xxxxxxxx" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Số dư ví nạp sẵn (VNĐ)</label>
          <input type="number" id="newCtvBalance" class="input-box" value="0" step="50000" min="0" />
        </div>
        <div>
          <button type="button" class="btn-violet" id="btnCreateCtvSubmit" style="width:100%;">
            + Tạo Tài Khoản CTV
          </button>
        </div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Danh sách Cộng tác viên (CTV phải có số dư ví > 0đ mới được đặt đơn)</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TÊN CTV</th>
              <th>USERNAME / EMAIL</th>
              <th>SỐ DƯ VÍ HIỆN TẠI</th>
              <th>SỐ ĐƠN ĐÃ ĐẶT</th>
              <th>DOANH SỐ / LÃI THU VỀ</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${ctvs
              .map(
                (u) => `
              <tr>
                <td><strong style="color:var(--color-pure-white);">${escapeHtml(u.name)}</strong><div style="font-size:11px;color:var(--color-fog-veil);">SĐT: ${escapeHtml(u.phone || '—')}</div></td>
                <td><strong>${escapeHtml(u.username)}</strong><div style="font-size:11px;color:var(--color-fog-veil);">${escapeHtml(u.email)}</div></td>
                <td><strong style="font-size:15px;color:${u.balance > 0 ? '#28754e' : '#ab334a'};">${formatVnd(u.balance)}</strong></td>
                <td>${u.totalOrders || 0} đơn</td>
                <td>
                  <div>Đã mua: ${formatVnd(u.totalSpent || 0)}</div>
                  <div style="font-size:11px;color:#28754e;">Lãi Admin: +${formatVnd(u.totalProfit || 0)}</div>
                </td>
                <td>
                  <span class="badge-tag ${u.isLocked ? 'red' : u.balance > 0 ? 'green' : 'amber'}">
                    ${u.isLocked ? 'Đã khóa' : u.balance > 0 ? 'Đủ điều kiện đặt đơn' : 'Ví 0đ (Tạm chặn)'}
                  </span>
                </td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn-violet" style="padding:4px 10px;font-size:11px;" data-topup-ctv="${u.id}" data-ctv-name="${escapeHtml(u.name)}">
                      + Nạp / Trừ ví
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-lock-ctv="${u.id}" data-locked="${u.isLocked ? '1' : '0'}">
                      ${u.isLocked ? 'Mở khóa' : 'Khóa'}
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;color:#ab334a;" data-del-ctv="${u.id}">
                      Ngừng tài khoản
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-reset-ctv="${u.id}">Đổi mật khẩu</button>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openResetCtvPasswordModal(ctvId) {
  const overlay = document.getElementById('appModalOverlay');
  const body = document.getElementById('appModalBody');
  document.getElementById('appModalBox').className = 'modal-box';
  document.getElementById('appModalTitle').textContent = 'Đổi mật khẩu CTV';
  body.innerHTML = `<form id="resetCtvForm" class="tool-form tool-form-column"><p class="tool-note">Sau khi đổi mật khẩu, tất cả phiên của CTV sẽ bị thu hồi.</p><label>Mật khẩu mới<input type="password" class="input-box" name="password" autocomplete="new-password" minlength="12" maxlength="128" required /></label><label>Nhập lại mật khẩu<input type="password" class="input-box" name="confirmation" autocomplete="new-password" minlength="12" maxlength="128" required /></label><button type="submit" class="btn-violet">Đổi mật khẩu</button></form>`;
  overlay.style.display = 'flex';
  body.querySelector('#resetCtvForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    if (form.elements.password.value !== form.elements.confirmation.value) { showToast('Mật khẩu nhập lại chưa khớp.'); return; }
    submit.disabled = true;
    try {
      const result = await apiFetch(`/api/admin/ctv/${encodeURIComponent(ctvId)}`, 'PUT', { password: form.elements.password.value });
      overlay.style.display = 'none'; body.innerHTML = ''; showToast(result.message);
    } catch (error) { showToast(error.message); }
    finally { submit.disabled = false; }
  });
}

function bindAdminCtvEvents() {
  document.getElementById('btnGotoStorageSetup')?.addEventListener('click', () => {
    switchView('admin_system');
  });
  document.getElementById('btnNotifyCtvUpdate')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '⏳ Đang gửi...';
    try {
      const r = await apiFetch('/api/admin/notify-update', 'POST');
      showToast(r.message || 'Đã gửi thông báo cập nhật cho CTV!');
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });
  document.getElementById('btnToggleMaintenanceMode')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const currentlyOn = Boolean(state.adminOverview?.settings?.maintenanceMode);
    const nextEnabled = !currentlyOn;
    const confirmText = nextEnabled
      ? 'Bật chế độ Bảo trì?\n\nTất cả các tài khoản CTV đang đăng nhập sẽ hiển thị "Hệ thống ebongiu đang bảo trì" và tạm khóa đặt đơn. Tài khoản Admin vẫn truy cập bình thường.'
      : 'Tắt chế độ Bảo trì và mở lại hệ thống cho toàn bộ CTV?';
    if (!confirm(confirmText)) return;
    btn.disabled = true;
    try {
      const r = await apiFetch('/api/admin/maintenance', 'POST', { enabled: nextEnabled });
      showToast(r.message);
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
    }
  });
  document.querySelectorAll('[data-reset-ctv]').forEach(button => button.addEventListener('click', async () => {
    openResetCtvPasswordModal(button.dataset.resetCtv);
  }));
  document.getElementById('btnCreateCtvSubmit')?.addEventListener('click', async () => {
    const name = document.getElementById('newCtvName')?.value || '';
    const username = document.getElementById('newCtvUsername')?.value || '';
    const password = document.getElementById('newCtvPassword')?.value || '';
    const phone = document.getElementById('newCtvPhone')?.value || '';
    const balance = Number(document.getElementById('newCtvBalance')?.value || 0);

    try {
      const r = await apiFetch('/api/admin/ctv', 'POST', { name, username, password, phone, balance });
      showToast(r.message);
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.querySelectorAll('[data-topup-ctv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openTopupCtvModal(btn.dataset.topupCtv, btn.dataset.ctvName);
    });
  });

  document.querySelectorAll('[data-lock-ctv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.lockCtv;
      const locked = btn.dataset.locked === '1';
      try {
        const r = await apiFetch(`/api/admin/ctv/${id}`, 'PUT', { isLocked: !locked });
        showToast(r.message);
        await loadAdminOverview();
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll('[data-del-ctv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ngừng tài khoản CTV này? Các phiên sẽ bị thu hồi; số dư và lịch sử vẫn được giữ để đối soát.')) return;
      try {
        const r = await apiFetch(`/api/admin/ctv/${btn.dataset.delCtv}`, 'DELETE');
        showToast(r.message);
        await loadAdminOverview();
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openTopupCtvModal(ctvId, ctvName) {
  const adjustmentKey = createRequestKey();
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box';
  title.textContent = `💲 Nạp / Điều chỉnh số dư ví CTV: ${ctvName}`;
  body.innerHTML = `
    <div>
      <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Số tiền điều chỉnh (Nhập số dương để nạp, số âm để trừ):</label>
      <input type="number" id="modalTopupAmt" class="input-box" value="100000" step="10000" />
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="btn-frost" data-q-amt="50000">+50.000đ</button>
      <button type="button" class="btn-frost" data-q-amt="100000">+100.000đ</button>
      <button type="button" class="btn-frost" data-q-amt="500000">+500.000đ</button>
      <button type="button" class="btn-frost" data-q-amt="-50000">Trừ 50.000đ</button>
    </div>
    <div>
      <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Ghi chú:</label>
      <input type="text" id="modalTopupNote" class="input-box" value="Admin nạp tiền ví CTV" />
    </div>
    <div class="action-row align-end">
      <button type="button" class="btn-violet" id="btnConfirmTopupSubmit">Xác nhận cập nhật →</button>
    </div>
  `;

  body.querySelectorAll('[data-q-amt]').forEach((b) => {
    b.addEventListener('click', () => {
      body.querySelector('#modalTopupAmt').value = b.dataset.qAmt;
    });
  });

  body.querySelector('#btnConfirmTopupSubmit')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    const amount = Number(body.querySelector('#modalTopupAmt')?.value || 0);
    const note = body.querySelector('#modalTopupNote')?.value || '';
    try {
      const r = await apiFetch(`/api/admin/ctv/${ctvId}/balance`, 'POST', { amount, note, idempotency_key: adjustmentKey });
      showToast(r.message);
      overlay.style.display = 'none';
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  overlay.style.display = 'flex';
}

function renderAdminSystemPageHtml() {
  const srcCfg = state.adminOverview?.settings?.source || {};
  const storage = state.adminOverview?.storage || { mode: 'json', persistent: false, isRender: false, healthy: true };
  const stats = state.adminOverview?.stats || {};
  const isPg = storage.mode === 'postgresql';

  return `
    <div class="glass-panel" style="max-width:760px;">
      <div class="panel-title-row">
        <span class="panel-title-text">💾 Lưu trữ Dữ liệu & Sao lưu (Chống mất tài khoản CTV)</span>
        <span class="badge-tag ${isPg ? 'green' : storage.isRender ? 'red' : 'amber'}">
          ${isPg ? '● PostgreSQL (Bền vững — Không mất khi hosting tắt)' : storage.isRender ? '● JSON ổ tạm Render (Sẽ mất khi ngủ/redeploy)' : '● JSON cục bộ (data/db.json)'}
        </span>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tài khoản CTV</div>
            <strong style="font-size:18px;color:var(--color-pure-white);">${stats.totalCtvCount || 0} CTV</strong>
          </div>
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tổng số dư ví CTV</div>
            <strong style="font-size:18px;color:#28754e;">${formatVnd(stats.totalCtvBalance || 0)}</strong>
          </div>
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Đơn hàng / Giao dịch</div>
            <strong style="font-size:18px;color:#895d0a;">${stats.totalLocalOrders || 0} / ${stats.totalTransactions || 0}</strong>
          </div>
        </div>

        ${!isPg ? `
          <div class="storage-guide-box">
            <strong style="color:var(--color-pure-white);">✨ Phương án lưu trữ MIỄN PHÍ vĩnh viễn cho Render Free (&lt;10 CTV): Neon PostgreSQL</strong>
            <ol>
              <li>Vào <strong>neon.tech</strong> (đăng nhập bằng GitHub/Google, miễn phí 0đ trọn đời, không cần thẻ tín dụng) → Tạo Project mới (chọn Region gần Render như Singapore hoặc US East).</li>
              <li>Bấm <strong>Connect</strong> → Copy chuỗi kết nối PostgreSQL (bắt đầu bằng <code>postgresql://...</code>).</li>
              <li>Vào Render Dashboard → dịch vụ BongPT → <strong>Environment</strong> → Thêm biến <code>DATABASE_URL</code> = chuỗi vừa copy → Lưu &amp; Deploy lại. Dữ liệu CTV, ví, đơn hàng và bảng giá được lưu trên PostgreSQL qua các lần Render khởi động lại.</li>
            </ol>
            <div style="font-size:12px;color:var(--color-fog-veil);">
              💡 Mẹo giữ web mượt không bị ngủ 15 phút: Tạo monitor miễn phí trên <strong>UptimeRobot</strong> hoặc <strong>cron-job.org</strong> gọi <code>https://&lt;domain-của-bạn&gt;/api/ping</code> mỗi 10 phút.
            </div>
          </div>
        ` : `
          <div style="font-size:12.5px;color:#236f60;background:rgba(38,150,132,0.12);padding:10px 14px;border-radius:10px;">
            ✓ Hệ thống đang kết nối PostgreSQL bền vững. Toàn bộ tài khoản CTV, số dư ví, đơn hàng và bảng giá được bảo toàn an toàn khi hosting nghỉ hoặc khởi động lại.
          </div>
        `}

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="btn-frost" id="btnExportBackupJson">⬇ Tải bản sao lưu JSON</button>
          <button type="button" class="btn-frost" id="btnImportBackupJson">⬆ Khôi phục từ file JSON</button>
          <input type="file" id="admBackupFileInput" accept="application/json,.json" style="display:none;" />
          <span style="font-size:11.5px;color:var(--color-fog-veil);">Bản sao lưu không chứa mật khẩu hay token nguồn API.</span>
        </div>
      </div>
    </div>

    <div class="glass-panel" style="max-width:760px;">
      <div class="panel-title-row">
        <span class="panel-title-text">⚙️ Cấu hình Tài khoản Nguồn API</span>
        <span class="badge-tag ${srcCfg.connected ? 'green' : 'red'}">
          ${srcCfg.connected ? '● Đã kết nối' : '○ Chưa kết nối'}
        </span>
      </div>
      ${srcCfg.lastError ? `<div style="color:#ab334a;font-size:12px;">${escapeHtml(srcCfg.lastError)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Email tài khoản nguồn API:</label>
          <input type="email" id="admSrcEmail" class="input-box" value="${escapeHtml(srcCfg.email || '')}" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Mật khẩu nguồn API (Để trống nếu giữ nguyên):</label>
          <input type="password" id="admSrcPassword" class="input-box" autocomplete="new-password" placeholder="••••••••" />
        </div>
        <div class="action-row align-end">
          <button type="button" class="btn-frost" id="btnAdmReconnectSrc">↻ Đồng bộ & Kết nối lại Token</button>
          <button type="button" class="btn-violet" id="btnAdmSaveSrc">Lưu cấu hình nguồn</button>
        </div>
      </div>
    </div>
    <form class="glass-panel" id="adminPasswordForm" style="max-width:760px;display:flex;flex-direction:column;gap:14px;">
      <div class="panel-title-text">Đổi mật khẩu đăng nhập Admin</div>
      <div style="font-size:12px;color:var(--color-moon-mist);">Sau khi đổi mật khẩu, tất cả phiên đăng nhập Admin sẽ được đăng xuất.</div>
      <label>Mật khẩu hiện tại
        <input type="password" id="admCurrentPassword" class="input-box" autocomplete="current-password" required />
      </label>
      <label>Mật khẩu mới (12–128 ký tự)
        <input type="password" id="admNewPassword" class="input-box" autocomplete="new-password" minlength="12" maxlength="128" required />
      </label>
      <label>Nhập lại mật khẩu mới
        <input type="password" id="admConfirmPassword" class="input-box" autocomplete="new-password" minlength="12" maxlength="128" required />
      </label>
      <button type="submit" class="btn-violet">Đổi mật khẩu Admin</button>
    </form>
  `;
}

function bindAdminSystemEvents() {
  document.getElementById('btnExportBackupJson')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnExportBackupJson');
    if (btn) btn.disabled = true;
    try {
      const r = await apiFetch('/api/admin/backup/export');
      const blob = new Blob([JSON.stringify(r.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ebongiu-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Đã tải bản sao lưu JSON thành công!');
    } catch (err) {
      showToast(`Lỗi sao lưu: ${err.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const fileInput = document.getElementById('admBackupFileInput');
  document.getElementById('btnImportBackupJson')?.addEventListener('click', () => {
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!confirm(`Khôi phục toàn bộ CTV, số dư, đơn hàng và bảng giá từ tệp "${file.name}"? Dữ liệu hiện tại sẽ được thay thế bằng bản sao lưu này.`)) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload = parsed.backup ? { backup: parsed.backup } : { backup: parsed };
      const r = await apiFetch('/api/admin/backup/import', 'POST', payload);
      showToast(r.message || 'Đã khôi phục dữ liệu thành công!');
      await Promise.all([loadAdminOverview(), loadCatalog(true), loadOrders(true)]);
      renderCurrentView();
    } catch (err) {
      showToast(`Lỗi khôi phục: ${err.message}`);
    }
  });
  document.getElementById('adminPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const currentPassword = document.getElementById('admCurrentPassword').value;
    const newPassword = document.getElementById('admNewPassword').value;
    if (newPassword !== document.getElementById('admConfirmPassword').value) {
      showToast('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const r = await apiFetch('/api/admin/password', 'PUT', { currentPassword, newPassword });
      clearAuthState();
      updateShellAuthUI();
      showToast(r.message);
    } catch (err) {
      showToast(err.message);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('btnAdmReconnectSrc')?.addEventListener('click', async () => {
    const button = document.getElementById('btnAdmReconnectSrc');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Đang kết nối...';
    try {
      showToast('⏳ Đang kết nối lại và đồng bộ dữ liệu...');
      const r = await apiFetch('/api/admin/source/reconnect', 'POST');
      showToast(r.message);
      await Promise.all([loadCatalog(true), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      await loadAdminOverview();
      renderCurrentView();
    } finally {
      button.disabled = false;
      button.textContent = '↻ Đồng bộ & Kết nối lại Token';
    }
  });

  document.getElementById('btnAdmSaveSrc')?.addEventListener('click', async () => {
    const button = document.getElementById('btnAdmSaveSrc');
    if (button.disabled) return;
    button.disabled = true;
    const sourceEmail = document.getElementById('admSrcEmail')?.value || '';
    const sourcePassword = document.getElementById('admSrcPassword')?.value || '';
    try {
      const r = await apiFetch('/api/admin/settings', 'PUT', { sourceEmail, sourcePassword });
      showToast(r.message);
      await Promise.all([loadCatalog(true), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      await loadAdminOverview();
      renderCurrentView();
    } finally {
      button.disabled = false;
    }
  });
}

// ============================================================================
// GLOBAL EVENTS & BOOTSTRAP
// ============================================================================
function bindGlobalEvents() {
  // Catalog auto-sync schedule: Admin every 1 min, CTV every 10 min (zero lag; pre-order modal ALWAYS live-syncs!).
  let lastClientCatalogSyncAt = Date.now();
  setInterval(async () => {
    if (!state.user || document.hidden) return;
    const isAdmin = state.user.role === 'admin';
    const intervalMs = isAdmin ? 60 * 1000 : 10 * 60 * 1000;
    if (Date.now() - lastClientCatalogSyncAt < intervalMs) return;
    lastClientCatalogSyncAt = Date.now();
    try {
      const catChanged = await loadCatalog(false);
      if (catChanged && !isUserTypingOrModalOpen() && (ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'admin_pricing')) {
        renderCurrentView();
      }
    } catch {}
  }, 30000);

  // Sync session, wallet balance, and live orders every 60s.
  setInterval(async () => {
    if (!state.user || document.hidden) return;
    try {
      const result = await apiFetch('/api/auth/me');
      if (result.user) { state.user = result.user; updateShellAuthUI(); }
      if (state.currentView === 'admin_monitor' && state.user?.role === 'admin') {
        await loadAdminMonitor();
      } else if ((ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'order_history') && !isUserTypingOrModalOpen()) {
        const changed = await loadOrders(false);
        if (changed && !isUserTypingOrModalOpen()) renderCurrentView();
      }
    } catch {}
  }, 60000);

  // Ultra-light maintenance & update check every 10s for CTVs (zero DB load)
  const checkCtvMaintenance = async () => {
    if (!state.token || state.user?.role === 'admin' || document.hidden) return;
    try {
      const p = await fetch('/api/ping', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
      if (!p) return;
      if (p.maintenance) {
        setCtvMaintenanceOverlay(true, 'Hệ thống ebongiu đang bảo trì');
      } else if (state.maintenanceLocked) {
        setCtvMaintenanceOverlay(false);
        await initAuth();
        if (state.user) await loadInitialAppData();
      }
      const remoteVer = Number(p.updateVersion || 0);
      if (p.pricingVersion && p.pricingVersion !== state.lastFullPricingVersion && state.user?.role === 'ctv' &&
          !state.maintenanceLocked && !state.loadingCatalog && !isUserTypingOrModalOpen()) {
        await loadCatalog(false);
        if (!isUserTypingOrModalOpen() && (ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard')) renderCurrentView();
      }
      if (state.seenUpdateVersion == null) {
        state.seenUpdateVersion = remoteVer;
      } else if (remoteVer > state.seenUpdateVersion && !state.maintenanceLocked) {
        setCtvUpdateBanner(true);
      }
    } catch {}
  };
  setInterval(checkCtvMaintenance, 10000);

  // When returning to tab, refresh only if stale (> 1 min for Admin, > 10 min for CTV).
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      if (state.token && state.user?.role !== 'admin') await checkCtvMaintenance();
      if (!state.user || state.maintenanceLocked) return;
      const intervalMs = state.user.role === 'admin' ? 60 * 1000 : 10 * 60 * 1000;
      if (Date.now() - lastClientCatalogSyncAt < intervalMs) return;
      lastClientCatalogSyncAt = Date.now();
      try {
        const catChanged = await loadCatalog(false);
        if (catChanged && !isUserTypingOrModalOpen() && (ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'admin_pricing')) {
          renderCurrentView();
        }
      } catch {}
    });
  }
  // Sidebar menu navigation
  document.querySelectorAll('.sidebar-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  document.getElementById('brandHomeLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('dashboard');
  });

  // Mobile sidebar toggle
  document.getElementById('btnToggleMobileSidebar')?.addEventListener('click', () => {
    setMobileMenuOpen(!document.getElementById('appSidebar')?.classList.contains('is-open'));
  });
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    setMobileMenuOpen(false);
  });

  window.matchMedia?.('(max-width: 860px)').addEventListener('change', () => setMobileMenuOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('appSidebar')?.classList.contains('is-open')) {
      setMobileMenuOpen(false);
      document.getElementById('btnToggleMobileSidebar')?.focus();
    }
  });

  // Modal close
  document.getElementById('btnCloseAppModal')?.addEventListener('click', () => {
    document.getElementById('appModalOverlay').style.display = 'none';
  });

  // Logout always returns to the credential form.
  document.getElementById('btnTopLogout')?.addEventListener('click', logout);

  // Auth Gate Login Events
  document.getElementById('gateLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = document.getElementById('btnGateSubmitLogin');
    if (submitButton.disabled) return;
    submitButton.disabled = true;
    const id = document.getElementById('gateLoginId')?.value || '';
    const pw = document.getElementById('gateLoginPw')?.value || '';
    const errEl = document.getElementById('gateLoginError');
    try {
      if (errEl) errEl.style.display = 'none';
      await loginWithCredentials(id, pw);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

function installClientProtection() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  document.addEventListener('keydown', (e) => {
    const key = String(e.key || '').toLowerCase();
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const isBlockedShortcut =
      e.key === 'F12' ||
      (ctrlOrMeta && (key === 'u' || key === 's')) ||
      (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(key));
    if (isBlockedShortcut) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('contextmenu', (e) => {
    const target = e.target;
    const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
    const hasSelection = typeof window !== 'undefined' && typeof window.getSelection === 'function' && String(window.getSelection()).trim().length > 0;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || hasSelection) return;
    e.preventDefault();
  });
}

async function bootstrap() {
  installClientProtection();
  bindGlobalEvents();
  await initAuth();
  if (state.user) {
    await loadInitialAppData();
  }
}

bootstrap();
