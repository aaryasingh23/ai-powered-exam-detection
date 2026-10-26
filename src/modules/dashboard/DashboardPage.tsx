import { Activity, AlertOctagon, AlertTriangle, Bell, CheckCircle2, Search, ShieldAlert, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RiskLevel } from '@shared/types';
import { Card, CardHeader, cx, EmptyState, ErrorState, Input, LoadingBlock, PageHeader, StatCard } from '../../components/ui';
import { fmtClock, fmtTime } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';
import { AlertItem, SessionTable } from './components';

const FILTERS: (RiskLevel | 'ALL')[] = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, error, loading, refresh } = usePolling((signal) => examinerApi.overview(signal), 3000);
  const [risk, setRisk] = useState<RiskLevel | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');

  const sessions = useMemo(() => {
    let list = data?.sessions ?? [];
    if (scope === 'ACTIVE') list = list.filter((s) => s.status === 'ACTIVE');
    if (risk !== 'ALL') list = list.filter((s) => s.risk.level === risk);
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((s) => [s.student.name, s.student.studentId, s.exam.name].some((v) => v.toLowerCase().includes(term)));
    return [...list].sort((a, b) => b.risk.score - a.risk.score);
  }, [data, risk, q, scope]);

  if (loading && !data) return <LoadingBlock label="Connecting to live telemetry…" />;

  const t = data?.totals;
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Live Telemetry Analytics"
        subtitle={
          <span className="flex items-center gap-2">
            <span className="size-2 animate-pulse-ring rounded-full bg-emerald-500" /> Streaming from {t?.active ?? 0} active sessions · updated {fmtTime(Date.now())}
          </span>
        }
      />
      {error && <ErrorState message={error} onRetry={refresh} className="mb-4" />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total active students" value={t?.active ?? 0} icon={<Users className="size-5" />} onClick={() => { setScope('ACTIVE'); setRisk('ALL'); }} active={scope === 'ACTIVE' && risk === 'ALL'} />
        <StatCard label="Low risk" value={t?.low ?? 0} tone="green" icon={<CheckCircle2 className="size-5" />} onClick={() => setRisk('LOW')} active={risk === 'LOW'} />
        <StatCard label="Medium risk" value={t?.medium ?? 0} tone="amber" icon={<AlertTriangle className="size-5" />} onClick={() => setRisk('MEDIUM')} active={risk === 'MEDIUM'} />
        <StatCard label="High risk" value={t?.high ?? 0} tone="orange" icon={<ShieldAlert className="size-5" />} onClick={() => setRisk('HIGH')} active={risk === 'HIGH'} />
        <StatCard label="Critical / review" value={t?.critical ?? 0} tone="red" icon={<AlertOctagon className="size-5" />} onClick={() => setRisk('CRITICAL')} active={risk === 'CRITICAL'} />
        <StatCard label="Flags pending review" value={t?.pendingReview ?? 0} tone="violet" icon={<Bell className="size-5" />} onClick={() => navigate('/examiner/alerts')} hint={`${t?.completed ?? 0} completed sessions`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Fleet risk over the last 30 minutes" subtitle="Average and highest score across active sessions" icon={<Activity className="size-4" />} />
          <div className="p-4">
            <div className="mb-2 flex gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-indigo-600" /> Average risk</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-rose-500" /> Highest risk</span>
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.riskTrend ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#eef0f6" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtClock} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(v) => fmtClock(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Line type="monotone" dataKey="avg" name="Average risk" stroke="#4f46e5" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="max" name="Highest risk" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Live alerts"
            subtitle="Flags for review — not accusations"
            icon={<Bell className="size-4" />}
            action={
              <button onClick={() => navigate('/examiner/alerts')} className="text-xs font-semibold text-indigo-600 hover:underline">
                View all
              </button>
            }
          />
          <div className="max-h-[310px] flex-1 space-y-2 overflow-y-auto p-4">
            {data?.alerts.length ? (
              data.alerts.map((a) => <AlertItem key={a.event.id} alert={a} onOpen={() => navigate(`/examiner/sessions/${a.session.id}`)} />)
            ) : (
              <EmptyState title="No alerts" description="Flags will appear here in real time." />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Live student monitoring</h3>
            <p className="text-xs text-slate-500">Click a student to open their proctoring detail</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID, exam" icon={<Search className="size-4" />} className="h-9" />
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setRisk(f)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold transition', risk === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(['ACTIVE', 'ALL'] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold transition', scope === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  {s === 'ACTIVE' ? 'Active' : 'All sessions'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <SessionTable sessions={sessions} />
      </Card>
    </div>
  );
}
