import { AlertCircle, ArrowLeft, ArrowRight, Bookmark, BrainCircuit, Clock, Eye, Flag, Mic, PanelRightOpen, Send, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, cx, ErrorState, LoadingBlock, Logo, Modal, Notice, ProgressBar, RISK_COLOR, RiskBadge } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { fmtCountdown } from '../../lib/format';
import { useAuth } from '../auth/authStore';
import { CameraPanel, DemoControlPanel, EventFeed, LiveStatusList, ModelStatus } from '../proctoring/ProctorPanels';
import { useProctoringSession } from '../proctoring/useProctoringSession';
import { RiskBreakdown, RiskGauge, RiskScaleLegend } from '../risk-engine/RiskWidgets';
import type { StudentSessionState } from '../telemetry/telemetryClient';

function readPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* storage unavailable — preference just isn't remembered */
  }
}

export default function ExamPage() {
  const navigate = useNavigate();
  const { exam, student, systemCheck } = useAuth();
  const [bootError, setBootError] = useState<{ code: string; message: string } | null>(null);
  const [initial, setInitial] = useState<StudentSessionState | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const [newAttempt, setNewAttempt] = useState(false);

  // Start (or resume) the exam session on the server.
  useEffect(() => {
    let cancelled = false;
    setBootError(null);
    api<{ session: StudentSessionState }>('/student/session/start', { body: { newAttempt } })
      .then((r) => !cancelled && setInitial(r.session))
      .catch((err) => !cancelled && setBootError({ code: err instanceof ApiError ? err.code : 'UNKNOWN', message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [attemptKey, newAttempt]);

  if (bootError) {
    return (
      <div className="bg-mesh grid min-h-full place-items-center p-6">
        <Card className="max-w-md p-6 text-center">
          <AlertCircle className="mx-auto size-10 text-amber-500" />
          <h2 className="mt-3 text-lg font-semibold">{bootError.code === 'ALREADY_SUBMITTED' ? 'Exam already submitted' : 'Could not start the exam'}</h2>
          <p className="mt-1 text-sm text-slate-500">{bootError.message}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {bootError.code === 'ALREADY_SUBMITTED' ? (
              <>
                <Button variant="secondary" onClick={() => navigate('/exam/submitted')}>
                  View submission
                </Button>
                <Button onClick={() => setNewAttempt(true)}>Start a new demo attempt</Button>
              </>
            ) : (
              <Button onClick={() => setAttemptKey((k) => k + 1)}>Retry</Button>
            )}
          </div>
        </Card>
      </div>
    );
  }
  if (!initial || !exam || !student) return <LoadingBlock label="Preparing your secure exam session…" />;
  return <ExamRoom key={initial.id} initial={initial} cameraWanted={!systemCheck?.demoWithoutCamera} />;
}

function ExamRoom({ initial, cameraWanted }: { initial: StudentSessionState; cameraWanted: boolean }) {
  const navigate = useNavigate();
  const { exam, student } = useAuth();
  const questions = exam!.questions;
  const [answers, setAnswers] = useState<Record<string, number>>(initial.answers);
  const [marked, setMarked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(`marked-${initial.id}`) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const [index, setIndex] = useState(0);
  const [presenter, setPresenter] = useState(() => readPref('presenter-view', true));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const deadline = useRef(Date.now() + initial.remainingMs);
  const [now, setNow] = useState(Date.now());
  const submittedRef = useRef(false);

  const onClosed = useCallback(() => navigate('/exam/submitted', { replace: true }), [navigate]);
  const p = useProctoringSession(initial.id, { cameraWanted, onClosed });
  const session = p.session ?? initial;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (p.session) deadline.current = Date.now() + p.session.remainingMs;
  }, [p.session]);

  // Debounced autosave of answers.
  useEffect(() => {
    if (submittedRef.current) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      api(`/student/session/${initial.id}/answers`, { method: 'PUT', body: { answers } })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 700);
    return () => clearTimeout(t);
  }, [answers, initial.id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`marked-${initial.id}`, JSON.stringify([...marked]));
    } catch {
      /* ignore */
    }
  }, [marked, initial.id]);

  const submit = useCallback(
    async (reason: 'submitted' | 'timeout') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await p.finish();
        const res = await api(`/student/session/${initial.id}/submit`, { body: { answers, reason } });
        navigate('/exam/submitted', { replace: true, state: res });
      } catch (err) {
        submittedRef.current = false;
        setSubmitError(errorMessage(err));
        setSubmitting(false);
      }
    },
    [answers, initial.id, navigate, p],
  );

  const remaining = Math.max(0, deadline.current - now);
  useEffect(() => {
    if (remaining <= 0 && !submittedRef.current) submit('timeout');
  }, [remaining, submit]);

  const togglePresenter = () => {
    setPresenter((v) => {
      writePref('presenter-view', !v);
      return !v;
    });
  };

  const q = questions[index];
  const answeredCount = Object.keys(answers).length;
  const risk = session.risk;
  const live = p.engineState?.live ?? null;
  const lowTime = remaining < 5 * 60_000;
  const unansweredMarked = useMemo(() => [...marked].filter((id) => answers[id] == null).length, [marked, answers]);

  return (
    <div className="min-h-full bg-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4">
          <Logo compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{exam!.name}</p>
            <p className="truncate text-xs text-slate-500">
              {student!.name} · {student!.studentId} · AI Exam Proctor Guard
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              <span className="size-2 animate-pulse-ring rounded-full bg-emerald-500" /> AI Proctoring Active
            </span>
            <Badge tone={live?.camera === 'ACTIVE' ? 'green' : 'red'}>Camera: {live?.camera === 'ACTIVE' ? 'Active' : 'Check camera'}</Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1" style={{ color: RISK_COLOR[risk.level], borderColor: RISK_COLOR[risk.level] }}>
              Risk: {risk.level}
            </span>
            {p.online ? <Wifi className="size-4 text-emerald-500" /> : <WifiOff className="size-4 text-rose-500" />}
          </div>
          <div className={cx('tabular flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-lg font-bold', lowTime ? 'bg-rose-50 text-rose-600' : 'bg-slate-900 text-white')}>
            <Clock className="size-4" /> {fmtCountdown(remaining)}
          </div>
          <button
            onClick={togglePresenter}
            className={cx('hidden rounded-xl p-2.5 ring-1 sm:block', presenter ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-white text-slate-500 ring-slate-200')}
            title="Presenter view: show detailed AI telemetry and demo controls"
            aria-label="Toggle presenter view"
          >
            <PanelRightOpen className="size-4" />
          </button>
        </div>
      </header>

      {!p.online && (
        <div className="bg-rose-600 px-4 py-2 text-center text-xs font-semibold text-white">
          Connection to the exam server lost — your answers and proctoring events are kept and will sync automatically.
        </div>
      )}

      <div className="mx-auto grid max-w-[1500px] gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Question column */}
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="indigo">
                  Question {index + 1} of {questions.length}
                </Badge>
                <Badge>{q.topic}</Badge>
                {marked.has(q.id) && (
                  <Badge tone="amber">
                    <Bookmark className="size-3" /> Marked for review
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-500">
                {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed — retrying on next change' : 'All answers saved'}
              </span>
            </div>
            <h2 className="mt-5 text-lg font-semibold leading-relaxed text-slate-900">{q.text}</h2>
            <div className="mt-5 space-y-2.5">
              {q.options.map((opt, i) => {
                const selected = answers[q.id] === i;
                return (
                  <button
                    key={i}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition',
                      selected ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold', selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-5">
              <div className="flex gap-2">
                <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} icon={<ArrowLeft className="size-4" />}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setMarked((m) => {
                      const n = new Set(m);
                      if (n.has(q.id)) n.delete(q.id);
                      else n.add(q.id);
                      return n;
                    })
                  }
                  icon={<Flag className={cx('size-4', marked.has(q.id) && 'fill-amber-400 text-amber-500')} />}
                >
                  {marked.has(q.id) ? 'Unmark' : 'Mark for Review'}
                </Button>
              </div>
              <div className="flex gap-2">
                {index < questions.length - 1 ? (
                  <Button onClick={() => setIndex((i) => i + 1)} icon={<ArrowRight className="size-4" />}>
                    Next
                  </Button>
                ) : null}
                <Button variant="success" onClick={() => setConfirmOpen(true)} icon={<Send className="size-4" />}>
                  Submit Exam
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Question palette</p>
              <p className="text-xs text-slate-500">
                {answeredCount}/{questions.length} answered
              </p>
            </div>
            <ProgressBar value={(answeredCount / questions.length) * 100} className="mt-2" />
            <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {questions.map((qq, i) => (
                <button
                  key={qq.id}
                  onClick={() => setIndex(i)}
                  className={cx(
                    'relative h-10 rounded-lg text-sm font-semibold ring-1 transition',
                    i === index && 'ring-2 ring-indigo-500',
                    answers[qq.id] != null ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {i + 1}
                  {marked.has(qq.id) && <span className="absolute -right-1 -top-1 size-3 rounded-full bg-amber-400 ring-2 ring-white" />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-indigo-600" /> Answered</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-white ring-1 ring-slate-300" /> Not answered</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-amber-400" /> Marked for review</span>
            </div>
          </Card>

          <Notice>
            <b>Privacy:</b> Your camera is used for examination integrity and identity verification. AI runs in your browser; only
            flags, a small evidence snapshot for serious flags and a low-resolution live preview reach the examiner. Nothing is
            decided automatically — an examiner reviews every flag.
          </Notice>
        </div>

        {/* Proctor column */}
        <div className="space-y-4">
          <CameraPanel
            videoRef={p.camera.videoRef}
            state={p.engineState}
            cameraStatus={cameraWanted ? p.camera.status : 'idle'}
            cameraError={p.camera.error?.message ?? null}
            onRetry={p.camera.retry}
            showOverlays={presenter}
          />

          <div className={cx('grid gap-4', presenter ? 'md:grid-cols-2' : 'md:grid-cols-[1.2fr_1fr]')}>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Live status</p>
                {live?.microphone === 'ACTIVE' && (
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Mic className="size-3" />
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full bg-emerald-500 transition-all" style={{ width: `${p.micLevel * 100}%` }} />
                    </span>
                  </span>
                )}
              </div>
              <LiveStatusList live={live} detailed={presenter} />
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{presenter ? 'Risk score' : 'Proctoring'}</p>
              {presenter ? (
                <>
                  <RiskGauge score={risk.score} level={risk.level} />
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Why this score</p>
                    <RiskBreakdown risk={risk} />
                  </div>
                </>
              ) : (
                <div className="space-y-3 py-2">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="size-8 text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">AI proctoring is active</p>
                      <p className="text-xs text-slate-500">Unusual activity is flagged for examiner review.</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">Risk</span>
                    <RiskBadge level={risk.level} />
                  </div>
                </div>
              )}
            </Card>
          </div>

          {presenter && (
            <>
              <DemoControlPanel onSimulate={p.simulate} onReset={p.resetRisk} onRecalibrate={p.recalibrate} active={p.engineState?.simulations ?? []} />
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Event log</p>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Eye className="size-3" /> {Object.values(p.engineState?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)} flags
                    </span>
                  </div>
                  <EventFeed items={p.feed} />
                </Card>
                <Card className="space-y-4 p-4">
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <BrainCircuit className="size-3.5" /> AI models
                    </p>
                    <ModelStatus state={p.engineState} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Risk scale</p>
                    <RiskScaleLegend config={p.config} />
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="Submit exam?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Keep working
            </Button>
            <Button variant="success" loading={submitting} onClick={() => submit('submitted')} icon={<Send className="size-4" />}>
              Submit now
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-2xl font-bold text-emerald-700">{answeredCount}</p>
            <p className="text-xs text-emerald-800">Answered</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-2xl font-bold text-slate-700">{questions.length - answeredCount}</p>
            <p className="text-xs text-slate-600">Unanswered</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-2xl font-bold text-amber-700">{marked.size}</p>
            <p className="text-xs text-amber-800">Marked</p>
          </div>
        </div>
        {unansweredMarked > 0 && <p className="mt-3 text-sm text-amber-700">{unansweredMarked} marked question(s) are still unanswered.</p>}
        <p className="mt-3 text-sm text-slate-600">After submitting you cannot change your answers. Proctoring stops when you submit.</p>
        {submitError && <ErrorState message={submitError} className="mt-3" />}
      </Modal>
    </div>
  );
}
