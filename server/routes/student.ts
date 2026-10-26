import { Router, type Request } from 'express';
import { computeRisk } from '../../shared/risk-engine';
import type { EventType, LiveStatus, NewEventInput } from '../../shared/types';
import { ApiError, requireRole } from '../auth';
import { getRiskConfig, newId, one, run, type Row } from '../db';
import { dropFrame, putFrame } from '../frames';
import { buildSummary, endEvent, finalizeSession, insertEvent, mapExam, sessionEvents } from '../repo';

export const studentRouter = Router();
studentRouter.use(requireRole('student'));

const EVENT_TYPES: EventType[] = [
  'LOOK_AWAY',
  'PHONE_DETECTED',
  'BOOK_DETECTED',
  'PAPER_DETECTED',
  'MULTIPLE_FACES',
  'FACE_MISSING',
  'IDENTITY_MISMATCH',
  'CAMERA_ISSUE',
  'HEAD_MOVEMENT',
  'NORMAL',
];
const SOURCES = ['mediapipe-face-landmarker', 'mediapipe-object-detector', 'yolo-http', 'face-api', 'frame-heuristics', 'system', 'demo-simulator'];

function currentExam(req: Request): Row {
  const examId = req.auth!.examId;
  const exam = examId ? one(`SELECT * FROM exams WHERE id = ?`, examId) : undefined;
  if (!exam) throw new ApiError(400, 'NO_EXAM', 'No exam is linked to this login. Please sign in with an exam code.');
  return exam;
}

function ownSession(req: Request): Row {
  const session = one(`SELECT * FROM sessions WHERE id = ? AND student_id = ?`, req.params.id, req.auth!.userId);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Exam session not found.');
  return session;
}

function activeSession(req: Request): Row {
  const session = ownSession(req);
  if (session.status !== 'ACTIVE') throw new ApiError(409, 'SESSION_CLOSED', 'This exam session has already been submitted.');
  return session;
}

function sessionState(session: Row, exam: Row, now = Date.now()) {
  const risk = computeRisk(sessionEvents(session.id), session.end_time ?? now, getRiskConfig(), session.risk_reset_at ?? null);
  const deadline = session.start_time + exam.duration_minutes * 60_000;
  return {
    id: session.id,
    status: session.status,
    startTime: session.start_time,
    endTime: session.end_time ?? null,
    deadline,
    remainingMs: Math.max(0, deadline - now),
    answers: JSON.parse(session.answers || '{}') as Record<string, number>,
    risk,
    riskResetAt: session.risk_reset_at ?? null,
  };
}

studentRouter.get('/exam', (req, res) => {
  res.json({ exam: mapExam(currentExam(req)) });
});

studentRouter.get('/config', (_req, res) => {
  res.json({ config: getRiskConfig() });
});

studentRouter.get('/session', (req, res) => {
  const exam = currentExam(req);
  const session = one(
    `SELECT * FROM sessions WHERE student_id = ? AND exam_id = ? AND simulated = 0 ORDER BY start_time DESC LIMIT 1`,
    req.auth!.userId,
    exam.id,
  );
  res.json({ session: session ? sessionState(session, exam) : null });
});

studentRouter.post('/session/start', (req, res) => {
  const exam = currentExam(req);
  const now = Date.now();
  const existing = one(
    `SELECT * FROM sessions WHERE student_id = ? AND exam_id = ? AND simulated = 0 ORDER BY start_time DESC LIMIT 1`,
    req.auth!.userId,
    exam.id,
  );
  if (existing?.status === 'ACTIVE') {
    const deadline = existing.start_time + exam.duration_minutes * 60_000;
    if (now < deadline) {
      res.json({ session: sessionState(existing, exam, now), resumed: true });
      return;
    }
    finalizeSession(existing.id, 'TIMED_OUT', deadline);
  }
  if (existing && existing.status !== 'ACTIVE' && !req.body?.newAttempt) {
    throw new ApiError(409, 'ALREADY_SUBMITTED', 'You have already submitted this exam.');
  }
  const id = newId('ses');
  run(
    `INSERT INTO sessions (id, student_id, exam_id, start_time, status, last_heartbeat) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
    id,
    req.auth!.userId,
    exam.id,
    now,
    now,
  );
  insertEvent(id, {
    clientId: newId('sys'),
    timestamp: now,
    eventType: 'NORMAL',
    label: 'Exam started',
    confidence: null,
    simulated: false,
    source: 'system',
  });
  const student = one(`SELECT verification_status FROM students WHERE id = ?`, req.auth!.userId);
  if (student?.verification_status === 'VERIFIED') {
    insertEvent(id, {
      clientId: newId('sys'),
      timestamp: now + 1,
      eventType: 'NORMAL',
      label: 'Pre-exam identity verification passed',
      confidence: null,
      simulated: false,
      source: 'system',
    });
  }
  res.status(201).json({ session: sessionState(one(`SELECT * FROM sessions WHERE id = ?`, id)!, exam, now), resumed: false });
});

function parseEvent(raw: any): NewEventInput {
  if (!raw || typeof raw !== 'object') throw new ApiError(400, 'VALIDATION', 'Invalid event.');
  if (!EVENT_TYPES.includes(raw.eventType)) throw new ApiError(400, 'VALIDATION', `Unknown event type ${raw.eventType}.`);
  if (!SOURCES.includes(raw.source)) throw new ApiError(400, 'VALIDATION', `Unknown source ${raw.source}.`);
  if (typeof raw.clientId !== 'string' || raw.clientId.length > 64) throw new ApiError(400, 'VALIDATION', 'Invalid clientId.');
  const now = Date.now();
  const ts = Number(raw.timestamp);
  return {
    clientId: raw.clientId,
    // Clamp client clocks to a sane window.
    timestamp: Number.isFinite(ts) && Math.abs(ts - now) < 10 * 60_000 ? ts : now,
    endedAt: raw.endedAt == null ? null : Number(raw.endedAt),
    eventType: raw.eventType,
    label: String(raw.label ?? '').slice(0, 200) || raw.eventType,
    confidence: raw.confidence == null ? null : Math.max(0, Math.min(1, Number(raw.confidence))),
    // The demo panel is the only source allowed to mark itself simulated;
    // anything sourced from the simulator is always simulated.
    simulated: !!raw.simulated || raw.source === 'demo-simulator',
    source: raw.source,
    details: raw.details && typeof raw.details === 'object' ? raw.details : {},
    evidence: typeof raw.evidence === 'string' && raw.evidence.startsWith('data:image/') ? raw.evidence : null,
  };
}

studentRouter.post('/session/:id/events', (req, res) => {
  const session = activeSession(req);
  const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
  const saved = list.map((raw: unknown) => insertEvent(session.id, parseEvent(raw)));
  const ends = Array.isArray(req.body?.ends) ? req.body.ends.slice(0, 50) : [];
  for (const e of ends) {
    if (typeof e?.clientId === 'string') {
      endEvent(session.id, e.clientId, Number(e.endedAt) || Date.now(), e.details && typeof e.details === 'object' ? e.details : {}, e.label);
    }
  }
  const exam = one(`SELECT * FROM exams WHERE id = ?`, session.exam_id)!;
  res.json({
    events: saved.map((e: ReturnType<typeof insertEvent>) => ({ id: e.id, riskContribution: e.riskContribution, severity: e.severity })),
    session: sessionState(one(`SELECT * FROM sessions WHERE id = ?`, session.id)!, exam),
  });
});

studentRouter.post('/session/:id/heartbeat', (req, res) => {
  const session = activeSession(req);
  const exam = one(`SELECT * FROM exams WHERE id = ?`, session.exam_id)!;
  const now = Date.now();
  const live = req.body?.live as LiveStatus | undefined;
  run(
    `UPDATE sessions SET last_heartbeat = ?, live_status = COALESCE(?, live_status) WHERE id = ?`,
    now,
    live ? JSON.stringify({ ...live, updatedAt: now }) : null,
    session.id,
  );
  const frame = req.body?.frame;
  if (getRiskConfig().livePreview && typeof frame === 'string' && frame.startsWith('data:image/jpeg') && frame.length < 150_000) {
    putFrame(session.id, frame);
  }
  const deadline = session.start_time + exam.duration_minutes * 60_000;
  if (now > deadline + 30_000) {
    finalizeSession(session.id, 'TIMED_OUT', deadline);
    dropFrame(session.id);
  }
  res.json({ session: sessionState(one(`SELECT * FROM sessions WHERE id = ?`, session.id)!, exam, now) });
});

studentRouter.put('/session/:id/answers', (req, res) => {
  const session = activeSession(req);
  const answers = req.body?.answers;
  if (!answers || typeof answers !== 'object') throw new ApiError(400, 'VALIDATION', 'Invalid answers.');
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(answers)) if (typeof v === 'number' && k.length < 20) clean[k] = v;
  run(`UPDATE sessions SET answers = ? WHERE id = ?`, JSON.stringify(clean), session.id);
  res.json({ ok: true, savedAt: Date.now() });
});

studentRouter.post('/session/:id/submit', (req, res) => {
  const session = ownSession(req);
  const exam = one(`SELECT * FROM exams WHERE id = ?`, session.exam_id)!;
  if (session.status === 'ACTIVE') {
    if (req.body?.answers && typeof req.body.answers === 'object') {
      run(`UPDATE sessions SET answers = ? WHERE id = ?`, JSON.stringify(req.body.answers), session.id);
    }
    const timedOut = req.body?.reason === 'timeout';
    const now = Date.now();
    insertEvent(session.id, {
      clientId: newId('sys'),
      timestamp: now,
      eventType: 'NORMAL',
      label: timedOut ? 'Exam auto-submitted (time limit reached)' : 'Exam submitted by student',
      confidence: null,
      simulated: false,
      source: 'system',
    });
    finalizeSession(session.id, timedOut ? 'TIMED_OUT' : 'SUBMITTED', now);
    dropFrame(session.id);
  }
  const updated = one(`SELECT * FROM sessions WHERE id = ?`, session.id)!;
  const summary = buildSummary(updated);
  res.json({ session: sessionState(updated, exam), summary, answered: Object.keys(JSON.parse(updated.answers || '{}')).length, total: JSON.parse(exam.questions).length });
});

// Demo-only: start risk from zero again (events stay on the timeline).
studentRouter.post('/session/:id/reset-risk', (req, res) => {
  const session = activeSession(req);
  const now = Date.now();
  run(`UPDATE sessions SET risk_reset_at = ? WHERE id = ?`, now, session.id);
  insertEvent(session.id, {
    clientId: newId('demo'),
    timestamp: now,
    eventType: 'NORMAL',
    label: 'DEMO: risk score reset from the demo control panel',
    confidence: null,
    simulated: true,
    source: 'demo-simulator',
  });
  const exam = one(`SELECT * FROM exams WHERE id = ?`, session.exam_id)!;
  res.json({ session: sessionState(one(`SELECT * FROM sessions WHERE id = ?`, session.id)!, exam, now) });
});
