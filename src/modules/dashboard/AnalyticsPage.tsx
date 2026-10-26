import { BarChart3, CheckCircle2, PieChart as PieIcon, ShieldAlert, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EVENT_META } from '@shared/risk-engine';
import { Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, RISK_COLOR, RiskBadge, StatCard } from '../../components/ui';
import { fmtClock, pct } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 };
const axis = { tick: { fontSize: 11, fill: '#94a3b8' }, axisLine: false, tickLine: false } as const;

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { data, error, loading, refresh } = usePolling((signal) => examinerApi.analytics(signal), 6000);
  if (loading && !data) return <LoadingBlock label="Crunching risk analytics…" />;
  if (!data) return <ErrorState message={error ?? 'No data'} onRetry={refresh} />;

  const totalFlags = data.byType.reduce((a, b) => a + b.count, 0);
  const types = data.byType.map((t) => ({ ...t, label: EVENT_META[t.eventType].shortLabel }));
  const highRisk = data.distribution.filter((d) => d.level === 'HIGH' || d.level === 'CRITICAL').reduce((a, b) => a + b.count, 0);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Risk Analytics" subtitle="Aggregated telemetry across all exam sessions (live and completed)." />
      {error && <ErrorState message={error} onRetry={refresh} className="mb-4" />}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total flags raised" value={totalFlags} icon={<BarChart3 className="size-5" />} />
        <StatCard label="High / critical sessions" value={highRisk} tone="red" icon={<ShieldAlert className="size-5" />} />
        <StatCard label="Flags reviewed" value={data.review.reviewed} tone="green" icon={<CheckCircle2 className="size-5" />} />
        <StatCard label="False-positive rate" value={`${data.review.falsePositiveRate}%`} tone="violet" icon={<Timer className="size-5" />} hint={`${data.review.falsePositives} marked false positive`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Sessions by risk level" subtitle="Current score of every session" icon={<PieIcon className="size-4" />} />
          <div className="h-[260px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="level" {...axis} tickFormatter={(l) => l[0] + l.slice(1).toLowerCase()} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'Sessions']} />
                <Bar isAnimationActive={false} dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {data.distribution.map((d) => (
                    <Cell key={d.level} fill={RISK_COLOR[d.level]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Flags by type" subtitle="How often each detector fired" icon={<BarChart3 className="size-4" />} />
          <div className="h-[260px] p-4">
            {types.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={types} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 24 }}>
                  <CartesianGrid stroke="#eef0f6" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axis} />
                  <YAxis type="category" dataKey="label" width={96} {...axis} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: '#f1f5f9' }}
                    formatter={(v, _n, item) => [`${v} (avg conf ${pct((item.payload as { avgConfidence: number | null }).avgConfidence)})`, 'Flags']}
                  />
                  <Bar isAnimationActive={false} dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No flags yet" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Flags over the last 3 hours" subtitle="10-minute buckets" icon={<Timer className="size-4" />} />
          <div className="h-[240px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.eventsOverTime} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtClock} {...axis} minTickGap={40} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtClock(Number(v))} formatter={(v) => [v, 'Flags']} />
                <Area type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} fill="#7c3aed" fillOpacity={0.12} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Risk score distribution" subtitle="Number of sessions per 10-point band" icon={<BarChart3 className="size-4" />} />
          <div className="h-[240px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.buckets} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="range" {...axis} interval={0} fontSize={10} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'Sessions']} />
                <Bar isAnimationActive={false} dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="By exam" subtitle="Average risk and flagged sessions" />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5">Exam</th>
                <th className="px-3 py-2.5 text-right">Sessions</th>
                <th className="px-3 py-2.5 text-right">Avg risk</th>
                <th className="px-5 py-2.5 text-right">High / critical</th>
              </tr>
            </thead>
            <tbody>
              {data.byExam.map((e) => (
                <tr key={e.code} className="border-b border-slate-50">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-slate-800">{e.exam}</p>
                    <p className="font-mono text-xs text-slate-400">{e.code}</p>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{e.sessions}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{e.avgRisk}</td>
                  <td className="tabular px-5 py-2.5 text-right">{e.flagged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title="Highest-risk sessions" subtitle="Prioritise these for review" />
          <ul className="divide-y divide-slate-50">
            {data.topSessions.map((s) => (
              <li key={s.id}>
                <button onClick={() => navigate(`/examiner/sessions/${s.id}`)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-800">{s.student.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.student.studentId} · {s.exam.subject} · {s.warnings} flags
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular font-bold text-slate-900">{s.risk.score}</span>
                    <RiskBadge level={s.risk.level} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Includes {data.byType.reduce((a, b) => a + b.simulated, 0)} simulated flags from seeded demo sessions and the demo control panel.
      </p>
    </div>
  );
}
