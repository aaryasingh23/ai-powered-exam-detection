// Seeds exams, demo accounts and realistic (clearly simulated) proctoring
// sessions. Run `npm run seed` to wipe and recreate everything.
import { hashPassword } from './auth';
import { EXAM_SEEDS } from './data/exams';
import { all, db, newId, one, run, transaction } from './db';
import { finalizeSession, insertEvent } from './repo';
import { backfillSession, refreshLiveStatus, type SimProfile } from './simulator';

export const DEMO_STUDENT = { studentId: 'STU1001', password: 'Demo@123', examCode: 'CN-2026' };
export const DEMO_EXAMINER = { username: 'examiner', password: 'Examiner@123' };
const SEEDED_PASSWORD = 'Student@123';

interface SeedSession {
  studentId: string;
  name: string;
  exam: string;
  profile: SimProfile;
  /** Minutes since start for live sessions. */
  startedMinutesAgo: number;
  completed?: { endedHoursAgo: number; review: 'PENDING_REVIEW' | 'IN_REVIEW' | 'CLEARED' | 'ESCALATED'; notes: string };
}

const SEED_SESSIONS: SeedSession[] = [
  { studentId: 'STU1021', name: 'Rahul Verma', exam: 'exam_phy', profile: 'low', startedMinutesAgo: 24 },
  { studentId: 'STU1045', name: 'Priya Nair', exam: 'exam_math', profile: 'medium', startedMinutesAgo: 21 },
  { studentId: 'STU1098', name: 'Aman Gupta', exam: 'exam_cn', profile: 'high', startedMinutesAgo: 26 },
  { studentId: 'STU1033', name: 'Sneha Kapoor', exam: 'exam_cn', profile: 'low', startedMinutesAgo: 19 },
  { studentId: 'STU1057', name: 'Arjun Mehta', exam: 'exam_dsa', profile: 'low', startedMinutesAgo: 15 },
  { studentId: 'STU1062', name: 'Kavya Reddy', exam: 'exam_cn', profile: 'medium', startedMinutesAgo: 22 },
  { studentId: 'STU1074', name: 'Rohan Das', exam: 'exam_phy', profile: 'low', startedMinutesAgo: 12 },
  { studentId: 'STU1081', name: 'Isha Malhotra', exam: 'exam_math', profile: 'low', startedMinutesAgo: 17 },
  { studentId: 'STU1089', name: 'Vikram Singh', exam: 'exam_dsa', profile: 'critical', startedMinutesAgo: 25 },
  { studentId: 'STU1102', name: 'Neha Joshi', exam: 'exam_cn', profile: 'medium', startedMinutesAgo: 14 },
  { studentId: 'STU1110', name: 'Aditya Rao', exam: 'exam_phy', profile: 'high', startedMinutesAgo: 20 },
  { studentId: 'STU1117', name: 'Meera Iyer', exam: 'exam_dsa', profile: 'low', startedMinutesAgo: 9 },
  {
    studentId: 'STU1124',
    name: 'Karan Sethi',
    exam: 'exam_cn',
    profile: 'medium',
    startedMinutesAgo: 0,
    completed: { endedHoursAgo: 3, review: 'IN_REVIEW', notes: 'Look-aways coincide with long calculation questions. Awaiting second reviewer.' },
  },
  {
    studentId: 'STU1131',
    name: 'Pooja Bansal',
    exam: 'exam_math',
    profile: 'low',
    startedMinutesAgo: 0,
    completed: { endedHoursAgo: 5, review: 'CLEARED', notes: 'No concerns. Brief glances only.' },
  },
  {
    studentId: 'STU1138',
    name: 'Siddharth Jain',
    exam: 'exam_dsa',
    profile: 'high',
    startedMinutesAgo: 0,
    completed: {
      endedHoursAgo: 26,
      review: 'ESCALATED',
      notes: 'Phone visible twice with matching look-down periods. Forwarded to the exam committee for a decision.',
    },
  },
  {
    studentId: 'STU1145',
    name: 'Tanvi Kulkarni',
    exam: 'exam_phy',
    profile: 'medium',
    startedMinutesAgo: 0,
    completed: { endedHoursAgo: 8, review: 'PENDING_REVIEW', notes: '' },
  },
];

function emailFor(name: string) {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@lcg.edu.in`;
}

function startSession(studentRowId: string, examId: string, start: number, profile: SimProfile) {
  const id = newId('ses');
  run(
    `INSERT INTO sessions (id, student_id, exam_id, start_time, status, simulated, sim_profile, last_heartbeat)
     VALUES (?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
    id,
    studentRowId,
    examId,
    start,
    profile,
    start,
  );
  const base = { simulated: true, source: 'seed-data' as const, confidence: null };
  insertEvent(id, { ...base, clientId: newId('sim'), timestamp: start, eventType: 'NORMAL', label: 'Exam started' });
  insertEvent(id, {
    ...base,
    clientId: newId('sim'),
    timestamp: start + 4_000,
    eventType: 'NORMAL',
    label: 'Face verified — identity confidence 97%',
    confidence: 0.97,
  });
  return one(`SELECT * FROM sessions WHERE id = ?`, id)!;
}

function seedSimulatedSessions(now: number) {
  for (const s of SEED_SESSIONS) {
    const student = one(`SELECT id FROM students WHERE student_id = ?`, s.studentId)!;
    if (s.completed) {
      const end = now - s.completed.endedHoursAgo * 3_600_000;
      const start = end - 28 * 60_000;
      const session = startSession(student.id, s.exam, start, s.profile);
      backfillSession(session, start, end);
      insertEvent(session.id, {
        clientId: newId('sim'),
        timestamp: end,
        eventType: 'NORMAL',
        label: 'Exam submitted by student',
        confidence: null,
        simulated: true,
        source: 'seed-data',
      });
      finalizeSession(session.id, 'SUBMITTED', end);
      run(`UPDATE sessions SET review_status = ?, examiner_notes = ? WHERE id = ?`, s.completed.review, s.completed.notes, session.id);
      if (s.completed.review === 'CLEARED' || s.completed.review === 'ESCALATED') {
        run(
          `UPDATE events SET review_status = 'REVIEWED', reviewed_at = ? WHERE session_id = ? AND event_type != 'NORMAL'`,
          end + 3_600_000,
          session.id,
        );
      }
      if (s.completed.review === 'IN_REVIEW') {
        const firstLook = one(`SELECT id FROM events WHERE session_id = ? AND event_type = 'LOOK_AWAY' ORDER BY timestamp LIMIT 1`, session.id);
        if (firstLook) {
          run(
            `UPDATE events SET review_status = 'FALSE_POSITIVE', examiner_note = ?, reviewed_at = ? WHERE id = ?`,
            'Student was reading a long question; head turn matches scrolling.',
            end + 1_800_000,
            firstLook.id,
          );
        }
      }
    } else {
      const start = now - s.startedMinutesAgo * 60_000;
      const session = startSession(student.id, s.exam, start, s.profile);
      backfillSession(session, start, now);
      refreshLiveStatus(session.id, now);
    }
  }
}

export function seedAll() {
  const now = Date.now();
  transaction(() => {
    for (const t of ['events', 'sessions', 'auth_tokens', 'password_reset_requests', 'students', 'examiners', 'exams', 'settings']) {
      db.exec(`DELETE FROM ${t}`);
    }
    for (const e of EXAM_SEEDS) {
      run(
        `INSERT INTO exams (id, code, name, subject, duration_minutes, start_time, end_time, questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id,
        e.code,
        e.name,
        e.subject,
        e.durationMinutes,
        now - 86_400_000,
        now + 365 * 86_400_000,
        JSON.stringify(e.questions),
      );
    }
    run(
      `INSERT INTO examiners (id, username, name, password_hash) VALUES (?, ?, ?, ?)`,
      newId('exm'),
      DEMO_EXAMINER.username,
      'Dr. S. Krishnan (Chief Examiner)',
      hashPassword(DEMO_EXAMINER.password),
    );
    run(
      `INSERT INTO students (id, student_id, name, email, password_hash, exam_id, verification_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'exam_cn', 'UNREGISTERED', ?)`,
      newId('stu'),
      DEMO_STUDENT.studentId,
      'Ananya Sharma',
      'ananya.sharma@lcg.edu.in',
      hashPassword(DEMO_STUDENT.password),
      now,
    );
    const seededHash = hashPassword(SEEDED_PASSWORD);
    for (const s of SEED_SESSIONS) {
      run(
        `INSERT INTO students (id, student_id, name, email, password_hash, exam_id, face_model, verification_status, seeded, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'simulated', 'VERIFIED', 1, ?)`,
        newId('stu'),
        s.studentId,
        s.name,
        emailFor(s.name),
        seededHash,
        s.exam,
        now - 30 * 86_400_000,
      );
    }
    seedSimulatedSessions(now);
  });
  console.log(`[seed] ${EXAM_SEEDS.length} exams, ${SEED_SESSIONS.length + 1} students, ${SEED_SESSIONS.length} sessions`);
}

/** Recreates simulated sessions if they are older than a few hours (keeps real data). */
export function seedIfNeeded() {
  const exams = one(`SELECT COUNT(*) AS n FROM exams`)!.n as number;
  if (exams === 0) return seedAll();
  const now = Date.now();
  const stale = one(`SELECT MIN(start_time) AS t FROM sessions WHERE simulated = 1 AND status = 'ACTIVE'`)?.t as number | null;
  if (stale == null || now - stale > 2 * 3_600_000) {
    transaction(() => {
      const ids = all(`SELECT id FROM sessions WHERE simulated = 1`).map((r) => r.id);
      for (const id of ids) run(`DELETE FROM sessions WHERE id = ?`, id);
      run(`UPDATE exams SET start_time = ?, end_time = ?`, now - 86_400_000, now + 365 * 86_400_000);
      seedSimulatedSessions(now);
    });
    console.log('[seed] refreshed simulated demo sessions');
  }
}

if (process.argv.includes('--reset')) {
  seedAll();
}
