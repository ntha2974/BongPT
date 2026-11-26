export function createToolViews({ state, apiFetch, moreButton, bindMore, createRequestKey, escapeHtml: esc, showToast, formatVnd: money, formatDateVi: date, renderCurrentView, loadOrders }) {
  const panel = (title, content, extra = '') => `<section class="glass-panel" ${extra}><div class="panel-title-row"><span class="panel-title-text">${title}</span></div>${content}</section>`;
  const button = (label, attribute, id, cls = 'btn-frost') => `<button type="button" class="${cls}" ${attribute}="${esc(id)}">${label}</button>`;

  const CAT_LABELS = {
    fruit_coin: 'Xu nông trại',
    fruit_by_fruit: 'Trái cây lẻ',
    buff_tim: 'Buff Tim',
    buff_sao: 'Buff Sao',
    guestbook: 'Bài viết',
    farm_gift: 'Quà nông trại',
    mail_gift: 'Quà thư',
    weather_buff: 'Buff Thời Tiết',
  };

  function formatAuditAction(action) {
    const a = String(action || '');
    if (a === 'POST /auth/login') return '🔑 Đăng nhập hệ thống';
    if (a === 'POST /auth/logout') return '🚪 Đăng xuất';
    if (a === 'POST /orders/place') return '🛒 Đặt đơn hàng mới';
    if (/^PUT \/orders\/[^/]+\/\d+\/toggle-active$/.test(a)) return '⏯️ Bật / Tắt đơn hàng';
    if (/^DELETE \/orders\/[^/]+\/\d+$/.test(a)) return '🗑️ Hủy đơn hàng';
    if (/^PUT \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return '👤 Gán / Đổi khách Buff Thời Tiết';
    if (/^DELETE \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return '👤 Gỡ khách Buff Thời Tiết';
    if (/^PUT \/orders\/weather_buff\/\d+\/weathers$/.test(a)) return '☁️ Lưu cấu hình thời tiết';
    if (/^POST \/orders\/weather_buff\/\d+\/share-link$/.test(a)) return '🔗 Lấy link theo dõi thời tiết';
    if (a === 'POST /customer/search-ingame') return '🔍 Tìm nhân vật trong game';
    if (a === 'POST /customer/select-ingame') return '✓ Chọn nhân vật khách hàng';
    if (a === 'POST /customer/resolve-role-id') return '🆔 Tra cứu khách theo Role ID';
    if (a === 'POST /catalog/preview-fruit') return '🧮 Xem trước giá trái cây';
    if (a === 'POST /tools/identity/lookup') return '🔎 Trích xuất ID Game / Tên nhân vật';
    if (a === 'POST /tools/identity/profile') return '👤 Xem hồ sơ nhân vật chi tiết';
    if (/^POST \/admin\/ctv\/[^/]+\/balance$/.test(a)) return '💰 Admin nạp / trừ ví CTV';
    if (/^PUT \/admin\/ctv\/[^/]+$/.test(a)) return '⚙️ Admin cập nhật tài khoản CTV';
    if (a === 'POST /admin/ctv') return '➕ Admin tạo tài khoản CTV';
    if (a === 'POST /admin/maintenance') return '🛠️ Admin bật / tắt chế độ bảo trì';
    if (a === 'POST /admin/notify-update') return '🔄 Admin gửi thông báo cập nhật cho CTV';
    if (/^DELETE \/admin\/ctv\/[^/]+$/.test(a)) return '🔒 Admin khóa / lưu trữ CTV';
    if (/^POST \/admin\/orders\/[^/]+\/refund$/.test(a)) return '↩️ Admin hoàn tiền đối soát';
    return a;
  }

  function formatAuditDetails(details) {
    if (!details || typeof details !== 'object') return '—';
    const parts = [];
    if (details.category) parts.push(`Mục: ${CAT_LABELS[details.category] || details.category}`);
    if (details.remoteOrderId) parts.push(`Đơn #${details.remoteOrderId}`);
    if (details.sellPrice !== undefined) parts.push(`Giá bán: ${money(details.sellPrice)}`);
    if (details.refundedAmount !== undefined && Number(details.refundedAmount) > 0) parts.push(`Hoàn ví: +${money(details.refundedAmount)}`);
    if (details.amount !== undefined) parts.push(`Số tiền: ${Number(details.amount) >= 0 ? '+' : ''}${money(details.amount)}`);
    if (details.balanceAfter !== undefined) parts.push(`Sau GD: ${money(details.balanceAfter)}`);
    if (details.nickname) parts.push(`Tên tìm: ${details.nickname}${details.resultCount !== undefined ? ` (${details.resultCount} KQ)` : ''}`);
    if (details.query) parts.push(`Tra cứu: ${details.query}${details.resultCount !== undefined ? ` (${details.resultCount} KQ)` : ''}`);
    if (details.roleId) parts.push(`Role ID: ${details.roleId}`);
    if (details.suid) parts.push(`SUID: ${details.suid}`);
    if (details.totalQty !== undefined) parts.push(`Tổng thời tiết: ${details.totalQty} lần`);
    if (details.passwordReset) parts.push('Đặt lại mật khẩu');
    if (details.isLocked === true) parts.push('Đã khóa tài khoản');
    if (details.note) parts.push(`Ghi chú: ${details.note}`);
    if (details.status && Number(details.status) >= 400) parts.push(`HTTP ${details.status}`);
    if (parts.length > 0) return parts.join(' · ');
    const raw = JSON.stringify(details);
    return raw === '{}' ? '—' : raw;
  }

  const IDENTITY_MODES = [
    { key: 'auto', label: '✨ Tự động', placeholder: 'Nhập Tên nhân vật (VD: Kitty), ID Game (RK8C-CKHL-LMGG) hoặc SUID...' },
    { key: 'name', label: '👤 Tên → ID Game', placeholder: 'Nhập tên nhân vật trong game (VD: Kitty, Bong)...' },
    { key: 'role_id', label: '🆔 ID Game → Tên', placeholder: 'Nhập ID Game / Role ID (VD: RK8C-CKHL-LMGG)...' },
    { key: 'suid', label: '🔢 SUID → Tên & ID', placeholder: 'Nhập ID số SUID (VD: 1070894579678792892)...' },
  ];

  function getIdentityState() {
    if (!state.identityTool) {
      state.identityTool = {
        mode: 'auto',
        query: '',
        loading: false,
        error: '',
        clientStatus: { loading: false, connected: false, availableClients: null, checkedAt: null, error: '' },
        lastResult: null, // { query, mode, resolvedBy, decoded, notFoundInGame, players }
        selectedSuid: null,
        selectedDetail: null,
        detailLoadingSuid: null,
        detailError: '',
        history: [],
      };
    }
    return state.identityTool;
  }

  function formatInt(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return Math.round(n).toLocaleString('vi-VN');
  }

  async function copyToClipboard(text, label, btnEl) {
    const val = String(text || '').trim();
    if (!val) {
      showToast('Không có dữ liệu để sao chép.');
      return;
    }
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(val);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = val;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    if (!ok) {
      showToast('Trình duyệt không cho phép sao chép tự động.');
      return;
    }
    showToast(`Đã sao chép ${label}: ${val}`);
    if (btnEl) {
      const orig = btnEl.dataset.origLabel || btnEl.textContent;
      btnEl.dataset.origLabel = orig;
      btnEl.textContent = '✓ Đã chép';
      btnEl.classList.add('is-copied');
      clearTimeout(Number(btnEl.dataset.copyTimer || 0));
      const tid = setTimeout(() => {
        btnEl.textContent = orig;
        btnEl.classList.remove('is-copied');
      }, 1600);
      btnEl.dataset.copyTimer = String(tid);
    }
  }

  async function loadIdentityClientStatus(force = false) {
    const idState = getIdentityState();
    if (idState.clientStatus.loading) return;
    idState.clientStatus = { ...idState.clientStatus, loading: true, error: '' };
    if (state.currentView === 'identity_tools') renderCurrentView();
    try {
      const r = await apiFetch(`/api/tools/game-clients${force ? '?refresh=1' : ''}`);
      idState.clientStatus = {
        loading: false,
        connected: Boolean(r.connected),
        availableClients: r.availableClients ?? null,
        checkedAt: r.checkedAt || new Date().toISOString(),
        error: '',
      };
    } catch (error) {
      idState.clientStatus = {
        loading: false,
        connected: false,
        availableClients: null,
        checkedAt: new Date().toISOString(),
        error: error.message || 'Không thể lấy client từ nguồn.',
      };
    }
    if (state.currentView === 'identity_tools') renderCurrentView();
  }

  async function loadIdentityProfileDetail(player) {
    if (!player?.suid) return;
    const idState = getIdentityState();
    const suid = String(player.suid);
    idState.selectedSuid = suid;
    idState.selectedDetail = player.detailLoaded ? player : { ...player };
    idState.detailError = '';
    if (player.detailLoaded) {
      idState.detailLoadingSuid = null;
      if (state.currentView === 'identity_tools') renderCurrentView();
      return;
    }
    idState.detailLoadingSuid = suid;
    if (state.currentView === 'identity_tools') renderCurrentView();
    try {
      const r = await apiFetch('/api/tools/identity/profile', 'POST', { suid });
      if (r.availableClients !== undefined && r.availableClients !== null) {
        idState.clientStatus = {
          loading: false,
          connected: true,
          availableClients: r.availableClients,
          checkedAt: new Date().toISOString(),
          error: '',
        };
      }
      if (idState.selectedSuid !== suid) return;
      if (r.player) {
        const merged = {
          ...player,
          ...r.player,
          regionName: r.player.regionName || player.regionName || r.player.region || player.region,
          onlineStatus: r.player.onlineStatus || player.onlineStatus || '',
          photoUrl: r.player.photoUrl || player.photoUrl || null,
          portraitUrl: r.player.portraitUrl || player.portraitUrl || null,
          detailLoaded: true,
        };
        idState.selectedDetail = merged;
        if (Array.isArray(idState.lastResult?.players)) {
          idState.lastResult.players = idState.lastResult.players.map((p) => (p.suid === suid ? merged : p));
        }
      }
    } catch (error) {
      if (idState.selectedSuid === suid) {
        idState.detailError = error.message || 'Chưa tải được chỉ số chi tiết từ client game.';
      }
    } finally {
      if (idState.detailLoadingSuid === suid) idState.detailLoadingSuid = null;
      if (state.currentView === 'identity_tools') renderCurrentView();
    }
  }

  async function runIdentityLookup(customQuery, customMode) {
    const idState = getIdentityState();
    const q = String(customQuery !== undefined ? customQuery : idState.query).trim();
    const mode = customMode || idState.mode || 'auto';
    idState.query = q;
    idState.mode = mode;
    if (!q) {
      showToast('Vui lòng nhập Tên nhân vật hoặc ID Game (Role ID) cần trích xuất.');
      return;
    }
    idState.loading = true;
    idState.error = '';
    idState.detailError = '';
    idState.selectedSuid = null;
    idState.selectedDetail = null;
    idState.detailLoadingSuid = null;
    if (state.currentView === 'identity_tools') renderCurrentView();

    try {
      const r = await apiFetch('/api/tools/identity/lookup?paged=1', 'POST', { query: q, mode });
      if (r.availableClients !== undefined && r.availableClients !== null) {
        idState.clientStatus = {
          loading: false,
          connected: true,
          availableClients: r.availableClients,
          checkedAt: new Date().toISOString(),
          error: '',
        };
      }
      const players = Array.isArray(r.players) ? r.players : [];
      idState.lastResult = {
        query: q,
        mode: r.mode || mode,
        resolvedBy: r.resolvedBy || mode,
        listUrl: r.listUrl,
        pageInfo: r.pageInfo,
        decoded: r.decoded || null,
        notFoundInGame: Boolean(r.notFoundInGame),
        players,
      };
      idState.history = [q, ...idState.history.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, 6);
      idState.loading = false;

      if (players.length === 1 && !r.pageInfo?.players?.more) {
        idState.selectedSuid = players[0].suid;
        idState.selectedDetail = players[0];
        if (state.currentView === 'identity_tools') renderCurrentView();
        if (!players[0].detailLoaded) {
          loadIdentityProfileDetail(players[0]);
        }
        return;
      }
    } catch (error) {
      idState.loading = false;
      idState.error = error.message || 'Lỗi khi trích xuất dữ liệu nhân vật.';
      showToast(idState.error);
    }
    if (state.currentView === 'identity_tools') renderCurrentView();
  }

  function renderPlayerAvatarHtml(player, sizeClass = '') {
    const initial = esc((String(player?.nickname || '?').trim().charAt(0) || '?').toUpperCase());
    const primarySrc = player?.portraitUrl || player?.photoUrl || '';
    const fallbackSrc = player?.portraitUrl && player?.photoUrl ? player.photoUrl : '';
    const level = Number(player?.achievementLevel || 0);
    return `
      <div class="id-tool-avatar-wrap ${sizeClass}">
        ${primarySrc
          ? `<img class="id-tool-avatar-img" src="${esc(primarySrc)}" ${fallbackSrc ? `data-fallback-src="${esc(fallbackSrc)}"` : ''} alt="${esc(player?.nickname || 'Avatar')}" loading="lazy" referrerpolicy="no-referrer" />`
          : ''}
        <div class="id-tool-avatar-fallback" ${primarySrc ? 'style="display:none;"' : ''}>${initial}</div>
        ${level > 0 ? `<span class="id-tool-level-pill">Lv.${level}</span>` : ''}
      </div>
    `;
  }

  function renderCopyRowHtml(label, value, copyLabel, highlight = false) {
    const safeVal = String(value || '').trim();
    if (!safeVal) return '';
    return `
      <div class="id-tool-copy-row ${highlight ? 'is-primary' : ''}">
        <div class="id-tool-copy-meta">
          <span class="id-tool-copy-label">${esc(label)}</span>
          <code class="id-tool-copy-value">${esc(safeVal)}</code>
        </div>
        <button type="button" class="${highlight ? 'btn-violet' : 'btn-frost'} id-tool-copy-btn" data-copy-value="${esc(safeVal)}" data-copy-label="${esc(copyLabel)}">
          📋 Sao chép
        </button>
      </div>
    `;
  }

  function renderSelectedPassportHtml(idState) {
    const p = idState.selectedDetail;
    if (!p) return '';
    const isLoadingDetail = idState.detailLoadingSuid === p.suid;
    const regionLabel = p.regionName || p.region || '';
    const stats = p.stats;
    const resolvedBadge = idState.lastResult?.resolvedBy === 'role_id'
      ? '<span class="badge-tag violet">Trích xuất từ ID Game (Role ID)</span>'
      : idState.lastResult?.resolvedBy === 'suid'
      ? '<span class="badge-tag violet">Trích xuất từ ID số (SUID)</span>'
      : '<span class="badge-tag green">Hồ sơ trực tiếp từ Game</span>';

    return `
      <section class="glass-panel id-tool-passport" id="identityPassportPanel">
        <div class="panel-title-row" style="flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="panel-title-text">🪪 Hồ sơ trích xuất nhân vật</span>
            ${resolvedBadge}
          </div>
          <div class="action-row">
            ${!p.detailLoaded && !isLoadingDetail ? `<button type="button" class="btn-frost" id="btnIdentityLoadDetail">📊 Tải chỉ số hồ sơ</button>` : ''}
            ${(idState.lastResult?.players?.length || 0) > 1 ? `<button type="button" class="btn-frost" id="btnIdentityClosePassport">✕ Đóng chi tiết</button>` : ''}
          </div>
        </div>

        <div class="id-tool-passport-grid">
          <div class="id-tool-passport-hero">
            ${renderPlayerAvatarHtml(p, 'is-lg')}
            <div class="id-tool-passport-heading">
              <div class="id-tool-passport-name">${esc(p.nickname || 'Chưa có tên')}</div>
              <div class="id-tool-meta-chips">
                ${regionLabel ? `<span class="badge-tag violet">📍 ${esc(regionLabel)}</span>` : ''}
                ${p.achievementLevel ? `<span class="badge-tag amber">⭐ Cấp ${p.achievementLevel}</span>` : ''}
                ${p.isOnline ? '<span class="badge-tag green">🟢 Đang online</span>' : p.onlineStatus ? `<span class="badge-tag">${esc(p.onlineStatus)}</span>` : p.lastLogin ? `<span class="badge-tag">🕒 Đăng nhập: ${esc(p.lastLogin)}</span>` : ''}
              </div>
              ${p.introStr ? `<p class="id-tool-bio">“${esc(p.introStr)}”</p>` : ''}
            </div>
          </div>

          <div class="id-tool-copy-stack">
            ${renderCopyRowHtml('Tên nhân vật (In-game)', p.nickname || '—', 'Tên nhân vật', false)}
            ${renderCopyRowHtml('ID Game (Role ID)', p.roleId || '—', 'ID Game (Role ID)', true)}
            ${renderCopyRowHtml('ID số (SUID / Giftcode)', p.suid || '—', 'SUID', false)}
          </div>
        </div>

        ${isLoadingDetail ? `<div class="tool-note" style="margin-top:12px;">⏳ Đang lấy thêm chỉ số tim, lượt thăm & bạn bè từ client game...</div>` : ''}
        ${idState.detailError ? `<div class="tool-note" style="margin-top:12px;color:#a5364b;">⚠️ ${esc(idState.detailError)}</div>` : ''}
        ${stats ? `
          <div class="id-tool-stats-grid">
            <div class="id-tool-stat-box"><span>💗 Tim nhân vật</span><strong>${formatInt(stats.userLikes)}</strong></div>
            <div class="id-tool-stat-box"><span>🏡 Tim nhà</span><strong>${formatInt(stats.homeLikes)}</strong></div>
            <div class="id-tool-stat-box"><span>👥 Người theo dõi</span><strong>${formatInt(stats.followerCount)}</strong></div>
            ${stats.friendCount !== null ? `<div class="id-tool-stat-box"><span>🤝 Bạn bè</span><strong>${formatInt(stats.friendCount)}</strong></div>` : ''}
            <div class="id-tool-stat-box"><span>👀 Thăm hồ sơ</span><strong>${formatInt(stats.totalProfileVisitCount)}</strong></div>
            <div class="id-tool-stat-box"><span>🚪 Thăm nhà</span><strong>${formatInt(stats.totalHomeVisitCount)}</strong></div>
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderIdentityToolsHtml() {
    const idState = getIdentityState();
    const cs = idState.clientStatus;
    const activeModeObj = IDENTITY_MODES.find((m) => m.key === idState.mode) || IDENTITY_MODES[0];

    let clientBadgeHtml = '<span class="badge-tag">⏳ Đang kết nối client nguồn...</span>';
    if (cs.loading) {
      clientBadgeHtml = '<span class="badge-tag amber">⏳ Đang lấy client từ nguồn...</span>';
    } else if (cs.connected) {
      const cnt = cs.availableClients;
      if (cnt !== null && cnt > 0) {
        clientBadgeHtml = `<span class="badge-tag green">🟢 Nguồn sẵn sàng · ${cnt} client game hoạt động</span>`;
      } else if (cnt === 0) {
        clientBadgeHtml = '<span class="badge-tag amber">🟡 Đã kết nối nguồn · Hiện có 0 client game</span>';
      } else {
        clientBadgeHtml = '<span class="badge-tag green">🟢 Đã kết nối máy chủ client nguồn</span>';
      }
    } else if (cs.error) {
      clientBadgeHtml = `<span class="badge-tag red">🔴 ${esc(cs.error)}</span>`;
    }

    const modePillsHtml = IDENTITY_MODES.map((m) => `
      <button type="button" class="btn-frost id-tool-mode-btn ${idState.mode === m.key ? 'is-active' : ''}" data-identity-mode="${m.key}">
        ${m.label}
      </button>
    `).join('');

    const historyHtml = idState.history.length > 0
      ? `
        <div class="id-tool-history">
          <span class="tool-note">Gần đây:</span>
          ${idState.history.map((h) => `<button type="button" class="id-tool-history-chip" data-identity-history="${esc(h)}">${esc(h)}</button>`).join('')}
        </div>
      `
      : '';

    let resultsHtml = '';
    const res = idState.lastResult;
    if (idState.loading) {
      resultsHtml = `
        <section class="glass-panel" style="text-align:center;padding:30px 18px;">
          <div style="font-size:15px;font-weight:600;color:var(--color-pure-white);">⏳ Đang truy vấn client game từ nguồn...</div>
          <p class="tool-note" style="margin-top:6px;">Đang tìm nhân vật và trích xuất ID Game (Role ID) / Tên nhân vật trực tiếp.</p>
        </section>
      `;
    } else if (idState.error) {
      resultsHtml = `
        <section class="glass-panel">
          <div class="tool-warning" style="background:rgba(228,109,76,0.14);color:#a5364b;">
            ⚠️ ${esc(idState.error)}
          </div>
        </section>
      `;
    } else if (res) {
      const players = Array.isArray(res.players) ? res.players : [];
      if (players.length === 0) {
        if (res.notFoundInGame && res.decoded) {
          resultsHtml = `
            <section class="glass-panel">
              <div class="tool-warning" style="margin-bottom:14px;">
                ⚠️ Định dạng mã hợp lệ nhưng client game không tìm thấy nhân vật đang tồn tại cho mã này (có thể sai ký tự hoặc tài khoản đã xóa).
              </div>
              <div class="id-tool-copy-stack">
                ${renderCopyRowHtml('ID Game (Role ID) đã chuẩn hóa', res.decoded.roleId, 'ID Game (Role ID)', true)}
                ${renderCopyRowHtml('ID số (SUID) giải mã tương ứng', res.decoded.suid, 'SUID', false)}
              </div>
            </section>
          `;
        } else {
          resultsHtml = `
            <section class="glass-panel" style="text-align:center;padding:28px 18px;">
              <div style="font-size:15px;font-weight:600;color:var(--color-pure-white);">Không tìm thấy nhân vật phù hợp cho “${esc(res.query)}”</div>
              <p class="tool-note" style="margin-top:6px;">Hãy kiểm tra lại chính tả tên nhân vật (có dấu / ký tự đặc biệt) hoặc dán đúng mã ID Game dạng <code>XXXX-XXXX-XXXX</code>.</p>
            </section>
          `;
        }
      } else {
        const passportHtml = renderSelectedPassportHtml(idState);
        const listHtml = players.length > 1 || !idState.selectedDetail
          ? `
            <section class="glass-panel">
              <div class="panel-title-row" style="flex-wrap:wrap;gap:8px;">
                <span class="panel-title-text">📋 Kết quả trích xuất (${idState.lastResult?.pageInfo?.players?.total ?? players.length} nhân vật)</span>
                <span class="tool-note">Nhấn nút sao chép nhanh hoặc bấm vào nhân vật để xem hồ sơ chi tiết</span>
              </div>
              <div class="id-tool-results-grid">
                ${players.map((p, idx) => {
                  const isSel = idState.selectedSuid === p.suid;
                  const reg = p.regionName || p.region || '';
                  return `
                    <article class="id-tool-card ${isSel ? 'is-selected' : ''}" data-identity-open="${idx}">
                      <div class="id-tool-card-top">
                        ${renderPlayerAvatarHtml(p)}
                        <div class="id-tool-card-info">
                          <div class="id-tool-card-name">${esc(p.nickname || 'Chưa có tên')}</div>
                          <div class="id-tool-card-sub">
                            ${reg ? `<span>📍 ${esc(reg)}</span>` : ''}
                            ${p.isOnline ? '<span style="color:#24705e;font-weight:600;">· Online</span>' : p.onlineStatus ? `<span>· ${esc(p.onlineStatus)}</span>` : ''}
                          </div>
                        </div>
                      </div>

                      <div class="id-tool-card-ids">
                        <div class="id-tool-mini-row">
                          <span class="id-tool-mini-lbl">ID Game</span>
                          <code class="id-tool-mini-val is-accent">${esc(p.roleId || '—')}</code>
                        </div>
                        <div class="id-tool-mini-row">
                          <span class="id-tool-mini-lbl">SUID</span>
                          <code class="id-tool-mini-val">${esc(p.suid)}</code>
                        </div>
                      </div>

                      <div class="id-tool-card-actions">
                        <button type="button" class="btn-frost id-tool-sm-btn" data-copy-value="${esc(p.nickname)}" data-copy-label="Tên nhân vật">📋 Chép tên</button>
                        <button type="button" class="btn-violet id-tool-sm-btn" data-copy-value="${esc(p.roleId || '')}" data-copy-label="ID Game (Role ID)">📋 Chép ID Game</button>
                        <button type="button" class="btn-frost id-tool-sm-btn" data-copy-value="${esc(p.suid)}" data-copy-label="SUID">🔢 SUID</button>
                        <button type="button" class="btn-frost id-tool-sm-btn" data-identity-detail="${idx}">👤 Hồ sơ</button>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
              ${moreButton(idState.lastResult, 'players')}
            </section>
          `
          : '';
        resultsHtml = passportHtml + listHtml;
      }
    } else {
      resultsHtml = `
        <section class="glass-panel id-tool-guide">
          <div class="id-tool-guide-grid">
            <div class="stat-subcard">
              <div style="font-weight:700;color:var(--color-pure-white);margin-bottom:4px;">👤 Tên nhân vật → ID Game</div>
              <p class="tool-note">Gõ tên nhân vật Play Together (VD: <strong>Kitty</strong>, <strong>Bong</strong>) để lấy danh sách nhân vật từ client nguồn kèm <strong>ID Game (Role ID)</strong> chuẩn xác.</p>
            </div>
            <div class="stat-subcard">
              <div style="font-weight:700;color:var(--color-pure-white);margin-bottom:4px;">🆔 ID Game (Role ID) → Tên nhân vật</div>
              <p class="tool-note">Dán mã <strong>XXXX-XXXX-XXXX</strong> (VD: <strong>RK8C-CKHL-LMGG</strong>) để giải mã SUID và truy vấn tên nhân vật, khu vực, cấp độ, tim trực tiếp trong game.</p>
            </div>
            <div class="stat-subcard">
              <div style="font-weight:700;color:var(--color-pure-white);margin-bottom:4px;">📋 Sao chép 1 chạm</div>
              <p class="tool-note">Mỗi kết quả đều hiển thị sẵn nút sao chép nhanh <strong>Tên nhân vật</strong>, <strong>ID Game (Role ID)</strong> và <strong>SUID</strong>.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="glass-panel">
        <div class="panel-title-row" style="flex-wrap:wrap;gap:10px;">
          <div>
            <div class="panel-title-text">🔎 Trích xuất ID Game / Tên nhân vật</div>
            <div class="tool-note" style="margin-top:3px;">Kết nối trực tiếp client nguồn Play Together để tra cứu hai chiều Tên nhân vật ⇄ ID Game (Role ID) & SUID.</div>
          </div>
          <div class="action-row">
            ${clientBadgeHtml}
            <button type="button" class="btn-frost" id="btnIdentityRefreshClients" ${cs.loading ? 'disabled' : ''}>↻ Lấy lại client</button>
          </div>
        </div>

        <div class="id-tool-mode-bar" role="tablist" aria-label="Chế độ trích xuất">
          ${modePillsHtml}
        </div>

        <form id="identityLookupForm" class="id-tool-search-form">
          <div class="id-tool-input-wrap">
            <input
              type="text"
              id="identityLookupInput"
              class="input-box"
              maxlength="80"
              autocomplete="off"
              spellcheck="false"
              placeholder="${esc(activeModeObj.placeholder)}"
              value="${esc(idState.query)}"
            />
            ${idState.query ? '<button type="button" class="id-tool-clear-btn" id="btnIdentityClearInput" aria-label="Xóa từ khóa">✕</button>' : ''}
          </div>
          <button type="submit" class="btn-violet" id="btnIdentityLookupSubmit" ${idState.loading ? 'disabled' : ''}>
            ${idState.loading ? '⏳ Đang trích xuất...' : '🔍 Trích xuất'}
          </button>
        </form>

        ${historyHtml}
      </section>

      ${resultsHtml}
    `;
  }

  function bindIdentityToolsEvents() {
    bindMore(document.getElementById('mainViewContainer'), getIdentityState().lastResult, renderCurrentView);
    const idState = getIdentityState();

    document.getElementById('btnIdentityRefreshClients')?.addEventListener('click', () => {
      loadIdentityClientStatus(true);
    });

    document.querySelectorAll('[data-identity-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        idState.mode = btn.dataset.identityMode || 'auto';
        renderCurrentView();
        document.getElementById('identityLookupInput')?.focus();
      });
    });

    const inputEl = document.getElementById('identityLookupInput');
    inputEl?.addEventListener('input', (e) => {
      idState.query = e.target.value;
    });

    document.getElementById('btnIdentityClearInput')?.addEventListener('click', () => {
      idState.query = '';
      idState.error = '';
      renderCurrentView();
      document.getElementById('identityLookupInput')?.focus();
    });

    document.getElementById('identityLookupForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = document.getElementById('identityLookupInput')?.value ?? idState.query;
      runIdentityLookup(q, idState.mode);
    });

    document.querySelectorAll('[data-identity-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        runIdentityLookup(btn.dataset.identityHistory || '', 'auto');
      });
    });

    document.querySelectorAll('[data-copy-value]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(btn.dataset.copyValue || '', btn.dataset.copyLabel || 'nội dung', btn);
      });
    });

    const openPlayerByIdx = (idx) => {
      const list = idState.lastResult?.players || [];
      const player = list[Number(idx)];
      if (!player) return;
      loadIdentityProfileDetail(player);
      setTimeout(() => {
        document.getElementById('identityPassportPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    };

    document.querySelectorAll('[data-identity-detail]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlayerByIdx(btn.dataset.identityDetail);
      });
    });

    document.querySelectorAll('[data-identity-open]').forEach((card) => {
      card.addEventListener('click', () => {
        openPlayerByIdx(card.dataset.identityOpen);
      });
    });

    document.getElementById('btnIdentityLoadDetail')?.addEventListener('click', () => {
      if (idState.selectedDetail) loadIdentityProfileDetail(idState.selectedDetail);
    });

    document.getElementById('btnIdentityClosePassport')?.addEventListener('click', () => {
      idState.selectedSuid = null;
      idState.selectedDetail = null;
      idState.detailError = '';
      renderCurrentView();
    });

    // Safe avatar image fallback without inline onerror attributes
    document.querySelectorAll('.id-tool-avatar-img').forEach((img) => {
      img.addEventListener('error', () => {
        const fb = img.dataset.fallbackSrc;
        if (fb && img.src !== fb) {
          img.removeAttribute('data-fallback-src');
          img.src = fb;
          return;
        }
        img.style.display = 'none';
        const fallbackEl = img.parentElement?.querySelector('.id-tool-avatar-fallback');
        if (fallbackEl) fallbackEl.style.display = 'grid';
      });
    });
  }

  let detailVersion = 0;
  async function loadAdminMonitorCtvDetail(ctvId, silent = false, retain = false) {
    if (state.user?.role !== 'admin' || !ctvId) return;
    state.adminMonitorCtvId = ctvId;
    const version = ++detailVersion;
    if (!silent) {
      state.adminMonitorCtvLoading = true;
      if (state.currentView === 'admin_monitor') renderCurrentView();
    }
    try {
      const qs = retainedPages(retain ? state.adminMonitorCtvDetail : null);
      qs.set('q', state.adminMonitorCtvOrderSearch || '');
      qs.set('tab', state.adminMonitorCtvTab || 'orders');
      if (state.adminMonitorCtvCatFilter && state.adminMonitorCtvCatFilter !== 'all') qs.set('category', state.adminMonitorCtvCatFilter);
      const response = await apiFetch(`/api/admin/monitor/ctv/${encodeURIComponent(ctvId)}?${qs}`);
      if (version !== detailVersion || state.user?.role !== 'admin' || state.adminMonitorCtvId !== ctvId) return;
      state.adminMonitorCtvDetail = response;
    } catch (error) {
      if (!silent) showToast(error.message);
    } finally {
      if (version === detailVersion) {
        state.adminMonitorCtvLoading = false;
        if (state.currentView === 'admin_monitor') renderCurrentView();
      }
    }
  }

  function retainedPages(previous) {
    const qs = new URLSearchParams({ paged: '1' });
    for (const key of Object.keys(previous?.pageInfo || {})) {
      if (previous[key]?.length > 10) qs.set('keep_' + key, String(previous[key].length));
    }
    return qs;
  }

  let monitorVersion = 0;
  async function loadAdminMonitor(retain = false) {
    if (state.user?.role !== 'admin') return;
    try {
      const version = ++monitorVersion;
      const qs = retainedPages(retain === true ? state.adminMonitor : null);
      const response = await apiFetch('/api/admin/monitor?' + qs);
      if (version !== monitorVersion || state.user?.role !== 'admin' || state.currentView !== 'admin_monitor') return;
      state.adminMonitor = response;

      if (state.adminMonitorCtvId) {
        await loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true, retain === true);
        return;
      }
      if (state.currentView === 'admin_monitor') renderCurrentView();
    } catch (error) { showToast(error.message); }
  }

  function renderSelectedCtvDetailHtml() {
    const ctvId = state.adminMonitorCtvId;
    if (!ctvId) return '';
    const detail = state.adminMonitorCtvDetail;
    if (state.adminMonitorCtvLoading && (!detail || detail.ctv?.id !== ctvId)) {
      return panel('👤 Hồ sơ chi tiết CTV', '<p class="tool-note">⏳ Đang tải nhật ký hoạt động và đơn hàng của CTV...</p>');
    }
    if (!detail || detail.ctv?.id !== ctvId) return '';

    const ctv = detail.ctv || {};
    const sum = detail.summary || {};
    const tab = state.adminMonitorCtvTab || 'orders';
    const q = String(state.adminMonitorCtvOrderSearch || '').trim().toLowerCase();
    const catFilter = state.adminMonitorCtvCatFilter || 'all';
    const online = ctv.lastSeenAt && Date.now() - Date.parse(ctv.lastSeenAt) < 120000;

    const allOrders = Array.isArray(detail.orders) ? detail.orders : [];
    const filteredOrders = allOrders.filter(o => {
      if (catFilter !== 'all' && o.category !== catFilter) return false;
      if (!q) return true;
      return (
        String(o.customer?.nickname || '').toLowerCase().includes(q) ||
        String(o.customer?.suid || '').toLowerCase().includes(q) ||
        String(o.remoteOrderId || o.id || '').toLowerCase().includes(q) ||
        String(o.summary || '').toLowerCase().includes(q)
      );
    });

    const trxList = Array.isArray(detail.transactions) ? detail.transactions : [];
    const evList = Array.isArray(detail.events) ? detail.events : [];
    const table = (headers, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--color-fog-veil);padding:20px;">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;

    let tabBody = '';
    if (tab === 'orders') {
      const orderRows = filteredOrders.map(o => {
        const stBadge = o.status === 'cancelled'
          ? '<span class="badge-tag red">Đã hủy</span>'
          : o.status === 'completed'
          ? '<span class="badge-tag green">Hoàn thành</span>'
          : o.isActive
          ? '<span class="badge-tag violet">Đang chạy</span>'
          : '<span class="badge-tag amber">Tạm dừng / Chờ</span>';
        return `
          <tr>
            <td style="white-space:nowrap;font-size:12px;">${date(o.createdAt)}</td>
            <td>
              <strong style="color:var(--color-pure-white);">${esc(o.categoryName || CAT_LABELS[o.category] || o.category)}</strong>
              <div class="tool-note">#${esc(o.remoteOrderId || o.id)}</div>
            </td>
            <td>
              <strong style="color:var(--color-pure-white);">${esc(o.customer?.nickname || 'Chưa gán khách')}</strong>
              ${o.customer?.suid ? `<div class="tool-note">SUID: ${esc(o.customer.suid)}</div>` : ''}
            </td>
            <td>
              <span class="badge-tag">${esc(o.summary || '—')}</span>
              ${o.trackUrl ? `<div class="tool-note" style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(o.trackUrl.replace(/^https?:\/\//, ''))}</div>` : ''}
            </td>
            <td><strong style="color:#895d0a;">${money(o.sellPrice)}</strong></td>
            <td>
              <div style="font-size:12px;color:var(--color-moon-mist);">Gốc: ${money(o.costPrice)}</div>
              <div style="font-size:11px;color:#28754e;font-weight:600;">Lãi: +${money(o.markupAmount)}</div>
            </td>
            <td>${stBadge}</td>
          </tr>
        `;
      }).join('');

      tabBody = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <input type="text" id="monitorCtvOrderSearch" class="input-box" style="flex:1;min-width:200px;" placeholder="🔍 Tìm theo khách hàng, SUID, mã đơn, gói..." value="${esc(state.adminMonitorCtvOrderSearch || '')}" />
          <select id="monitorCtvCatFilter" class="input-box" style="width:auto;min-width:170px;">
            <option value="all" ${catFilter === 'all' ? 'selected' : ''}>Tất cả danh mục (${detail.pageInfo?.orders?.total ?? allOrders.length})</option>
            ${Object.entries(CAT_LABELS).map(([k, lbl]) => `<option value="${k}" ${catFilter === k ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
          </select>
        </div>
        ${table(['Thời điểm', 'Danh mục / Mã', 'Khách hàng', 'Đơn đã đặt', 'Giá CTV trả', 'Gốc & Lãi', 'Trạng thái'], orderRows)}
      `;
    } else if (tab === 'events') {
      const evRows = evList.map(ev => `
        <tr>
          <td style="white-space:nowrap;font-size:12px;">${date(ev.createdAt)}</td>
          <td><strong>${esc(ev.actorName || '—')}</strong><div class="tool-note">${ev.actorRole === 'admin' ? 'Admin' : 'CTV'}</div></td>
          <td><strong>${esc(formatAuditAction(ev.action))}</strong></td>
          <td style="font-size:12px;color:var(--color-moon-mist);">${esc(formatAuditDetails(ev.details))}</td>
        </tr>
      `).join('');
      tabBody = table(['Thời điểm', 'Người thao tác', 'Hành động', 'Chi tiết'], evRows);
    } else {
      const trxLabels = {
        admin_topup: '<span class="badge-tag green">Nạp ví</span>',
        admin_deduct: '<span class="badge-tag red">Trừ ví</span>',
        order_debit: '<span class="badge-tag violet">Đặt đơn</span>',
        order_hold: '<span class="badge-tag amber">Giữ tiền</span>',
        order_release: '<span class="badge-tag green">Trả tiền giữ</span>',
        order_refund: '<span class="badge-tag green">Hoàn đối soát</span>',
      };
      const trxRows = trxList.map(tx => `
        <tr>
          <td style="white-space:nowrap;font-size:12px;">${date(tx.createdAt)}</td>
          <td>${trxLabels[tx.type] || `<span class="badge-tag">${esc(tx.type)}</span>`}</td>
          <td style="font-weight:700;color:${Number(tx.amount) >= 0 ? '#28754e' : '#a8304c'};">${Number(tx.amount) >= 0 ? '+' : ''}${money(tx.amount)}</td>
          <td style="font-weight:600;color:var(--color-pure-white);">${money(tx.balanceAfter)}</td>
          <td style="font-size:12px;color:var(--color-moon-mist);">${esc(tx.note || '—')}</td>
        </tr>
      `).join('');
      tabBody = table(['Thời điểm', 'Loại GD', 'Số tiền', 'Số dư sau GD', 'Ghi chú'], trxRows);
    }

    return `
      <section class="glass-panel" id="monitorCtvDetailPanel" style="border:1px solid rgba(167,139,250,0.45);">
        <div class="panel-title-row" style="flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="panel-title-text">👤 Chi tiết CTV: ${esc(ctv.name || '—')}</span>
            <span class="badge-tag violet">@${esc(ctv.username || '')}</span>
            ${ctv.isLocked ? '<span class="badge-tag red">Đã khóa</span>' : online ? '<span class="badge-tag green">Đang hoạt động</span>' : '<span class="badge-tag">Ngoại tuyến</span>'}
          </div>
          <div class="action-row">
            ${button('↻ Tải lại CTV', 'data-refresh-ctv-detail', ctvId)}
            ${button('✕ Đóng chi tiết', 'data-close-ctv-detail', '')}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0 16px;">
          <div class="stat-subcard">
            <div style="font-size:11px;color:var(--color-fog-veil);">Số dư ví hiện tại</div>
            <div style="font-size:19px;font-weight:700;color:#28754e;margin-top:4px;">${money(sum.balance || 0)}</div>
            <div class="tool-note">HĐ gần nhất: ${date(ctv.lastSeenAt)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:11px;color:var(--color-fog-veil);">Đơn hàng đã đặt</div>
            <div style="font-size:19px;font-weight:700;color:var(--color-pure-white);margin-top:4px;">${Number(sum.orderCount || 0)} đơn</div>
            <div class="tool-note">Hoàn thành: ${Number(sum.completedCount || 0)} · Đang chạy: ${Number(sum.runningCount || 0)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tổng tiền CTV đã mua</div>
            <div style="font-size:19px;font-weight:700;color:#895d0a;margin-top:4px;">${money(sum.totalSell || 0)}</div>
            <div class="tool-note">Tổng đã nạp: ${money(sum.totalTopup || 0)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tổng lãi Admin từ CTV</div>
            <div style="font-size:19px;font-weight:700;color:#95436c;margin-top:4px;">+${money(sum.totalProfit || 0)}</div>
            <div class="tool-note">Chi phí nguồn: ${money(sum.totalCost || 0)}</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          <button type="button" class="btn-frost ${tab === 'orders' ? 'is-active' : ''}" data-ctv-detail-tab="orders">📦 Đơn đã đặt (${detail.pageInfo?.orders?.total ?? allOrders.length})</button>
          <button type="button" class="btn-frost ${tab === 'events' ? 'is-active' : ''}" data-ctv-detail-tab="events">🕒 Nhật ký hoạt động (${detail.pageInfo?.events?.total ?? evList.length})</button>
          <button type="button" class="btn-frost ${tab === 'transactions' ? 'is-active' : ''}" data-ctv-detail-tab="transactions">💳 Biến động ví (${detail.pageInfo?.transactions?.total ?? trxList.length})</button>
        </div>

        ${tabBody}
        ${moreButton(detail, tab)}
      </section>
    `;
  }

  function renderAdminMonitorHtml() {
    const data = state.adminMonitor;
    if (!data) return panel('Giám sát & đối soát CTV', `<p class="tool-note">Đang tải nhật ký hoạt động...</p>${button('Tải dữ liệu', 'data-refresh-monitor', '')}`);
    const statuses = { processing: 'Đang gửi nguồn', uncertain: 'Chưa xác định kết quả', completed: 'Có chênh lệch chi phí' };
    const ctvList = Array.isArray(data.ctvs) ? data.ctvs : [];
    const selectedId = state.adminMonitorCtvId || '';

    const presence = ctvList.map(user => {
      const online = user.lastSeenAt && Date.now() - Date.parse(user.lastSeenAt) < 120000;
      const isSel = Boolean(selectedId && user.id === selectedId);
      const uid = user.id || '';
      return `<tr ${uid ? `data-select-ctv-row="${esc(uid)}" style="cursor:pointer;${isSel ? 'background:rgba(139,92,246,0.16);' : ''}"` : ''}>
        <td><strong style="color:var(--color-pure-white);">${esc(user.name)}</strong><div class="tool-note">${esc(user.username)}</div></td>
        <td><strong style="color:#28754e;">${money(user.balance)}</strong></td>
        <td>
          <strong>${Number(user.orderCount || 0)} đơn</strong>
          ${user.totalSell ? `<div class="tool-note">Mua: ${money(user.totalSell)} · Lãi: +${money(user.totalProfit || 0)}</div>` : ''}
        </td>
        <td>${user.isLocked ? '<span class="badge-tag red">Đã khóa</span>' : online ? '<span class="badge-tag green">Hoạt động gần đây</span>' : 'Không có hoạt động gần đây'}</td>
        <td>${date(user.lastSeenAt)}</td>
        <td>${uid ? button(isSel ? '✓ Đang xem' : '👁️ Xem nhật ký & đơn', 'data-select-ctv', uid, isSel ? 'btn-violet' : 'btn-frost') : '—'}</td>
      </tr>`;
    }).join('');

    const ctvSelectHtml = ctvList.some(u => u.id)
      ? `<select id="monitorCtvQuickSelect" class="input-box" style="width:auto;min-width:220px;padding:6px 10px;font-size:12px;">
          <option value="">-- Chọn nhanh CTV để xem riêng --</option>
          ${ctvList.filter(u => u.id).map(u => `<option value="${esc(u.id)}" ${u.id === selectedId ? 'selected' : ''}>${esc(u.name)} (@${esc(u.username)}) — ${Number(u.orderCount || 0)} đơn</option>`).join('')}
        </select>`
      : '';

    const intents = (data.intents || []).map(intent => `<tr><td>${esc(intent.userName)}<div class="tool-note">${date(intent.createdAt)}</div></td><td>${esc(intent.summary || intent.category)}<div class="tool-note">${esc(intent.id)}</div></td><td>${money(intent.heldAmount)}<div class="tool-note">Chi phí dự kiến: ${money(intent.expectedCost)}</div></td><td>${esc(statuses[intent.status] || intent.status)}</td><td>${intent.status === 'uncertain' ? button('Đối soát nguồn', 'data-reconcile-intent', intent.id) : intent.requiresReview ? button('Ghi nhận chênh lệch', 'data-ack-intent', intent.id) : 'Đợi phản hồi nguồn'}</td></tr>`).join('');
    const cancellations = (data.cancellations || []).map(order => `<tr><td>${esc(order.placedBy?.name)}<div class="tool-note">${esc(order.categoryName)} #${esc(order.remoteOrderId)}</div></td><td>${esc(order.summary)}</td><td>${money(order.sellPrice)}<div class="tool-note">Đã hoàn CTV: ${money(order.refundedAmount || 0)}</div></td><td>${order.status === 'cancelled' ? 'Đã hủy tại nguồn, chờ hoàn tiền & dọn đơn' : 'CTV yêu cầu hủy; cần kiểm tra trạng thái nguồn'}</td><td style="display:flex;gap:6px;flex-wrap:wrap;">${order.status === 'cancelled' ? `${button('💰 Hoàn đủ & xóa đơn', 'data-quick-refund-clean', order.id, 'btn-violet')}${button('Hoàn một phần', 'data-refund-order', order.id)}` : button('Hủy & hoàn tiền', 'data-cancel-source', order.id, 'btn-violet')}${order.weatherDeletePending ? button('Xác nhận nguồn đã xóa', 'data-verify-deleted', order.id) : ''}</td></tr>`).join('');
    const events = (data.events || []).map(event => `<tr><td style="white-space:nowrap;font-size:12px;">${date(event.createdAt)}</td><td>${esc(event.actorName)}<div class="tool-note">${esc(event.actorRole)}</div></td><td>${esc(formatAuditAction(event.action))}</td><td style="font-size:12px;color:var(--color-moon-mist);">${esc(formatAuditDetails(event.details))}</td></tr>`).join('');
    const table = (headers, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;

    const payment = data.payment;
    const payable = panel('Admin phải thanh toán', `<strong style="font-size:24px">${payment?.amount != null ? money(payment.amount) : 'Chưa có số liệu nguồn'}</strong>
      <div class="tool-note">Hạn mức nguồn đã dùng trong tuần ${esc(payment?.weekStart || '')} · ${payment?.sourceSpent != null ? money(payment.sourceSpent) : 'Chưa xác định'}</div>
      <div class="tool-note">Tổng số dư ví CTV · ${payment ? money(payment.totalBalance) : '—'}</div>`);
    return payable + panel('Giám sát & quản lý từng CTV', `<div class="tool-actions" style="flex-wrap:wrap;"><span class="badge-tag ${data.storageHealthy ? 'green' : 'red'}">${data.storageHealthy ? 'Lưu trữ đang hoạt động' : 'Lỗi ghi dữ liệu: tạm dừng giao dịch'}</span>${ctvSelectHtml}${button('Làm mới', 'data-refresh-monitor', '')}</div><p class="tool-note">Chọn CTV để xem nhật ký hoạt động, đơn đã đặt và biến động ví. Dữ liệu tự cập nhật mỗi phút.</p>${table(['CTV', 'Số dư', 'Đơn đã đặt', 'Trạng thái', 'Hoạt động gần nhất', 'Quản lý'], presence)}${moreButton(data, 'ctvs')}`)
      + renderSelectedCtvDetailHtml()
      + panel('Yêu cầu cần kiểm tra', table(['CTV', 'Đơn / yêu cầu', 'Tiền giữ', 'Kết quả', 'Xử lý'], intents) + moreButton(data, 'intents'))
      + panel('Yêu cầu hủy / hoàn tiền', `<p class="tool-note">Chỉ hoàn ví sau khi kiểm tra nguồn. Hủy đơn không tự động hoàn toàn bộ tiền.</p>${table(['CTV / nguồn', 'Đơn', 'Giá bán', 'Trạng thái', 'Thao tác'], cancellations)}${moreButton(data, 'cancellations')}`)
      + panel('Nhật ký hoạt động toàn hệ thống', table(['Thời điểm', 'Tài khoản', 'Hoạt động', 'Chi tiết / đối soát'], events) + moreButton(data, 'events'));
  }

  function openReviewModal(title, content, handler) {
    const overlay = document.getElementById('appModalOverlay');
    const box = document.getElementById('appModalBox');
    const body = document.getElementById('appModalBody');
    box.className = 'modal-box';
    document.getElementById('appModalTitle').textContent = title;
    body.innerHTML = `<form id="reviewForm" class="tool-form tool-form-column">${content}<label>Ghi chú đối soát<textarea class="input-box" name="note" minlength="10" maxlength="500" required placeholder="Mã đơn nguồn, kết quả đã kiểm tra, số tiền đã nhận lại..."></textarea></label><label class="tool-check"><input type="checkbox" name="confirmed" required /> Tôi đã kiểm tra dữ liệu thực tế tại nguồn chính.</label><button type="submit" class="btn-violet">Xác nhận kết quả đối soát</button></form>`;
    overlay.style.display = 'flex';
    const form = body.querySelector('#reviewForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        const response = await handler(form);
        overlay.style.display = 'none';
        body.innerHTML = '';
        showToast(response.message);
        await loadAdminMonitor();
      } catch (error) { showToast(error.message); }
      finally { submit.disabled = false; }
    });
  }

  const readReview = form => ({ note: form.elements.note.value.trim(), confirmed: form.elements.confirmed.checked });
  let detailSearchTimer;
  function bindAdminMonitorEvents() {
    const expanded = () => { monitorVersion++; renderCurrentView(); };
    bindMore(document.getElementById('monitorCtvDetailPanel'), state.adminMonitorCtvDetail, expanded);
    bindMore(document.getElementById('mainViewContainer'), state.adminMonitor, expanded);
    document.querySelectorAll('[data-refresh-monitor]').forEach(control => control.addEventListener('click', () => loadAdminMonitor(false)));

    const selectCtv = async (ctvId) => {
      if (!ctvId) {
        state.adminMonitorCtvId = null;
        state.adminMonitorCtvDetail = null;
        renderCurrentView();
        return;
      }
      state.adminMonitorCtvTab = state.adminMonitorCtvTab || 'orders';
      state.adminMonitorCtvOrderSearch = '';
      state.adminMonitorCtvCatFilter = 'all';
      await loadAdminMonitorCtvDetail(ctvId, false);
      document.getElementById('monitorCtvDetailPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    document.getElementById('monitorCtvQuickSelect')?.addEventListener('change', (e) => {
      selectCtv(e.target.value);
    });
    document.querySelectorAll('[data-select-ctv]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCtv(btn.dataset.selectCtv);
      });
    });
    document.querySelectorAll('[data-select-ctv-row]').forEach(row => {
      row.addEventListener('click', () => {
        selectCtv(row.dataset.selectCtvRow);
      });
    });
    document.querySelectorAll('[data-refresh-ctv-detail]').forEach(btn => {
      btn.addEventListener('click', () => loadAdminMonitorCtvDetail(btn.dataset.refreshCtvDetail, false));
    });
    document.querySelectorAll('[data-close-ctv-detail]').forEach(btn => {
      btn.addEventListener('click', () => selectCtv(''));
    });
    document.querySelectorAll('[data-ctv-detail-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.adminMonitorCtvTab = btn.dataset.ctvDetailTab;
        loadAdminMonitorCtvDetail(state.adminMonitorCtvId, false);
      });
    });
    document.getElementById('monitorCtvOrderSearch')?.addEventListener('input', (e) => {
      const value = e.target.value;
      state.adminMonitorCtvOrderSearch = value;
      clearTimeout(detailSearchTimer);
      detailSearchTimer = setTimeout(async () => {
        if (state.currentView !== 'admin_monitor') return;
        const active = document.activeElement;
        const hadFocus = active?.id === 'monitorCtvOrderSearch';
        const pos = hadFocus ? active.selectionStart : null;
        await loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true);
        if (hadFocus && value === state.adminMonitorCtvOrderSearch) {
          const inp = document.getElementById('monitorCtvOrderSearch');
          if (inp) {
            inp.focus();
            if (pos != null) { try { inp.setSelectionRange(pos, pos); } catch {} }
          }
        }
      }, 250);
    });
    document.getElementById('monitorCtvCatFilter')?.addEventListener('change', (e) => {
      state.adminMonitorCtvCatFilter = e.target.value;
      loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true);
    });

    document.querySelectorAll('[data-reconcile-intent]').forEach(control => control.addEventListener('click', () => {
      const intent = state.adminMonitor.intents.find(item => item.id === control.dataset.reconcileIntent);
      openReviewModal(`Đối soát: ${intent.userName}`, `<p class="tool-note">Yêu cầu này không tự gửi lại. Chỉ xác nhận sau khi kiểm tra nguồn đã tạo đơn hay chưa.</p><label>Kết quả<select class="input-box" name="resolution" required><option value="">Chọn sau khi kiểm tra nguồn</option><option value="created">Nguồn đã tạo đơn</option><option value="not_created">Nguồn xác nhận chưa tạo đơn — trả khoản giữ</option></select></label><label>Mã đơn nguồn (nếu đã tạo)<input class="input-box" name="remoteOrderId" type="number" min="1" step="1" /></label><label>Chi phí thực tế ở nguồn (nếu đã tạo)<input class="input-box" name="actualCost" type="number" min="0" step="1" /></label>`, form => apiFetch(`/api/admin/intents/${encodeURIComponent(intent.id)}/reconcile`, 'POST', { ...readReview(form), resolution: form.elements.resolution.value, remoteOrderId: form.elements.remoteOrderId.value === '' ? null : Number(form.elements.remoteOrderId.value), actualCost: form.elements.actualCost.value === '' ? null : Number(form.elements.actualCost.value) }));
    }));
    document.querySelectorAll('[data-ack-intent]').forEach(control => control.addEventListener('click', () => {
      openReviewModal('Ghi nhận chênh lệch chi phí nguồn', '<p class="tool-note">Thao tác này ghi nhận admin đã kiểm tra chi phí, không tự trừ thêm tiền ví CTV.</p>', form => apiFetch(`/api/admin/intents/${encodeURIComponent(control.dataset.ackIntent)}/acknowledge`, 'POST', readReview(form)));
    }));
    document.querySelectorAll('[data-quick-refund-clean]').forEach(control => control.addEventListener('click', async () => {
      const order = state.adminMonitor.cancellations.find(item => item.id === control.dataset.quickRefundClean);
      if (!order) return;
      const rem = Math.max(0, Number(order.sellPrice || 0) - Number(order.refundedAmount || 0));
      if (!confirm(`Hoàn đủ ${money(rem)} về ví CTV "${order.placedBy?.name || ''}" và xóa hẳn đơn #${order.remoteOrderId} khỏi hệ thống?`)) return;
      control.disabled = true;
      try {
        const response = await apiFetch(`/api/orders/${encodeURIComponent(order.category)}/${encodeURIComponent(order.remoteOrderId)}`, 'DELETE', { deletion_note: 'Hoàn tiền & dọn đơn đã hủy' });
        showToast(response.message || 'Đã hoàn tiền & xóa đơn!');
        await Promise.all([loadAdminMonitor(), loadOrders(true)]);
      } catch (error) { showToast(error.message); }
      finally { control.disabled = false; }
    }));
    document.querySelectorAll('[data-cancel-source]').forEach(control => control.addEventListener('click', async () => {
      const order = state.adminMonitor.cancellations.find(item => item.id === control.dataset.cancelSource);
      if (!confirm(`Hủy đơn ${order.categoryName} #${order.remoteOrderId} tại nguồn và hoàn phần chưa chạy về ví CTV?`)) return;
      control.disabled = true;
      try {
        const response = await apiFetch(`/api/orders/${encodeURIComponent(order.category)}/${encodeURIComponent(order.remoteOrderId)}`, 'DELETE', { deletion_note: 'Admin duyệt yêu cầu hủy từ CTV' });
        showToast(response.message);
        await loadAdminMonitor();
        await loadOrders(true);
      } catch (error) { showToast(error.message); }
      finally { control.disabled = false; }
    }));
    document.querySelectorAll('[data-verify-deleted]').forEach(control => control.addEventListener('click', () => {
      const order = state.adminMonitor.cancellations.find(o => o.id === control.dataset.verifyDeleted);
      if (!order) return;
      const key = createRequestKey();
      openReviewModal(`Đối soát xóa đơn #${esc(order.remoteOrderId)}`, `<p class="tool-note">Xác minh nguồn đã xóa đơn trống và hoàn đủ chi phí nguồn trước khi hoàn ${money(order.sellPrice)} vào ví CTV.</p>`, form =>
        apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, 'POST', {
          ...readReview(form), verifiedDeleted: true, sourceRefund: order.costPrice, amount: order.sellPrice, idempotency_key: key,
        }));
    }));
    document.querySelectorAll('[data-refund-order]').forEach(control => control.addEventListener('click', () => {
      const order = state.adminMonitor.cancellations.find(item => item.id === control.dataset.refundOrder);
      const key = createRequestKey();
      openReviewModal(`Hoàn ví đơn #${order.remoteOrderId}`, `<p class="tool-note">Nhập tổng tiền nguồn đã hoàn cho đơn, bao gồm các lần trước. Hoàn CTV bị giới hạn theo tỷ lệ tiền nguồn đã hoàn; không thể hoàn trùng hoặc vượt giá trị đơn.</p><label>Tổng tiền nguồn đã hoàn (VNĐ, lũy kế)<input class="input-box" name="sourceRefund" type="number" min="${order.sourceRefunded || 0}" max="${order.costPrice}" value="${order.sourceRefunded || 0}" step="1" required /></label><label>Hoàn thêm vào ví CTV (VNĐ)<input class="input-box" name="amount" type="number" min="1" max="${Math.max(0, order.sellPrice - (order.refundedAmount || 0))}" step="1" required /></label>`, form => apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, 'POST', { ...readReview(form), sourceRefund: Number(form.elements.sourceRefund.value), amount: Number(form.elements.amount.value), idempotency_key: key }));
    }));
  }

  return { renderIdentityToolsHtml, bindIdentityToolsEvents, loadIdentityClientStatus, loadAdminMonitor, renderAdminMonitorHtml, bindAdminMonitorEvents };
}
