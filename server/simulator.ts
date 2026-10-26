// Demo-data simulator.
//
// Seeded sessions are NOT real people. To make the examiner dashboard look
// alive during a presentation, this module generates plausible events for
// them, every one flagged `simulated = 1` and sourced from `seed-data` (history)
// or `demo-simulator` (live). Each simulated session follows a risk profile and
// the simulator nudges its score to stay inside that profile's band.
import { computeRisk, EVENT_META } from '../shared/risk-engine';
import type { EventType, LiveStatus, NewEventInput, ProctoringEvent } from '../shared/types';
import type { BankQuestion } from './data/exams';
import { all, getRiskConfig, newId, one, run, type Row } from './db';
import { insertEvent, sessionEvents } from './repo';

export type SimProfile = 'low' | 'medium' | 'high' | 'critical';

const BANDS: Record<SimProfile, [number, number]> = {
  low: [0, 14],
  medium: [24, 44],
  high: [54, 72],
  critical: [78, 94],
};

const PALETTE: Record<SimProfile, EventType[]> = {
  low: ['LOOK_AWAY', 'LOOK_AWAY', 'HEAD_MOVEMENT', 'CAMERA_ISSUE'],
  medium: ['LOOK_AWAY', 'LOOK_AWAY', 'BOOK_DETECTED', 'FACE_MISSING', 'HEAD_MOVEMENT'],
  high: ['PHONE_DETECTED', 'LOOK_AWAY', 'MULTIPLE_FACES', 'BOOK_DETECTED', 'FACE_MISSING'],
  critical: ['PHONE_DETECTED', 'MULTIPLE_FACES', 'IDENTITY_MISMATCH', 'LOOK_AWAY', 'PAPER_DETECTED'],
};

const DURATION_S: Record<EventType, [number, number]> = {
  LOOK_AWAY: [2.6, 6.5],
  PHONE_DETECTED: [8, 35],
  BOOK_DETECTED: [12, 50],
  PAPER_DETECTED: [10, 40],
  MULTIPLE_FACES: [4, 14],
  FACE_MISSING: [5.2, 12],
  IDENTITY_MISMATCH: [15, 40],
  CAMERA_ISSUE: [3.5, 8],
  HEAD_MOVEMENT: [10, 12],
  NORMAL: [0, 0],
};

const DIRECTIONS = ['left', 'right', 'down'] as const;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

function labelFor(type: EventType, durationS: number, direction: string): string {
  switch (type) {
    case 'LOOK_AWAY':
      return `Look-away detected (${direction}) — ${durationS.toFixed(1)} seconds`;
    case 'PHONE_DETECTED':
      return 'Mobile phone detected in camera frame';
    case 'BOOK_DETECTED':
      return 'Possible book/notes detected';
    case 'PAPER_DETECTED':
      return 'Possible paper detected';
    case 'MULTIPLE_FACES':
      return 'Multiple faces detected — review required';
    case 'FACE_MISSING':
      return `Face not visible for ${durationS.toFixed(1)} seconds`;
    case 'IDENTITY_MISMATCH':
      return 'Identity verification requires review';
    case 'CAMERA_ISSUE':
      return 'Camera frame too dark / possibly blocked';
    case 'HEAD_MOVEMENT':
      return 'Excessive head movement over 10 seconds';
    default:
      return EVENT_META[type].label;
  }
}

const CLEAR_LABEL: Partial<Record<EventType, string>> = {
  LOOK_AWAY: 'Normal gaze restored',
  PHONE_DETECTED: 'Phone no longer detected',
  BOOK_DETECTED: 'Book/notes no longer detected',
  PAPER_DETECTED: 'Paper no longer detected',
  MULTIPLE_FACES: 'Single face restored',
  FACE_MISSING: 'Face visible again',
  IDENTITY_MISMATCH: 'Identity verified again',
  CAMERA_ISSUE: 'Camera feed restored',
};

/** Pending "condition cleared" entries for live sessions (time → event). */
const pendingClears: { at: number; sessionId: string; input: NewEventInput }[] = [];

function emitSimulated(session: Row, t: number, events: ProctoringEvent[], live: boolean): ProctoringEvent | null {
  const profile = (session.sim_profile ?? 'low') as SimProfile;
  const [min, max] = BANDS[profile];
  const config = getRiskConfig();
  const score = computeRisk(events, t, config, session.risk_reset_at ?? null).score;
  const ongoing = events.some((e) => e.eventType !== 'NORMAL' && (e.endedAt == null || e.endedAt > t));
  if (ongoing) return null;
  let p: number;
  if (score < min) p = 0.55;
  else if (score < max) p = profile === 'low' ? 0.03 : 0.07;
  else p = 0;
  if (Math.random() > p) return null;

  let type = pick(PALETTE[profile]);
  const weightKey = EVENT_META[type].weightKey;
  if (weightKey && score + config.weights[weightKey] > max + 8) type = 'LOOK_AWAY';
  const [dMin, dMax] = DURATION_S[type];
  const durationS = rand(dMin, dMax);
  const direction = pick(DIRECTIONS);
  const endedAt = Math.round(t + durationS * 1000);
  const confidence = type === 'IDENTITY_MISMATCH' ? rand(0.18, 0.42) : rand(0.62, 0.95);
  const source = live ? 'demo-simulator' : 'seed-data';
  const evt = insertEvent(session.id, {
    clientId: newId('sim'),
    timestamp: Math.round(t),
    endedAt,
    eventType: type,
    label: labelFor(type, durationS, direction),
    confidence: Math.round(confidence * 100) / 100,
    simulated: true,
    source,
    details: {
      durationMs: Math.round(durationS * 1000),
      direction: type === 'LOOK_AWAY' ? direction : undefined,
      note: 'Simulated event for a seeded demo session (not a real detection).',
    },
  });
  const clear = CLEAR_LABEL[type];
  if (clear) {
    const input: NewEventInput = {
      clientId: newId('sim'),
      timestamp: endedAt,
      eventType: 'NORMAL',
      label: clear,
      confidence: null,
      simulated: true,
      source,
      details: { relatedTo: evt.id },
    };
    if (live && endedAt > Date.now()) pendingClears.push({ at: endedAt, sessionId: session.id, input });
    else insertEvent(session.id, input);
  }
  return evt;
}

function maybeAnswer(session: Row, t: number) {
  const exam = one(`SELECT questions, duration_minutes FROM exams WHERE id = ?`, session.exam_id)!;
  const questions = JSON.parse(exam.questions) as BankQuestion[];
  const answers = JSON.parse(session.answers || '{}') as Record<string, number>;
  const elapsed = (t - session.start_time) / (exam.duration_minutes * 60_000);
  const target = Math.min(questions.length, Math.floor(elapsed * questions.length * 1.1));
  const missing = questions.filter((q) => answers[q.id] == null);
  if (Object.keys(answers).length >= target || missing.length === 0) return;
  const q = missing[0];
  answers[q.id] = Math.random() < 0.7 ? q.answer : Math.floor(Math.random() * q.options.length);
  run(`UPDATE sessions SET answers = ? WHERE id = ?`, JSON.stringify(answers), session.id);
  session.answers = JSON.stringify(answers);
}

function liveStatusFor(events: ProctoringEvent[], t: number): LiveStatus {
  const ongoing = new Set(events.filter((e) => e.endedAt != null && e.endedAt > t).map((e) => e.eventType));
  const lookAway = events.find((e) => e.eventType === 'LOOK_AWAY' && e.endedAt != null && e.endedAt > t);
  const dir = (lookAway?.details.direction as string | undefined)?.toUpperCase() as LiveStatus['gaze'] | undefined;
  const objects: string[] = [];
  if (ongoing.has('PHONE_DETECTED')) objects.push('cell phone');
  if (ongoing.has('BOOK_DETECTED')) objects.push('book');
  if (ongoing.has('PAPER_DETECTED')) objects.push('paper');
  const faceMissing = ongoing.has('FACE_MISSING');
  const multiple = ongoing.has('MULTIPLE_FACES');
  const identityIssue = ongoing.has('IDENTITY_MISMATCH');
  return {
    face: faceMissing ? 'NOT_DETECTED' : multiple ? 'MULTIPLE' : 'DETECTED',
    facesCount: faceMissing ? 0 : multiple ? 2 : 1,
    identity: identityIssue ? 'CHECK_REQUIRED' : 'VERIFIED',
    identityConfidence: identityIssue ? Math.round(rand(0.2, 0.4) * 100) / 100 : Math.round(rand(0.9, 0.98) * 100) / 100,
    camera: ongoing.has('CAMERA_ISSUE') ? 'CHECK_CAMERA' : 'ACTIVE',
    microphone: 'ACTIVE',
    gaze: dir ?? 'CENTER',
    head: ongoing.has('HEAD_MOVEMENT') ? 'EXCESSIVE_MOVEMENT' : 'NORMAL',
    headPose: { yaw: dir === 'LEFT' ? -31 : dir === 'RIGHT' ? 29 : rand(-6, 6), pitch: dir === 'DOWN' ? 24 : rand(-4, 4) },
    objects,
    models: { face: 'demo', objects: 'demo', identity: 'demo' },
    proctoring: 'ACTIVE',
    updatedAt: t,
  };
}

/** Generates history between `from` and `to` for a simulated session. */
export function backfillSession(session: Row, from: number, to: number) {
  for (let t = from + 45_000; t < to; t += 15_000) {
    emitSimulated(session, t, sessionEvents(session.id), false);
    maybeAnswer(session, t);
  }
}

export function tickSimulator(now = Date.now()) {
  for (let i = pendingClears.length - 1; i >= 0; i--) {
    const c = pendingClears[i];
    if (c.at <= now) {
      pendingClears.splice(i, 1);
      const s = one(`SELECT status FROM sessions WHERE id = ?`, c.sessionId);
      if (s?.status === 'ACTIVE') insertEvent(c.sessionId, c.input);
    }
  }
  const sessions = all(`SELECT * FROM sessions WHERE simulated = 1 AND status = 'ACTIVE'`);
  for (const session of sessions) {
    emitSimulated(session, now, sessionEvents(session.id), true);
    maybeAnswer(session, now);
    run(
      `UPDATE sessions SET live_status = ?, last_heartbeat = ? WHERE id = ?`,
      JSON.stringify(liveStatusFor(sessionEvents(session.id), now)),
      now,
      session.id,
    );
  }
}

export function refreshLiveStatus(sessionId: string, now = Date.now()) {
  run(`UPDATE sessions SET live_status = ? WHERE id = ?`, JSON.stringify(liveStatusFor(sessionEvents(sessionId), now)), sessionId);
}
