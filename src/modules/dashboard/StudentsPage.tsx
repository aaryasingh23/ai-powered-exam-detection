import { Search, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RiskLevel } from '@shared/types';
import { Badge, Card, cx, EmptyState, ErrorState, Initials, Input, LoadingBlock, PageHeader, SimulatedTag } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';
import { SessionTable } from './components';

const VERIFICATION_TONE = { UNREGISTERED: 'slate', REGISTERED: 'indigo', VERIFIED: 'green', REVIEW: 'red' } as const;

export default function StudentsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'sessions' | 'registry'>('sessions');
  const [q, setQ] = useState('');
  const [risk, setRisk] = useState<RiskLevel | ''>('');
  const [status, setStatus] = useState('');
  const sessions = usePolling((signal) => examinerApi.sessions({ q, risk, status }, signal), 4000, [q, risk, status]);
  const registry = usePolling((signal) => examinerApi.students(signal), 10000);

  const students = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (registry.data?.students ?? []).filter((s) => !term || [s.name, s.studentId, s.email].some((v) => v.toLowerCase().includes(term)));
  }, [registry.data, q]);

  const select = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400';

  return (
    <div className="animate-fade-in">
      <PageHeader title="Students" subtitle="Search candidates, filter by risk level and open any session." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(
              [
                ['sessions', 'Exam sessions'],
                ['registry', 'Student registry'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold', tab === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-w-[220px] flex-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, Student ID, exam or email" icon={<Search className="size-4" />} className="h-10" />
          </div>
          {tab === 'sessions' && (
            <>
              <select value={risk} onChange={(e) => setRisk(e.target.value as RiskLevel | '')} className={select} aria-label="Risk filter">
                <option value="">All risk levels</option>
                <option value="LOW">Low risk</option>
                <option value="MEDIUM">Medium risk</option>
                <option value="HIGH">High risk</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={select} aria-label="Status filter">
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="TIMED_OUT">Timed out</option>
              </select>
            </>
          )}
        </div>
        {tab === 'sessions' ? (
          sessions.loading && !sessions.data ? (
            <LoadingBlock />
          ) : (
            <>
              {sessions.error && <ErrorState message={sessions.error} onRetry={sessions.refresh} className="m-4" />}
              <SessionTable sessions={sessions.data?.sessions ?? []} />
            </>
          )
        ) : registry.loading && !registry.data ? (
          <LoadingBlock />
        ) : students.length === 0 ? (
          <EmptyState title="No students found" icon={<UserCheck className="size-6" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Student</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Face reference</th>
                  <th className="px-3 py-3">Verification</th>
                  <th className="px-3 py-3">Sessions</th>
                  <th className="px-3 py-3">Registered</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => s.latestSessionId && navigate(`/examiner/sessions/${s.latestSessionId}`)}
                    className={cx('border-b border-slate-50', s.latestSessionId && 'cursor-pointer hover:bg-indigo-50/40')}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Initials name={s.name} />
                        <div>
                          <p className="font-semibold text-slate-900">{s.name}</p>
                          <p className="font-mono text-xs text-slate-500">{s.studentId}</p>
                        </div>
                        {s.seeded && <SimulatedTag label="Seeded" className="!py-0" />}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{s.email}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {s.faceReferenceModel === 'face-api-128d' ? '128-d embedding (real)' : s.faceReferenceModel === 'demo' ? 'Demo (no embedding)' : s.faceReferenceModel === 'simulated' ? 'Simulated' : 'Not registered'}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={VERIFICATION_TONE[s.verificationStatus]}>{s.verificationStatus.toLowerCase()}</Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{s.sessionCount}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{fmtDateTime(s.createdAt)}</td>
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
