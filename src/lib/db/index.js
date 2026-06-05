import { Pool } from 'pg';

function normalizeParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0];
  }
  return args;
}

function replacePlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function withReturningId(sql) {
  const trimmed = sql.trim();
  if (/^INSERT\s/i.test(trimmed) && !/\bRETURNING\b/i.test(trimmed)) {
    if (/\bstaff_profiles\b/i.test(trimmed)) {
      return `${trimmed} RETURNING user_id`;
    }
    return `${trimmed} RETURNING id`;
  }
  return trimmed;
}

class PostgresAdapter {
  constructor(queryFn) {
    this.queryFn = queryFn;
    this.provider = 'postgres';
  }

  async query(sql, params = []) {
    const text = replacePlaceholders(withReturningId(sql));
    return this.queryFn(text, params);
  }

  prepare(sql) {
    return {
      run: async (...params) => {
        const values = normalizeParams(params);
        const result = await this.query(sql, values);
        return {
          rowCount: result.rowCount,
          lastInsertRowid: result.rows?.[0]?.id ?? result.rows?.[0]?.user_id,
          rows: result.rows,
        };
      },
      get: async (...params) => {
        const values = normalizeParams(params);
        const text = replacePlaceholders(sql);
        const result = await this.queryFn(text, values);
        return result.rows?.[0] ?? null;
      },
      all: async (...params) => {
        const values = normalizeParams(params);
        const text = replacePlaceholders(sql);
        const result = await this.queryFn(text, values);
        return result.rows;
      },
    };
  }

  async run(sql, params = []) {
    return this.prepare(sql).run(params);
  }

  async get(sql, params = []) {
    return this.prepare(sql).get(params);
  }

  async all(sql, params = []) {
    return this.prepare(sql).all(params);
  }
}

function resolvePoolConfig(databaseUrl) {
  const isServerless = !!process.env.VERCEL;
  const config = {
    connectionString: databaseUrl,
    max: isServerless ? 1 : Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: isServerless ? 5000 : 30000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  };

  // Supabase transaction pooler (port 6543) needs this for prepared statements.
  if (/pooler\.supabase\.com:6543/i.test(databaseUrl) && !/[?&]pgbouncer=/i.test(databaseUrl)) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    config.connectionString = `${databaseUrl}${separator}pgbouncer=true`;
  }

  return config;
}

class PostgresDatabase extends PostgresAdapter {
  constructor(databaseUrl) {
    const pool = new Pool(resolvePoolConfig(databaseUrl));
    super((text, values) => pool.query(text, values));
    this.pool = pool;
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    const tx = new PostgresAdapter((text, values) => client.query(text, values));
    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

class Database {
  static instance = null;

  static getInstance() {
    if (!Database.instance) {
      const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
      if (!/^(postgres|postgresql):\/\//i.test(databaseUrl)) {
        throw new Error(
          'SUPABASE_DB_URL or DATABASE_URL must be a postgres:// connection string. Apply docs/supabase-schema.sql and docs/supabase-seed.sql in Supabase first.'
        );
      }
      Database.instance = new PostgresDatabase(databaseUrl);
    }
    return Database.instance;
  }
}

export default Database;
