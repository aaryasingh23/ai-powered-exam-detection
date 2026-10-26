import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { one, run } from './db';

const TTL_MS = Number(process.env.SESSION_TTL_MINUTES ?? 180) * 60_000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function issueToken(userId: string, role: 'student' | 'examiner', examId: string | null = null): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  run(
    `INSERT INTO auth_tokens (token, user_id, role, exam_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    token,
    userId,
    role,
    examId,
    now,
    now + TTL_MS,
  );
  return { token, expiresAt: now + TTL_MS };
}

export function revokeToken(token: string) {
  run(`DELETE FROM auth_tokens WHERE token = ?`, token);
}

export interface AuthContext {
  token: string;
  userId: string;
  role: 'student' | 'examiner';
  examId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function readAuth(req: Request): AuthContext {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  const row = one(`SELECT * FROM auth_tokens WHERE token = ?`, token);
  if (!row) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  if (row.expires_at < Date.now()) {
    revokeToken(token);
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  return { token, userId: row.user_id, role: row.role, examId: row.exam_id };
}

export function requireRole(role: 'student' | 'examiner') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = readAuth(req);
    if (auth.role !== role) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this resource.');
    req.auth = auth;
    next();
  };
}

export function requireAny(req: Request, _res: Response, next: NextFunction) {
  req.auth = readAuth(req);
  next();
}
