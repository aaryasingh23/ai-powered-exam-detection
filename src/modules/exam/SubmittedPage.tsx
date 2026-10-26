import { CheckCircle2, ExternalLink, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SessionSummary } from '@shared/types';
import { Button, Card, LoadingBlock, Notice } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime, fmtDuration } from '../../lib/format';
import { useAuth } from '../auth/authStore';
import type { StudentSessionState } from '../telemetry/telemetryClient';
import { StudentShell } from './StudentShell';

interface SubmitResult {
  session: StudentSessionState;
  summary?: SessionSummary;
  answered?: number;
  total?: number;
}

export default function SubmittedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { exam, logout } = useAuth();
  const [data, setData] = useState<SubmitResult | null>((location.state as SubmitResult) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (data) return;
    api<{ session: StudentSessionState | null }>('/student/session')
      .then((r) => (r.session ? setData({ session: r.session, answered: Object.keys(r.session.answers).length, total: exam?.questions.length }) : setError(true)))
      .catch(() => setError(true));
  }, [data, exam]);

  if (!data && !error) return <LoadingBlock label="Loading your submission…" />;
  const s = data?.session;
  const timedOut = s?.status === 'TIMED_OUT';

  return (
    <StudentShell step={5}>
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-8 py-10 text-center text-white">
            <CheckCircle2 className="mx-auto size-14" />
            <h1 className="mt-3 text-2xl font-bold">{timedOut ? 'Time is up — exam auto-submitted' : 'Exam submitted successfully'}</h1>
            <p className="mt-1 text-sm text-emerald-50">{exam?.name}</p>
          </div>
          {s ? (
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
              <div className="p-5">
                <p className="text-2xl font-bold text-slate-900">
                  {data?.answered ?? Object.keys(s.answers).length}/{data?.total ?? exam?.questions.length}
                </p>
                <p className="text-xs text-slate-500">Questions answered</p>
              </div>
              <div className="p-5">
                <p className="text-2xl font-bold text-slate-900">{s.endTime ? fmtDuration(s.endTime - s.startTime) : '—'}</p>
                <p className="text-xs text-slate-500">Time taken</p>
              </div>
              <div className="p-5">
                <p className="text-sm font-bold text-slate-900">{s.endTime ? fmtDateTime(s.endTime) : '—'}</p>
                <p className="text-xs text-slate-500">Submitted at</p>
              </div>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">No submission found for this login.</p>
          )}
          <div className="space-y-4 p-6">
            <Notice>
              <span className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-4" /> Proctoring has stopped and your camera is off.
              </span>
              Any flags raised during the exam will be reviewed by an examiner. Flags are not decisions — if anything needs
              clarification, the examination office will contact you.
            </Notice>
            <div className="flex flex-wrap justify-between gap-2">
              <a
                href={s ? `/examiner/sessions/${s.id}` : '/examiner'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
              >
                <ExternalLink className="size-4" /> Presenter: open examiner view
              </a>
              <Button
                variant="secondary"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                icon={<LogOut className="size-4" />}
              >
                Sign out
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </StudentShell>
  );
}
