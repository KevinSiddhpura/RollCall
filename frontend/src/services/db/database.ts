import * as SQLite from 'expo-sqlite';

const DB_NAME = 'rollcall.db';

export const db = SQLite.openDatabaseSync(DB_NAME);
let dbUserId: string = 'guest';

export const setDbUserId = (id: string | null) => {
  dbUserId = id || 'guest';
  notifyChange();
};

export const getDbUserId = () => dbUserId;

export async function initDatabase() {
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      parent_id TEXT DEFAULT '',
      node_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS field_defs (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_unique INTEGER DEFAULT 0,
      is_display INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      user_id TEXT DEFAULT '',
      FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      field_values TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );
  `);

    // Clean up duplicate records (legacy bug: edits could leave stale rows)
    await db.execAsync(`
      DELETE FROM records WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM records GROUP BY session_id, member_id
      );
    `);
  }

/** Execute a query and return rows as an array of T */
export async function queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  const results = await db.getAllAsync<T>(sql, params);
  return results;
}

/** Execute a query and return a single row or null */
export async function queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
  const result = await db.getFirstAsync<T>(sql, params);
  return result || null;
}

/** Execute an INSERT/UPDATE/DELETE statement */
export async function execute(sql: string, params: any[] = []) {
  const result = await db.runAsync(sql, params);
  notifyChange();
  return result;
}

/** Migrate guest data to a real user ID on sign up / sign in */
export async function migrateGuestData(newUserId: string) {
  const tables = ['groups', 'field_defs', 'members', 'sessions', 'records'];
  for (const table of tables) {
    await db.runAsync(`UPDATE ${table} SET user_id = ? WHERE user_id = 'guest' OR user_id = '' OR user_id IS NULL`, [newUserId]);
  }
  notifyChange();
}

/** Clear all data from all tables */
export async function clearAllData() {
  await db.execAsync('DELETE FROM records;');
  await db.execAsync('DELETE FROM sessions;');
  await db.execAsync('DELETE FROM members;');
  await db.execAsync('DELETE FROM field_defs;');
  await db.execAsync('DELETE FROM groups;');
  notifyChange();
}

// Simple Reactivity System
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToDB(callback: Listener) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function notifyChange() {
  listeners.forEach(l => l());
}
