const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const esbuild = require('esbuild');
const express = require('express');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const toolsSource = fs.readFileSync(path.join(root, 'public/tools.js'), 'utf8');

// Run the actual routes with an in-memory database and mocked upstream service.
// Tests never change data/db.json or contact the order provider.
async function startTestServer(t, upstreamFetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }), options = {}) {
  const data = {
    settings: { hoanNguyen: { token: 'test-upstream-token', email: 'source@example.test', password: 'source-test-password' } },
    users: [
      { id: 'owner', username: 'owner', password: 'owner-test-password', role: 'admin', name: 'Owner' },
      { id: 'seller', username: 'seller', password: 'seller-test-password', role: 'ctv', name: 'Seller', balance: 50000 },
    ],
    sessions: {
      legacyAdmin: { userId: 'owner', createdAt: Date.now() },
      legacyString: 'owner',
    },
    localOrders: [], transactions: [],
  };
  if (options.seed) options.seed(data);
  let writeFailure = false;
  const publicDir = path.join(root, 'public');
  const fakeFs = {
    existsSync: filePath => filePath.startsWith(publicDir) ? fs.existsSync(filePath) : !(options.fresh && filePath.endsWith('db.json')),
    mkdirSync() {},
    readFileSync: (filePath, enc) => filePath.startsWith(publicDir) ? fs.readFileSync(filePath, enc) : (options.corrupt ? '{broken json' : JSON.stringify(data)),
    writeFileSync() { if (writeFailure) throw new Error('Disk full'); }, renameSync() {}, unlinkSync() {},
  };
  const context = vm.createContext({
    express: () => {
      const app = express();
      app.listen = () => {}; // Avoid the production listener and startup login.
      return app;
    },
    fs: fakeFs, path, crypto, zlib, esbuild,
    fileURLToPath: () => path.join(root, 'server.js'),
    process: { env: options.env || {}, on() {} }, console: { ...console, error() {} }, structuredClone, URL, URLSearchParams, Buffer, AbortSignal,
    fetch: upstreamFetch,
  });
  context.express.json = express.json;
  context.express.static = express.static;
  await vm.runInContext('(async () => {\n' + serverSource.replace(/^import .*;\r?\n/gm, '')
    .replace('import.meta.url', '"file:///test/server.js"')
    + '\nglobalThis.testApp = app; globalThis.testDb = db;\n})()', context);
  const server = http.createServer(context.testApp);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = 'GET', token = '', body) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const login = async (identifier, password) => request('/api/auth/login', 'POST', '', { identifier, password });
  return { base, request, login, db: context.testDb, setUpstreamFetch: value => { context.fetch = value; },
    setWriteFailure: value => { writeFailure = value; },
    mockSearch: handler => { context.searchInGameByWebSocket = handler; },
  };
}

test('new deployment requires a private admin password and never creates demo CTV accounts', async t => {
  await assert.rejects(startTestServer(t, undefined, { fresh: true }), /ADMIN_PASSWORD/);
  const { db, login, request } = await startTestServer(t, undefined, {
    fresh: true, env: { ADMIN_PASSWORD: 'private-owner-test-password', ADMIN_USERNAME: 'myowner', ADMIN_EMAIL: 'owner@example.test' },
  });
  assert.equal(db.users.length, 1);
  assert.equal(db.users[0].role, 'admin');
  assert.match(db.users[0].password, /^scrypt\$/);
  assert.notEqual(db.users[0].password, 'private-owner-test-password');
  assert.equal((await login('myowner', 'private-owner-test-password')).status, 200);
  assert.equal((await request('/api/health')).status, 200);
  assert.equal(db.settings.hoanNguyen.password, '');
});

test('deployment environment preserves existing admin password and clears an outdated source token', async t => {
  const { db, login } = await startTestServer(t, undefined, {
    env: { ADMIN_PASSWORD: 'different-bootstrap-password', HOANNGUYEN_EMAIL: 'new-source@example.test', HOANNGUYEN_PASSWORD: 'new-source-test-password' },
  });
  assert.equal((await login('owner', 'owner-test-password')).status, 200);
  assert.equal((await login('owner', 'different-bootstrap-password')).status, 401);
  assert.equal(db.settings.hoanNguyen.token, '');
  assert.equal(db.settings.hoanNguyen.email, 'new-source@example.test');
});

test('corrupt existing database stops startup instead of resetting balances and accounts', async t => {
  await assert.rejects(startTestServer(t, undefined, { corrupt: true, env: { ADMIN_PASSWORD: 'private-owner-test-password' } }), /tránh ghi đè dữ liệu/);
});

test('cached token does not imply connectivity and a failed reconnect reports the network cause', async t => {
  const networkFailure = async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'EACCES' } }); };
  const { request, login, setUpstreamFetch } = await startTestServer(t, networkFailure);
  const admin = await login('owner', 'owner-test-password');
  const token = admin.body.token;
  const overview = await request('/api/admin/overview', 'GET', token);
  assert.equal(overview.body.settings.hoanNguyen.connected, false);
  assert.match(overview.body.settings.hoanNguyen.lastError, /bị chặn kết nối mạng/);
  const reconnect = await request('/api/admin/hoannguyen/reconnect', 'POST', token);
  assert.equal(reconnect.status, 502);
  assert.match(reconnect.body.message, /bị chặn kết nối mạng/);
  const catalog = await request('/api/catalog?refresh=1', 'GET', token);
  assert.equal(catalog.body.success, false);
  assert.equal(catalog.body.catalog, undefined);
  setUpstreamFetch(async url => ({
    ok: true, status: 200,
    json: async () => url.endsWith('/api/auth/login') ? { token: 'fresh-upstream-token' } : { success: true, data: [] },
  }));
  const recovered = await request('/api/admin/hoannguyen/reconnect', 'POST', token);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.hoanNguyen.connected, true);
  assert.equal(recovered.body.hoanNguyen.lastError, '');
});

test('a failed required catalog request cannot be hidden by later successful responses', async t => {
  const { request, login } = await startTestServer(t, async url => {
    if (url.includes('/api/fruit-items')) return { ok: false, status: 503, json: async () => ({ message: 'Catalog unavailable' }) };
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  const admin = await login('owner', 'owner-test-password');
  const catalog = await request('/api/catalog?refresh=1', 'GET', admin.body.token);
  assert.equal(catalog.body.success, false);
  const overview = await request('/api/admin/overview', 'GET', admin.body.token);
  assert.equal(overview.body.settings.hoanNguyen.connected, false);
  assert.equal(overview.body.settings.hoanNguyen.lastError, 'Catalog unavailable');
});

test('only authenticated admins can access every admin operation', async t => {
  const { request, login, db } = await startTestServer(t);
  assert.equal((await request('/api/auth/me')).status, 401);
  for (const token of ['legacyAdmin', 'legacyString', 'forged-token']) {
    assert.equal((await request('/api/auth/me', 'GET', token)).status, 401);
    assert.equal((await request('/api/admin/overview', 'GET', token)).status, 403);
  }
  assert.equal((await login('owner', 'wrong-password')).status, 401);
  const seller = await login('seller', 'seller-test-password');
  assert.equal(seller.status, 200);
  assert.equal(seller.body.user.password, undefined);
  assert.equal((await request('/api/auth/me', 'GET', seller.body.token)).body.user.role, 'ctv');
  const before = JSON.stringify({ users: db.users, settings: db.settings });
  for (const [url, method] of [
    ['/api/admin/overview', 'GET'], ['/api/admin/settings', 'PUT'],
    ['/api/admin/ctv', 'POST'], ['/api/admin/ctv/seller', 'PUT'],
    ['/api/admin/ctv/seller', 'DELETE'], ['/api/admin/ctv/seller/balance', 'POST'],
    ['/api/admin/hoannguyen/reconnect', 'POST'], ['/api/admin/password', 'PUT'],
    ['/api/admin/future-route', 'GET'],
  ]) {
    assert.equal((await request(url, method, seller.body.token, { role: 'admin', balance: 999999 })).status, 403, url);
    assert.equal((await request(url, method)).status, 403, url);
  }
  assert.equal(JSON.stringify({ users: db.users, settings: db.settings }), before);
  const admin = await login('owner', 'owner-test-password');
  const overview = await request('/api/admin/overview', 'GET', admin.body.token);
  assert.equal(overview.status, 200);
  assert.equal(overview.headers.get('cache-control'), 'no-store');
  db.users.find(u => u.id === 'owner').isLocked = true;
  assert.equal((await request('/api/admin/overview', 'GET', admin.body.token)).status, 403);
});

test('changing owner password validates credentials and revokes all owner sessions', async t => {
  const { request, login } = await startTestServer(t);
  const first = await login('owner', 'owner-test-password');
  const second = await login('owner', 'owner-test-password');
  const seller = await login('seller', 'seller-test-password');
  const change = body => request('/api/admin/password', 'PUT', first.body.token, body);
  assert.equal((await change({ currentPassword: 'wrong', newPassword: 'new-owner-password' })).status, 400);
  assert.equal((await change({ currentPassword: 'owner-test-password', newPassword: 'short' })).status, 400);
  assert.equal((await change({ currentPassword: 'owner-test-password', newPassword: 'owner-test-password' })).status, 400);
  assert.equal((await change({ currentPassword: 'owner-test-password', newPassword: 'new-owner-password' })).status, 200);
  for (const session of [first, second]) {
    assert.equal((await request('/api/auth/me', 'GET', session.body.token)).status, 401);
  }
  assert.equal((await request('/api/auth/me', 'GET', seller.body.token)).status, 200);
  assert.equal((await login('owner', 'owner-test-password')).status, 401);
  const fresh = await login('owner', 'new-owner-password');
  assert.equal(fresh.status, 200);
  await request('/api/auth/logout', 'POST', fresh.body.token);
  assert.equal((await request('/api/auth/me', 'GET', fresh.body.token)).status, 401);
});

function createClient(fetchImpl = async () => { throw new Error('Unexpected request'); }, token = '') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, innerHTML: '', textContent: '', value: '',
      classList: { remove() {}, toggle() {} },
    });
    return elements.get(id);
  };
  const storage = new Map(token ? [['znplay_token', token]] : []);
  const context = vm.createContext({
    localStorage: { getItem: () => null, removeItem() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { getElementById: element, querySelectorAll: () => [] },
    fetch: fetchImpl, console: { ...console, error() {} }, setTimeout,
  });
  vm.runInContext(toolsSource.replace(/^export /m, '') + '\n' + clientSource.replace(/^import .*;\r?\n/gm, '').replace(/bootstrap\(\);\s*$/, '') + '\nglobalThis.testState = state;', context);
  return { context, state: context.testState, element, storage };
}

test('first visit and invalid session show login without automatic admin login', async () => {
  const first = createClient();
  await first.context.initAuth();
  assert.equal(first.state.user, null);
  assert.equal(first.element('authGateScreen').style.display, 'flex');
  assert.equal(first.element('appShell').style.display, 'none');
  const urls = [];
  const expired = createClient(async url => {
    urls.push(url);
    return { status: 401, ok: false, json: async () => ({ message: 'Expired' }) };
  }, 'old-token');
  await expired.context.initAuth();
  assert.deepEqual(urls, ['/api/auth/me']);
  assert.equal(expired.storage.has('ebongiu_token'), false);
});

test('a temporary connection failure keeps the session for the next page load', async () => {
  const client = createClient(async () => { throw new Error('offline'); }, 'existing-session');
  await client.context.initAuth();
  assert.equal(client.storage.get('ebongiu_token'), 'existing-session');
  assert.equal(client.storage.has('znplay_token'), false);
  assert.equal(client.storage.has('bonglee_token'), false);
  assert.equal(client.state.user, null);
  assert.equal(client.element('appShell').style.display, 'none');
});

test('empty CTV history skips source calls and concurrent admin reads share a partial result', async t => {
  let requests = 0;
  const server = await startTestServer(t, async url => {
    requests++;
    if (url.includes('guestbook-orders')) throw new Error('Temporarily offline');
    return { status: 200, ok: true, json: async () => ({ data: { data: [] } }) };
  });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  assert.equal((await server.request('/api/orders', 'GET', seller)).body.partial, false);
  assert.equal(requests, 0);
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const reads = await Promise.all([1, 2].map(() => server.request('/api/orders', 'GET', admin)));
  assert.ok(reads.every(r => r.status === 200 && r.body.partial === true));
  assert.equal(requests, 11);
});

test('CTV navigation cannot render admin pages or preserve prior admin data', () => {
  const { context, state, element } = createClient();
  state.user = { role: 'ctv', balance: 100 };
  context.renderOrderCategoryPageHtml = () => 'CTV order page';
  context.bindOrderCategoryPageEvents = () => {};
  for (const view of ['admin_pricing', 'admin_ctv', 'admin_system']) {
    context.switchView(view);
    assert.equal(state.currentView, 'fruit_coin');
    assert.equal(element('mainViewContainer').innerHTML, 'CTV order page');
  }
  state.catalogData = { secret: true };
  state.adminOverview = { secret: true };
  state.orders = [{ costPrice: 100 }];
  element('appModalBody').innerHTML = 'private information';
  context.clearAuthState();
  assert.equal(state.adminOverview, null);
  assert.equal(state.catalogData, null);
  assert.equal(state.orders.length, 0);
  assert.equal(element('mainViewContainer').innerHTML, '');
  assert.equal(element('appModalBody').innerHTML, '');
});

test('late admin responses cannot restore private data after logout', async () => {
  const pending = [];
  const { context, state } = createClient(() => new Promise(resolve => pending.push(resolve)), 'admin-token');
  state.user = { role: 'admin' };
  const loads = [context.loadCatalog(), context.loadOrders(), context.loadAdminOverview()];
  context.clearAuthState();
  for (const resolve of pending) resolve({ status: 200, ok: true, json: async () => ({ success: true, orders: [{ secret: true }], catalog: { secret: true } }) });
  await Promise.all(loads);
  assert.equal(state.catalogData, null);
  assert.equal(state.adminOverview, null);
  assert.equal(state.orders.length, 0);
});

test('public files contain no embedded credentials or quick-login controls', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.doesNotMatch(clientSource + html, /btnQuickSwitchRole|btnGateQuickAdmin|btnGateQuickCtv/);
  assert.doesNotMatch(clientSource, /loginWithCredentials\(\s*['"]/);
  assert.match(html, /id="appShell" style="display:none;"/);
});

function financeSource(onCreate = async () => ({ success: true, data: { id: 501, total_price: 10000, total_cnt: 100 } })) {
  return async (url, options = {}) => {
    const path = new URL(url).pathname;
    let data = { success: true, data: [] };
    if (path === '/api/auth/login') data = { token: 'test-source-token', user: { id: 10 } };
    else if (path === '/api/customers/resolve-by-role-id') data.data = { id: 101, nickname: 'Test customer', suid: 'test-suid', role_id: 'TEST-1234' };
    else if (path === '/api/settings') data.data = { is_send_task: true, is_send_bufftimorder: true, is_send_fruitorder: true, is_send_buffsaoorder: true };
    else if (path === '/api/buff-tim-price-packages') data.data = [{ id: 7, is_active: true, quantity: 100, total_price: 10000 }];
    else if (path === '/api/fruit-coin-price-packages') data.data = [{ id: 8, is_active: true, coin_quantity: 1000, total_price: 10000 }];
    else if (path === '/api/fruit-items') data.data = [{ id: 1, is_active: true, base_price: 130, item: { name: 'Test fruit' }, mutation_prices: [{ mutation_key: 1, unit_price: 1000 }] }];
    else if (path === '/api/order-pricing/preview-fruit') data.data = { total_price: 1300 };
    else if (path === '/api/buff-tim-orders' && options.method === 'POST') data = await onCreate(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => data };
  };
}

async function prepareBuyer(server) {
  const seller = await server.login('seller', 'seller-test-password');
  assert.equal(seller.status, 200);
  const token = seller.body.token;
  const selected = await server.request('/api/customer/resolve-role-id', 'POST', token, { role_id: 'TEST-1234' });
  assert.equal(selected.status, 200);
  return { token, payload: { category: 'buff_tim', customer_id: 101, game_profile_id: null,
    price_package_id: 7, expected_price: 15000, idempotency_key: crypto.randomUUID() } };
}

test('simultaneous purchases reserve funds before source calls and cannot overdraw the wallet', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1;
    const id = creates;
    await new Promise(resolve => setTimeout(resolve, 30));
    return { success: true, data: { id, total_price: 10000 } };
  }));
  const { token, payload } = await prepareBuyer(server);
  const responses = await Promise.all(Array.from({ length: 4 }, () => server.request('/api/orders/place', 'POST', token, { ...payload, idempotency_key: crypto.randomUUID() })));
  assert.equal(responses.filter(r => r.body.success).length, 3);
  assert.equal(creates, 3);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 5000);
  assert.equal(server.db.transactions.filter(tx => tx.type === 'order_debit').length, 3);
  assert.equal(server.db.localOrders.length, 3);
  for (const response of responses.filter(r => r.body.success)) {
    assert.equal(response.body.order.costPrice, undefined);
    assert.equal(response.body.order.markupAmount, undefined);
    assert.equal(response.body.order.apiOrderPath, undefined);
  }
});

test('replaying a purchase returns the same order without another debit or source request', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { success: true, data: { id: 501, total_price: 10000 } };
  }));
  const { token, payload } = await prepareBuyer(server);
  await Promise.all([server.request('/api/orders/place', 'POST', token, payload), server.request('/api/orders/place', 'POST', token, payload)]);
  const replay = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(replay.body.success, true);
  assert.equal(creates, 1);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
  const changed = await server.request('/api/orders/place', 'POST', token, { ...payload, price_package_id: 99 });
  assert.equal(changed.status, 409);
  assert.equal(creates, 1);
});

test('wrong price, insufficient funds, bad customer and invalid fruit inputs never reach billable API', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true }; }));
  const { token, payload } = await prepareBuyer(server);
  for (const patch of [
    { customer_id: 999 }, { game_profile_id: 999 }, { expected_price: 1 },
    { category: 'constructor' }, { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: -2, mutation_list: [] },
    { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 1501, mutation_list: [] },
    { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 10, mutation_list: [1, 1] },
    { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 10, mutation_list: [999] },
  ]) {
    const response = await server.request('/api/orders/place', 'POST', token, { ...payload, ...patch, idempotency_key: crypto.randomUUID() });
    assert.equal(response.body.success, false);
  }
  server.db.users.find(u => u.id === 'seller').balance = 14000;
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).body.code, 'INSUFFICIENT_BALANCE');
  assert.equal(creates, 0);
  assert.equal(server.db.orderIntents.length, 0);
});

test('unknown source outcome holds funds and blocks retries until admin reconciliation', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1;
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
  }));
  const { token, payload } = await prepareBuyer(server);
  const response = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(response.body.code, 'ORDER_REVIEW_REQUIRED');
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
  assert.equal(server.db.orderIntents[0].status, 'uncertain');
  await server.request('/api/orders/place', 'POST', token, { ...payload, idempotency_key: crypto.randomUUID() });
  assert.equal(creates, 1);
  const admin = await server.login('owner', 'owner-test-password');
  const path = `/api/admin/intents/${server.db.orderIntents[0].id}/reconcile`;
  const body = { resolution: 'not_created', confirmed: true, note: 'Checked source: no order was created.' };
  assert.equal((await server.request(path, 'POST', token, body)).status, 403);
  assert.equal((await server.request(path, 'POST', admin.body.token, body)).status, 200);
  assert.equal((await server.request(path, 'POST', admin.body.token, body)).status, 409);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);
  assert.equal(server.db.transactions.filter(tx => tx.type === 'order_release').length, 1);
});

test('definitive source rejection and duplicate confirmation release exactly the reserved amount', async t => {
  for (const duplicate of [false, true]) {
    const upstream = financeSource(async () => duplicate
      ? { needs_confirmation: true, code: 'duplicate_customer', data: { existing_orders: [{ private_cost: 999 }], customer: { private_data: true } } }
      : { success: false, message: 'Source rejected the order' });
    const server = await startTestServer(t, upstream);
    const { token, payload } = await prepareBuyer(server);
    const response = await server.request('/api/orders/place', 'POST', token, payload);
    assert.equal(response.body.success, false);
    assert.equal(response.body.existing_orders, undefined);
    assert.equal(response.body.customer, undefined);
    assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);
    assert.equal(server.db.transactions.filter(tx => tx.type === 'order_release').length, 1);
  }
});

test('disk failure prevents source dispatch and disables health and subsequent money operations', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true }; }));
  const { token, payload } = await prepareBuyer(server);
  server.setWriteFailure(true);
  const response = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(response.status, 503);
  assert.equal((await server.request('/api/health')).status, 503);
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).status, 503);
  assert.equal(creates, 0);
});

test('order IDs are scoped by category; CTV cannot delete while Admin delete auto-refunds uncompleted portion and removes order', async t => {
  let deletes = 0;
  let failNextDelete = false;
  const source = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    if (options.method === 'DELETE') {
      if (failNextDelete) return { ok: false, status: 400, json: async () => ({ success: false, message: 'Cannot delete' }) };
      deletes += 1;
    }
    return source(url, options);
  }, { seed: data => {
    data.localOrders.push(
      { id: 'my-order', category: 'buff_tim', remoteOrderId: 42, sellPrice: 15000, costPrice: 10000, totalCnt: 100, completedCnt: 0, status: 'pending', placedBy: { id: 'seller', role: 'ctv', name: 'Seller' }, customer: {} },
      { id: 'partial-order', category: 'buff_tim', remoteOrderId: 43, sellPrice: 15000, costPrice: 10000, totalCnt: 100, completedCnt: 40, status: 'assigned', placedBy: { id: 'seller', role: 'ctv', name: 'Seller' }, customer: {} },
      { id: 'done-order', category: 'buff_tim', remoteOrderId: 44, sellPrice: 15000, costPrice: 10000, totalCnt: 100, completedCnt: 100, status: 'completed', placedBy: { id: 'seller', role: 'ctv', name: 'Seller' }, customer: {} },
      { id: 'foreign-order', category: 'buff_sao', remoteOrderId: 42, status: 'pending', placedBy: { id: 'other', role: 'ctv' }, customer: {} }
    );
  } });
  const seller = await server.login('seller', 'seller-test-password');
  assert.equal((await server.request('/api/orders/buff_sao/42', 'DELETE', seller.body.token)).status, 403);
  assert.equal((await server.request('/api/orders/buff_sao/42/toggle-active', 'PUT', seller.body.token)).status, 403);
  assert.equal((await server.request('/api/orders/buff_tim/42', 'DELETE', seller.body.token)).status, 403);
  assert.equal(deletes, 0);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);

  const admin = await server.login('owner', 'owner-test-password');
  // Upstream failure must NOT refund or remove order
  failNextDelete = true;
  assert.equal((await server.request('/api/orders/buff_tim/42', 'DELETE', admin.body.token)).status, 400);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);
  assert.equal(server.db.localOrders.length, 4);

  // Admin deletes unstarted CTV order -> refunds 100% (15.000đ) and deletes order from localOrders
  failNextDelete = false;
  const delUnstarted = await server.request('/api/orders/buff_tim/42', 'DELETE', admin.body.token);
  assert.equal(delUnstarted.status, 200);
  assert.equal(delUnstarted.body.refundedAmount, 15000);
  assert.equal(deletes, 1);
  assert.equal(server.db.localOrders.some(o => o.id === 'my-order'), false);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 65000);

  // Admin deletes partially completed CTV order (40/100 done) -> refunds remaining 60% (9.000đ) and removes order
  const delPartial = await server.request('/api/orders/buff_tim/43', 'DELETE', admin.body.token);
  assert.equal(delPartial.status, 200);
  assert.equal(delPartial.body.refundedAmount, 9000);
  assert.equal(server.db.localOrders.some(o => o.id === 'partial-order'), false);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 74000);

  // Admin deletes completed CTV order -> 0đ refund, removes order cleanly
  const delDone = await server.request('/api/orders/buff_tim/44', 'DELETE', admin.body.token);
  assert.equal(delDone.status, 200);
  assert.equal(delDone.body.refundedAmount, 0);
  assert.equal(server.db.localOrders.some(o => o.id === 'done-order'), false);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 74000);
  assert.equal(server.db.localOrders.length, 1);
});

test('manual partial refund uses cumulative source credit and cannot over-refund or repeat', async t => {
  const server = await startTestServer(t, financeSource(), { seed: data => {
    data.localOrders.push({ id: 'refund-order', category: 'buff_tim', remoteOrderId: 42, sellPrice: 15000, costPrice: 10000, status: 'cancelled', placedBy: { id: 'seller', role: 'ctv' } });
  } });
  const admin = await server.login('owner', 'owner-test-password');
  const payload = { confirmed: true, note: 'Verified cumulative source refund of 4000.', sourceRefund: 4000, amount: 7000, idempotency_key: crypto.randomUUID() };
  const path = '/api/admin/orders/refund-order/refund';
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 400);
  payload.amount = 6000;
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 200);
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 409);
  assert.equal((await server.request(path, 'POST', admin.body.token, { ...payload, idempotency_key: crypto.randomUUID() })).status, 400);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 56000);
});

test('wallet adjustments are bounded, idempotent and protected by admin authorization', async t => {
  const server = await startTestServer(t);
  const admin = await server.login('owner', 'owner-test-password');
  const payload = { amount: 1000, note: 'Test topup', idempotency_key: crypto.randomUUID() };
  const path = '/api/admin/ctv/seller/balance';
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 200);
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 409);
  for (const amount of [-100000, 1.5, 1e15, '1000', null]) {
    assert.equal((await server.request(path, 'POST', admin.body.token, { ...payload, amount, idempotency_key: crypto.randomUUID() })).status, 400);
  }
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 51000);
});

test('price tables reject nonfinite and polluted keys, and never sell a package below source cost', async t => {
  const server = await startTestServer(t, financeSource());
  const admin = await server.login('owner', 'owner-test-password');
  for (const body of [{ defaultMarkup: -1 }, { defaultMarkup: 'NaN' }, { fruitUnitPrices: [] }, { categoryMarkups: { constructor: 100 } }, { fruitMutationPrices: { '1:99': 100 } }]) {
    assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, body)).status, 400);
  }
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { packagePriceOverrides: { 'buff_tim:7': 1 } })).status, 200);
  const seller = await server.login('seller', 'seller-test-password');
  const catalog = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catalog.body.catalog.buff_tim[0].total_price, 10000);
  assert.equal(catalog.body.catalog.buff_tim[0]._admin, undefined);
});

test('locking or resetting a CTV password revokes sessions, including after the account is unlocked', async t => {
  const server = await startTestServer(t);
  const seller = await server.login('seller', 'seller-test-password');
  const admin = await server.login('owner', 'owner-test-password');
  const path = '/api/admin/ctv/seller';
  await server.request(path, 'PUT', admin.body.token, { isLocked: true });
  await server.request(path, 'PUT', admin.body.token, { isLocked: false });
  assert.equal((await server.request('/api/auth/me', 'GET', seller.body.token)).status, 401);
  const fresh = await server.login('seller', 'seller-test-password');
  await server.request(path, 'PUT', admin.body.token, { password: 'new-ctv-test-password' });
  assert.equal((await server.request('/api/auth/me', 'GET', fresh.body.token)).status, 401);
  assert.equal((await server.login('seller', 'seller-test-password')).status, 401);
  assert.equal((await server.login('seller', 'new-ctv-test-password')).status, 200);
});

test('CTV cannot enumerate saved source customers, read stock internals, monitor logs or other orders', async t => {
  const server = await startTestServer(t, financeSource(), { seed: data => {
    data.localOrders.push({ id: 'foreign', category: 'buff_tim', remoteOrderId: 10, placedBy: { id: 'someone-else' }, customer: {}, sellPrice: 99999 });
  } });
  const seller = await server.login('seller', 'seller-test-password');
  for (const path of ['/api/customer/saved', '/api/customer/saved/101', '/api/catalog/fruit-stock/1', '/api/admin/monitor']) {
    assert.equal((await server.request(path, 'GET', seller.body.token)).status, 403);
  }
  assert.equal((await server.request('/api/orders', 'GET', seller.body.token)).body.orders.length, 0);
  assert.equal((await server.request('/api/settlements', 'GET', seller.body.token)).body.orders.length, 0);
});

test('deferred identity tool has no active input or backend operation', async t => {
  const { context } = createClient();
  const rendered = vm.runInContext('renderIdentityToolsHtml()', context);
  assert.match(rendered, /Chưa mở/);
  assert.doesNotMatch(rendered, /<form|<input/);
  const server = await startTestServer(t);
  const result = await server.request('/api/tools/identity', 'POST', '', { mode: 'name', query: 'unused' });
  assert.equal(result.status, 404);
});

test('Render Free permits CTV credit, positive initial balances and purchases without a persistent disk', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true, data: { id: 501, total_price: 10000 } }; }), { env: { RENDER: 'true' } });
  const { token, payload } = await prepareBuyer(server);
  const admin = await server.login('owner', 'owner-test-password');
  const credit = { amount: 1000, idempotency_key: crypto.randomUUID() };
  assert.equal((await server.request('/api/admin/ctv/seller/balance', 'POST', admin.body.token, credit)).status, 200);
  assert.equal((await server.request('/api/admin/ctv/seller/balance', 'POST', admin.body.token, credit)).status, 409);
  const created = await server.request('/api/admin/ctv', 'POST', admin.body.token, { name: 'Free test CTV', username: 'trial', password: 'private-test-ctv-password', balance: 5000 });
  assert.equal(created.status, 200);
  assert.equal(created.body.ctv.balance, 5000);
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).status, 200);
  assert.equal(server.db.users.find(user => user.id === 'seller').balance, 36000);
  assert.equal((await server.request('/api/admin/monitor', 'GET', admin.body.token)).body.storageHealthy, true);
  assert.equal(creates, 1);
});

test('monitor records sensitive operations without passwords or tokens, and sessions expire', async t => {
  const server = await startTestServer(t);
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');
  await server.request('/api/admin/overview', 'GET', seller.body.token);
  await server.request('/api/admin/ctv/seller', 'PUT', admin.body.token, { password: 'private-replacement-password' });
  const monitor = await server.request('/api/admin/monitor', 'GET', admin.body.token);
  assert.ok(monitor.body.events.length >= 3);
  assert.ok(monitor.body.events.some(event => event.details.passwordReset === true));
  assert.doesNotMatch(JSON.stringify(monitor.body.events), /private-replacement-password|owner-test-password|test-upstream-token/);
  server.db.sessions[admin.body.token].createdAt = Date.now() - 13 * 60 * 60 * 1000;
  assert.equal((await server.request('/api/auth/me', 'GET', admin.body.token)).status, 401);
});

test('new tools sidebar, source script policy and monitoring HTML reject injected markup', async t => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(html, /CÔNG CỤ/);
  assert.match(html, /data-view="identity_tools"/);
  assert.doesNotMatch(html, /data-view="customers"/);
  const { context, state } = createClient();
  state.adminMonitor = { storageHealthy: true, financialReady: true, ctvs: [{ name: '<img src=x onerror=alert(1)>', username: '<script>', balance: 0 }], events: [] };
  const rendered = vm.runInContext('renderAdminMonitorHtml()', context);
  assert.doesNotMatch(rendered, /<img|<script/);
  assert.match(rendered, /&lt;img/);
  const server = await startTestServer(t);
  const response = await server.request('/api/health');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});

test('same request arriving while catalog is slow is accepted only once', async t => {
  let creates = 0;
  const base = financeSource(async () => {
    creates += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { success: true, data: { id: 501, total_price: 10000 } };
  });
  const server = await startTestServer(t, async (url, options) => {
    if (options.method === 'GET') await new Promise(resolve => setTimeout(resolve, 25));
    return base(url, options);
  });
  const { token, payload } = await prepareBuyer(server);
  await Promise.all([server.request('/api/orders/place', 'POST', token, payload), server.request('/api/orders/place', 'POST', token, payload)]);
  assert.equal(creates, 1);
  assert.equal(server.db.orderIntents.length, 1);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
});

test('a restart preserves an in-flight hold as uncertain; admin can link a confirmed source order without resending', async t => {
  let creates = 0;
  const intent = { id: 'interrupted-intent', requestKey: crypto.randomUUID(), payloadHash: 'test', userId: 'seller', userName: 'Seller',
    status: 'processing', category: 'buff_tim', customerId: 101, customer: { customerId: 101, nickname: 'Test' }, summary: 'Test Tim', heldAmount: 15000, sellPrice: 15000, expectedCost: 10000, createdAt: new Date().toISOString() };
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true }; }), { seed: data => {
    data.users.find(u => u.id === 'seller').balance = 35000;
    data.orderIntents = [intent];
    data.transactions.push({ id: intent.id, userId: 'seller', type: 'order_hold', amount: -15000 });
  } });
  assert.equal(server.db.orderIntents[0].status, 'uncertain');
  const admin = await server.login('owner', 'owner-test-password');
  const result = await server.request('/api/admin/intents/interrupted-intent/reconcile', 'POST', admin.body.token,
    { resolution: 'created', confirmed: true, remoteOrderId: 777, actualCost: 10000, note: 'Source order 777 was verified before linking.' });
  assert.equal(result.status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
  assert.equal(server.db.localOrders[0].remoteOrderId, 777);
  assert.equal(server.db.transactions[0].type, 'order_debit');
  assert.equal(creates, 0);
});

test('unexpected source cost creates a review alert and blocks further purchases until explicit admin acknowledgment', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1; return { success: true, data: { id: 500 + creates, total_price: 11000 } };
  }));
  const { token, payload } = await prepareBuyer(server);
  const placed = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(placed.body.order.requiresReview, true);
  assert.equal(placed.body.order.costPrice, undefined);
  assert.equal(server.db.localOrders[0].costPrice, 11000);
  const blocked = await server.request('/api/orders/place', 'POST', token, { ...payload, idempotency_key: crypto.randomUUID() });
  assert.equal(blocked.body.code, 'ORDER_REVIEW_REQUIRED');
  assert.equal(creates, 1);
  const admin = await server.login('owner', 'owner-test-password');
  const id = server.db.orderIntents[0].id;
  const acknowledged = await server.request(`/api/admin/intents/${id}/acknowledge`, 'POST', admin.body.token,
    { confirmed: true, note: 'Verified changed source cost, no extra CTV debit.' });
  assert.equal(acknowledged.status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
});

test('foreign category with the same numeric ID cannot overwrite local customer or completion status', async t => {
  const base = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    if (new URL(url).pathname === '/api/buff-sao-orders') return { ok: true, status: 200, json: async () => ({ data: { data: [{ id: 42, status: 'completed', completed_cnt: 999, customer: { nickname: 'Foreign customer' } }] } }) };
    return base(url, options);
  }, { seed: data => data.localOrders.push({ id: 'owned-tim', category: 'buff_tim', remoteOrderId: 42, status: 'pending', completedCnt: 0, placedBy: { id: 'seller' }, customer: { nickname: 'Own customer' }, sellPrice: 15000 }) });
  const seller = await server.login('seller', 'seller-test-password');
  const response = await server.request('/api/orders', 'GET', seller.body.token);
  assert.equal(response.body.orders[0].customer.nickname, 'Own customer');
  assert.equal(response.body.orders[0].status, 'pending');
  assert.equal(response.body.orders[0].completedCnt, 0);
});

test('settlements expose only CTV-visible order fields, excluding source refund and internal costs', async t => {
  const server = await startTestServer(t, financeSource(), { seed: data => data.localOrders.push({ id: 'mine', placedBy: { id: 'seller' }, customer: {}, sellPrice: 15000, costPrice: 10000, markupAmount: 5000, sourceRefunded: 4000, apiOrderPath: '/private/source', intentId: 'internal' }) });
  const seller = await server.login('seller', 'seller-test-password');
  const response = await server.request('/api/settlements', 'GET', seller.body.token);
  for (const field of ['costPrice', 'markupAmount', 'sourceRefunded', 'apiOrderPath', 'intentId']) assert.equal(response.body.orders[0][field], undefined);
});

test('ping responds immediately, catalog supports compression and invalidates cache on price changes', async t => {
  const server = await startTestServer(t, financeSource());
  const ping = await server.request('/api/ping');
  assert.equal(ping.status, 200);
  assert.equal(ping.body.ok, true);
  const headPing = await fetch(`${server.base}/api/ping`, { method: 'HEAD' });
  assert.equal(headPing.status, 200);

  const admin = await server.login('owner', 'owner-test-password');
  const cat1 = await server.request('/api/catalog', 'GET', admin.body.token);
  assert.equal(cat1.status, 200);
  assert.equal(cat1.body.catalog.buff_tim[0].total_price, 15000);

  await server.request('/api/admin/settings', 'PUT', admin.body.token, { packagePriceOverrides: { 'buff_tim:7': 19000 } });
  const cat2 = await server.request('/api/catalog', 'GET', admin.body.token);
  assert.equal(cat2.status, 200);
  assert.equal(cat2.body.catalog.buff_tim[0].total_price, 19000);
});

test('admin backup export excludes upstream secrets and backup import restores CTVs safely', async t => {
  const server = await startTestServer(t);
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  assert.equal((await server.request('/api/admin/backup/export', 'GET', seller.body.token)).status, 403);
  assert.equal((await server.request('/api/admin/backup/import', 'POST', seller.body.token, { backup: {} })).status, 403);

  const exported = await server.request('/api/admin/backup/export', 'GET', admin.body.token);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.backup.settings.hoanNguyen.password, '');
  assert.equal(exported.body.backup.settings.hoanNguyen.token, '');
  assert.equal(exported.body.backup.users.length, 2);

  // Reject malformed backup (empty users, missing record ID, duplicate ID, duplicate username) without corrupting live DB or storageHealthy
  assert.equal((await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: { users: [] } })).status, 400);
  const badMissingId = structuredClone(exported.body.backup);
  badMissingId.localOrders = [{ remoteOrderId: 99, category: 'buff_tim' }];
  assert.equal((await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: badMissingId })).status, 400);
  const badDupId = structuredClone(exported.body.backup);
  badDupId.transactions = [{ id: 'dup-1', amount: 1000 }, { id: 'dup-1', amount: 2000 }];
  assert.equal((await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: badDupId })).status, 400);
  const badDupUser = structuredClone(exported.body.backup);
  badDupUser.users.push({ id: 'ctv_dup', username: 'SELLER', password: 'dup-ctv-password-123', name: 'Dup', role: 'ctv', balance: 0 });
  assert.equal((await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: badDupUser })).status, 400);
  assert.equal((await server.request('/api/health')).status, 200);
  assert.equal(server.db.users.length, 2);

  // Modify backup (add a CTV and legacy brandName 'ZNPLAY') and restore while preserving upstream credentials
  const modified = structuredClone(exported.body.backup);
  modified.settings.brandName = 'ZNPLAY';
  modified.users.push({ id: 'ctv_restored', username: 'restored01', email: 'restored01@ebongiu.vn', password: 'restored-ctv-password-123', name: 'Restored CTV', phone: '', role: 'ctv', balance: 75000, isLocked: false, createdAt: new Date().toISOString() });
  const imported = await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: modified });
  assert.equal(imported.status, 200);
  assert.equal(server.db.settings.brandName, 'ebongiu');
  assert.equal(server.db.users.find(u => u.username === 'restored01')?.balance, 75000);
  assert.equal(server.db.settings.hoanNguyen.password, 'source-test-password');
  assert.equal(server.db.settings.hoanNguyen.token, 'test-upstream-token');
  assert.equal((await server.login('restored01', 'restored-ctv-password-123')).status, 200);
});

test('weather_buff status follows is_send_task when source has no separate weather toggle, and exhausted sales fall back to regular price', async t => {
  const base = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    const p = new URL(url).pathname;
    if (p === '/api/settings') {
      return { ok: true, status: 200, json: async () => ({ data: { is_send_task: true, is_send_fruitorder: true, is_send_farmgiftorder: false, is_send_bufftimorder: true } }) };
    }
    if (p === '/api/buff-tim-price-packages') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: [
            { id: 7, is_active: true, quantity: 1000, total_price: 10000, original_price: 10000, effective_price: 6000, is_on_sale: true, sale: { id: 1, sale_price: 6000, slots_total: 10, slots_used: 10, slots_remaining: 0, status: 'active' } },
            { id: 8, is_active: true, quantity: 5000, total_price: 30000, original_price: 30000, effective_price: 20000, is_on_sale: true, sale: { id: 2, sale_price: 20000, slots_total: 10, slots_used: 3, slots_remaining: 7, status: 'active' } },
          ],
        }),
      };
    }
    return base(url, options);
  });
  const seller = await server.login('seller', 'seller-test-password');
  const cat = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(cat.status, 200);
  assert.equal(cat.body.systemStatus.weather_buff, true);
  assert.equal(cat.body.systemStatus.farm_gift, false);
  assert.equal(cat.body.systemStatus.fruit_coin, true);
  // Package 7 has 0 remaining sale slots -> must use regular price (10000 + 5000 = 15000), not sale price
  assert.equal(cat.body.catalog.buff_tim[0].is_on_sale, false);
  assert.equal(cat.body.catalog.buff_tim[0].total_price, 15000);
  // Package 8 has 7 remaining sale slots -> must use sale price (20000 + 5000 = 25000)
  assert.equal(cat.body.catalog.buff_tim[1].is_on_sale, true);
  assert.equal(cat.body.catalog.buff_tim[1].total_price, 25000);
});

test('per-category percentage and manual pricing modes work across packages, fruits, mutations, and reset overrides', async t => {
  const server = await startTestServer(t, financeSource());
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  // Reject invalid mode or out-of-range percent
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { categoryMarkupModes: { buff_tim: 'invalid' } })).status, 400);
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { categoryMarkupPercents: { buff_tim: 999 } })).status, 400);
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { categoryMarkupPercents: { constructor: 10 } })).status, 400);

  // Switch buff_tim to +20% (base cost 10000 -> 12000) and fruit_by_fruit to +50% (base 130 -> 195, mut1 1000 -> 1500)
  const updated = await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkupModes: { buff_tim: 'percent', fruit_by_fruit: 'percent', weather_buff: 'percent' },
    categoryMarkupPercents: { buff_tim: 20, fruit_by_fruit: 50, weather_buff: 15 },
  });
  assert.equal(updated.status, 200);

  const catPct = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catPct.body.catalog.buff_tim[0].total_price, 12000);
  assert.equal(catPct.body.catalog.fruit_by_fruit[0].unit_price, 195);
  assert.equal(catPct.body.catalog.fruit_by_fruit[0].mutation_prices[0].unit_price, 1500);

  // Manual package override beats category percentage, then resetCategoryOverrides brings it back to +20%
  await server.request('/api/admin/settings', 'PUT', admin.body.token, { packagePriceOverrides: { 'buff_tim:7': 14500 } });
  const catOvr = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catOvr.body.catalog.buff_tim[0].total_price, 14500);

  await server.request('/api/admin/settings', 'PUT', admin.body.token, { resetCategoryOverrides: ['buff_tim'] });
  const catReset = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catReset.body.catalog.buff_tim[0].total_price, 12000);

  // Switch back to fixed +3000đ on buff_tim -> 13000đ, and pricingVersion increments
  const beforeVer = catReset.body.pricingVersion;
  await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkupModes: { buff_tim: 'fixed' },
    categoryMarkups: { buff_tim: 3000 },
  });
  const catFixed = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catFixed.body.catalog.buff_tim[0].total_price, 13000);
  assert.ok(catFixed.body.pricingVersion > beforeVer);
});

test('CTV product prices stay with the selected account across catalog, preview, checkout and reset', async t => {
  const server = await startTestServer(t, financeSource(), { seed: data => {
    data.users.push({ ...data.users[1], id: 'second', username: 'second' });
  } });
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const other = (await server.login('second', 'seller-test-password')).body.token;
  const { token, payload } = await prepareBuyer(server);
  const path = '/api/admin/ctv/seller/pricing';
  const changes = { packagePriceOverrides: { 'buff_tim:7': 21000 }, fruitUnitPrices: { 1: 300 }, fruitMutationPrices: { '1:1': 1700 } };
  assert.equal((await server.request(path, 'PUT', other, changes)).status, 403);
  assert.equal((await server.request('/api/admin/ctv/missing/pricing', 'PUT', admin, changes)).status, 404);
  assert.equal((await server.request(path, 'PUT', admin, { ...changes, defaultMarkup: 1 })).status, 400);
  assert.equal((await server.request(path, 'PUT', admin, changes)).status, 200);
  assert.equal((await server.request('/api/catalog?ctvId=seller', 'GET', other)).status, 403);

  const catalog = async (auth, query = '') => (await server.request('/api/catalog' + query, 'GET', auth)).body.catalog;
  const scoped = await catalog(admin, '?ctvId=seller');
  assert.equal(scoped.buff_tim[0]._admin.has_custom_override, true);
  assert.equal(scoped.fruit_by_fruit[0].unit_price, 300);
  assert.equal(scoped.fruit_by_fruit[0].mutation_prices[0].unit_price, 1700);
  for (const auth of [token, other, token, admin]) {
    const rows = await catalog(auth, '?scope=buff_tim&compact=1');
    assert.equal(rows.buff_tim[0].total_price, auth === token ? 21000 : 15000);
  }
  const preview = await server.request('/api/catalog/preview-fruit', 'POST', token, { fruit_item_id: 1, total_cnt: 2, mutation_list: [1] });
  assert.equal(preview.body.data.total_price, 3400 + server.db.settings.categoryMarkups.fruit_by_fruit);
  const stale = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(stale.body.code, 'PRICE_CHANGED');
  const placed = await server.request('/api/orders/place', 'POST', token, { ...payload, expected_price: 21000 });
  assert.equal(placed.status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 29000);
  assert.equal(server.db.localOrders[0].sellPrice, 21000);

  await server.request('/api/admin/settings', 'PUT', admin, { packagePriceOverrides: { 'buff_tim:7': 18000 } });
  assert.equal((await catalog(token)).buff_tim[0].total_price, 21000);
  assert.equal((await catalog(other)).buff_tim[0].total_price, 18000);
  assert.equal((await server.request(path, 'PUT', admin, { packagePriceOverrides: { 'buff_tim:7': null } })).status, 200);
  const reset = await catalog(admin, '?ctvId=seller');
  assert.equal(reset.buff_tim[0].total_price, 18000);
  assert.equal(reset.buff_tim[0]._admin.has_custom_override, false);
  assert.equal(reset.fruit_by_fruit[0].unit_price, 300);
});

test('CTV category edits, inheritance and resets stay isolated through quotes and wallet debits', async t => {
  const server = await startTestServer(t, financeSource(), { seed: data => {
    data.users.push({ ...data.users[1], id: 'second', username: 'second' });
    data.settings.packagePriceOverrides = { 'buff_tim:7': 18000 };
    data.settings.fruitMutationPrices = { '1:1': 2000 };
  } });
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const other = (await server.login('second', 'seller-test-password')).body.token;
  const { token, payload } = await prepareBuyer(server);
  const url = '/api/admin/ctv/seller/pricing';
  const percent = { mode: 'percent', fixed: 0, percent: 12.5 };
  const fruit = { mode: 'fixed', fixed: 70, percent: 0, orderFee: 300 };
  const rules = { buff_tim: percent, fruit_by_fruit: fruit };
  const put = body => server.request(url, 'PUT', admin, body);
  const read = async (user, query = '') => (await server.request('/api/catalog' + query, 'GET', user)).body;
  const scoped = () => read(admin, '?ctvId=seller');
  assert.equal((await scoped()).categoryPricing.buff_tim.personal, false);
  assert.equal((await put({ categoryRules: { ...rules, buff_sao: { ...percent, percent: 501 } } })).status, 400);
  assert.equal((await scoped()).categoryPricing.buff_tim.personal, false);
  assert.equal((await server.request(url, 'PUT', token, { categoryRules: rules })).status, 403);
  assert.equal((await put({ categoryRules: rules, packagePriceOverrides: { 'buff_tim:7': 21000 } })).status, 200);
  const selected = await scoped();
  assert.equal(Object.keys(selected.categoryPricing).length, 8);
  assert.equal(selected.categoryPricing.buff_tim.productCount, 1);
  assert.equal(selected.categoryPricing.buff_sao.personal, false);
  assert.equal(selected.catalog.buff_tim[0].total_price, 21000);
  assert.equal(selected.catalog.fruit_by_fruit[0].unit_price, 200);
  assert.equal(selected.catalog.fruit_by_fruit[0].mutation_prices[0].unit_price, 1070);
  assert.equal(selected.fruitOrderFee, 300);
  const preview = await server.request('/api/catalog/preview-fruit', 'POST', token, { fruit_item_id: 1, total_cnt: 2, mutation_list: [1] });
  assert.equal(preview.body.data.total_price, 2440);
  assert.equal((await put({ resetCategoryOverrides: ['buff_tim'] })).status, 200);
  const own = await read(token, '?scope=buff_tim&compact=1');
  assert.equal(own.categoryPricing, undefined);
  assert.equal(own.pricingVersion, (await server.request('/api/ping')).body.pricingVersion);
  assert.equal(own.catalog.buff_tim[0].total_price, 11250);
  assert.equal((await read(other, '?scope=buff_tim&compact=1')).catalog.buff_tim[0].total_price, 18000);
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).body.code, 'PRICE_CHANGED');
  assert.equal((await server.request('/api/orders/place', 'POST', token, { ...payload, expected_price: 11250 })).status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 38750);
  assert.equal(server.db.users.find(u => u.id === 'second').balance, 50000);
  assert.equal((await put({ categoryRules: { buff_tim: null } })).status, 200);
  const restored = await scoped();
  assert.equal(restored.catalog.buff_tim[0].total_price, 18000);
  assert.equal(restored.categoryPricing.buff_tim.personal, false);
  assert.equal(restored.categoryPricing.fruit_by_fruit.personal, true);
});

test('passive CTV catalog reads reuse 10-minute cache while pre-order refresh fetches live upstream prices', async t => {
  let upstreamSettingsHits = 0;
  let livePrice = 10000;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    const p = new URL(url).pathname;
    if (p === '/api/settings') upstreamSettingsHits += 1;
    if (p === '/api/buff-tim-price-packages') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 7, is_active: true, quantity: 100, total_price: livePrice }] }) };
    }
    return base(url, options);
  });
  const seller = await server.login('seller', 'seller-test-password');
  const first = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(first.body.catalog.buff_tim[0].total_price, 15000);
  assert.equal(upstreamSettingsHits, 1);

  // Passive read reuses cache (zero upstream calls)
  livePrice = 12000;
  const cached = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(cached.body.catalog.buff_tim[0].total_price, 15000);
  assert.equal(upstreamSettingsHits, 1);

  // Wait past 1.5s burst guard and verify pre-order ?refresh=1 gets the live updated price
  await new Promise(resolve => setTimeout(resolve, 1600));
  const refreshed = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(refreshed.body.catalog.buff_tim[0].total_price, 17000);
  assert.equal(upstreamSettingsHits, 2);
});

test('raw source files and dotfiles are blocked, minified bundle hides upstream supplier name, and image proxy hides supplier URL', async t => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const base = financeSource();
  let pngHits = 0;
  const server = await startTestServer(t, async (url, options) => {
    if (String(url).includes('/assets/playtogether/images/test.png')) {
      pngHits += 1;
      return { ok: true, status: 200, arrayBuffer: async () => pngHeader };
    }
    return base(url, options);
  });

  // 1. Minified HTML & security headers
  const rootRes = await fetch(`${server.base}/`);
  assert.equal(rootRes.status, 200);
  assert.equal(rootRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(rootRes.headers.get('x-permitted-cross-domain-policies'), 'none');
  const htmlText = await rootRes.text();
  assert.match(htmlText, /\/assets\/ebongiu\.bundle\.js/);
  assert.match(htmlText, /\/assets\/ebongiu\.bundle\.css/);
  assert.doesNotMatch(htmlText, /<!--/);
  assert.doesNotMatch(htmlText, /hoannguyen/i);

  // 2. Minified JS & CSS bundles + ETag 304 + zero upstream brand leaks
  const jsRes = await fetch(`${server.base}/assets/ebongiu.bundle.js`);
  assert.equal(jsRes.status, 200);
  const etag = jsRes.headers.get('etag');
  assert.ok(etag);
  const jsText = await jsRes.text();
  assert.doesNotMatch(jsText, /hoannguyen/i);
  assert.doesNotMatch(jsText, /SCREENSHOT 1/i);
  assert.ok(jsText.length < clientSource.length + toolsSource.length);
  const js304 = await fetch(`${server.base}/assets/ebongiu.bundle.js`, { headers: { 'If-None-Match': etag } });
  assert.equal(js304.status, 304);

  const cssRes = await fetch(`${server.base}/assets/ebongiu.bundle.css`);
  assert.equal(cssRes.status, 200);

  // 3. Raw source files, dotfiles, source maps, and backend filenames return 404
  for (const blocked of ['/app.js', '/tools.js', '/styles.css', '/index.html', '/.env', '/.git/config', '/server.js', '/package.json', '/assets/ebongiu.bundle.js.map']) {
    const r = await fetch(`${server.base}${blocked}`);
    assert.equal(r.status, 404, `Expected 404 for ${blocked}`);
  }

  // 4. Image proxy hides supplier origin (200 image/png, no 302 redirect, cached, rejects traversal)
  const img1 = await fetch(`${server.base}/assets/playtogether/images/test.png`, { redirect: 'manual' });
  assert.equal(img1.status, 200);
  assert.equal(img1.headers.get('content-type'), 'image/png');
  assert.equal(pngHits, 1);
  const img2 = await fetch(`${server.base}/assets/playtogether/images/test.png`, { redirect: 'manual' });
  assert.equal(img2.status, 200);
  assert.equal(pngHits, 1);
  for (const badImg of ['/assets/playtogether/images/..%2fsecret.png', '/assets/playtogether/images/bad.html']) {
    const r = await fetch(`${server.base}${badImg}`, { redirect: 'manual' });
    assert.equal(r.status, 404, `Expected 404 for ${badImg}`);
  }
});

test('weather_buff full workflow: Admin pricing, package-first order creation, slot assignment, weather config, package lock, and toggle validation', async t => {
  const upstreamCalls = [];
  let wbOrderState = null;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    const p = new URL(url).pathname;
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    if (p === '/api/weather-buff-price-packages') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: [
        { id: 16, quantity: 10, total_price: 2000, original_price: 2000, effective_price: 2000, is_active: true, is_on_sale: false },
        { id: 23, quantity: 200, total_price: 25000, original_price: 25000, effective_price: 25000, is_active: true, is_on_sale: false },
      ] }) };
    }
    if (p === '/api/weather-buff-types') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: [
        { id: 1, name: 'Mưa', enum_key: 'Rain', icon_path_and_name: 'Weather/icon_weather_Rain', diamond: 50, is_active: true, sort_order: 1 },
        { id: 2, name: 'Bão', enum_key: 'Thunderstorm', icon_path_and_name: 'Weather/icon_weather_Thunderstorm', diamond: 60, is_active: true, sort_order: 2 },
      ] }) };
    }
    if (p === '/api/weather-buff-orders' && method === 'POST') {
      upstreamCalls.push({ p, method, body });
      wbOrderState = {
        id: 7701,
        price_package_id: body.price_package_id,
        package_quantity: body.price_package_id === 16 ? 10 : 200,
        total_price: body.price_package_id === 16 ? 2000 : 25000,
        customer_count: body.customer_count || 1,
        is_active: false,
        status: 'pending',
        completed_cnt: 0,
        public_token: 'tok123abc987def',
        slots: [{ slot_index: 0, customer_id: null, customer: null }],
        weathers: [],
      };
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders/7701/share-link' && method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { token: 'tok123abc987def', path: '/track/weather/tok123abc987def', url: 'https://thoitietplay.us/track/weather/tok123abc987def' } }) };
    }
    if (p === '/api/weather-buff-orders/7701/slots/0' && method === 'PUT') {
      upstreamCalls.push({ p, method, body });
      wbOrderState.slots = [{ slot_index: 0, customer_id: body.customer_id, customer: { id: body.customer_id, nickname: 'KhachWeather', suid: '99887766' } }];
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders/7701/weathers' && method === 'PUT') {
      upstreamCalls.push({ p, method, body });
      wbOrderState.weathers = body.weathers.map((w, idx) => ({
        id: 900 + idx,
        weather_type_id: w.weather_type_id,
        position: idx,
        quantity: w.quantity,
        completed_cnt: 0,
        weather_type: { id: w.weather_type_id, name: w.weather_type_id === 1 ? 'Mưa' : 'Bão', icon_path_and_name: 'Weather/icon_weather_Rain' },
      }));
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders/7701/toggle-active' && method === 'PUT') {
      upstreamCalls.push({ p, method });
      wbOrderState.is_active = !wbOrderState.is_active;
      wbOrderState.status = wbOrderState.is_active ? 'assigned' : 'pending';
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders' && method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { data: wbOrderState ? [wbOrderState] : [] } }) };
    }
    if (p === '/api/customers/resolve-by-role-id' && method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 555, nickname: 'KhachWeather', suid: '99887766', role_id: body.role_id } }) };
    }
    return base(url, options);
  }, {
    seed(data) {
      data.users.push({ id: 'seller2', username: 'seller2', password: 'seller2-test-password', role: 'ctv', name: 'Seller2', balance: 50000 });
    },
  });

  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');
  const seller2 = await server.login('seller2', 'seller2-test-password');

  // 1. Admin configures +3.000đ markup on weather_buff -> 10 lần (cost 2.000đ) sells for 5.000đ
  const setRes = await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkups: { weather_buff: 3000 },
    categoryMarkupModes: { weather_buff: 'fixed' },
  });
  assert.equal(setRes.status, 200);

  const cat = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(cat.status, 200);
  assert.equal(cat.body.catalog.weather_buff[0].total_price, 5000);
  assert.equal(cat.body.catalog.weather_buff[0]._admin, undefined);
  assert.equal(cat.body.catalog.weather_buff_types.length, 2);
  assert.match(cat.body.catalog.weather_buff_types[0].icon, /^\/assets\/playtogether\/images\//);

  // 2. CTV places weather_buff package order WITHOUT selecting customer first
  const place = await server.request('/api/orders/place', 'POST', seller.body.token, {
    category: 'weather_buff',
    price_package_id: 16,
    expect_sale: true,
    expected_price: 5000,
    idempotency_key: 'wb_order_place_test_key_001',
  });
  assert.equal(place.status, 200);
  assert.equal(place.body.success, true);
  assert.equal(place.body.userBalance, 45000);
  assert.equal(place.body.order.isActive, false);
  assert.equal(place.body.order.remoteOrderId, 7701);
  assert.deepEqual(upstreamCalls[0].body, {
    customer_count: 1,
    price_package_id: 16,
    expect_sale: false,
    expect_package_sale_id: null,
  });

  // 3. Cannot toggle ON before customer & weathers are configured
  const toggleEarly = await server.request('/api/orders/weather_buff/7701/toggle-active', 'PUT', seller.body.token);
  assert.equal(toggleEarly.status, 400);
  assert.match(toggleEarly.body.message, /gán khách/i);

  // 4. Cannot assign an unselected customer ID (403) or edit another CTV's order (403)
  const badSlot = await server.request('/api/orders/weather_buff/7701/slots/0', 'PUT', seller.body.token, { customer_id: 555 });
  assert.equal(badSlot.status, 403);
  const otherCtvSlot = await server.request('/api/orders/weather_buff/7701/slots/0', 'PUT', seller2.body.token, { customer_id: 555 });
  assert.equal(otherCtvSlot.status, 403);

  // 5. Select customer via Role ID and assign to slot 0
  const resolved = await server.request('/api/customer/resolve-role-id', 'POST', seller.body.token, { role_id: 'ABCD-1234' });
  assert.equal(resolved.status, 200);
  const assignSlot = await server.request('/api/orders/weather_buff/7701/slots/0', 'PUT', seller.body.token, { customer_id: 555 });
  assert.equal(assignSlot.status, 200);
  assert.equal(assignSlot.body.order.customer.nickname, 'KhachWeather');

  // 6. Still cannot toggle ON before choosing weathers
  const toggleNoWeather = await server.request('/api/orders/weather_buff/7701/toggle-active', 'PUT', seller.body.token);
  assert.equal(toggleNoWeather.status, 400);
  assert.match(toggleNoWeather.body.message, /thời tiết/i);

  // 7. Reject weather lines exceeding package quantity (11 > 10)
  const overQty = await server.request('/api/orders/weather_buff/7701/weathers', 'PUT', seller.body.token, {
    weathers: [{ id: null, weather_type_id: 1, quantity: 11 }],
  });
  assert.equal(overQty.status, 400);

  // 8. Save valid weather lines (even if client tries passing price_package_id: 23, server locks to paid 16!)
  const saveW = await server.request('/api/orders/weather_buff/7701/weathers', 'PUT', seller.body.token, {
    price_package_id: 23,
    weathers: [
      { id: null, weather_type_id: 1, quantity: 6 },
      { id: null, weather_type_id: 2, quantity: 4 },
    ],
  });
  assert.equal(saveW.status, 200);
  const weatherCall = upstreamCalls.find(c => c.p === '/api/weather-buff-orders/7701/weathers');
  assert.equal(weatherCall.body.price_package_id, 16);
  assert.equal(weatherCall.body.weathers.length, 2);

  // 9. Toggle ON now succeeds
  const toggleOk = await server.request('/api/orders/weather_buff/7701/toggle-active', 'PUT', seller.body.token);
  assert.equal(toggleOk.status, 200);
  const listRes = await server.request('/api/orders?category=weather_buff&refresh=1', 'GET', seller.body.token);
  assert.equal(listRes.body.orders.length, 1);
  assert.equal(listRes.body.orders[0].isActive, true);
  assert.equal(listRes.body.orders[0].customer.nickname, 'KhachWeather');
  assert.equal(listRes.body.orders[0].weather.weathers.length, 2);
  assert.equal(listRes.body.orders[0].weather.trackUrl, 'https://thoitietplay.us/track/weather/tok123abc987def');

  // The tracking link is private to its owner and a running order cannot be deleted by the CTV.
  const linkOwn = await server.request('/api/orders/weather_buff/7701/share-link', 'POST', seller.body.token);
  assert.equal(linkOwn.status, 200);
  assert.equal(linkOwn.body.url, 'https://thoitietplay.us/track/weather/tok123abc987def');
  const linkOther = await server.request('/api/orders/weather_buff/7701/share-link', 'POST', seller2.body.token);
  assert.equal(linkOther.status, 403);
  const delCtv = await server.request('/api/orders/weather_buff/7701', 'DELETE', seller.body.token);
  assert.equal(delCtv.status, 409);
});

test('empty weather cancellation verifies age, owner and live progress, refunds the original sale once, and updates admin totals', async t => {
  let spent = 2000;
  const remote = { id: 71, status: 'pending', is_active: false, sending_cnt: 0, failed_cnt: 0, completed_cnt: 0,
    slots: [{ slot_index: 0, customer_id: null }], weathers: [] };
  let deletes = 0;
  let rejectDelete = true;
  const server = await startTestServer(t, async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/api/seller-settlements') return Response.json({ data: { weekly_limit: { spent } } });
    if (path === '/api/weather-buff-orders') return Response.json({ data: { data: [remote] } });
    if (options.method === 'DELETE') {
      deletes++;
      if (rejectDelete) return Response.json({ success: false }, { status: 422 });
      await new Promise(resolve => setTimeout(resolve, 20));
      spent = 0;
      return Response.json({ success: true });
    }
    return financeSource()(url, options);
  }, { seed(data) {
    data.users.push({ id: 'second', username: 'second', name: 'Second', password: 'second-seller-password', role: 'ctv', balance: 1000 });
    data.localOrders.push({ id: 'weather-71', category: 'weather_buff', remoteOrderId: 71, status: 'pending',
      isActive: false, totalCnt: 10, costPrice: 2000, sellPrice: 5700, markupAmount: 3700, createdAt: new Date().toISOString(),
      weather: { slots: [], weathers: [] }, placedBy: { id: 'seller', role: 'ctv', name: 'Seller' } });
  } });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  const other = (await server.login('second', 'second-seller-password')).body.token;
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const remove = (token = seller) => server.request('/api/orders/weather_buff/71', 'DELETE', token, { sellPrice: 99999 });
  const monitor = async () => (await server.request('/api/admin/monitor', 'GET', admin)).body;
  assert.equal((await monitor()).payment.amount, 53000);
  assert.equal((await remove(other)).status, 403);
  assert.equal((await remove()).status, 409);
  server.db.localOrders[0].createdAt = new Date(Date.now() - 15000).toISOString();
  for (const [key, value] of Object.entries({ slots: [{customer_id: 22}], weathers: [{quantity: 2}], completed_cnt: 1,
    failed_cnt: 1, sending_cnt: 1, remote_ref: 'assigned', casting: {}, is_active: true, status: 'completed' })) {
    const previous = remote[key];
    remote[key] = value;
    assert.equal((await remove()).status, 409, key);
    remote[key] = previous;
  }
  assert.equal(deletes, 0);
  assert.equal((await remove()).status, 400);
  assert.equal((await monitor()).payment.amount, 53000);
  assert.equal(server.db.transactions.length, 0);
  rejectDelete = false;
  const results = await Promise.all([remove(), remove()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(results.find(r => r.status === 200).body.userBalance, 55700);
  assert.equal((await remove()).status, 403);
  assert.equal(deletes, 2);
  assert.equal(server.db.transactions.length, 1);
  assert.equal(server.db.transactions[0].amount, 5700);
  const dashboard = await monitor();
  assert.equal(dashboard.payment.amount, 56700);
  assert.equal(dashboard.ctvs.find(u => u.id === 'seller').orderCount, 0);
  assert.ok(dashboard.events.some(e => e.details?.refundedAmount === 5700));
  const overview = (await server.request('/api/admin/overview', 'GET', admin)).body;
  assert.equal(overview.stats.totalRevenue, 0);
  assert.equal(overview.stats.totalProfit, 0);
  spent = null;
  assert.equal((await monitor()).payment.amount, null);
});

test('unconfirmed source deletion stays in admin reconciliation until a verified, single refund', async t => {
  const order = { id: 'uncertain-weather', category: 'weather_buff', remoteOrderId: 72, status: 'pending',
    createdAt: new Date(Date.now() - 60000).toISOString(), isActive: false, weather: { slots: [], weathers: [] },
    costPrice: 2000, sellPrice: 5100, placedBy: { id: 'seller', role: 'ctv' } };
  const server = await startTestServer(t, async (url, options) => {
    if (options.method === 'DELETE') throw new Error('Source timed out');
    if (new URL(url).pathname === '/api/weather-buff-orders') return Response.json({ data: { data: [{
      id: 72, status: 'pending', is_active: false, sending_cnt: 0, completed_cnt: 0, failed_cnt: 0, slots: [], weathers: [],
    }] } });
    return financeSource()(url, options);
  }, { seed(data) { data.localOrders.push(order); } });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const remove = () => server.request('/api/orders/weather_buff/72', 'DELETE', seller);
  assert.equal((await remove()).status, 409);
  assert.equal((await remove()).status, 409);
  assert.equal(server.db.transactions.length, 0);
  assert.equal((await server.request('/api/admin/monitor', 'GET', admin)).body.cancellations[0].weatherDeletePending, true);
  const review = { confirmed: true, amount: 5100, sourceRefund: 2000, note: 'Verified deletion and full credit at source.', idempotency_key: crypto.randomUUID() };
  const refund = () => server.request('/api/admin/orders/uncertain-weather/refund', 'POST', admin, review);
  assert.equal((await refund()).status, 409);
  review.verifiedDeleted = true;
  assert.equal((await refund()).status, 200);
  assert.equal((await refund()).status, 409);
  assert.equal(server.db.transactions.length, 1);
  assert.equal(server.db.localOrders.length, 0);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 55100);
});

test('admin per-CTV monitor endpoint returns isolated orders, wallet transactions, and activity logs without secrets', async t => {
  const server = await startTestServer(t, financeSource(), {
    seed(data) {
      data.users.push({ id: 'seller2', username: 'seller2', password: 'seller2-test-password', role: 'ctv', name: 'Seller Two', balance: 20000 });
      data.localOrders.push(
        { id: 'ord-s1', remoteOrderId: 101, category: 'buff_tim', categoryName: 'Buff Tim', summary: 'Buff 100 Tim', customer: { nickname: 'KhachA', suid: '111' }, sellPrice: 15000, costPrice: 10000, markupAmount: 5000, status: 'completed', isActive: false, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, createdAt: '2026-11-22T10:00:00Z' },
        { id: 'ord-s2', remoteOrderId: 202, category: 'buff_sao', categoryName: 'Buff Sao', summary: 'Buff 50 Sao', customer: { nickname: 'KhachB', suid: '222' }, sellPrice: 12000, costPrice: 8000, markupAmount: 4000, status: 'pending', isActive: true, placedBy: { id: 'seller2', name: 'Seller Two', role: 'ctv' }, createdAt: '2026-11-22T10:05:00Z' }
      );
      data.transactions.push(
        { id: 'tx-s1', userId: 'seller', type: 'admin_topup', amount: 50000, balanceAfter: 50000, note: 'Nap cho seller 1', createdAt: '2026-11-22T09:00:00Z' },
        { id: 'tx-s2', userId: 'seller2', type: 'admin_topup', amount: 20000, balanceAfter: 20000, note: 'Nap cho seller 2', createdAt: '2026-11-22T09:01:00Z' }
      );
    },
  });

  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');
  const seller2 = await server.login('seller2', 'seller2-test-password');
  assert.ok(seller2.body.token);

  // CTV cannot access per-CTV monitor
  assert.equal((await server.request('/api/admin/monitor/ctv/seller', 'GET', seller.body.token)).status, 403);
  // Missing CTV returns 404
  assert.equal((await server.request('/api/admin/monitor/ctv/unknown', 'GET', admin.body.token)).status, 404);

  // Admin top-up on seller appears in seller's activity log
  const topup = await server.request('/api/admin/ctv/seller/balance', 'POST', admin.body.token, {
    amount: 10000,
    note: 'Nap them test',
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(topup.status, 200);

  // Overview monitor includes per-CTV order stats
  const mon = await server.request('/api/admin/monitor', 'GET', admin.body.token);
  const s1Row = mon.body.ctvs.find(u => u.id === 'seller');
  assert.equal(s1Row.orderCount, 1);
  assert.equal(s1Row.totalSell, 15000);
  assert.equal(s1Row.totalProfit, 5000);

  // Detailed CTV endpoint returns strictly seller's orders, transactions, and events
  const det = await server.request('/api/admin/monitor/ctv/seller', 'GET', admin.body.token);
  assert.equal(det.status, 200);
  assert.equal(det.body.ctv.password, undefined);
  assert.equal(det.body.summary.orderCount, 1);
  assert.equal(det.body.summary.completedCount, 1);
  assert.equal(det.body.summary.totalSell, 15000);
  assert.equal(det.body.summary.totalProfit, 5000);
  assert.equal(det.body.summary.totalTopup, 60000);
  assert.equal(det.body.orders.length, 1);
  assert.equal(det.body.orders[0].id, 'ord-s1');
  assert.ok(det.body.transactions.every(tx => tx.userId === 'seller'));
  assert.ok(det.body.events.some(ev => ev.actorId === 'seller'));
  assert.ok(det.body.events.some(ev => ev.details?.userId === 'seller' && ev.details?.amount === 10000));
  assert.ok(det.body.events.every(ev => ev.actorId !== 'seller2'));
  assert.doesNotMatch(JSON.stringify(det.body), /seller-test-password|owner-test-password|test-upstream-token/);

  // Client monitor HTML with selected CTV detail safely escapes XSS payloads
  const { context, state } = createClient();
  state.adminMonitor = mon.body;
  state.adminMonitorCtvId = 'seller';
  state.adminMonitorCtvTab = 'orders';
  state.adminMonitorCtvDetail = {
    ...det.body,
    ctv: { ...det.body.ctv, name: '<img src=x onerror=alert(1)>' },
    orders: [{ ...det.body.orders[0], summary: '<script>evil()</script>' }],
  };
  const rendered = vm.runInContext('renderAdminMonitorHtml()', context);
  assert.doesNotMatch(rendered, /<img|<script/);
  assert.match(rendered, /&lt;script&gt;/);
});

test('admin maintenance toggle blocks logged-in and newly logging-in CTVs with maintenance message while Admin retains full access', async t => {
  const server = await startTestServer(t, financeSource());
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  // CTV cannot toggle maintenance
  assert.equal((await server.request('/api/admin/maintenance', 'POST', seller.body.token, { enabled: true })).status, 403);

  // Admin enables maintenance mode
  const onRes = await server.request('/api/admin/maintenance', 'POST', admin.body.token, { enabled: true });
  assert.equal(onRes.status, 200);
  assert.equal(onRes.body.maintenanceMode, true);

  // /api/ping reports maintenance: true immediately
  const pingOn = await server.request('/api/ping');
  assert.equal(pingOn.body.maintenance, true);

  // Logged-in CTV is blocked on /api/auth/me and /api/catalog with 503 + exact message
  const ctvMe = await server.request('/api/auth/me', 'GET', seller.body.token);
  assert.equal(ctvMe.status, 503);
  assert.equal(ctvMe.body.code, 'MAINTENANCE');
  assert.equal(ctvMe.body.message, 'Hệ thống ebongiu đang bảo trì');

  const ctvCat = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(ctvCat.status, 503);
  assert.equal(ctvCat.body.message, 'Hệ thống ebongiu đang bảo trì');

  // New CTV login is also blocked with 503 maintenance message
  const ctvLoginBlocked = await server.login('seller', 'seller-test-password');
  assert.equal(ctvLoginBlocked.status, 503);
  assert.equal(ctvLoginBlocked.body.message, 'Hệ thống ebongiu đang bảo trì');

  // Admin continues accessing everything normally (login, me, overview, catalog)
  const adminRelogin = await server.login('owner', 'owner-test-password');
  assert.equal(adminRelogin.status, 200);
  const adminOverview = await server.request('/api/admin/overview', 'GET', adminRelogin.body.token);
  assert.equal(adminOverview.status, 200);
  assert.equal(adminOverview.body.settings.maintenanceMode, true);
  assert.equal((await server.request('/api/catalog', 'GET', adminRelogin.body.token)).status, 200);

  // Admin disables maintenance mode -> CTV resumes seamlessly with existing token
  const offRes = await server.request('/api/admin/maintenance', 'POST', adminRelogin.body.token, { enabled: false });
  assert.equal(offRes.status, 200);
  assert.equal(offRes.body.maintenanceMode, false);
  assert.equal((await server.request('/api/ping')).body.maintenance, false);
  assert.equal((await server.request('/api/auth/me', 'GET', seller.body.token)).status, 200);
  assert.equal((await server.request('/api/catalog', 'GET', seller.body.token)).status, 200);

  // Admin notify-update bumps updateVersion exposed by /api/ping; CTV cannot call it
  assert.equal((await server.request('/api/admin/notify-update', 'POST', seller.body.token)).status, 403);
  const beforeVer = (await server.request('/api/ping')).body.updateVersion;
  const notifyRes = await server.request('/api/admin/notify-update', 'POST', adminRelogin.body.token);
  assert.equal(notifyRes.status, 200);
  assert.ok(notifyRes.body.updateVersion > beforeVer);
  assert.equal((await server.request('/api/ping')).body.updateVersion, notifyRes.body.updateVersion);
});

test('scoped catalog refresh calls only target category endpoints, omits seller-settlements for CTV, and returns compact fruit mutations', async t => {
  const hitPaths = [];
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    hitPaths.push(new URL(url).pathname);
    return base(url, options);
  });
  const seller = await server.login('seller', 'seller-test-password');

  // 1. Scoped buff_tim refresh calls ONLY /api/settings + /api/buff-tim-price-packages (2 calls, zero fruit-items or settlements!)
  hitPaths.length = 0;
  const timRes = await server.request('/api/catalog?refresh=1&scope=buff_tim&compact=1', 'GET', seller.body.token);
  assert.equal(timRes.status, 200);
  assert.equal(timRes.body.partialScope, 'buff_tim');
  assert.equal(timRes.body.catalog.buff_tim.length, 1);
  assert.equal(timRes.body.catalog.fruit_by_fruit, undefined);
  assert.deepEqual([...new Set(hitPaths)].sort(), ['/api/buff-tim-price-packages', '/api/settings']);

  // 2. Scoped fruit_by_fruit refresh with compact=1 calls ONLY 3 fruit endpoints and returns compact mp tuples (no _admin)
  hitPaths.length = 0;
  const fruitRes = await server.request('/api/catalog?refresh=1&scope=fruit_by_fruit&compact=1', 'GET', seller.body.token);
  assert.equal(fruitRes.status, 200);
  assert.equal(fruitRes.body.partialScope, 'fruit_by_fruit');
  assert.deepEqual([...new Set(hitPaths)].sort(), ['/api/fruit-items', '/api/fruit-stock', '/api/settings']);
  const firstFruit = fruitRes.body.catalog.fruit_by_fruit[0];
  assert.ok(Array.isArray(firstFruit.mp));
  assert.equal(firstFruit.mutation_prices, undefined);
  assert.equal(firstFruit._admin, undefined);

  // 3. Full CTV catalog load skips /api/seller-settlements (Admin-only!)
  hitPaths.length = 0;
  const fullCtv = await server.request('/api/catalog?refresh=1&compact=1', 'GET', seller.body.token);
  assert.equal(fullCtv.status, 200);
  assert.equal(hitPaths.includes('/api/seller-settlements'), false);
  assert.equal(fullCtv.body.weeklyLimit, undefined);

  // 4. Order placement uses scoped refresh (for buff_tim, never pulls 586KB fruit-items!)
  await server.request('/api/customer/resolve-role-id', 'POST', seller.body.token, { role_id: 'FAST-123' });
  hitPaths.length = 0;
  const place = await server.request('/api/orders/place', 'POST', seller.body.token, {
    category: 'buff_tim',
    customer_id: 101,
    price_package_id: 7,
    expected_price: 15000,
    idempotency_key: 'fast_scoped_order_key_001',
  });
  assert.equal(place.status, 200);
  assert.equal(hitPaths.includes('/api/fruit-items'), false);
  assert.equal(hitPaths.includes('/api/seller-settlements'), false);
});

test('anti-DDoS shield blocks cross-origin writes, oversized URLs, scanner floods, asset proxy amplification, and login brute-force without bloating auditLog', async t => {
  let upstreamAssetHits = 0;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    if (String(url).includes('/assets/playtogether/images/')) {
      upstreamAssetHits += 1;
      return { ok: false, status: 404, arrayBuffer: async () => Buffer.alloc(0) };
    }
    return base(url, options);
  });

  // 1. robots.txt + COOP/CORP headers
  const robots = await fetch(`${server.base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow:\s*\//);
  assert.equal(robots.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(robots.headers.get('cross-origin-resource-policy'), 'same-origin');

  // 2. Oversized URL rejected with 414
  const longRes = await fetch(`${server.base}/api/ping?x=${'a'.repeat(2100)}`);
  assert.equal(longRes.status, 414);

  // 3. Cross-origin POST rejected with 403
  const csrfRes = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil-competitor.example' },
    body: JSON.stringify({ identifier: 'owner', password: 'owner-test-password' }),
  });
  assert.equal(csrfRes.status, 403);

  // 4. Asset proxy negative cache prevents upstream amplification (5 requests for missing PNG -> only 1 upstream call!)
  upstreamAssetHits = 0;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${server.base}/assets/playtogether/images/missing_probe.png`);
    assert.equal(r.status, 404);
  }
  assert.equal(upstreamAssetHits, 1);

  // 5. Random missing asset flood is rate-limited at 30 misses/min (429 + Retry-After) without hitting upstream further
  let throttled = 0;
  for (let i = 0; i < 35; i++) {
    const r = await fetch(`${server.base}/assets/playtogether/images/random_miss_${i}.png`);
    if (r.status === 429) {
      throttled += 1;
      assert.ok(Number(r.headers.get('retry-after')) >= 1);
    }
  }
  assert.ok(throttled >= 5, `Expected asset proxy miss flood to be throttled with 429, got ${throttled}`);
  assert.ok(upstreamAssetHits <= 30, `Upstream asset fetches must stay capped <= 30, got ${upstreamAssetHits}`);

  // 6. Login brute-force triggers per-account lockout (429) and never floods auditLog with 429/spam entries
  const auditBefore = server.db.auditLog.length;
  let got429 = false;
  for (let i = 0; i < 14; i++) {
    const r = await server.login('seller', 'wrong-password-123');
    if (r.status === 429) got429 = true;
  }
  assert.equal(got429, true, 'Expected 429 lockout during login brute-force');
  const auditDelta = server.db.auditLog.length - auditBefore;
  assert.ok(auditDelta <= 4, `Audit log must be protected from login flood bloat (delta=${auditDelta})`);

  // 7. Automated vulnerability scanner flood triggers automatic temporary IP ban (429)
  let banned = false;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${server.base}/wp-login.php?p=${i}`);
    if (r.status === 429) banned = true;
  }
  assert.equal(banned, true, 'Expected scanner probe flood to trigger automatic IP ban');
});

test('CTV orders refresh burst guard coalesces rapid refresh=1 spam and handles null customer safely', async t => {
  let orderHits = 0;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    const p = new URL(url).pathname;
    if (p.includes('-orders')) {
      orderHits += 1;
      return { ok: true, status: 200, json: async () => ({ data: { data: [{ id: 88, status: 'assigned', completed_cnt: 5, customer: { nickname: 'SyncedName', suid: '999' } }] } }) };
    }
    return base(url, options);
  }, {
    seed(data) {
      data.localOrders.push({ id: 'ord-null-cust', category: 'buff_tim', remoteOrderId: 88, status: 'pending', placedBy: { id: 'seller', role: 'ctv' }, customer: null, sellPrice: 15000 });
    },
  });
  const seller = await server.login('seller', 'seller-test-password');
  const first = await server.request('/api/orders?refresh=1', 'GET', seller.body.token);
  assert.equal(first.status, 200);
  assert.equal(first.body.orders[0].customer.nickname, 'SyncedName');
  const hitsAfterFirst = orderHits;
  // Immediate repeated refresh=1 within 2.5s burst guard reuses fresh cache (0 extra upstream calls!)
  const burst = await server.request('/api/orders?refresh=1', 'GET', seller.body.token);
  assert.equal(burst.status, 200);
  assert.equal(orderHits, hitsAfterFirst);
});
