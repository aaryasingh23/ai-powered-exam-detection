import {
  AlertTriangle,
  BookOpen,
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  EyeOff,
  FileText,
  FlaskConical,
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanFace,
  ShieldAlert,
  Smartphone,
  UserX,
  Users,
  VideoOff,
} from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import type { LiveStatus, ModelMode } from '@shared/types';
import { Badge, Button, cx, SimulatedTag, type Tone } from '../../components/ui';
import { fmtTime, pct } from '../../lib/format';
import type { EngineState, SimulationKind } from './ProctoringEngine';
import type { FeedItem } from './useProctoringSession';

// ------------------------------------------------------------ camera panel

export function CameraPanel({
  videoRef,
  state,
  cameraStatus,
  cameraError,
  onRetry,
  showOverlays,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: EngineState | null;
  cameraStatus: 'idle' | 'starting' | 'active' | 'error';
  cameraError: string | null;
  onRetry: () => void;
  showOverlays: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [lastAlert, setLastAlert] = useState<{ title: string; startedAt: number; endedAt: number | null; simulated: boolean } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const active = state?.conditions.filter((c) => c.eventType !== 'CAMERA_ISSUE' || state.hasVideo) ?? [];
  const top = [...active].sort((a, b) => rank(b.severity) - rank(a.severity))[0];

  useEffect(() => {
    if (top) setLastAlert({ title: top.title, startedAt: top.startedAt, endedAt: null, simulated: top.simulated });
    else setLastAlert((prev) => (prev && prev.endedAt == null ? { ...prev, endedAt: Date.now() } : prev));
  }, [top?.title, top?.startedAt, top?.simulated]); // eslint-disable-line react-hooks/exhaustive-deps

  const showAlert = lastAlert && (lastAlert.endedAt == null || now - lastAlert.endedAt < 2500);
  const suspicious = !!top;
  const pending = suspicious ? null : (state?.pending ?? null);

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl bg-ink-950 ring-4 transition-all duration-300',
        suspicious ? 'ring-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.18),0_20px_50px_-20px_rgba(244,63,94,0.6)]' : pending ? 'ring-amber-400' : 'ring-emerald-500/60',
      )}
    >
      <div className="relative aspect-video">
        <video ref={videoRef} className="size-full -scale-x-100 object-cover" muted playsInline />
        {cameraStatus !== 'active' && (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/90 p-6 pb-24 text-center">
            {cameraStatus === 'error' ? (
              <div className="max-w-sm text-slate-300">
                <VideoOff className="mx-auto size-10 text-rose-400" />
                <p className="mt-2 font-semibold text-white">Camera status: CHECK CAMERA</p>
                <p className="mt-1 text-sm text-slate-400">{cameraError}</p>
                <Button variant="dark" size="sm" className="mt-3" onClick={onRetry} icon={<RefreshCw className="size-3.5" />}>
                  Reconnect camera
                </Button>
                <p className="mt-3 text-[11px] text-slate-500">Demo controls still work without a camera.</p>
              </div>
            ) : cameraStatus === 'starting' ? (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="size-4 animate-spin" /> Starting camera…
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                <CameraOff className="mx-auto mb-2 size-8" />
                Running without camera (demo mode)
              </div>
            )}
          </div>
        )}

        {showOverlays &&
          state?.faces.map((f, i) => (
            <div
              key={i}
              className={cx('pointer-events-none absolute rounded-md border-2', i === 0 && state.faces.length === 1 ? 'border-emerald-400/80' : 'border-rose-400')}
              style={{ left: `${(1 - f.box.x - f.box.w) * 100}%`, top: `${f.box.y * 100}%`, width: `${f.box.w * 100}%`, height: `${f.box.h * 100}%` }}
            >
              <span className="absolute -top-5 left-0 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">Face {i + 1}</span>
            </div>
          ))}
        {showOverlays &&
          state?.objects.map((o) => (
            <div
              key={o.label}
              className={cx('pointer-events-none absolute rounded-md border-2', o.simulated ? 'border-dashed border-violet-400' : 'border-amber-400')}
              style={{ left: `${(1 - o.box.x - o.box.w) * 100}%`, top: `${o.box.y * 100}%`, width: `${o.box.w * 100}%`, height: `${o.box.h * 100}%` }}
            >
              <span className={cx('absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 text-[10px] font-bold text-white', o.simulated ? 'bg-violet-600' : 'bg-amber-600')}>
                {o.label} {pct(o.score)} {o.simulated && '· SIMULATED'}
              </span>
            </div>
          ))}

        {/* Status chips */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <span className={cx('size-2 rounded-full', cameraStatus === 'active' ? 'animate-pulse-ring bg-rose-500' : 'bg-slate-500')} />
            {cameraStatus === 'active' ? 'LIVE' : 'NO VIDEO'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur">
            ● AI Proctoring Active
          </span>
          {state?.simulations.length ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-600/90 px-2.5 py-1 text-[11px] font-bold text-white">
              <FlaskConical className="size-3" /> DEMO SIMULATION
            </span>
          ) : null}
        </div>
        {showOverlays && state && (
          <div className="absolute right-3 top-3 rounded-lg bg-black/55 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur">
            {state.fps} fps · {state.calibrated ? 'calibrated' : 'calibrating…'}
          </div>
        )}

        {pending && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-amber-500/90 px-3 py-2 text-xs font-semibold text-amber-950 backdrop-blur animate-fade-in">
            <div className="flex items-center justify-between">
              <span>{pending.title}…</span>
              <span className="tabular">{(pending.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-amber-900/20">
              <div className="h-full bg-amber-950/70 transition-all" style={{ width: `${pending.progress * 100}%` }} />
            </div>
          </div>
        )}

        {showAlert && lastAlert && (
          <div
            className={cx(
              'absolute inset-x-3 bottom-3 overflow-hidden rounded-xl border text-white shadow-2xl backdrop-blur animate-fade-in',
              lastAlert.endedAt == null ? 'border-rose-300/40 bg-rose-600/90' : 'border-emerald-300/40 bg-emerald-600/90',
            )}
          >
            <div className="h-0.5 bg-white/40" />
            <div className="flex items-start gap-3 px-4 py-3">
              {lastAlert.endedAt == null ? <AlertTriangle className="mt-0.5 size-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/85">
                  {lastAlert.endedAt == null ? '⚠ Suspicious activity' : 'Condition cleared'}
                  {lastAlert.simulated && <span className="ml-2 rounded bg-white/20 px-1.5 py-px text-[9px]">DEMO / SIMULATED</span>}
                </p>
                <p className="truncate text-[15px] font-bold">{lastAlert.title}</p>
                <p className="text-xs text-white/85">
                  Duration: <span className="tabular font-semibold">{(((lastAlert.endedAt ?? now) - lastAlert.startedAt) / 1000).toFixed(1)} sec</span>
                  {lastAlert.endedAt == null && ' · Suspicious activity detected — examiner review required'}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function rank(s: string) {
  return ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(s);
}

// ------------------------------------------------------------ live status

type Row = { label: string; value: ReactNode; tone: 'ok' | 'warn' | 'bad' | 'muted'; icon: ReactNode };

const TONE_CLASS = {
  ok: 'text-emerald-600 bg-emerald-50 ring-emerald-200',
  warn: 'text-amber-700 bg-amber-50 ring-amber-200',
  bad: 'text-rose-700 bg-rose-50 ring-rose-200',
  muted: 'text-slate-500 bg-slate-50 ring-slate-200',
};

export function statusRows(live: LiveStatus | null, opts: { detailed: boolean }): Row[] {
  if (!live) return [];
  const has = (o: string) => live.objects.includes(o);
  const noVideo = live.camera === 'UNAVAILABLE';
  const objectTone = (hit: boolean): Row['tone'] => (hit ? 'bad' : noVideo ? 'muted' : modeTone(live.models.objects));
  const objectText = (hit: boolean) => (hit ? 'Detected' : noVideo ? 'No video' : 'Not detected');
  const rows: Row[] = [
    {
      label: 'Face',
      icon: <ScanFace className="size-4" />,
      value: live.face === 'DETECTED' ? 'Detected' : live.face === 'MULTIPLE' ? 'Multiple' : live.face === 'NOT_DETECTED' ? 'Not detected' : 'Unknown',
      tone: live.face === 'DETECTED' ? 'ok' : live.face === 'UNKNOWN' ? 'muted' : 'bad',
    },
    {
      label: 'Identity',
      icon: <ShieldAlert className="size-4" />,
      value: (
        <>
          {live.identity === 'VERIFIED' ? 'Verified' : live.identity === 'CHECK_REQUIRED' ? 'Check required' : live.identity === 'PENDING' ? 'Checking…' : 'Unavailable'}
          {live.identityConfidence != null && <span className="ml-1 font-normal opacity-75">{pct(live.identityConfidence)}</span>}
          {live.models.identity === 'demo' && <span className="ml-1 text-[9px] font-bold">DEMO</span>}
        </>
      ),
      tone: live.identity === 'VERIFIED' ? 'ok' : live.identity === 'CHECK_REQUIRED' ? 'bad' : 'muted',
    },
    {
      label: 'Camera',
      icon: <Camera className="size-4" />,
      value: live.camera === 'ACTIVE' ? 'Active' : live.camera === 'CHECK_CAMERA' ? 'Check camera' : 'Unavailable',
      tone: live.camera === 'ACTIVE' ? 'ok' : 'bad',
    },
  ];
  if (opts.detailed) {
    rows.push(
      {
        label: 'Multiple faces',
        icon: <Users className="size-4" />,
        value: live.facesCount >= 2 ? `Yes (${live.facesCount})` : live.face === 'UNKNOWN' ? 'Unknown' : 'No',
        tone: live.facesCount >= 2 ? 'bad' : live.face === 'UNKNOWN' ? 'muted' : 'ok',
      },
      {
        label: 'Phone',
        icon: <Smartphone className="size-4" />,
        value: objectText(has('cell phone')),
        tone: objectTone(has('cell phone')),
      },
      {
        label: 'Book / notes',
        icon: <BookOpen className="size-4" />,
        value: objectText(has('book') || has('paper')),
        tone: objectTone(has('book') || has('paper')),
      },
      {
        label: 'Gaze',
        icon: <EyeOff className="size-4" />,
        value: live.gaze === 'CENTER' ? 'Normal' : live.gaze === 'UNKNOWN' ? 'Unknown' : `Looking ${live.gaze.toLowerCase()}`,
        tone: live.gaze === 'CENTER' ? 'ok' : live.gaze === 'UNKNOWN' ? 'muted' : 'warn',
      },
      {
        label: 'Head position',
        icon: <Crosshair className="size-4" />,
        value: (
          <>
            {live.head === 'NORMAL' ? 'Normal' : live.head === 'EXCESSIVE_MOVEMENT' ? 'Excessive movement' : 'Unknown'}
            {live.headPose && (
              <span className="ml-1 font-mono text-[10px] font-normal opacity-70">
                {live.headPose.yaw > 0 ? '+' : ''}
                {live.headPose.yaw}° / {live.headPose.pitch > 0 ? '+' : ''}
                {live.headPose.pitch}°
              </span>
            )}
          </>
        ),
        tone: live.head === 'NORMAL' ? 'ok' : live.head === 'UNKNOWN' ? 'muted' : 'warn',
      },
    );
  }
  rows.push({
    label: 'Proctoring',
    icon: <Gauge className="size-4" />,
    value: live.proctoring === 'ACTIVE' ? 'Active' : 'Paused',
    tone: live.proctoring === 'ACTIVE' ? 'ok' : 'warn',
  });
  return rows;
}

function modeTone(m: ModelMode): Row['tone'] {
  return m === 'real' || m === 'remote' ? 'ok' : 'muted';
}

export function LiveStatusList({ live, detailed, dark }: { live: LiveStatus | null; detailed: boolean; dark?: boolean }) {
  const rows = statusRows(live, { detailed });
  if (!rows.length) return <p className="text-sm text-slate-400">Waiting for the first analysis…</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className={cx('flex items-center justify-between gap-3 rounded-lg px-3 py-2', dark ? 'bg-white/5' : 'bg-slate-50/80')}>
          <span className={cx('flex items-center gap-2 text-sm', dark ? 'text-slate-300' : 'text-slate-600')}>
            <span className={dark ? 'text-slate-500' : 'text-slate-400'}>{r.icon}</span>
            {r.label}
          </span>
          <span className={cx('rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset', TONE_CLASS[r.tone])}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ models

const MODE_BADGE: Record<ModelMode, { tone: Tone; text: string }> = {
  real: { tone: 'green', text: 'REAL · in browser' },
  remote: { tone: 'indigo', text: 'REAL · remote' },
  demo: { tone: 'violet', text: 'DEMO adapter' },
  loading: { tone: 'slate', text: 'Loading' },
  error: { tone: 'red', text: 'Unavailable' },
  off: { tone: 'slate', text: 'Off' },
};

export function ModelStatus({ state }: { state: EngineState | null }) {
  const models = state?.models;
  const rows = models
    ? [
        ['Face / gaze / head pose', models.face],
        ['Object detection', models.objects],
        ['Identity verification', models.identity],
      ] as const
    : [];
  return (
    <ul className="space-y-2">
      {rows.map(([label, m]) => (
        <li key={label} className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <Badge tone={MODE_BADGE[m.status].tone}>{MODE_BADGE[m.status].text}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500" title={m.error ?? m.name}>
            {m.error ?? m.name}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ demo panel

const DEMO_BUTTONS: { kind: SimulationKind; label: string; icon: ReactNode }[] = [
  { kind: 'LOOK_AWAY', label: 'Simulate Look Away', icon: <EyeOff className="size-4" /> },
  { kind: 'PHONE', label: 'Simulate Phone Detection', icon: <Smartphone className="size-4" /> },
  { kind: 'BOOK', label: 'Simulate Book Detection', icon: <BookOpen className="size-4" /> },
  { kind: 'MULTIPLE_FACES', label: 'Simulate Multiple Faces', icon: <Users className="size-4" /> },
  { kind: 'IDENTITY_MISMATCH', label: 'Simulate Identity Mismatch', icon: <UserX className="size-4" /> },
  { kind: 'FACE_MISSING', label: 'Simulate Face Missing', icon: <ScanFace className="size-4" /> },
  { kind: 'PAPER', label: 'Simulate Paper / Notes', icon: <FileText className="size-4" /> },
  { kind: 'CAMERA_BLOCK', label: 'Simulate Camera Blocked', icon: <CameraOff className="size-4" /> },
];

export function DemoControlPanel({
  onSimulate,
  onReset,
  onRecalibrate,
  active,
}: {
  onSimulate: (k: SimulationKind) => void;
  onReset: () => Promise<void>;
  onRecalibrate: () => void;
  active: SimulationKind[];
}) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-gradient-to-b from-violet-50 to-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-violet-600 text-white">
            <FlaskConical className="size-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-violet-900">Demo control panel</p>
            <p className="text-[11px] text-violet-700">Injects simulated observations into the real pipeline</p>
          </div>
        </div>
        <SimulatedTag />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DEMO_BUTTONS.map((b) => (
          <button
            key={b.kind}
            onClick={() => onSimulate(b.kind)}
            className={cx(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition active:scale-[0.98]',
              active.includes(b.kind) ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-900 hover:border-violet-400 hover:bg-violet-50',
            )}
          >
            {b.icon}
            {b.label}
            {active.includes(b.kind) && <Loader2 className="ml-auto size-3.5 animate-spin" />}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={async () => {
            setResetting(true);
            setResetError(null);
            try {
              await onReset();
            } catch (err) {
              setResetError(err instanceof Error ? err.message : 'Reset failed');
            } finally {
              setResetting(false);
            }
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Reset Risk
        </button>
        <button onClick={onRecalibrate} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <Crosshair className="size-3.5" /> Recalibrate gaze
        </button>
      </div>
      {resetError && <p className="mt-2 text-xs text-rose-600">{resetError}</p>}
      <p className="mt-3 text-[11px] leading-snug text-violet-700/80">
        Simulated events follow the same thresholds, red warning and risk scoring as real detections, and are stored with a
        <b> DEMO / SIMULATED</b> label so examiners can tell them apart.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ local event feed

export function EventFeed({ items }: { items: FeedItem[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-400">No events yet.</p>;
  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {items.map((e) => (
        <li key={e.clientId} className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-white px-3 py-2 animate-slide-in">
          <span
            className={cx(
              'mt-1.5 size-2 shrink-0 rounded-full',
              e.eventType === 'NORMAL' ? 'bg-sky-400' : e.severity === 'CRITICAL' || e.severity === 'HIGH' ? 'bg-rose-500' : e.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-400',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-snug text-slate-800">{e.label}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
              <span className="font-mono">{fmtTime(e.timestamp)}</span>
              {e.confidence != null && <span>conf {pct(e.confidence)}</span>}
              {e.contribution > 0 && <span className="font-semibold text-rose-600">risk +{e.contribution}</span>}
              {!e.ended && e.eventType !== 'NORMAL' && <span className="font-semibold text-amber-600">ongoing</span>}
              {e.simulated && <SimulatedTag className="!py-0" />}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
