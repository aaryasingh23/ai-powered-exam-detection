import { Eye, MonitorPlay, ScanFace, Smartphone, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionSummary } from '@shared/types';
import { Badge, Card, cx, EmptyState, ErrorState, Initials, LoadingBlock, PageHeader, RISK_COLOR, RiskBadge, SimulatedTag } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';
import { faceText, identityText, LivePreview, statusLabel } from './components';

function Tile({ s }: { s: SessionSummary }) {
  const navigate = useNavigate();
  const st = statusLabel(s);
  const l = s.live;
  const alerting = s.risk.level === 'HIGH' || s.risk.level === 'CRITICAL';
  return (
    <button
      onClick={() => navigate(`/examiner/sessions/${s.id}`)}
      className={cx('group overflow-hidden rounded-2xl border bg-white text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg', alerting ? 'border-rose-200' : 'border-slate-200/80')}
    >
      <div className="h-1" style={{ background: RISK_COLOR[s.risk.level] }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Initials name={s.student.name} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{s.student.name}</p>
              <p className="truncate text-xs text-slate-500">
                {s.student.studentId} · {s.exam.subject}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="tabular text-2xl font-extrabold leading-none" style={{ color: RISK_COLOR[s.risk.level] }}>
              {s.risk.score}
            </p>
            <p className="text-[10px] text-slate-400">/ 100</p>
          </div>
        </div>
        {!s.simulatedSession && (
          <div className="mt-3">
            <LivePreview session={s} />
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-slate-600">
            <ScanFace className="size-3.5" /> {faceText(s)}
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-slate-600">
            <Users className="size-3.5" /> ID: {identityText(s)}
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-slate-600">
            <Eye className="size-3.5" /> {l ? (l.gaze === 'CENTER' ? 'Gaze normal' : l.gaze === 'UNKNOWN' ? 'Gaze unknown' : `Looking ${l.gaze.toLowerCase()}`) : '—'}
          </span>
          <span className={cx('flex items-center gap-1.5 rounded-lg px-2 py-1.5', l?.objects.length ? 'bg-rose-50 font-semibold text-rose-700' : 'bg-slate-50 text-slate-600')}>
            <Smartphone className="size-3.5" /> {l?.objects.length ? l.objects.join(', ') : 'No objects'}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <RiskBadge level={s.risk.level} />
            <Badge tone={st.tone} dot>
              {st.text}
            </Badge>
          </div>
          {s.simulatedSession && <SimulatedTag label="Seeded" />}
        </div>
        <p className="mt-2 truncate text-xs text-slate-500">
          {s.lastEvent ? `${s.lastEvent.label} · ${timeAgo(s.lastEvent.timestamp)}` : 'No events yet'}
        </p>
      </div>
    </button>
  );
}

export default function LiveMonitoringPage() {
  const { data, error, loading, refresh } = usePolling((signal) => examinerApi.sessions({ status: 'ACTIVE' }, signal), 3000);
  const [sort, setSort] = useState<'risk' | 'name'>('risk');
  if (loading && !data) return <LoadingBlock />;
  const sessions = [...(data?.sessions ?? [])].sort((a, b) => (sort === 'risk' ? b.risk.score - a.risk.score : a.student.name.localeCompare(b.student.name)));
  const real = sessions.filter((s) => !s.simulatedSession);
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Live Monitoring"
        subtitle={`${sessions.length} active sessions · ${real.length} real candidate(s) with live preview`}
        actions={
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(['risk', 'name'] as const).map((k) => (
              <button key={k} onClick={() => setSort(k)} className={cx('rounded-lg px-3 py-1 text-xs font-semibold', sort === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                Sort by {k}
              </button>
            ))}
          </div>
        }
      />
      {error && <ErrorState message={error} onRetry={refresh} className="mb-4" />}
      {sessions.length === 0 ? (
        <Card>
          <EmptyState icon={<MonitorPlay className="size-6" />} title="No active sessions" description="Sessions appear here as soon as a student starts an exam." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sessions.map((s) => (
            <Tile key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
