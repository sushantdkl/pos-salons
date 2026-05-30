import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PosDatabase {
  constructor(dbPath) {
    const isVercel = !!process.env.VERCEL;

    // Use database from environment variable or .license file
    if (!dbPath) {
      // Try to read from .license file
      const licensePath = path.join(process.cwd(), 'databases', '.license');
      if (fs.existsSync(licensePath)) {
        try {
          const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
          dbPath = `databases/${licenseData.db_name}`;
        } catch (error) {
          console.error('Error reading license file:', error);
        }
      }
      
      // Fallback to environment variable or default
      if (!dbPath) {
        dbPath = process.env.DB_NAME ? `databases/${process.env.DB_NAME}` : 'pos_restaurant.db';
      }
    }
    
    const fullPath = path.join(process.cwd(), dbPath);
    let runtimePath = fullPath;

    // Vercel serverless filesystem is read-only except /tmp.
    // Mirror/copy the DB into /tmp so writes (sessions/orders/etc.) can work.
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
    
    // Check if database file exists
    const dbExists = fs.existsSync(runtimePath);
    
    console.log('📊 Using database:', runtimePath);
    
    this.db = new BetterSqlite3(runtimePath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });
    
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    // Only initialize schema if database is new
    if (!dbExists) {
      console.log('⚠️  Database file not found. Please run: npm run db:seed');
      // Don't throw error, just warn - the seed script will create it
    }
  }
  
  // Helper methods
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

// Singleton instance
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
