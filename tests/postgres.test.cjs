const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const options = { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run against PostgreSQL' };
async function isolatedSchema(t) {
  const schema = 'ebongiu_test_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  await client.query('CREATE SCHEMA ' + schema);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  t.after(async () => {
    try { await client.query('DROP SCHEMA ' + schema + ' CASCADE'); }
    finally { await client.end(); }
  });
  return { client, schema, url };
}

test('PostgreSQL imports once, commits in order, rejects a replaced writer and rolls back a failed debit', options, async t => {
  const { openPostgres } = await import('../postgres-store.js');
  const { client, schema, url } = await isolatedSchema(t);
  const stores = [];
  t.after(() => Promise.all(stores.map(store => store.close())));
  const seed = { settings: {}, sessions: { old: { userId: 'u' } }, users: [{ id: 'u', balance: 50000 }],
    transactions: [], orderIntents: [], localOrders: [], auditLog: [] };
  await openPostgres(url.href, () => structuredClone(seed), { importOnly: true });
  await assert.rejects(openPostgres(url.href, () => seed, { importOnly: true }), /đã có dữ liệu/);
  const open = async () => {
    const store = await openPostgres(url.href, () => assert.fail('Must read the existing database'));
    stores.push(store);
    return store;
  };
  const first = await open();
  assert.deepEqual(first.state, seed);
  first.state.users[0].balance -= 10000;
  first.state.orderIntents.push({ id: 'intent', status: 'processing' });
  const held = first.save(first.state);
  first.state.transactions.unshift({ id: 'tx', amount: -10000 });
  const recorded = first.save(first.state);
  await Promise.all([held, recorded]);
  const replacement = await open();
  assert.deepEqual(replacement.state, first.state);
  assert.equal(await first.ready(), false);
  await assert.rejects(first.save(seed), /tiếp quản/);
  const committed = structuredClone(replacement.state);
  await client.query(`ALTER TABLE ${schema}.ebongiu_records ADD CHECK (key <> 'transactions/refused')`);
  replacement.state.users[0].balance = 0;
  replacement.state.transactions.unshift({ id: 'refused', amount: -40000 });
  await assert.rejects(replacement.save(replacement.state));
  assert.deepEqual((await open()).state, committed);
});

test('HTTP service restores an imported wallet, session and pending hold after restart on Render', options, async t => {
  const { url } = await isolatedSchema(t);
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebongiu-import-'));
  const legacyPath = path.join(dataDir, 'db.json');
  const password = randomUUID();
  await fs.writeFile(legacyPath, JSON.stringify({
    settings: { brandName: 'ZNPLAY' },
    users: [{ id: 'a', role: 'admin', username: 'owner', password },
      { id: 'u', role: 'ctv', username: 'seller', password, balance: 50000 }],
    localOrders: [{ id: 'ZNP-legacy-order', placedBy: {id: 'u', role: 'ctv'}, remoteOrderId: 42,
      category: 'buff_tim', sellPrice: 7500, status: 'completed' }],
    orderIntents: [{ id: 'pending', status: 'processing', userId: 'u', heldAmount: 5000 }],
  }));
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, RENDER: 'true', DATA_DIR: dataDir, DATABASE_URL: url.href,
    PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: '', HOANNGUYEN_EMAIL: '', HOANNGUYEN_PASSWORD: '' };
  const server = path.resolve(__dirname, '../server.js');
  let child;
  async function stop() {
    if (child && child.exitCode === null && !child.signalCode) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
  }
  t.after(async () => { await stop(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const request = (route, token, body) => fetch('http://127.0.0.1:' + port + route, {
    method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + (token || ''), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  async function start() {
    child = spawn(process.execPath, [server], { env, stdio: 'ignore', windowsHide: true });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited during startup');
      const health = await request('/api/health').then(r => r.json()).catch(() => null);
      if (health?.storage === 'postgresql' && health.success) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('Server readiness timeout');
  }
  assert.equal(spawnSync(process.execPath, [server, '--import-json'], { env, windowsHide: true }).status, 0);
  await fs.unlink(legacyPath);
  // Recreate the previous release's physical schema before the first HTTP boot.
  const beforeUpgrade = new Client({connectionString: url.href});
  await beforeUpgrade.connect();
  try {
    await beforeUpgrade.query(`
      ALTER TABLE ebongiu_writer RENAME CONSTRAINT ebongiu_writer_pkey TO znplay_writer_pkey;
      ALTER TABLE ebongiu_writer RENAME TO znplay_writer;
      ALTER TABLE ebongiu_records RENAME CONSTRAINT ebongiu_records_pkey TO znplay_records_pkey;
      ALTER TABLE ebongiu_records RENAME TO znplay_records`);
  } finally { await beforeUpgrade.end(); }
  await start();
  const rollbackClient = new Client({connectionString: url.href});
  await rollbackClient.connect();
  try {
    // An older binary can still use its original lock and upsert statements.
    await rollbackClient.query('BEGIN');
    await rollbackClient.query('SELECT id FROM znplay_writer WHERE id = 1 FOR UPDATE');
    await rollbackClient.query('INSERT INTO znplay_writer SELECT * FROM ebongiu_writer ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner');
    await rollbackClient.query("INSERT INTO znplay_records SELECT * FROM ebongiu_records WHERE key='index' ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
    await rollbackClient.query('ROLLBACK');
  } finally { await rollbackClient.end(); }
  // Also verify HEAD /api/ping works cleanly on PostgreSQL storage without errors.
  const headPing = await fetch('http://127.0.0.1:' + port + '/api/ping', { method: 'HEAD' });
  assert.equal(headPing.status, 200);
  const login = await (await request('/api/auth/login', '', { identifier: 'owner', password })).json();
  assert.ok(login.token);
  const payload = { amount: 2500, idempotency_key: randomUUID() };
  const credits = await Promise.all([1, 2].map(() => request('/api/admin/ctv/u/balance', login.token, payload)));
  assert.deepEqual(credits.map(r => r.status).sort(), [200, 409]);
  await stop();
  await start();
  const monitor = await (await request('/api/admin/monitor', login.token)).json();
  assert.equal(monitor.ctvs[0].balance, 52500);
  assert.equal(monitor.intents[0].status, 'uncertain');
  assert.equal(monitor.intents[0].heldAmount, 5000);
  assert.ok(monitor.events.length >= 3);

  const exportData = async () => {
    const response = await request('/api/admin/backup/export', login.token);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /ebongiu-backup-/);
    return (await response.json()).backup;
  };
  const backup = await exportData();
  assert.equal(backup.settings.brandName, 'ebongiu');
  assert.equal(backup.transactions.length, 1);
  assert.equal(backup.localOrders[0].id, 'ZNP-legacy-order');
  const extra = await request('/api/admin/ctv/u/balance', login.token, {amount: 1000, idempotency_key: randomUUID()});
  assert.equal(extra.status, 200);
  assert.equal((await exportData()).users.find(u => u.id === 'u').balance, 53500);
  // Reject malformed backup with duplicate ID on PostgreSQL without breaking storageHealthy
  const badBackup = structuredClone(backup);
  badBackup.transactions.push(structuredClone(backup.transactions[0]));
  assert.equal((await request('/api/admin/backup/import', login.token, {backup: badBackup})).status, 400);
  assert.equal((await request('/api/health')).status, 200);
  const legacyBackup = structuredClone(backup);
  legacyBackup.settings.brandName = 'BongLee';
  assert.equal((await request('/api/admin/backup/import', login.token, {backup: legacyBackup})).status, 200);
  await stop();
  await start();
  const restored = await exportData();
  assert.equal(restored.settings.brandName, 'ebongiu');
  for (const key of ['transactions', 'orderIntents', 'localOrders']) assert.deepEqual(restored[key], backup[key]);
  assert.equal(restored.users.find(u => u.id === 'u').balance, 52500);
  assert.equal((await request('/api/admin/ctv/u/balance', login.token, payload)).status, 409);
});

test('PostgreSQL upgrades cleanly from bonglee_* physical tables with existing znplay_* views', options, async t => {
  const { openPostgres } = await import('../postgres-store.js');
  const { client, schema, url } = await isolatedSchema(t);
  const seed = {
    settings: { brandName: 'BongLee' },
    sessions: {},
    users: [{ id: 'u1', role: 'ctv', balance: 88000 }],
    transactions: [{ id: 'tx1', amount: 88000 }],
    orderIntents: [],
    localOrders: [{ id: 'BONGLEE-1', sellPrice: 12000 }],
    auditLog: [],
  };
  await client.query(`
    SET search_path TO ${schema};
    CREATE TABLE bonglee_writer (id smallint PRIMARY KEY CHECK (id = 1), owner uuid NOT NULL);
    CREATE TABLE bonglee_records (key text PRIMARY KEY, value jsonb NOT NULL);
    CREATE VIEW znplay_writer AS SELECT id, owner FROM bonglee_writer;
    CREATE VIEW znplay_records AS SELECT key, value FROM bonglee_records;
    INSERT INTO bonglee_writer VALUES (1, '${randomUUID()}');
    INSERT INTO bonglee_records VALUES
      ('index', '${JSON.stringify({ ...seed, users: ['u1'], transactions: ['tx1'], orderIntents: [], localOrders: ['BONGLEE-1'], auditLog: [] })}'),
      ('users/u1', '${JSON.stringify(seed.users[0])}'),
      ('transactions/tx1', '${JSON.stringify(seed.transactions[0])}'),
      ('localOrders/BONGLEE-1', '${JSON.stringify(seed.localOrders[0])}')`);
  const store = await openPostgres(url.href, () => assert.fail('Must load existing bonglee records'));
  t.after(() => store.close());
  assert.deepEqual(store.state, seed);
  store.state.users[0].balance = 99000;
  await store.save(store.state);
  const checkViews = await client.query(`
    SELECT (SELECT owner FROM ${schema}.ebongiu_writer WHERE id = 1) = (SELECT owner FROM ${schema}.bonglee_writer WHERE id = 1) AS bonglee_ok,
           (SELECT owner FROM ${schema}.ebongiu_writer WHERE id = 1) = (SELECT owner FROM ${schema}.znplay_writer WHERE id = 1) AS znplay_ok,
           (SELECT (value->>'balance')::int FROM ${schema}.ebongiu_records WHERE key = 'users/u1') AS bal`);
  assert.equal(checkViews.rows[0].bonglee_ok, true);
  assert.equal(checkViews.rows[0].znplay_ok, true);
  assert.equal(checkViews.rows[0].bal, 99000);
});
