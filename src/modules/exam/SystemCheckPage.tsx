import { ArrowRight, BrainCircuit, Camera, CheckCircle2, Loader2, Mic, RefreshCw, Wifi, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, cx, Notice, ProgressBar } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../auth/authStore';
import { loadFaceVerification } from '../face-verification/FaceVerificationService';
import { getGazeService } from '../gaze-detection/GazeDetectionService';
import { getObjectDetectionService } from '../object-detection/ObjectDetectionService';
import { createLevelMeter, openMicrophone, stopStream } from '../proctoring/camera';
import { useCamera } from '../proctoring/useCamera';
import { StudentShell } from './StudentShell';

type CheckState = 'pending' | 'ok' | 'warn' | 'fail';

function Row({ icon, title, state, detail, action }: { icon: ReactNode; title: string; state: CheckState; detail: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <div className="text-xs text-slate-500">{detail}</div>
      </div>
      {action}
      {state === 'pending' && <Loader2 className="size-5 animate-spin text-indigo-500" />}
      {state === 'ok' && <CheckCircle2 className="size-5 text-emerald-500" />}
      {state === 'warn' && <CheckCircle2 className="size-5 text-amber-500" />}
      {state === 'fail' && <XCircle className="size-5 text-rose-500" />}
    </div>
  );
}

export default function SystemCheckPage() {
  const navigate = useNavigate();
  const setSystemCheck = useAuth((s) => s.setSystemCheck);
  const camera = useCamera();
  const [mic, setMic] = useState<CheckState>('pending');
  const [level, setLevel] = useState(0);
  const [network, setNetwork] = useState<{ state: CheckState; ms: number | null }>({ state: 'pending', ms: null });
  const [models, setModels] = useState({ face: 'loading', objects: 'loading', identity: 'loading' } as Record<string, string>);
  const micStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    let meter: ReturnType<typeof createLevelMeter> | null = null;
    let raf = 0;
    openMicrophone().then((s) => {
      if (!s) return setMic('warn');
      micStream.current = s;
      setMic('ok');
      meter = createLevelMeter(s);
      const loop = () => {
        setLevel(meter!.level());
        raf = requestAnimationFrame(loop);
      };
      loop();
    });
    const t0 = performance.now();
    api('/student/config')
      .then(() => setNetwork({ state: 'ok', ms: Math.round(performance.now() - t0) }))
      .catch(() => setNetwork({ state: 'fail', ms: null }));
    const gaze = getGazeService();
    const objects = getObjectDetectionService();
    gaze.load().then(() => setModels((m) => ({ ...m, face: 'real' })), () => setModels((m) => ({ ...m, face: 'error' })));
    objects.load().then(() => setModels((m) => ({ ...m, objects: objects.status })), () => setModels((m) => ({ ...m, objects: 'error' })));
    loadFaceVerification().then((svc) => setModels((m) => ({ ...m, identity: svc.kind === 'demo' ? 'demo' : 'real' })));
    return () => {
      cancelAnimationFrame(raf);
      meter?.close();
      stopStream(micStream.current);
    };
  }, []);

  const camState: CheckState = camera.status === 'active' ? 'ok' : camera.status === 'error' ? 'fail' : 'pending';
  const modelsDone = Object.values(models).every((v) => v !== 'loading');
  const canStart = camState === 'ok' && network.state === 'ok' && modelsDone;

  const start = (demoWithoutCamera = false) => {
    setSystemCheck({ camera: camState === 'ok', microphone: mic === 'ok', demoWithoutCamera });
    navigate('/exam');
  };

  const modelBadge = (v: string) =>
    v === 'real' ? <Badge tone="green">Running in browser</Badge> : v === 'remote' ? <Badge tone="indigo">Remote service</Badge> : v === 'demo' ? <Badge tone="violet">Demo adapter</Badge> : v === 'error' ? <Badge tone="red">Unavailable</Badge> : <Badge>Loading…</Badge>;

  return (
    <StudentShell step={3}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Camera &amp; system check</h1>
        <p className="mt-1 text-sm text-slate-500">Allow camera and microphone access when your browser asks. Nothing is recorded during this check.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="overflow-hidden p-0">
          <div className={cx('relative aspect-video bg-ink-950 ring-4 ring-inset', camState === 'ok' ? 'ring-emerald-400/70' : 'ring-white/5')}>
            <video ref={camera.videoRef} className="size-full -scale-x-100 object-cover" muted playsInline />
            {camState !== 'ok' && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-300">
                {camera.status === 'error' ? camera.error?.message : 'Waiting for camera permission…'}
              </div>
            )}
          </div>
          <div className="space-y-2 p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Mic className="size-3.5" /> Microphone level
              </span>
              <span>Speak to test — audio is not recorded</span>
            </div>
            <ProgressBar value={level * 100} color={level > 0.6 ? '#f59e0b' : '#10b981'} />
          </div>
        </Card>

        <div className="space-y-3">
          <Row
            icon={<Camera className="size-5" />}
            title="Camera"
            state={camState}
            detail={camera.status === 'error' ? camera.error?.message : camState === 'ok' ? 'Camera active' : 'Requesting access…'}
            action={camera.status === 'error' ? <Button size="sm" variant="secondary" onClick={camera.retry} icon={<RefreshCw className="size-3.5" />}>Retry</Button> : undefined}
          />
          <Row
            icon={<Mic className="size-5" />}
            title="Microphone"
            state={mic}
            detail={mic === 'ok' ? 'Microphone active (level meter only)' : mic === 'warn' ? 'Not available — optional, the exam can continue' : 'Requesting access…'}
          />
          <Row
            icon={<Wifi className="size-5" />}
            title="Connection to exam server"
            state={network.state}
            detail={network.state === 'ok' ? `Connected · ${network.ms} ms` : network.state === 'fail' ? 'Cannot reach the server. Check your connection.' : 'Testing…'}
          />
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <BrainCircuit className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">AI proctoring models</p>
                <p className="text-xs text-slate-500">Loaded once and run locally in your browser</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {[
                ['Face, gaze & head pose', models.face],
                ['Phone / book detection', models.objects],
                ['Identity verification', models.identity],
              ].map(([label, v]) => (
                <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-700">{label}</span>
                  {modelBadge(v)}
                </div>
              ))}
            </div>
          </Card>
          {modelsDone && Object.values(models).some((v) => v === 'error' || v === 'demo') && (
            <Notice tone="warning">Some models are unavailable. Those checks are paused and the demo panel can still simulate them — simulated flags are always labelled.</Notice>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {camera.status === 'error' && (
              <Button variant="secondary" onClick={() => start(true)}>
                Start without camera (demo)
              </Button>
            )}
            <Button size="lg" disabled={!canStart} onClick={() => start(false)} icon={<ArrowRight className="size-5" />}>
              Start exam
            </Button>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
