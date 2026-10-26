import {
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  ScanFace,
  Smartphone,
  UserX,
  Users,
  Video,
  VideoOff,
  XCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DEFAULT_RISK_CONFIG, EVENT_META, type RiskConfig } from '@shared/risk-engine';
import type { Alert, EventType, ProctoringEvent, ReviewStatus, RiskPoint, SessionReviewStatus, SessionSummary } from '@shared/types';
import { Badge, Button, cx, EmptyState, Initials, Modal, RISK_COLOR, RiskBadge, SeverityBadge, SimulatedTag, type Tone } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { fmtClock, fmtTime, pct, timeAgo } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';

export const EVENT_ICON: Record<EventType, ReactNode> = {
  LOOK_AWAY: <Eye className="size-4" />,
  PHONE_DETECTED: <Smartphone className="size-4" />,
  BOOK_DETECTED: <BookOpen className="size-4" />,
  PAPER_DETECTED: <FileText className="size-4" />,
  MULTIPLE_FACES: <Users className="size-4" />,
  FACE_MISSING: <ScanFace className="size-4" />,
  IDENTITY_MISMATCH: <UserX className="size-4" />,
  CAMERA_ISSUE: <Camera className="size-4" />,
  HEAD_MOVEMENT: <Eye className="size-4" />,
  NORMAL: <CheckCircle2 className="size-4" />,
};

export const REVIEW_LABEL: Record<SessionReviewStatus, { text: string; tone: Tone }> = {
  PENDING_REVIEW: { text: 'Pending review', tone: 'slate' },
  IN_REVIEW: { text: 'In review', tone: 'indigo' },
  CLEARED: { text: 'Cleared', tone: 'green' },
  ESCALATED: { text: 'Escalated', tone: 'red' },
};

export function statusLabel(s: SessionSummary): { text: string; tone: Tone } {
  if (s.status === 'ACTIVE') return s.online ? { text: 'Live', tone: 'green' } : { text: 'Offline', tone: 'amber' };
  return s.status === 'TIMED_OUT' ? { text: 'Timed out', tone: 'slate' } : { text: 'Submitted', tone: 'slate' };
}

export function faceText(s: SessionSummary) {
  const l = s.live;
  if (!l || s.status !== 'ACTIVE') return '—';
  return l.face === 'DETECTED' ? 'Detected' : l.face === 'MULTIPLE' ? `Multiple (${l.facesCount})` : l.face === 'NOT_DETECTED' ? 'Not visible' : 'Unknown';
}

export function identityText(s: SessionSummary) {
  const l = s.live;
  if (!l) return s.status === 'ACTIVE' ? 'Pending' : '—';
  return l.identity === 'VERIFIED' ? 'Verified' : l.identity === 'CHECK_REQUIRED' ? 'Review' : l.identity === 'PENDING' ? 'Checking' : 'Unavailable';
}

// ------------------------------------------------------------ session table

export function SessionTable({ sessions, empty }: { sessions: SessionSummary[]; empty?: string }) {
  const navigate = useNavigate();
  if (!sessions.length) return <EmptyState title={empty ?? 'No sessions match'} description="Try a different filter or search term." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-5 py-3">Student</th>
            <th className="px-3 py-3">Exam</th>
            <th className="px-3 py-3">Face</th>
            <th className="px-3 py-3">Identity</th>
            <th className="px-3 py-3">Risk score</th>
            <th className="px-3 py-3">Last event</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const st = statusLabel(s);
            const idText = identityText(s);
            return (
              <tr key={s.id} onClick={() => navigate(`/examiner/sessions/${s.id}`)} className="cursor-pointer border-b border-slate-50 transition hover:bg-indigo-50/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Initials name={s.student.name} />
                    <div>
                      <p className="font-semibold text-slate-900">{s.student.name}</p>
                      <p className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                        {s.student.studentId}
                        {s.simulatedSession && <SimulatedTag label="Seeded" className="!py-0 !text-[9px]" />}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-700">{s.exam.subject}</td>
                <td className="px-3 py-3">
                  <span className={cx('text-xs font-semibold', s.live?.face === 'DETECTED' ? 'text-emerald-600' : s.live && s.status === 'ACTIVE' ? 'text-rose-600' : 'text-slate-400')}>{faceText(s)}</span>
                </td>
                <td className="px-3 py-3">
                  <span className={cx('text-xs font-semibold', idText === 'Verified' ? 'text-emerald-600' : idText === 'Review' ? 'text-rose-600' : 'text-slate-400')}>{idText}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular w-7 text-right font-bold text-slate-900">{s.risk.score}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${s.risk.score}%`, background: RISK_COLOR[s.risk.level] }} />
                    </div>
                    <RiskBadge level={s.risk.level} />
                  </div>
                </td>
                <td className="max-w-[220px] px-3 py-3">
                  {s.lastEvent ? (
                    <>
                      <p className="truncate text-xs font-medium text-slate-700">{s.lastEvent.eventType === 'NORMAL' ? 'Normal' : EVENT_META[s.lastEvent.eventType].shortLabel}</p>
                      <p className="text-[11px] text-slate-400">{timeAgo(s.lastEvent.timestamp)}</p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={st.tone} dot>
                    {st.text}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-slate-300">
                  <ChevronRight className="size-4" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------ alerts

const PRIORITY: Record<string, { label: string; dot: string; bar: string }> = {
  CRITICAL: { label: '🔴 Critical — review required', dot: 'bg-rose-600', bar: 'border-l-rose-600' },
  HIGH: { label: '🔴 High priority', dot: 'bg-rose-500', bar: 'border-l-rose-500' },
  MEDIUM: { label: '🟠 Review required', dot: 'bg-orange-500', bar: 'border-l-orange-500' },
  LOW: { label: '🟡 Attention', dot: 'bg-amber-400', bar: 'border-l-amber-400' },
  INFO: { label: 'ℹ Info', dot: 'bg-sky-400', bar: 'border-l-sky-400' },
};

export function AlertItem({ alert, onOpen, actions }: { alert: Alert; onOpen: () => void; actions?: ReactNode }) {
  const p = PRIORITY[alert.event.severity];
  return (
    <div className={cx('rounded-xl border border-l-4 border-slate-200 bg-white p-3 transition hover:shadow-md', p.bar)}>
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{p.label}</span>
          <span className="font-mono text-[11px] text-slate-400">{fmtTime(alert.event.timestamp)}</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {alert.event.label} — <span className="font-mono text-indigo-600">{alert.session.studentId}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {alert.session.studentName} · {alert.session.examName}
          {alert.event.confidence != null && <span>· conf {pct(alert.event.confidence)}</span>}
          {alert.event.simulated && <SimulatedTag className="!py-0" />}
          {alert.event.reviewStatus !== 'PENDING' && <Badge tone={alert.event.reviewStatus === 'FALSE_POSITIVE' ? 'slate' : 'green'}>{alert.event.reviewStatus === 'FALSE_POSITIVE' ? 'False positive' : 'Reviewed'}</Badge>}
        </p>
      </button>
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------ risk chart

export function RiskChart({ points, height = 240, config = DEFAULT_RISK_CONFIG }: { points: RiskPoint[]; height?: number; config?: RiskConfig }) {
  const data = points.map((p) => ({ t: p.t, score: p.score }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef0f6" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t) => fmtClock(t)}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <ReferenceLine y={config.thresholds.medium} stroke={RISK_COLOR.MEDIUM} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: 'Medium', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
          <ReferenceLine y={config.thresholds.high} stroke={RISK_COLOR.HIGH} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: 'High', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
          <ReferenceLine y={config.thresholds.critical} stroke={RISK_COLOR.CRITICAL} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: 'Critical', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            labelFormatter={(t) => fmtTime(Number(t))}
            formatter={(v) => [`${v} / 100`, 'Risk score']}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} fill="url(#riskFill)" isAnimationActive={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ timeline

export function EventTimeline({
  events,
  onChanged,
  filter,
}: {
  events: ProctoringEvent[];
  onChanged: (e: ProctoringEvent) => void;
  filter: 'all' | 'flags' | 'pending';
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<ProctoringEvent | null>(null);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<ProctoringEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = [...events]
    .filter((e) => e.timestamp <= Date.now())
    .filter((e) => (filter === 'all' ? true : filter === 'flags' ? e.eventType !== 'NORMAL' : e.eventType !== 'NORMAL' && e.reviewStatus === 'PENDING'))
    .reverse();

  const review = async (e: ProctoringEvent, reviewStatus: ReviewStatus) => {
    setBusy(e.id);
    setError(null);
    try {
      const res = await examinerApi.updateEvent(e.id, { reviewStatus });
      onChanged(res.event);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    if (!noteFor) return;
    setBusy(noteFor.id);
    try {
      const res = await examinerApi.updateEvent(noteFor.id, { examinerNote: note });
      onChanged(res.event);
      setNoteFor(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!list.length) return <EmptyState title={filter === 'pending' ? 'Nothing left to review' : 'No events yet'} description="Events appear here as the session progresses." />;

  return (
    <>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[67px] before:top-2 before:w-px before:bg-slate-200">
        {list.map((e) => {
          const flag = e.eventType !== 'NORMAL';
          return (
            <li key={e.id} className={cx('relative flex gap-3 rounded-xl px-2 py-2.5', flag && e.reviewStatus === 'FALSE_POSITIVE' && 'opacity-60')}>
              <span className="w-[52px] shrink-0 pt-1 text-right font-mono text-[11px] text-slate-500">{fmtTime(e.timestamp)}</span>
              <span
                className={cx(
                  'relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-white',
                  !flag ? 'bg-sky-50 text-sky-600' : e.severity === 'CRITICAL' || e.severity === 'HIGH' ? 'bg-rose-100 text-rose-600' : e.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600',
                )}
              >
                {EVENT_ICON[e.eventType]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {flag && <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">{e.eventType.replace(/_/g, ' ')}</span>}
                  {flag && <SeverityBadge severity={e.severity} />}
                  {e.simulated && <SimulatedTag className="!py-0" />}
                  {flag && e.reviewStatus === 'REVIEWED' && <Badge tone="green">Reviewed</Badge>}
                  {flag && e.reviewStatus === 'FALSE_POSITIVE' && <Badge tone="slate">False positive · excluded</Badge>}
                </div>
                <p className={cx('text-sm', flag ? 'mt-0.5 font-medium text-slate-800' : 'text-slate-600')}>{e.label}</p>
                {flag && (
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    <span>Confidence: {pct(e.confidence)}</span>
                    <span className="font-semibold text-rose-600">Risk: +{e.riskContribution}</span>
                    {e.endedAt != null && e.endedAt > e.timestamp && <span>Duration: {((e.endedAt - e.timestamp) / 1000).toFixed(1)} s</span>}
                    {e.endedAt == null && <span className="font-semibold text-amber-600">Ongoing</span>}
                    <span>Source: {e.source}</span>
                    {typeof e.details.rule === 'string' && <span>Rule: {e.details.rule}</span>}
                  </p>
                )}
                {e.examinerNote && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-900">
                    <MessageSquare className="mt-0.5 size-3 shrink-0" /> {e.examinerNote}
                  </p>
                )}
                {flag && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.evidence && (
                      <Button size="sm" variant="secondary" onClick={() => setEvidence(e)} icon={<ImageIcon className="size-3.5" />}>
                        Evidence
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={e.reviewStatus === 'REVIEWED' ? 'success' : 'secondary'}
                      loading={busy === e.id}
                      onClick={() => review(e, e.reviewStatus === 'REVIEWED' ? 'PENDING' : 'REVIEWED')}
                      icon={<CheckCircle2 className="size-3.5" />}
                    >
                      {e.reviewStatus === 'REVIEWED' ? 'Reviewed' : 'Mark reviewed'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => review(e, e.reviewStatus === 'FALSE_POSITIVE' ? 'PENDING' : 'FALSE_POSITIVE')}
                      icon={<XCircle className="size-3.5" />}
                    >
                      {e.reviewStatus === 'FALSE_POSITIVE' ? 'Undo false positive' : 'False positive'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNoteFor(e);
                        setNote(e.examinerNote);
                      }}
                      icon={<MessageSquare className="size-3.5" />}
                    >
                      Note
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Modal
        open={!!noteFor}
        onClose={() => setNoteFor(null)}
        title="Examiner note"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteFor(null)}>
              Cancel
            </Button>
            <Button onClick={saveNote} loading={busy === noteFor?.id}>
              Save note
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-slate-600">{noteFor?.label}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="e.g. Student was reading a long question; head turn matches scrolling."
          className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
        />
      </Modal>

      <Modal open={!!evidence} onClose={() => setEvidence(null)} title="Evidence snapshot" wide>
        {evidence?.evidence && <img src={evidence.evidence} alt="Evidence frame captured when the event fired" className="w-full rounded-xl" />}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <b>{evidence?.label}</b> · {evidence && fmtTime(evidence.timestamp)} · confidence {pct(evidence?.confidence)}
          {evidence?.simulated && <SimulatedTag />}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Captured automatically when the flag fired (240 px, stored with the event). Evidence supports review; it does not prove misconduct.
        </p>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------ live preview

export function LivePreview({ session }: { session: SessionSummary }) {
  const enabled = session.status === 'ACTIVE' && !session.simulatedSession;
  const { data } = usePolling((signal) => (enabled ? examinerApi.frame(session.id, signal) : Promise.resolve({ frame: null, at: null })), 2000, [session.id, enabled]);
  const fresh = data?.frame && data.at && Date.now() - data.at < 15000;
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-950">
      {fresh ? (
        <>
          <img src={data!.frame!} alt="Low-resolution live preview of the candidate" className="size-full object-cover" />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
            <span className="size-1.5 animate-pulse-ring rounded-full bg-rose-500" /> LIVE · {timeAgo(data!.at!)}
          </span>
        </>
      ) : (
        <div className="grid size-full place-items-center p-4 text-center text-slate-400">
          {session.simulatedSession ? (
            <div>
              <Video className="mx-auto mb-2 size-8 text-violet-300" />
              <p className="text-sm font-semibold text-slate-200">Seeded demo session</p>
              <p className="text-xs">Simulated candidate — no camera feed exists.</p>
            </div>
          ) : session.status !== 'ACTIVE' ? (
            <div>
              <VideoOff className="mx-auto mb-2 size-8" />
              <p className="text-sm">Session ended — live preview is not recorded.</p>
            </div>
          ) : (
            <div>
              <VideoOff className="mx-auto mb-2 size-8" />
              <p className="text-sm">Waiting for preview frames…</p>
              <p className="text-xs">The candidate may have no camera or preview is disabled in Settings.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
