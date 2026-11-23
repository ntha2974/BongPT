export function createToolViews({ state, apiFetch, createRequestKey, escapeHtml: esc, showToast, formatVnd: money, formatDateVi: date, renderCurrentView, loadOrders }) {
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

  function renderIdentityToolsHtml() {
    return panel('2. Trích xuất tên nhân vật / ID Game', '<p class="tool-note">Chưa mở. Tính năng này sẽ được bổ sung ở phiên bản sau.</p>');
  }

  function bindIdentityToolsEvents() {}

  async function loadAdminMonitorCtvDetail(ctvId, silent = false) {
    if (state.user?.role !== 'admin' || !ctvId) return;
    state.adminMonitorCtvId = ctvId;
    if (!silent) {
      state.adminMonitorCtvLoading = true;
      if (state.currentView === 'admin_monitor') renderCurrentView();
    }
    try {
      const response = await apiFetch(`/api/admin/monitor/ctv/${encodeURIComponent(ctvId)}`);
      if (state.user?.role !== 'admin' || state.adminMonitorCtvId !== ctvId) return;
      state.adminMonitorCtvDetail = response;
    } catch (error) {
      if (!silent) showToast(error.message);
    } finally {
      state.adminMonitorCtvLoading = false;
      if (state.currentView === 'admin_monitor') renderCurrentView();
    }
  }

  async function loadAdminMonitor() {
    if (state.user?.role !== 'admin') return;
    try {
      const response = await apiFetch('/api/admin/monitor');
      if (state.user?.role !== 'admin') return;
      state.adminMonitor = response;
      if (state.adminMonitorCtvId) {
        await loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true);
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
            <option value="all" ${catFilter === 'all' ? 'selected' : ''}>Tất cả danh mục (${allOrders.length})</option>
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
          <button type="button" class="btn-frost ${tab === 'orders' ? 'is-active' : ''}" data-ctv-detail-tab="orders">📦 Đơn đã đặt (${allOrders.length})</button>
          <button type="button" class="btn-frost ${tab === 'events' ? 'is-active' : ''}" data-ctv-detail-tab="events">🕒 Nhật ký hoạt động (${evList.length})</button>
          <button type="button" class="btn-frost ${tab === 'transactions' ? 'is-active' : ''}" data-ctv-detail-tab="transactions">💳 Biến động ví (${trxList.length})</button>
        </div>

        ${tabBody}
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
    const cancellations = (data.cancellations || []).map(order => `<tr><td>${esc(order.placedBy?.name)}<div class="tool-note">${esc(order.categoryName)} #${esc(order.remoteOrderId)}</div></td><td>${esc(order.summary)}</td><td>${money(order.sellPrice)}<div class="tool-note">Đã hoàn CTV: ${money(order.refundedAmount || 0)}</div></td><td>${order.status === 'cancelled' ? 'Đã hủy tại nguồn, chờ hoàn tiền & dọn đơn' : 'CTV yêu cầu hủy; nguồn có thể vẫn chạy'}</td><td style="display:flex;gap:6px;flex-wrap:wrap;">${order.status === 'cancelled' ? `${button('💰 Hoàn đủ & xóa đơn', 'data-quick-refund-clean', order.id, 'btn-violet')}${button('Hoàn một phần', 'data-refund-order', order.id)}` : button('Hủy & hoàn tiền', 'data-cancel-source', order.id, 'btn-violet')}</td></tr>`).join('');
    const events = (data.events || []).map(event => `<tr><td style="white-space:nowrap;font-size:12px;">${date(event.createdAt)}</td><td>${esc(event.actorName)}<div class="tool-note">${esc(event.actorRole)}</div></td><td>${esc(formatAuditAction(event.action))}</td><td style="font-size:12px;color:var(--color-moon-mist);">${esc(formatAuditDetails(event.details))}</td></tr>`).join('');
    const table = (headers, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;

    return panel('Giám sát & quản lý từng CTV', `<div class="tool-actions" style="flex-wrap:wrap;"><span class="badge-tag ${data.storageHealthy ? 'green' : 'red'}">${data.storageHealthy ? 'Lưu trữ đang hoạt động' : 'Lỗi ghi dữ liệu: tạm dừng giao dịch'}</span>${ctvSelectHtml}${button('Làm mới', 'data-refresh-monitor', '')}</div><p class="tool-note">Ấn vào từng CTV bên dưới (hoặc chọn ở danh sách trên) để xem riêng nhật ký hoạt động, đơn đã đặt và biến động ví của CTV đó. Tự cập nhật mỗi 30 giây.</p>${table(['CTV', 'Số dư', 'Đơn đã đặt', 'Trạng thái', 'Hoạt động gần nhất', 'Quản lý'], presence)}`)
      + renderSelectedCtvDetailHtml()
      + panel('Yêu cầu cần kiểm tra', table(['CTV', 'Đơn / yêu cầu', 'Tiền giữ', 'Kết quả', 'Xử lý'], intents))
      + panel('Yêu cầu hủy / hoàn tiền', `<p class="tool-note">Chỉ hoàn ví sau khi kiểm tra nguồn. Hủy đơn không tự động hoàn toàn bộ tiền.</p>${table(['CTV / nguồn', 'Đơn', 'Giá bán', 'Trạng thái', 'Thao tác'], cancellations)}`)
      + panel('200 hoạt động gần nhất (toàn hệ thống)', table(['Thời điểm', 'Tài khoản', 'Hoạt động', 'Chi tiết / đối soát'], events));
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
  function bindAdminMonitorEvents() {
    document.querySelectorAll('[data-refresh-monitor]').forEach(control => control.addEventListener('click', loadAdminMonitor));

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
        renderCurrentView();
      });
    });
    document.getElementById('monitorCtvOrderSearch')?.addEventListener('input', (e) => {
      const pos = e.target.selectionStart;
      state.adminMonitorCtvOrderSearch = e.target.value;
      renderCurrentView();
      const inp = document.getElementById('monitorCtvOrderSearch');
      if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch {} }
    });
    document.getElementById('monitorCtvCatFilter')?.addEventListener('change', (e) => {
      state.adminMonitorCtvCatFilter = e.target.value;
      renderCurrentView();
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
      if (!confirm(`Hủy đơn ${order.categoryName} #${order.remoteOrderId} tại nguồn? Chưa tự động hoàn ví CTV.`)) return;
      control.disabled = true;
      try {
        const response = await apiFetch(`/api/orders/${encodeURIComponent(order.category)}/${encodeURIComponent(order.remoteOrderId)}`, 'DELETE', { deletion_note: 'Admin duyệt yêu cầu hủy từ CTV' });
        showToast(response.message);
        await loadAdminMonitor();
        await loadOrders(true);
      } catch (error) { showToast(error.message); }
      finally { control.disabled = false; }
    }));
    document.querySelectorAll('[data-refund-order]').forEach(control => control.addEventListener('click', () => {
      const order = state.adminMonitor.cancellations.find(item => item.id === control.dataset.refundOrder);
      const key = createRequestKey();
      openReviewModal(`Hoàn ví đơn #${order.remoteOrderId}`, `<p class="tool-note">Nhập tổng tiền nguồn đã hoàn cho đơn, bao gồm các lần trước. Hoàn CTV bị giới hạn theo tỷ lệ tiền nguồn đã hoàn; không thể hoàn trùng hoặc vượt giá trị đơn.</p><label>Tổng tiền nguồn đã hoàn (VNĐ, lũy kế)<input class="input-box" name="sourceRefund" type="number" min="${order.sourceRefunded || 0}" max="${order.costPrice}" value="${order.sourceRefunded || 0}" step="1" required /></label><label>Hoàn thêm vào ví CTV (VNĐ)<input class="input-box" name="amount" type="number" min="1" max="${Math.max(0, order.sellPrice - (order.refundedAmount || 0))}" step="1" required /></label>`, form => apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, 'POST', { ...readReview(form), sourceRefund: Number(form.elements.sourceRefund.value), amount: Number(form.elements.amount.value), idempotency_key: key }));
    }));
  }

  return { renderIdentityToolsHtml, bindIdentityToolsEvents, loadAdminMonitor, renderAdminMonitorHtml, bindAdminMonitorEvents };
}
