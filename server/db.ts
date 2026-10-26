import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mergeConfig, type RiskConfig } from '../shared/risk-engine';

const file = resolve(process.env.DB_FILE ?? 'data/proctor.db');
mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  exam_id TEXT,
  face_reference TEXT,            -- JSON number[] (128-d embedding), never raw images
  face_model TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNREGISTERED',
  seeded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS examiners (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  exam_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  questions TEXT NOT NULL          -- JSON, includes answer keys (server only)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  examiner_notes TEXT NOT NULL DEFAULT '',
  final_risk INTEGER,
  risk_reset_at INTEGER,
  answers TEXT NOT NULL DEFAULT '{}',
  exam_score INTEGER,
  live_status TEXT,
  last_heartbeat INTEGER,
  simulated INTEGER NOT NULL DEFAULT 0,
  sim_profile TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  client_id TEXT,
  timestamp INTEGER NOT NULL,
  ended_at INTEGER,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence REAL,
  risk_contribution REAL NOT NULL DEFAULT 0,
  details TEXT NOT NULL DEFAULT '{}',
  simulated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  evidence TEXT,
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  examiner_note TEXT NOT NULL DEFAULT '',
  reviewed_at INTEGER,
  UNIQUE (session_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
);
`);

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// node:sqlite returns null-prototype objects; this keeps typing simple.
export type Row = Record<string, any>;

export function one(sql: string, ...params: any[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}
export function all(sql: string, ...params: any[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}
export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

let cachedConfig: RiskConfig | null = null;

export function getRiskConfig(): RiskConfig {
  if (cachedConfig) return cachedConfig;
  const row = one(`SELECT value FROM settings WHERE key = 'risk_config'`);
  cachedConfig = mergeConfig(row ? JSON.parse(row.value) : null);
  return cachedConfig;
}

export function saveRiskConfig(config: RiskConfig) {
  run(
    `INSERT INTO settings (key, value) VALUES ('risk_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    JSON.stringify(config),
  );
  cachedConfig = mergeConfig(config);
}
