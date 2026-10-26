import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, cx, EmptyState, ErrorState, LoadingBlock, PageHeader, RiskBadge, SimulatedTag } from '../../components/ui';
import { fmtDateTime, fmtDuration } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { REVIEW_LABEL, statusLabel } from '../dashboard/components';
import { examinerApi } from '../telemetry/examinerApi';

export default function ReportsPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<'COMPLETED' | 'ALL'>('COMPLETED');
  const { data, error, loading, refresh } = usePolling((signal) => examinerApi.sessions({}, signal), 8000);
  if (loading && !data) return <LoadingBlock />;
  const sessions = (data?.sessions ?? []).filter((s) => scope === 'ALL' || s.status !== 'ACTIVE');

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports"
        subtitle="Final proctoring reports with event summary, timeline, examiner notes and review status."
        actions={
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(
              [
                ['COMPLETED', 'Completed'],
                ['ALL', 'All sessions'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setScope(k)} className={cx('rounded-lg px-3 py-1 text-xs font-semibold', scope === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      {error && <ErrorState message={error} onRetry={refresh} className="mb-4" />}
      <Card>
        {sessions.length === 0 ? (
          <EmptyState icon={<FileText className="size-6" />} title="No completed sessions yet" description="Reports become available when a student submits. Switch to “All sessions” for interim reports." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Student</th>
                  <th className="px-3 py-3">Exam</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3">Final risk</th>
                  <th className="px-3 py-3">Review</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{s.student.name}</p>
                      <p className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                        {s.student.studentId} {s.simulatedSession && <SimulatedTag label="Seeded" className="!py-0" />}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{s.exam.name}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{fmtDateTime(s.startTime)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{fmtDuration((s.endTime ?? Date.now()) - s.startTime)}</td>
                    <td className="px-3 py-3">
                      <span className="tabular mr-2 font-bold">{s.risk.score}</span>
                      <RiskBadge level={s.risk.level} />
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={REVIEW_LABEL[s.reviewStatus].tone}>{REVIEW_LABEL[s.reviewStatus].text}</Badge>
                      {s.status === 'ACTIVE' && <Badge tone={statusLabel(s).tone} className="ml-1">{statusLabel(s).text}</Badge>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/examiner/reports/${s.id}`)} icon={<FileText className="size-3.5" />}>
                        View report
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
