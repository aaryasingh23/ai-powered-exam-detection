import { Database, KeyRound, RefreshCcw, RotateCcw, Save, Scale, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WEIGHT_LABELS, type RiskConfig, type WeightKey } from '@shared/risk-engine';
import { Button, Card, CardHeader, ErrorState, LoadingBlock, Notice, PageHeader, Toggle } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { usePolling } from '../../lib/usePolling';
import { examinerApi } from '../telemetry/examinerApi';

function NumberField({ label, value, onChange, suffix, step = 1, min = 0, max = 1000 }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-semibold outline-none focus:border-indigo-400"
        />
        {suffix && <span className="w-8 text-xs text-slate-500">{suffix}</span>}
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const resets = usePolling(() => examinerApi.resetRequests(), 15000);

  useEffect(() => {
    examinerApi
      .settings()
      .then((r) => setConfig(r.config))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!config) return error ? <ErrorState message={error} /> : <LoadingBlock />;

  const setWeight = (k: WeightKey, v: number) => setConfig({ ...config, weights: { ...config.weights, [k]: v } });
  const setDet = (k: keyof RiskConfig['detection'], v: number) => setConfig({ ...config, detection: { ...config.detection, [k]: v } });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const r = await examinerApi.saveSettings(config);
      setConfig(r.config);
      setMsg('Settings saved. New sessions pick them up immediately; running sessions on their next reload. Scores are re-computed with the new weights.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const r = await examinerApi.resetSettings();
      setConfig(r.config);
      setMsg('Defaults restored.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Transparent, configurable scoring. Every value here is applied by the same engine on the student and server side."
        actions={
          <>
            <Button variant="secondary" onClick={reset} disabled={saving} icon={<RotateCcw className="size-4" />}>
              Restore defaults
            </Button>
            <Button onClick={save} loading={saving} icon={<Save className="size-4" />}>
              Save settings
            </Button>
          </>
        }
      />
      {msg && <Notice tone="success" className="mb-4">{msg}</Notice>}
      {error && <ErrorState message={error} className="mb-4" />}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Event weights" subtitle="Risk points added when a flag fires" icon={<Scale className="size-4" />} />
          <div className="space-y-2 p-4">
            {(Object.keys(WEIGHT_LABELS) as WeightKey[]).map((k) => (
              <NumberField key={k} label={WEIGHT_LABELS[k]} value={config.weights[k]} onChange={(v) => setWeight(k, v)} suffix="pts" max={100} />
            ))}
            <NumberField label="Repeated look-away after" value={config.repeatedLookAway.count} onChange={(v) => setConfig({ ...config, repeatedLookAway: { ...config.repeatedLookAway, count: v } })} suffix="×" min={2} max={20} />
            <NumberField label="…within window" value={config.repeatedLookAway.windowSeconds} onChange={(v) => setConfig({ ...config, repeatedLookAway: { ...config.repeatedLookAway, windowSeconds: v } })} suffix="s" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Detection thresholds" subtitle="How long a condition must persist" icon={<SlidersHorizontal className="size-4" />} />
          <div className="space-y-2 p-4">
            <NumberField label="Look-away threshold" value={config.detection.lookAwaySeconds} onChange={(v) => setDet('lookAwaySeconds', v)} suffix="s" step={0.5} />
            <NumberField label="Face missing threshold" value={config.detection.faceMissingSeconds} onChange={(v) => setDet('faceMissingSeconds', v)} suffix="s" step={0.5} />
            <NumberField label="Multiple faces threshold" value={config.detection.multipleFacesSeconds} onChange={(v) => setDet('multipleFacesSeconds', v)} suffix="s" step={0.5} />
            <NumberField label="Dark / blocked camera" value={config.detection.cameraDarkSeconds} onChange={(v) => setDet('cameraDarkSeconds', v)} suffix="s" step={0.5} />
            <NumberField label="Object confidence" value={config.detection.objectConfidence} onChange={(v) => setDet('objectConfidence', v)} step={0.05} max={1} />
            <NumberField label="Identity match threshold" value={config.detection.identityThreshold} onChange={(v) => setDet('identityThreshold', v)} step={0.05} max={1} />
            <NumberField label="Identity failures needed" value={config.detection.identityFailures} onChange={(v) => setDet('identityFailures', v)} suffix={`/ ${config.detection.identityWindow}`} />
            <NumberField label="Identity check interval" value={config.detection.identityIntervalSeconds} onChange={(v) => setDet('identityIntervalSeconds', v)} suffix="s" />
            <NumberField label="Head yaw threshold" value={config.detection.yawThresholdDeg} onChange={(v) => setDet('yawThresholdDeg', v)} suffix="°" />
            <NumberField label="Head pitch threshold" value={config.detection.pitchThresholdDeg} onChange={(v) => setDet('pitchThresholdDeg', v)} suffix="°" />
            <NumberField label="Event cooldown" value={config.detection.cooldownSeconds} onChange={(v) => setDet('cooldownSeconds', v)} suffix="s" />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Risk levels & decay" subtitle="Score bands and how fast flags fade" icon={<Scale className="size-4" />} />
            <div className="space-y-2 p-4">
              <NumberField label="Medium from" value={config.thresholds.medium} onChange={(v) => setConfig({ ...config, thresholds: { ...config.thresholds, medium: v } })} max={100} />
              <NumberField label="High from" value={config.thresholds.high} onChange={(v) => setConfig({ ...config, thresholds: { ...config.thresholds, high: v } })} max={100} />
              <NumberField label="Critical from" value={config.thresholds.critical} onChange={(v) => setConfig({ ...config, thresholds: { ...config.thresholds, critical: v } })} max={100} />
              <NumberField label="Decay grace period" value={config.decay.graceSeconds} onChange={(v) => setConfig({ ...config, decay: { ...config.decay, graceSeconds: v } })} suffix="s" />
              <NumberField label="Decay half-life" value={config.decay.halfLifeSeconds} onChange={(v) => setConfig({ ...config, decay: { ...config.decay, halfLifeSeconds: v } })} suffix="s" />
            </div>
          </Card>
          <Card>
            <CardHeader title="Privacy & data handling" icon={<Database className="size-4" />} />
            <div className="space-y-4 p-4">
              <Toggle checked={config.evidenceSnapshots} onChange={(v) => setConfig({ ...config, evidenceSnapshots: v })} label="Evidence snapshots" description="Store one 240 px frame with HIGH / CRITICAL flags." />
              <Toggle checked={config.livePreview} onChange={(v) => setConfig({ ...config, livePreview: v })} label="Live preview for examiners" description="Low-res frame every 3 s, kept in server memory only." />
              <Button
                variant="secondary"
                className="w-full"
                loading={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await examinerApi.refreshDemo();
                    setMsg('Seeded demo sessions regenerated.');
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setRefreshing(false);
                  }
                }}
                icon={<RefreshCcw className="size-4" />}
              >
                Regenerate seeded demo sessions
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Password reset requests" subtitle="Raised from the student login page — verify identity before resetting" icon={<KeyRound className="size-4" />} />
        <div className="p-4">
          {resets.data?.requests.length ? (
            <ul className="divide-y divide-slate-100">
              {resets.data.requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <b className="font-mono">{r.student_id}</b> <span className="text-slate-500">· {fmtDateTime(r.created_at)}</span>
                  </span>
                  {r.status === 'OPEN' ? (
                    <Button size="sm" variant="secondary" onClick={() => examinerApi.resolveResetRequest(r.id).then(resets.refresh)}>
                      Mark resolved
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600">Resolved</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">No requests.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
