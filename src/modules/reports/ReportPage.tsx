import { ArrowLeft, Download, FileJson, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EVENT_META, RISK_LEVEL_TEXT } from '@shared/risk-engine';
import type { EventType } from '@shared/types';
import { Button, ErrorState, LoadingBlock, Logo, RISK_COLOR, SimulatedTag } from '../../components/ui';
import { fmtDateTime, fmtDuration, fmtTime, pct } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { REVIEW_LABEL, RiskChart } from '../dashboard/components';
import { examinerApi, type Report } from '../telemetry/examinerApi';

const SUMMARY: [string, EventType[]][] = [
  ['Look-away', ['LOOK_AWAY']],
  ['Phone', ['PHONE_DETECTED']],
  ['Book / notes / paper', ['BOOK_DETECTED', 'PAPER_DETECTED']],
  ['Multiple faces', ['MULTIPLE_FACES']],
  ['Face missing', ['FACE_MISSING']],
  ['Identity warnings', ['IDENTITY_MISMATCH']],
  ['Camera issues', ['CAMERA_ISSUE']],
  ['Head movement', ['HEAD_MOVEMENT']],
];

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(r: Report) {
  const rows = [['timestamp', 'event_type', 'severity', 'label', 'confidence', 'risk_contribution', 'duration_s', 'review_status', 'simulated', 'source', 'examiner_note']];
  for (const e of r.session.events) {
    rows.push([
      new Date(e.timestamp).toISOString(),
      e.eventType,
      e.severity,
      e.label,
      e.confidence == null ? '' : String(e.confidence),
      String(e.riskContribution),
      e.endedAt ? ((e.endedAt - e.timestamp) / 1000).toFixed(1) : '',
      e.reviewStatus,
      String(e.simulated),
      e.source,
      e.examinerNote,
    ]);
  }
  return rows.map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
}

function verdictText(r: Report) {
  const s = r.session;
  if (s.reviewStatus === 'CLEARED') return 'Cleared by examiner';
  if (s.reviewStatus === 'ESCALATED') return 'Escalated by examiner';
  if (s.risk.level === 'LOW' && s.pendingReview === 0) return 'No review required';
  return 'Review Required';
}

export default function ReportPage() {
  const { id = '' } = useParams();
  const { data, error, loading, refresh } = usePolling((signal) => examinerApi.report(id, signal), 30000, [id]);
  if (loading && !data) return <LoadingBlock label="Generating report…" />;
  if (!data) return <ErrorState message={error ?? 'Report unavailable'} onRetry={refresh} />;
  const r = data.report;
  const s = r.session;
  const flags = s.events.filter((e) => e.eventType !== 'NORMAL');
  const fileBase = `proctoring-report-${r.student.studentId}-${r.exam.code}`;
  const simulatedCount = flags.filter((e) => e.simulated).length;

  return (
    <div className="animate-fade-in">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/examiner/sessions/${s.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Back to session
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download(`${fileBase}.csv`, toCsv(r), 'text/csv')} icon={<Download className="size-4" />}>
            Timeline CSV
          </Button>
          <Button variant="secondary" onClick={() => download(`${fileBase}.json`, JSON.stringify({ ...r, session: { ...s, events: s.events.map((e) => ({ ...e, evidence: e.evidence ? '[image omitted]' : null })) } }, null, 2), 'application/json')} icon={<FileJson className="size-4" />}>
            JSON
          </Button>
          <Button onClick={() => window.print()} icon={<Printer className="size-4" />}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="print-sheet mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-soft sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <Logo />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Final Proctoring Report</h1>
            <p className="text-sm text-slate-500">
              Generated {fmtDateTime(r.generatedAt)} by {r.generatedBy}
            </p>
          </div>
          <div className="rounded-2xl border-2 px-5 py-3 text-center" style={{ borderColor: RISK_COLOR[s.risk.level] }}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Final risk score</p>
            <p className="tabular text-4xl font-extrabold" style={{ color: RISK_COLOR[s.risk.level] }}>
              {s.risk.score}
              <span className="text-lg text-slate-400"> / 100</span>
            </p>
            <p className="text-xs font-semibold" style={{ color: RISK_COLOR[s.risk.level] }}>
              {RISK_LEVEL_TEXT[s.risk.level]}
            </p>
          </div>
        </header>

        <section className="print-break mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-600">Student</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Student ID</dt><dd className="font-mono font-semibold">{r.student.studentId}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="font-semibold">{r.student.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd>{r.student.email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Identity status</dt><dd>{r.student.verificationStatus.toLowerCase()}</dd></div>
            </dl>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-600">Exam</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Exam</dt><dd className="text-right font-semibold">{r.exam.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Code</dt><dd className="font-mono">{r.exam.code}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Exam duration</dt><dd>{r.exam.durationMinutes} minutes</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Session</dt><dd>{fmtDateTime(s.startTime)} · {fmtDuration((s.endTime ?? Date.now()) - s.startTime)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Answered</dt><dd>{s.answeredCount}/{s.questionCount}{s.examScore != null && ` · score ${s.examScore}%`}</dd></div>
            </dl>
          </div>
        </section>

        <section className="print-break mt-6 rounded-2xl bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Status</h2>
              <p className="mt-1 text-xl font-bold text-slate-900">{verdictText(r)}</p>
              <p className="text-sm text-slate-500">Review status: {REVIEW_LABEL[s.reviewStatus].text} · {s.status === 'ACTIVE' ? 'Session still in progress (interim report)' : `Session ${s.status.toLowerCase().replace('_', ' ')}`}</p>
            </div>
            <p className="max-w-xs text-xs text-slate-500">This report lists automated flags for human review. It is not a finding of misconduct.</p>
          </div>
        </section>

        <section className="print-break mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600">Event summary</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUMMARY.map(([label, types]) => {
              const n = flags.filter((e) => types.includes(e.eventType)).length;
              const fp = flags.filter((e) => types.includes(e.eventType) && e.reviewStatus === 'FALSE_POSITIVE').length;
              return (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-2xl font-bold text-slate-900">{n}</p>
                  {fp > 0 && <p className="text-[11px] text-slate-400">{fp} false positive</p>}
                </div>
              );
            })}
          </div>
          {simulatedCount > 0 && (
            <p className="mt-2 flex items-center gap-2 text-xs text-violet-700">
              <SimulatedTag /> {simulatedCount} of {flags.length} flags were generated by the demo simulator, not by a real detection.
            </p>
          )}
        </section>

        <section className="print-break mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600">Score contribution</h2>
          {s.risk.breakdown.length ? (
            <table className="w-full text-sm">
              <tbody>
                {s.risk.breakdown.map((b) => (
                  <tr key={b.eventType} className="border-b border-slate-100">
                    <td className="py-1.5">{b.label}</td>
                    <td className="py-1.5 text-right text-slate-500">× {b.count}</td>
                    <td className="tabular py-1.5 text-right font-semibold">+{Math.round(b.current)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">No flags contribute to the final score.</p>
          )}
        </section>

        <section className="print-break mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600">Risk over time</h2>
          <RiskChart points={s.riskHistory} height={200} />
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600">Timeline</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2">Time</th>
                <th className="py-2">Event</th>
                <th className="py-2 text-right">Conf.</th>
                <th className="py-2 text-right">Risk</th>
                <th className="py-2 pl-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {s.events.filter((e) => e.timestamp <= Date.now()).map((e) => (
                <tr key={e.id} className="print-break border-b border-slate-100 align-top">
                  <td className="py-1.5 pr-3 font-mono text-slate-500">{fmtTime(e.timestamp)}</td>
                  <td className="py-1.5">
                    {e.eventType !== 'NORMAL' && <b className="mr-1">{EVENT_META[e.eventType].shortLabel}:</b>}
                    {e.label}
                    {e.simulated && <span className="ml-1 font-bold text-violet-600">[SIMULATED]</span>}
                    {e.examinerNote && <p className="text-indigo-700">Note: {e.examinerNote}</p>}
                  </td>
                  <td className="py-1.5 text-right">{e.eventType === 'NORMAL' ? '' : pct(e.confidence)}</td>
                  <td className="py-1.5 text-right font-semibold">{e.riskContribution > 0 ? `+${e.riskContribution}` : ''}</td>
                  <td className="py-1.5 pl-3 text-slate-500">{e.eventType === 'NORMAL' ? '' : e.reviewStatus.toLowerCase().replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="print-break mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-600">Examiner notes</h2>
          <p className="min-h-16 whitespace-pre-wrap rounded-xl border border-slate-200 p-4 text-sm text-slate-700">{s.examinerNotes || 'No notes recorded.'}</p>
        </section>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-xs text-slate-500">
          <div className="border-t border-slate-300 pt-2">Examiner signature</div>
          <div className="border-t border-slate-300 pt-2">Date</div>
        </footer>
      </article>
    </div>
  );
}
