// Data access + DTO mapping. Routes stay thin; all shaping happens here.
import {
  computeRisk,
  contributionFor,
  riskTimeline,
  severityFor,
} from '../shared/risk-engine';
import type {
  Exam,
  LiveStatus,
  NewEventInput,
  ProctoringEvent,
  SessionDetail,
  SessionSummary,
  Student,
} from '../shared/types';
import type { BankQuestion } from './data/exams';
import { all, getRiskConfig, newId, one, run, type Row } from './db';

export const ONLINE_WINDOW_MS = 20_000;

export function mapStudent(row: Row): Student {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    email: row.email,
    examId: row.exam_id ?? null,
    hasFaceReference: !!row.face_reference || row.face_model === 'demo' || row.face_model === 'simulated',
    faceReferenceModel: row.face_model ?? null,
    verificationStatus: row.verification_status,
    createdAt: row.created_at,
  };
}

export function mapExam(row: Row): Exam {
  const questions = JSON.parse(row.questions) as BankQuestion[];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    subject: row.subject,
    durationMinutes: row.duration_minutes,
    startTime: row.start_time,
    endTime: row.end_time,
    // Answer keys are stripped before anything leaves the server.
    questions: questions.map(({ answer: _answer, ...q }) => q),
  };
}

export function mapEvent(row: Row): ProctoringEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    endedAt: row.ended_at ?? null,
    eventType: row.event_type,
    severity: row.severity,
    label: row.label,
    confidence: row.confidence ?? null,
    riskContribution: row.risk_contribution,
    details: JSON.parse(row.details || '{}'),
    simulated: !!row.simulated,
    source: row.source,
    evidence: row.evidence ?? null,
    reviewStatus: row.review_status,
    examinerNote: row.examiner_note ?? '',
    reviewedAt: row.reviewed_at ?? null,
  };
}

export function sessionEvents(sessionId: string, withEvidence = false): ProctoringEvent[] {
  const cols = withEvidence ? '*' : `*, NULL AS evidence`;
  return all(`SELECT ${cols} FROM events WHERE session_id = ? ORDER BY timestamp ASC`, sessionId).map((r) => {
    const e = mapEvent(r);
    if (!withEvidence) e.evidence = null;
    return e;
  });
}

function evaluationTime(session: Row, now: number) {
  return session.end_time ?? now;
}

export function buildSummary(session: Row, now = Date.now(), events?: ProctoringEvent[]): SessionSummary {
  const student = one(`SELECT id, student_id, name FROM students WHERE id = ?`, session.student_id)!;
  const exam = one(`SELECT id, code, name, subject FROM exams WHERE id = ?`, session.exam_id)!;
  const evs = events ?? sessionEvents(session.id);
  const config = getRiskConfig();
  const risk = computeRisk(evs, evaluationTime(session, now), config, session.risk_reset_at ?? null);
  const suspicious = evs.filter((e) => e.eventType !== 'NORMAL' && e.reviewStatus !== 'FALSE_POSITIVE');
  const last = [...evs].reverse().find((e) => e.eventType !== 'NORMAL') ?? evs[evs.length - 1] ?? null;
  const live: LiveStatus | null = session.live_status ? JSON.parse(session.live_status) : null;
  const online =
    session.status === 'ACTIVE' && (!!session.simulated || (session.last_heartbeat ?? 0) > now - ONLINE_WINDOW_MS);
  return {
    id: session.id,
    student: { id: student.id, studentId: student.student_id, name: student.name },
    exam: { id: exam.id, code: exam.code, name: exam.name, subject: exam.subject },
    status: session.status,
    reviewStatus: session.review_status,
    startTime: session.start_time,
    endTime: session.end_time ?? null,
    risk,
    lastEvent: last ? { label: last.label, eventType: last.eventType, timestamp: last.timestamp, severity: last.severity } : null,
    warnings: suspicious.length,
    pendingReview: suspicious.filter((e) => e.reviewStatus === 'PENDING').length,
    live,
    online,
    simulatedSession: !!session.simulated,
  };
}

export function buildDetail(session: Row, now = Date.now()): SessionDetail {
  const events = sessionEvents(session.id, true);
  const summary = buildSummary(session, now, events);
  const exam = one(`SELECT * FROM exams WHERE id = ?`, session.exam_id)!;
  const questions = JSON.parse(exam.questions) as BankQuestion[];
  const answers = JSON.parse(session.answers || '{}') as Record<string, number>;
  const to = evaluationTime(session, now);
  const span = Math.max(60_000, to - session.start_time);
  const step = Math.max(10_000, Math.round(span / 120));
  return {
    ...summary,
    events,
    riskHistory: riskTimeline(events, session.start_time, to, step, getRiskConfig(), session.risk_reset_at ?? null),
    examinerNotes: session.examiner_notes ?? '',
    answeredCount: Object.keys(answers).length,
    questionCount: questions.length,
    examScore: session.exam_score ?? null,
    durationMinutes: exam.duration_minutes,
    riskResetAt: session.risk_reset_at ?? null,
  };
}

export function insertEvent(sessionId: string, input: NewEventInput): ProctoringEvent {
  const existing = one(`SELECT * FROM events WHERE session_id = ? AND client_id = ?`, sessionId, input.clientId);
  if (existing) return mapEvent(existing);
  const config = getRiskConfig();
  const resetAt = (one(`SELECT risk_reset_at FROM sessions WHERE id = ?`, sessionId)?.risk_reset_at as number | null) ?? null;
  const previous = sessionEvents(sessionId).filter((e) => resetAt == null || e.timestamp >= resetAt);
  const { value, rule } = contributionFor(input.eventType, input.timestamp, previous, config);
  const severity = severityFor(input.eventType, value, config);
  const id = newId('evt');
  run(
    `INSERT INTO events (id, session_id, client_id, timestamp, ended_at, event_type, severity, label, confidence,
      risk_contribution, details, simulated, source, evidence, review_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    sessionId,
    input.clientId,
    input.timestamp,
    input.endedAt ?? (input.eventType === 'NORMAL' ? input.timestamp : null),
    input.eventType,
    severity,
    input.label.slice(0, 200),
    input.confidence ?? null,
    value,
    JSON.stringify({ ...(input.details ?? {}), rule }),
    input.simulated ? 1 : 0,
    input.source,
    config.evidenceSnapshots && input.evidence && input.evidence.length < 120_000 ? input.evidence : null,
    input.eventType === 'NORMAL' ? 'NOT_REQUIRED' : 'PENDING',
  );
  return mapEvent(one(`SELECT * FROM events WHERE id = ?`, id)!);
}

export function endEvent(
  sessionId: string,
  clientId: string,
  endedAt: number,
  details: Record<string, unknown> = {},
  label?: string,
) {
  const row = one(`SELECT * FROM events WHERE session_id = ? AND client_id = ?`, sessionId, clientId);
  if (!row || row.ended_at != null) return;
  const end = Math.max(row.timestamp, endedAt);
  const merged = { ...JSON.parse(row.details || '{}'), ...details, durationMs: end - row.timestamp };
  run(
    `UPDATE events SET ended_at = ?, details = ?, label = ? WHERE id = ?`,
    end,
    JSON.stringify(merged),
    typeof label === 'string' && label ? label.slice(0, 200) : row.label,
    row.id,
  );
}

/** Closes open events and freezes the final score. */
export function finalizeSession(sessionId: string, status: 'SUBMITTED' | 'TIMED_OUT', at: number) {
  const session = one(`SELECT * FROM sessions WHERE id = ?`, sessionId);
  if (!session || session.status !== 'ACTIVE') return;
  run(`UPDATE events SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL`, at, sessionId);
  const exam = one(`SELECT questions FROM exams WHERE id = ?`, session.exam_id)!;
  const questions = JSON.parse(exam.questions) as BankQuestion[];
  const answers = JSON.parse(session.answers || '{}') as Record<string, number>;
  const correct = questions.filter((q) => answers[q.id] === q.answer).length;
  const risk = computeRisk(sessionEvents(sessionId), at, getRiskConfig(), session.risk_reset_at ?? null);
  run(
    `UPDATE sessions SET status = ?, end_time = ?, final_risk = ?, exam_score = ? WHERE id = ?`,
    status,
    at,
    risk.score,
    Math.round((correct / Math.max(1, questions.length)) * 100),
    sessionId,
  );
}
