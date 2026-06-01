import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDatabasePathFromUrl(databaseUrl) {
  if (!databaseUrl) return '';

  if (databaseUrl.startsWith('file:')) {
    return fileURLToPath(databaseUrl);
  }

  if (databaseUrl.startsWith('sqlite://')) {
    return databaseUrl.replace(/^sqlite:\/\//, '');
  }

  if (/^(postgres|postgresql|mysql|https?):\/\//i.test(databaseUrl)) {
    console.warn('DATABASE_URL is not a SQLite path. Falling back to local SQLite storage.');
    return '';
  }

  return databaseUrl;
}

export class PosDatabase {
  constructor(dbPath) {
    const isVercel = !!process.env.VERCEL;

    // Use explicit path, DATABASE_URL, isolated license file, DB_NAME, or default SQLite file.
    if (!dbPath) {
      dbPath = resolveDatabasePathFromUrl(process.env.DATABASE_URL);
    }

    if (!dbPath) {
      const licensePath = path.join(process.cwd(), 'databases', '.license');
      if (fs.existsSync(licensePath)) {
        try {
          const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
          dbPath = `databases/${licenseData.db_name}`;
        } catch (error) {
          console.error('Error reading license file:', error);
        }
      }
    }

    if (!dbPath) {
      dbPath = process.env.DB_NAME ? `databases/${process.env.DB_NAME}` : 'salon_pos.db';
    }

    const fullPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
    let runtimePath = fullPath;

    // Vercel serverless filesystem is read-only except /tmp. Mirror or create the DB there.
    if (isVercel) {
      const tmpBaseDir = path.join('/tmp', 'databases');
      if (!fs.existsSync(tmpBaseDir)) {
        fs.mkdirSync(tmpBaseDir, { recursive: true });
      }

      const dbFileName = path.basename(fullPath);
      const tmpDbPath = path.join(tmpBaseDir, dbFileName);

      if (!fs.existsSync(tmpDbPath) && fs.existsSync(fullPath)) {
        fs.copyFileSync(fullPath, tmpDbPath);
      }

      runtimePath = tmpDbPath;
    }

    const dbExists = fs.existsSync(runtimePath);

    console.log('Using database:', runtimePath);

    this.db = new BetterSqlite3(runtimePath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    });

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    if (!dbExists) {
      console.log('Database file not found. The application will initialize the salon schema on first use.');
    }
  }

  run(sql, params = []) {
    try {
      return this.db.prepare(sql).run(params);
    } catch (error) {
      console.error('Database run error:', error);
      throw error;
    }
  }

  get(sql, params = []) {
    try {
      return this.db.prepare(sql).get(params);
    } catch (error) {
      console.error('Database get error:', error);
      throw error;
    }
  }

  all(sql, params = []) {
    try {
      return this.db.prepare(sql).all(params);
    } catch (error) {
      console.error('Database all error:', error);
      throw error;
    }
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  close() {
    this.db.close();
  }
}

class Database {
  static instance = null;

  static getInstance() {
    if (!Database.instance) {
      Database.instance = new PosDatabase();
    }
    return Database.instance;
  }
}

export default Database;
