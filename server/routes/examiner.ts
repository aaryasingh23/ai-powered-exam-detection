import { Router } from 'express';
import { DEFAULT_RISK_CONFIG, mergeConfig, riskTimeline, severityRank, type RiskConfig } from '../../shared/risk-engine';
import type { Alert, DashboardOverview, EventType, RiskLevel, SessionReviewStatus, SessionSummary, Severity } from '../../shared/types';
import { ApiError, requireRole } from '../auth';
import { all, getRiskConfig, one, run, saveRiskConfig, transaction } from '../db';
import { getFrame } from '../frames';
import { buildDetail, buildSummary, mapEvent, mapExam, mapStudent, sessionEvents } from '../repo';
import { seedIfNeeded } from '../seed';

export const examinerRouter = Router();
examinerRouter.use(requireRole('examiner'));

const REVIEW_STATUSES: SessionReviewStatus[] = ['PENDING_REVIEW', 'IN_REVIEW', 'CLEARED', 'ESCALATED'];
const EVENT_REVIEW = ['PENDING', 'REVIEWED', 'FALSE_POSITIVE'];

function allSummaries(now = Date.now()): SessionSummary[] {
  return all(`SELECT * FROM sessions ORDER BY start_time DESC`).map((s) => buildSummary(s, now));
}

function sessionOr404(id: string) {
  const s = one(`SELECT * FROM sessions WHERE id = ?`, id);
  if (!s) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  return s;
}

function recentAlerts(limit: number, filter: { severity?: Severity; status?: string; sessionId?: string } = {}): Alert[] {
  const params: unknown[] = [];
  let where = `e.event_type != 'NORMAL'`;
  if (filter.status) {
    where += ` AND e.review_status = ?`;
    params.push(filter.status);
  }
  if (filter.sessionId) {
    where += ` AND e.session_id = ?`;
    params.push(filter.sessionId);
  }
  const rows = all(
    `SELECT e.*, NULL AS evidence, s.id AS sid, s.simulated AS ses_sim, st.student_id AS stu_code, st.name AS stu_name, x.name AS exam_name
     FROM events e JOIN sessions s ON s.id = e.session_id
     JOIN students st ON st.id = s.student_id JOIN exams x ON x.id = s.exam_id
     WHERE ${where} ORDER BY e.timestamp DESC LIMIT ?`,
    ...params,
    limit * 3,
  );
  const now = Date.now();
  return rows
    .filter((r) => r.timestamp <= now)
    .map((r) => ({
      event: mapEvent(r),
      session: { id: r.sid, studentId: r.stu_code, studentName: r.stu_name, examName: r.exam_name, simulatedSession: !!r.ses_sim },
    }))
    .filter((a) => !filter.severity || severityRank(a.event.severity) >= severityRank(filter.severity))
    .slice(0, limit);
}

examinerRouter.get('/overview', (_req, res) => {
  const now = Date.now();
  const sessions = allSummaries(now);
  const active = sessions.filter((s) => s.status === 'ACTIVE');
  const count = (lvl: RiskLevel) => active.filter((s) => s.risk.level === lvl).length;
  // Fleet-wide trend over the last 30 minutes.
  const from = now - 30 * 60_000;
  const config = getRiskConfig();
  const series = active.map((s) => {
    const row = one(`SELECT risk_reset_at FROM sessions WHERE id = ?`, s.id)!;
    return riskTimeline(sessionEvents(s.id), Math.max(from, s.startTime), now, 60_000, config, row.risk_reset_at ?? null);
  });
  const riskTrend: DashboardOverview['riskTrend'] = [];
  for (let t = from; t <= now; t += 60_000) {
    const scores = series
      .map((pts) => pts.filter((p) => p.t <= t + 30_000).at(-1)?.score)
      .filter((v): v is number => v != null);
    // Skip minutes before any session was running (no data ≠ zero risk).
    if (!scores.length) continue;
    riskTrend.push({ t, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), max: Math.max(...scores) });
  }
  const overview: DashboardOverview = {
    totals: {
      active: active.length,
      low: count('LOW'),
      medium: count('MEDIUM'),
      high: count('HIGH'),
      critical: count('CRITICAL'),
      completed: sessions.length - active.length,
      pendingReview: sessions.reduce((n, s) => n + s.pendingReview, 0),
    },
    sessions,
    alerts: recentAlerts(12, { severity: 'LOW' }),
    riskTrend,
  };
  res.json(overview);
});

examinerRouter.get('/sessions', (req, res) => {
  let list = allSummaries();
  const risk = String(req.query.risk ?? '').toUpperCase();
  const status = String(req.query.status ?? '').toUpperCase();
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (risk) list = list.filter((s) => s.risk.level === risk);
  if (status) list = list.filter((s) => s.status === status);
  if (q) {
    list = list.filter((s) =>
      [s.student.studentId, s.student.name, s.exam.name, s.exam.code].some((v) => v.toLowerCase().includes(q)),
    );
  }
  res.json({ sessions: list });
});

examinerRouter.get('/sessions/:id', (req, res) => {
  res.json({ session: buildDetail(sessionOr404(req.params.id)) });
});

examinerRouter.get('/sessions/:id/frame', (req, res) => {
  sessionOr404(req.params.id);
  res.json(getFrame(req.params.id) ?? { frame: null, at: null });
});

examinerRouter.patch('/sessions/:id', (req, res) => {
  const session = sessionOr404(req.params.id);
  const { reviewStatus, examinerNotes } = req.body ?? {};
  if (reviewStatus != null) {
    if (!REVIEW_STATUSES.includes(reviewStatus)) throw new ApiError(400, 'VALIDATION', 'Invalid review status.');
    run(`UPDATE sessions SET review_status = ? WHERE id = ?`, reviewStatus, session.id);
  }
  if (examinerNotes != null) {
    run(`UPDATE sessions SET examiner_notes = ? WHERE id = ?`, String(examinerNotes).slice(0, 4000), session.id);
  }
  res.json({ session: buildDetail(sessionOr404(session.id)) });
});

examinerRouter.patch('/events/:id', (req, res) => {
  const row = one(`SELECT * FROM events WHERE id = ?`, req.params.id);
  if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  const { reviewStatus, examinerNote } = req.body ?? {};
  if (reviewStatus != null) {
    if (!EVENT_REVIEW.includes(reviewStatus)) throw new ApiError(400, 'VALIDATION', 'Invalid review status.');
    run(`UPDATE events SET review_status = ?, reviewed_at = ? WHERE id = ?`, reviewStatus, reviewStatus === 'PENDING' ? null : Date.now(), row.id);
    const session = one(`SELECT review_status FROM sessions WHERE id = ?`, row.session_id);
    if (session?.review_status === 'PENDING_REVIEW') run(`UPDATE sessions SET review_status = 'IN_REVIEW' WHERE id = ?`, row.session_id);
  }
  if (examinerNote != null) run(`UPDATE events SET examiner_note = ? WHERE id = ?`, String(examinerNote).slice(0, 2000), row.id);
  res.json({ event: mapEvent(one(`SELECT * FROM events WHERE id = ?`, row.id)!) });
});

examinerRouter.get('/alerts', (req, res) => {
  const severity = String(req.query.severity ?? '').toUpperCase() as Severity;
  const status = String(req.query.status ?? '').toUpperCase();
  res.json({
    alerts: recentAlerts(Math.min(200, Number(req.query.limit) || 100), {
      severity: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) ? severity : undefined,
      status: EVENT_REVIEW.includes(status) ? status : undefined,
    }),
  });
});

examinerRouter.get('/analytics', (_req, res) => {
  const now = Date.now();
  const sessions = allSummaries(now);
  const byType = all(
    `SELECT event_type AS type, COUNT(*) AS n, SUM(CASE WHEN review_status = 'FALSE_POSITIVE' THEN 1 ELSE 0 END) AS fp,
            SUM(CASE WHEN simulated = 1 THEN 1 ELSE 0 END) AS sim, AVG(confidence) AS conf
     FROM events WHERE event_type != 'NORMAL' AND timestamp <= ? GROUP BY event_type ORDER BY n DESC`,
    now,
  ).map((r) => ({
    eventType: r.type as EventType,
    count: r.n as number,
    falsePositives: r.fp as number,
    simulated: r.sim as number,
    avgConfidence: r.conf == null ? null : Math.round(r.conf * 100) / 100,
  }));
  const levels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const distribution = levels.map((level) => ({ level, count: sessions.filter((s) => s.risk.level === level).length }));
  const buckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}–${i * 10 + 9}`, count: 0 }));
  for (const s of sessions) buckets[Math.min(9, Math.floor(s.risk.score / 10))].count++;
  const hourly = all(
    `SELECT (timestamp / 600000) * 600000 AS t, COUNT(*) AS n FROM events
     WHERE event_type != 'NORMAL' AND timestamp > ? AND timestamp <= ? GROUP BY t ORDER BY t`,
    now - 3 * 3_600_000,
    now,
  ).map((r) => ({ t: r.t as number, count: r.n as number }));
  const byExam = all(`SELECT id, name, code FROM exams`).map((e) => {
    const list = sessions.filter((s) => s.exam.id === e.id);
    return {
      exam: e.name,
      code: e.code,
      sessions: list.length,
      avgRisk: list.length ? Math.round(list.reduce((a, s) => a + s.risk.score, 0) / list.length) : 0,
      flagged: list.filter((s) => s.risk.level === 'HIGH' || s.risk.level === 'CRITICAL').length,
    };
  });
  const reviewed = one(`SELECT COUNT(*) AS n FROM events WHERE event_type != 'NORMAL' AND review_status IN ('REVIEWED','FALSE_POSITIVE')`)!.n;
  const fp = one(`SELECT COUNT(*) AS n FROM events WHERE review_status = 'FALSE_POSITIVE'`)!.n;
  res.json({
    byType,
    distribution,
    buckets,
    eventsOverTime: hourly,
    byExam,
    review: { reviewed, falsePositives: fp, falsePositiveRate: reviewed ? Math.round((fp / reviewed) * 100) : 0 },
    topSessions: [...sessions].sort((a, b) => b.risk.score - a.risk.score).slice(0, 5),
  });
});

examinerRouter.get('/students', (_req, res) => {
  const rows = all(`SELECT * FROM students ORDER BY student_id`);
  res.json({
    students: rows.map((r) => {
      const sessions = all(`SELECT id, status, start_time FROM sessions WHERE student_id = ? ORDER BY start_time DESC`, r.id);
      return { ...mapStudent(r), seeded: !!r.seeded, sessionCount: sessions.length, latestSessionId: sessions[0]?.id ?? null };
    }),
  });
});

examinerRouter.get('/sessions/:id/report', (req, res) => {
  const session = sessionOr404(req.params.id);
  const student = one(`SELECT * FROM students WHERE id = ?`, session.student_id)!;
  const exam = one(`SELECT * FROM exams WHERE id = ?`, session.exam_id)!;
  const examiner = one(`SELECT name FROM examiners WHERE id = ?`, req.auth!.userId);
  const { questions: _q, ...examInfo } = mapExam(exam);
  res.json({
    report: {
      generatedAt: Date.now(),
      generatedBy: examiner?.name ?? 'Examiner',
      student: mapStudent(student),
      exam: examInfo,
      session: buildDetail(session),
    },
  });
});

examinerRouter.get('/settings', (_req, res) => {
  res.json({ config: getRiskConfig(), defaults: DEFAULT_RISK_CONFIG });
});

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

examinerRouter.put('/settings', (req, res) => {
  const incoming = mergeConfig(req.body?.config as Partial<RiskConfig>);
  const d = DEFAULT_RISK_CONFIG;
  const weights = Object.fromEntries(
    Object.entries(incoming.weights).map(([k, v]) => [k, clampNum(v, 0, 100, d.weights[k as keyof typeof d.weights])]),
  ) as RiskConfig['weights'];
  const cfg: RiskConfig = {
    ...incoming,
    weights,
    decay: {
      graceSeconds: clampNum(incoming.decay.graceSeconds, 0, 3600, d.decay.graceSeconds),
      halfLifeSeconds: clampNum(incoming.decay.halfLifeSeconds, 10, 7200, d.decay.halfLifeSeconds),
    },
    repeatedLookAway: {
      count: clampNum(incoming.repeatedLookAway.count, 2, 20, d.repeatedLookAway.count),
      windowSeconds: clampNum(incoming.repeatedLookAway.windowSeconds, 30, 3600, d.repeatedLookAway.windowSeconds),
    },
    thresholds: {
      medium: clampNum(incoming.thresholds.medium, 1, 98, d.thresholds.medium),
      high: clampNum(incoming.thresholds.high, 2, 99, d.thresholds.high),
      critical: clampNum(incoming.thresholds.critical, 3, 100, d.thresholds.critical),
    },
    evidenceSnapshots: !!incoming.evidenceSnapshots,
    livePreview: !!incoming.livePreview,
  };
  if (!(cfg.thresholds.medium < cfg.thresholds.high && cfg.thresholds.high < cfg.thresholds.critical)) {
    throw new ApiError(400, 'VALIDATION', 'Risk thresholds must increase: medium < high < critical.');
  }
  saveRiskConfig(cfg);
  res.json({ config: getRiskConfig() });
});

examinerRouter.post('/settings/reset', (_req, res) => {
  saveRiskConfig(DEFAULT_RISK_CONFIG);
  res.json({ config: getRiskConfig() });
});

examinerRouter.get('/reset-requests', (_req, res) => {
  res.json({ requests: all(`SELECT * FROM password_reset_requests ORDER BY created_at DESC LIMIT 50`) });
});

examinerRouter.patch('/reset-requests/:id', (req, res) => {
  run(`UPDATE password_reset_requests SET status = 'RESOLVED' WHERE id = ?`, req.params.id);
  res.json({ ok: true });
});

examinerRouter.post('/demo/refresh', (_req, res) => {
  transaction(() => run(`UPDATE sessions SET start_time = 0 WHERE simulated = 1 AND status = 'ACTIVE'`));
  seedIfNeeded();
  res.json({ ok: true });
});
