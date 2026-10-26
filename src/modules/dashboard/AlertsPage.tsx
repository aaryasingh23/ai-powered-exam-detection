import { Bell, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewStatus, Severity } from '@shared/types';
import { Button, Card, cx, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';
import { AlertItem } from './components';

const SEVERITIES: (Severity | '')[] = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function AlertsPage() {
  const navigate = useNavigate();
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [status, setStatus] = useState<'' | 'PENDING' | 'REVIEWED' | 'FALSE_POSITIVE'>('PENDING');
  const [hideSeeded, setHideSeeded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error, loading, refresh } = usePolling((signal) => examinerApi.alerts({ severity, status }, signal), 3000, [severity, status]);

  const act = async (id: string, reviewStatus: ReviewStatus) => {
    setBusy(id);
    setActionError(null);
    try {
      await examinerApi.updateEvent(id, { reviewStatus });
      refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const alerts = (data?.alerts ?? []).filter((a) => !hideSeeded || !a.session.simulatedSession);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Alerts" subtitle="Every suspicious-activity flag, newest first. Alerts are prompts for review, not accusations." />
      <Notice className="mb-4">
        Severity levels: <b>INFO</b> · <b>LOW</b> (attention) · <b>MEDIUM</b> (review required) · <b>HIGH</b> (high priority) · <b>CRITICAL</b> (identity / review required).
      </Notice>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {SEVERITIES.map((s) => (
              <button key={s || 'all'} onClick={() => setSeverity(s)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold', severity === s ? 'bg-white shadow-sm' : 'text-slate-500')}>
                {s ? `${s}+` : 'All severities'}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(
              [
                ['PENDING', 'Pending'],
                ['REVIEWED', 'Reviewed'],
                ['FALSE_POSITIVE', 'False positive'],
                ['', 'All'],
              ] as const
            ).map(([k, label]) => (
              <button key={k || 'all'} onClick={() => setStatus(k)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold', status === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                {label}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={hideSeeded} onChange={(e) => setHideSeeded(e.target.checked)} className="accent-indigo-600" />
            Only real candidate sessions
          </label>
        </div>
        <div className="space-y-2 p-4">
          {(error || actionError) && <ErrorState message={actionError ?? error!} onRetry={refresh} />}
          {loading && !data ? (
            <LoadingBlock />
          ) : alerts.length === 0 ? (
            <EmptyState icon={<Bell className="size-6" />} title="No alerts match" description="Change the filters, or wait for new flags to arrive." />
          ) : (
            alerts.map((a) => (
              <AlertItem
                key={a.event.id}
                alert={a}
                onOpen={() => navigate(`/examiner/sessions/${a.session.id}`)}
                actions={
                  a.event.reviewStatus === 'PENDING' ? (
                    <>
                      <Button size="sm" variant="secondary" loading={busy === a.event.id} onClick={() => act(a.event.id, 'REVIEWED')} icon={<CheckCircle2 className="size-3.5" />}>
                        Mark reviewed
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => act(a.event.id, 'FALSE_POSITIVE')} icon={<XCircle className="size-3.5" />}>
                        False positive
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => act(a.event.id, 'PENDING')}>
                      Move back to pending
                    </Button>
                  )
                }
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
