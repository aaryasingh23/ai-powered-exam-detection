import { ArrowLeft, Clock, FileText, Gauge, ListChecks, Save, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EVENT_META } from '@shared/risk-engine';
import type { EventType, ProctoringEvent, SessionReviewStatus } from '@shared/types';
import { Badge, Button, Card, CardHeader, cx, ErrorState, Initials, LoadingBlock, Notice, RiskBadge, SimulatedTag } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { fmtDateTime, fmtDuration } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { LiveStatusList } from '../proctoring/ProctorPanels';
import { RiskBreakdown, RiskGauge } from '../risk-engine/RiskWidgets';
import { examinerApi } from '../telemetry/examinerApi';
import { EventTimeline, LivePreview, REVIEW_LABEL, RiskChart, statusLabel } from './components';

const COUNT_TYPES: EventType[] = ['LOOK_AWAY', 'PHONE_DETECTED', 'BOOK_DETECTED', 'PAPER_DETECTED', 'MULTIPLE_FACES', 'FACE_MISSING', 'IDENTITY_MISMATCH', 'CAMERA_ISSUE', 'HEAD_MOVEMENT'];

export default function StudentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, refresh, setData } = usePolling((signal) => examinerApi.session(id, signal), 3000, [id]);
  const [filter, setFilter] = useState<'all' | 'flags' | 'pending'>('flags');
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const s = data?.session;
  useEffect(() => {
    if (s && notes == null) setNotes(s.examinerNotes);
  }, [s, notes]);

  if (loading && !s) return <LoadingBlock label="Loading proctoring detail…" />;
  if (!s)
    return (
      <div>
        <ErrorState message={error ?? 'Session not found.'} onRetry={refresh} />
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/examiner')} icon={<ArrowLeft className="size-4" />}>
          Back to dashboard
        </Button>
      </div>
    );

  const onEventChanged = (e: ProctoringEvent) => {
    setData((d) => (d ? { session: { ...d.session, events: d.session.events.map((x) => (x.id === e.id ? { ...e, evidence: x.evidence } : x)) } } : d));
    refresh();
  };

  const updateReview = async (body: { reviewStatus?: SessionReviewStatus; examinerNotes?: string }) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await examinerApi.updateSession(s.id, body);
      setData({ session: res.session });
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (err) {
      setSaveMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const flags = s.events.filter((e) => e.eventType !== 'NORMAL' && e.timestamp <= now);
  const counts = COUNT_TYPES.map((t) => ({ t, n: flags.filter((e) => e.eventType === t).length })).filter((c) => c.n > 0);
  const st = statusLabel(s);
  const elapsed = (s.endTime ?? now) - s.startTime;
  const pendingCount = flags.filter((e) => e.reviewStatus === 'PENDING').length;

  return (
    <div className="animate-fade-in">
      <Link to="/examiner" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Initials name={s.student.name} className="size-12 text-sm" />
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
              {s.student.name}
              <span className="font-mono text-base font-medium text-slate-400">{s.student.studentId}</span>
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {s.exam.name} · started {fmtDateTime(s.startTime)}
              <Badge tone={st.tone} dot>
                {st.text}
              </Badge>
              <Badge tone={REVIEW_LABEL[s.reviewStatus].tone}>{REVIEW_LABEL[s.reviewStatus].text}</Badge>
              {s.simulatedSession && <SimulatedTag label="Seeded demo session" />}
            </p>
          </div>
        </div>
        <Button onClick={() => navigate(`/examiner/reports/${s.id}`)} icon={<FileText className="size-4" />}>
          Generate report
        </Button>
      </div>

      {error && <ErrorState message={`Live refresh failed: ${error}`} className="mb-4" />}
      <Notice className="mb-5">
        Suspicious activity flags are indicators for <b>examiner review</b>. They are not proof of misconduct — please review evidence and context before any decision.
      </Notice>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr_1fr]">
        <Card className="p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Live camera preview</p>
          <LivePreview session={s} />
          <div className="mt-4">
            <LiveStatusList live={s.status === 'ACTIVE' ? s.live : null} detailed />
            {s.status !== 'ACTIVE' && <p className="text-sm text-slate-400">Session ended — live status no longer updates.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Gauge className="size-3.5" /> Risk score
          </p>
          <RiskGauge score={s.risk.score} level={s.risk.level} size={210} />
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Why this score</p>
            <RiskBreakdown risk={s.risk} />
          </div>
          {s.riskResetAt && <p className="mt-3 text-[11px] text-violet-600">Risk was reset from the demo panel at {fmtDateTime(s.riskResetAt)}.</p>}
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Session</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Duration', <span className="flex items-center gap-1"><Clock className="size-3.5 text-slate-400" />{fmtDuration(elapsed)}</span>],
              ['Time limit', `${s.durationMinutes} min`],
              ['Warnings', <span className="font-bold text-rose-600">{s.warnings}</span>],
              ['Pending review', pendingCount],
              ['Answered', `${s.answeredCount}/${s.questionCount}`],
              ['Exam score', s.examScore == null ? 'After submission' : `${s.examScore}%`],
              ['Identity', s.live?.identity === 'CHECK_REQUIRED' ? <span className="text-rose-600">Review</span> : s.live?.identity === 'VERIFIED' ? <span className="text-emerald-600">Verified</span> : '—'],
              ['Risk level', <RiskBadge level={s.risk.level} />],
            ].map(([k, v], i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] text-slate-500">{k}</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Flags by type</p>
          {counts.length ? (
            <div className="flex flex-wrap gap-1.5">
              {counts.map((c) => (
                <Badge key={c.t} tone="slate">
                  {EVENT_META[c.t].shortLabel}: {c.n}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No flags raised.</p>
          )}
          {s.live && s.status === 'ACTIVE' && s.live.objects.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-rose-600">
              <TriangleAlert className="size-4" /> Detected objects: {s.live.objects.join(', ')}
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Risk score over time" subtitle="Re-computed from the event history with the current scoring rules" icon={<Gauge className="size-4" />} />
        <div className="p-4">
          <RiskChart points={s.riskHistory} height={260} />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <ListChecks className="size-4" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">Event timeline</h3>
                <p className="text-xs text-slate-500">Timestamp · type · confidence · risk contribution</p>
              </div>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(
                [
                  ['flags', 'Flags'],
                  ['pending', `Pending (${pendingCount})`],
                  ['all', 'Everything'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold', filter === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[640px] overflow-y-auto p-4">
            <EventTimeline events={s.events} filter={filter} onChanged={onEventChanged} />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Human review" subtitle="The examiner makes the final decision" icon={<ShieldCheck className="size-4" />} />
          <div className="space-y-4 p-5">
            <div>
              <p className="mb-2 text-[13px] font-semibold text-slate-700">Session review status</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(REVIEW_LABEL) as SessionReviewStatus[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => updateReview({ reviewStatus: k })}
                    disabled={saving}
                    className={cx(
                      'rounded-xl border px-3 py-2 text-xs font-semibold transition',
                      s.reviewStatus === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {REVIEW_LABEL[k].text}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-slate-700">Examiner notes</p>
              <textarea
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                maxLength={4000}
                placeholder="Context, follow-up actions, decision rationale…"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className={cx('text-xs', saveMsg === 'Saved' ? 'text-emerald-600' : 'text-rose-600')}>{saveMsg}</span>
                <Button size="sm" onClick={() => updateReview({ examinerNotes: notes ?? '' })} loading={saving} icon={<Save className="size-3.5" />}>
                  Save notes
                </Button>
              </div>
            </div>
            <Notice tone="warning">
              <span className="flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="size-4" /> Fair review checklist
              </span>
              Check evidence snapshots, durations and confidence. Mark wrong detections as <b>false positive</b> — they are then excluded from the risk score.
            </Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
