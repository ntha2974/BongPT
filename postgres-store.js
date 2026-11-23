import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Keep one row per business record. The index preserves the order of legacy
// arrays and any additional fields from older installations.
const collections = ['users', 'localOrders', 'transactions', 'orderIntents', 'auditLog'];

function encode(state) {
  const index = { ...state };
  const rows = new Map();
  for (const name of collections) {
    index[name] = state[name].map(record => {
      if (!record?.id) throw new Error('Bản ghi thiếu mã định danh.');
      const key = name + '/' + record.id;
      if (rows.has(key)) throw new Error('Có mã bản ghi bị trùng.');
      rows.set(key, JSON.stringify(record));
      return record.id;
    });
  }
  rows.set('index', JSON.stringify(index));
  return rows;
}

function decode(rows) {
  const values = new Map(rows.map(row => [row.key, row.value]));
  const state = values.get('index');
  if (!state) throw new Error('Thiếu chỉ mục PostgreSQL.');
  for (const name of collections) {
    state[name] = state[name].map(id => {
      const record = values.get(name + '/' + id);
      if (!record || record.id !== id) throw new Error('Bản ghi PostgreSQL không khớp chỉ mục.');
      return record;
    });
  }
  return state;
}

function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isTransientPgError(error) {
  if (!error) return false;
  const code = String(error.code || error.cause?.code || '');
  const msg = String(error.message || '');
  if (['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006'].includes(code)) {
    return true;
  }
  return /Connection terminated|Client has encountered a connection error|timeout expired|socket hang up|Endpoint is temporarily unavailable|the database system is starting up|unexpected EOF/i.test(msg);
}

async function withTransientRetry(fn, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientPgError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastError;
}

export async function openPostgres(connectionString, seed, { importOnly = false } = {}) {
  if (!URL.canParse(connectionString)) throw new Error('DATABASE_URL không hợp lệ.');
  const url = new URL(connectionString);
  const poolConfig = {
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000,
    application_name: 'ebongiu',
  };

  if (url.hostname.endsWith('.neon.tech')) {
    url.searchParams.set('sslmode', 'verify-full');
  } else if (!isLocalHost(url.hostname)) {
    const sslmode = (url.searchParams.get('sslmode') || '').toLowerCase();
    if (!sslmode) {
      url.searchParams.set('sslmode', 'require');
    }
    if (sslmode !== 'verify-full' && sslmode !== 'verify-ca' && sslmode !== 'disable') {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  }

  poolConfig.connectionString = url.href;
  const pool = new pg.Pool(poolConfig);
  pool.on('error', () => console.error('Kết nối PostgreSQL nhàn rỗi bị ngắt (sẽ tự kết nối lại khi cần).'));

  const owner = randomUUID();
  let previous;
  let initialized = false;
  let pending = Promise.resolve();
  let activeWrites = 0;

  async function commit(current) {
    const changed = {};
    let changedCount = 0;
    for (const [key, value] of current) {
      if (previous.get(key) !== value) {
        changed[key] = JSON.parse(value);
        changedCount += 1;
      }
    }
    const removed = [...previous.keys()].filter(key => !current.has(key));

    // All changes, including a wallet hold and its intent, commit together.
    // A replaced Render instance cannot overwrite its successor's records.
    const result = await withTransientRetry(() => {
      if (changedCount === 0 && removed.length === 0) {
        return pool.query('SELECT id FROM ebongiu_writer WHERE id = 1 AND owner = $1', [owner]);
      }
      return pool.query(`
        WITH writer AS (
          SELECT id FROM ebongiu_writer WHERE id = 1 AND owner = $1 FOR SHARE
        ), saved AS (
          INSERT INTO ebongiu_records (key, value)
          SELECT e.key, e.value FROM jsonb_each($2::jsonb) e CROSS JOIN writer
          ON CONFLICT (key) DO UPDATE SET value = excluded.value
        ), removed AS (
          DELETE FROM ebongiu_records USING writer WHERE key = ANY($3::text[])
        )
        SELECT id FROM writer`, [owner, JSON.stringify(changed), removed]);
    });
    if (!result.rowCount) throw new Error('Một tiến trình mới đã tiếp quản PostgreSQL.');
    previous = current;
  }

  const client = await withTransientRetry(() => pool.connect());
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(165005931, 1)');
    // Rename in place while holding the same startup lock as older releases.
    // Legacy views keep a rolling deployment or rollback on the same records.
    const {rows: existingTables} = await client.query(`
      SELECT relname FROM pg_class WHERE relnamespace = current_schema()::regnamespace
        AND relkind = 'r' AND relname IN ('ebongiu_writer', 'ebongiu_records', 'bonglee_writer', 'bonglee_records', 'znplay_writer', 'znplay_records')`);
    const tableSet = new Set(existingTables.map(r => r.relname));
    const hasCurrent = tableSet.has('ebongiu_writer') || tableSet.has('ebongiu_records');
    if (hasCurrent && (!tableSet.has('ebongiu_writer') || !tableSet.has('ebongiu_records'))) {
      throw new Error('Thiếu bảng dữ liệu PostgreSQL hiện hành. Dừng khởi động.');
    }
    if (!hasCurrent) {
      const hasBonglee = tableSet.has('bonglee_writer') || tableSet.has('bonglee_records');
      const hasZnplay = tableSet.has('znplay_writer') || tableSet.has('znplay_records');
      if (hasBonglee) {
        if (!tableSet.has('bonglee_writer') || !tableSet.has('bonglee_records')) {
          throw new Error('Thiếu bảng dữ liệu PostgreSQL cũ. Dừng chuyển đổi.');
        }
        await client.query(`
          ALTER TABLE bonglee_writer RENAME TO ebongiu_writer;
          ALTER TABLE ebongiu_writer RENAME CONSTRAINT bonglee_writer_pkey TO ebongiu_writer_pkey;
          ALTER TABLE bonglee_records RENAME TO ebongiu_records;
          ALTER TABLE ebongiu_records RENAME CONSTRAINT bonglee_records_pkey TO ebongiu_records_pkey;
          CREATE OR REPLACE VIEW bonglee_writer AS SELECT id, owner FROM ebongiu_writer;
          CREATE OR REPLACE VIEW bonglee_records AS SELECT key, value FROM ebongiu_records;
          CREATE OR REPLACE VIEW znplay_writer AS SELECT id, owner FROM ebongiu_writer;
          CREATE OR REPLACE VIEW znplay_records AS SELECT key, value FROM ebongiu_records`);
      } else if (hasZnplay) {
        if (!tableSet.has('znplay_writer') || !tableSet.has('znplay_records')) {
          throw new Error('Thiếu bảng dữ liệu PostgreSQL cũ. Dừng chuyển đổi.');
        }
        await client.query(`
          ALTER TABLE znplay_writer RENAME TO ebongiu_writer;
          ALTER TABLE ebongiu_writer RENAME CONSTRAINT znplay_writer_pkey TO ebongiu_writer_pkey;
          ALTER TABLE znplay_records RENAME TO ebongiu_records;
          ALTER TABLE ebongiu_records RENAME CONSTRAINT znplay_records_pkey TO ebongiu_records_pkey;
          CREATE OR REPLACE VIEW znplay_writer AS SELECT id, owner FROM ebongiu_writer;
          CREATE OR REPLACE VIEW znplay_records AS SELECT key, value FROM ebongiu_records`);
      }
    }
    await client.query(`CREATE TABLE IF NOT EXISTS ebongiu_writer (
      id smallint PRIMARY KEY CHECK (id = 1), owner uuid NOT NULL
    ); CREATE TABLE IF NOT EXISTS ebongiu_records (key text PRIMARY KEY, value jsonb NOT NULL)`);
    const existing = await client.query('SELECT id FROM ebongiu_writer WHERE id = 1 FOR UPDATE');
    if (importOnly && existing.rowCount) throw new Error('PostgreSQL đã có dữ liệu ebongiu. Dừng nhập để giữ nguyên dữ liệu.');
    const records = await client.query('SELECT key, value FROM ebongiu_records');
    if (Boolean(existing.rowCount) !== Boolean(records.rowCount)) throw new Error('Dữ liệu PostgreSQL không đầy đủ.');
    const state = existing.rowCount ? decode(records.rows) : seed();
    previous = encode(state);
    if (!existing.rowCount) {
      const entries = Object.fromEntries([...previous].map(([k, v]) => [k, JSON.parse(v)]));
      await client.query('INSERT INTO ebongiu_records SELECT key, value FROM jsonb_each($1::jsonb)', [JSON.stringify(entries)]);
    }
    await client.query('INSERT INTO ebongiu_writer VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET owner = excluded.owner', [owner]);
    await client.query('COMMIT');
    initialized = true;
    return {
      state,
      save(data) {
        const snapshot = encode(data);
        activeWrites += 1;
        const run = pending
          .catch(() => {})
          .then(() => commit(snapshot))
          .finally(() => { activeWrites -= 1; });
        pending = run.catch(() => {});
        return run;
      },
      async ready() {
        await pending;
        const result = await withTransientRetry(() =>
          pool.query('SELECT 1 FROM ebongiu_writer WHERE id = 1 AND owner = $1', [owner])
        );
        return result.rowCount === 1;
      },
      hasPending: () => activeWrites > 0,
      flush: () => pending,
      close: () => pool.end(),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    if (!initialized || importOnly) await pool.end();
  }
}
