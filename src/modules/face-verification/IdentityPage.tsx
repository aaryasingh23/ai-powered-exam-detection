import { ArrowRight, Camera, CheckCircle2, Database, Loader2, RefreshCw, ScanFace, ShieldAlert, ShieldCheck, VideoOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_RISK_CONFIG } from '@shared/risk-engine';
import { Badge, Button, Card, cx, ErrorState, Notice, ProgressBar, SimulatedTag } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { pct } from '../../lib/format';
import { useAuth } from '../auth/authStore';
import { StudentShell } from '../exam/StudentShell';
import { getGazeService } from '../gaze-detection/GazeDetectionService';
import { measureFrame } from '../proctoring/frameAnalysis';
import { useCamera } from '../proctoring/useCamera';
import { averageDescriptors, loadFaceVerification, type FaceVerificationService } from './FaceVerificationService';

type Phase = 'loading' | 'position' | 'capturing' | 'verifying' | 'done' | 'failed';

interface Guidance {
  ok: boolean;
  message: string;
  box: { x: number; y: number; w: number; h: number } | null;
}

const READY_MS = 1200;
const MAX_ATTEMPTS = 3;

function evaluate(video: HTMLVideoElement): Guidance {
  const gaze = getGazeService();
  if (gaze.status !== 'real') return { ok: true, message: 'Face guidance unavailable — centre your face and capture.', box: null };
  const obs = gaze.detect(video, performance.now());
  if (!obs) return { ok: false, message: 'Starting camera analysis…', box: null };
  const stats = measureFrame(video);
  if (stats && stats.brightness < 45) return { ok: false, message: 'It is too dark — face a light source or turn on a lamp.', box: null };
  if (obs.facesCount === 0) return { ok: false, message: 'No face detected — look directly at the camera.', box: null };
  if (obs.facesCount > 1) return { ok: false, message: 'Only you should be in the frame. Ask others to step away.', box: obs.faces[0].box };
  const f = obs.faces[0];
  const cx = f.box.x + f.box.w / 2;
  const cy = f.box.y + f.box.h / 2;
  if (f.box.w < 0.2) return { ok: false, message: 'Move a little closer to the camera.', box: f.box };
  if (f.box.w > 0.6) return { ok: false, message: 'Move back slightly — your face is too close.', box: f.box };
  if (cx < 0.33 || cx > 0.67 || cy < 0.28 || cy > 0.72) return { ok: false, message: 'Centre your face inside the oval.', box: f.box };
  if (Math.abs(f.yaw) > 14) return { ok: false, message: 'Look straight at the camera.', box: f.box };
  return { ok: true, message: 'Perfect — hold still…', box: f.box };
}

export default function IdentityPage() {
  const navigate = useNavigate();
  const { student, setStudent, setIdentity, identity } = useAuth();
  const camera = useCamera();
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<'register' | 'verify'>(student?.hasFaceReference ? 'verify' : 'register');
  const [service, setService] = useState<FaceVerificationService | null>(null);
  const [reference, setReference] = useState<number[] | null>(null);
  const [guidance, setGuidance] = useState<Guidance>({ ok: false, message: 'Position your face inside the oval.', box: null });
  const [ready, setReady] = useState(0);
  const [result, setResult] = useState<{ confidence: number | null; simulated: boolean; passed: boolean } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const readySince = useRef<number | null>(null);
  const busy = useRef(false);
  const threshold = DEFAULT_RISK_CONFIG.detection.identityThreshold;

  // Load models + existing reference.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [svc, ref] = await Promise.all([
          loadFaceVerification(),
          api<{ descriptor: number[] | null; model: string | null }>('/auth/face-reference'),
          getGazeService().load().catch(() => undefined),
        ]);
        if (cancelled) return;
        setService(svc);
        setReference(ref.descriptor);
        const hasRef = !!ref.descriptor || ref.model === 'demo';
        // A real model with only a demo reference must register properly.
        setMode(hasRef && !(svc.kind === 'face-api' && !ref.descriptor) ? 'verify' : 'register');
        setPhase('position');
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runCapture = useCallback(async () => {
    const video = camera.videoRef.current;
    if (!service || !video || busy.current) return;
    busy.current = true;
    setError(null);
    try {
      let refDescriptor = reference;
      if (mode === 'register') {
        setPhase('capturing');
        const samples: number[][] = [];
        if (service.kind === 'face-api') {
          for (let i = 0; i < 6 && samples.length < 3; i++) {
            const emb = await service.embed(video);
            if (emb) samples.push(emb.descriptor);
            await new Promise((r) => setTimeout(r, 250));
          }
          if (samples.length < 3) throw new Error('We could not get a clear view of your face. Improve lighting and try again.');
          refDescriptor = averageDescriptors(samples);
        }
        const res = await api<{ student: typeof student }>('/auth/face-reference', {
          method: 'PUT',
          body: { descriptor: refDescriptor, model: service.kind === 'face-api' ? 'face-api-128d' : 'demo' },
        });
        if (res.student) setStudent(res.student);
        setReference(refDescriptor);
        setMode('verify');
        await new Promise((r) => setTimeout(r, 600));
      }
      // Verification: compare a fresh capture against the stored reference.
      setPhase('verifying');
      let best: { confidence: number; simulated: boolean } | null = null;
      for (let i = 0; i < 3; i++) {
        const emb = await service.embed(video);
        const cmp = service.compare(refDescriptor, emb, threshold);
        if (emb && (!best || cmp.confidence > best.confidence)) best = { confidence: cmp.confidence, simulated: cmp.simulated };
        if (best && best.confidence >= threshold + 0.25) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!best) throw new Error('No face found during verification. Look at the camera and try again.');
      const passed = best.confidence >= threshold;
      setResult({ confidence: best.confidence, simulated: best.simulated, passed });
      if (passed) {
        await api('/auth/identity-verified', { body: { passed: true, confidence: best.confidence } });
        setIdentity({ passed: true, confidence: best.confidence, model: service.kind, simulated: best.simulated, at: Date.now() });
        setPhase('done');
      } else {
        const n = attempts + 1;
        setAttempts(n);
        setPhase(n >= MAX_ATTEMPTS ? 'failed' : 'position');
        if (n < MAX_ATTEMPTS) setError(`Identity confidence ${pct(best.confidence)} is below the ${pct(threshold)} threshold. Please try again (${n}/${MAX_ATTEMPTS}).`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setPhase('position');
    } finally {
      busy.current = false;
      readySince.current = null;
      setReady(0);
    }
  }, [service, mode, reference, attempts, threshold, camera.videoRef, setIdentity, setStudent]);

  // Guidance loop — auto-captures once the face has been well positioned for READY_MS.
  useEffect(() => {
    if (phase !== 'position' || camera.status !== 'active') return;
    const id = setInterval(() => {
      const video = camera.videoRef.current;
      if (!video || busy.current) return;
      const g = evaluate(video);
      setGuidance(g);
      if (g.ok && getGazeService().status === 'real') {
        readySince.current ??= Date.now();
        const p = Math.min(1, (Date.now() - readySince.current) / READY_MS);
        setReady(p);
        if (p >= 1) runCapture();
      } else {
        readySince.current = null;
        setReady(0);
      }
    }, 120);
    return () => clearInterval(id);
  }, [phase, camera.status, camera.videoRef, runCapture]);

  const continueWithoutCamera = async () => {
    await api('/auth/identity-verified', { body: { passed: false, confidence: null } }).catch(() => undefined);
    setIdentity({ passed: false, confidence: null, model: 'none', simulated: true, at: Date.now() });
    navigate('/guidelines');
  };

  const continueFlagged = async () => {
    await api('/auth/identity-verified', { body: { passed: false, confidence: result?.confidence ?? null } }).catch(() => undefined);
    setIdentity({ passed: false, confidence: result?.confidence ?? null, model: service?.kind ?? 'none', simulated: !!result?.simulated, at: Date.now() });
    navigate('/guidelines');
  };

  const box = guidance.box;
  const borderTone = phase === 'done' ? 'ring-emerald-400' : guidance.ok ? 'ring-indigo-400' : 'ring-white/10';

  return (
    <StudentShell step={1}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{mode === 'register' ? 'Face registration' : 'Identity verification'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'register'
            ? 'First exam on this account: we will capture a face reference and then verify it.'
            : 'Confirm it is you before the exam starts. This takes a few seconds.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className={cx('relative aspect-video bg-ink-950 ring-4 ring-inset transition-colors', borderTone)}>
            <video ref={camera.videoRef} className="size-full -scale-x-100 object-cover" muted playsInline />
            {camera.status === 'active' && phase !== 'done' && (
              <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 160 90" preserveAspectRatio="none">
                <defs>
                  <mask id="oval">
                    <rect width="160" height="90" fill="white" />
                    <ellipse cx="80" cy="45" rx="22" ry="30" fill="black" />
                  </mask>
                </defs>
                <rect width="160" height="90" fill="rgb(11 16 32 / 0.55)" mask="url(#oval)" />
                <ellipse cx="80" cy="45" rx="22" ry="30" fill="none" stroke={guidance.ok ? '#818cf8' : 'rgba(255,255,255,0.5)'} strokeWidth="0.6" strokeDasharray={guidance.ok ? '0' : '2 1.5'} />
              </svg>
            )}
            {box && phase === 'position' && (
              <div
                className="pointer-events-none absolute rounded-lg border-2 border-indigo-300/80"
                style={{ left: `${(1 - box.x - box.w) * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
              />
            )}
            {(phase === 'capturing' || phase === 'verifying') && (
              <div className="absolute inset-x-0 top-0 h-full overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 animate-scan bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_18px_4px_rgba(129,140,248,0.6)]" />
              </div>
            )}
            {camera.status !== 'active' && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-slate-300">
                {camera.status === 'error' ? (
                  <div className="max-w-sm">
                    <VideoOff className="mx-auto size-10 text-rose-400" />
                    <p className="mt-3 font-semibold text-white">Camera not available</p>
                    <p className="mt-1 text-sm text-slate-400">{camera.error?.message}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button variant="dark" onClick={camera.retry} icon={<RefreshCw className="size-4" />}>
                        Retry
                      </Button>
                      <Button variant="dark" onClick={continueWithoutCamera}>
                        Continue without camera (demo)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Starting camera…
                  </div>
                )}
              </div>
            )}
            {phase === 'done' && (
              <div className="absolute inset-0 grid place-items-center bg-emerald-950/55 backdrop-blur-[2px] animate-fade-in">
                <div className="text-center text-white">
                  <CheckCircle2 className="mx-auto size-16 text-emerald-300" />
                  <p className="mt-3 text-xl font-bold">Identity verification completed</p>
                  <p className="text-sm text-emerald-100">Confidence {pct(result?.confidence)}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cx('grid size-9 place-items-center rounded-xl', guidance.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                <ScanFace className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {phase === 'loading'
                    ? 'Loading face models…'
                    : phase === 'capturing'
                      ? 'Capturing face reference…'
                      : phase === 'verifying'
                        ? 'Comparing with your reference…'
                        : phase === 'done'
                          ? 'You are verified'
                          : phase === 'failed'
                            ? 'Verification unsuccessful'
                            : camera.status === 'error'
                              ? 'Camera unavailable — retry or continue in demo mode'
                              : camera.status !== 'active'
                                ? 'Waiting for camera…'
                                : guidance.message}
                </p>
                {phase === 'position' && <ProgressBar value={ready * 100} className="mt-1.5 w-48" />}
              </div>
            </div>
            {phase === 'position' && camera.status === 'active' && (
              <Button onClick={runCapture} icon={<Camera className="size-4" />}>
                {mode === 'register' ? 'Capture now' : 'Verify now'}
              </Button>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {loadError && <ErrorState message={loadError} />}
          {error && <ErrorState message={error} />}
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Steps</p>
            <ol className="mt-3 space-y-3">
              {[
                { label: 'Position your face in the oval', done: phase !== 'loading' && phase !== 'position' },
                { label: mode === 'register' && phase !== 'verifying' && phase !== 'done' ? 'Capture face reference' : 'Face reference on file', done: mode === 'verify' },
                { label: 'Verify identity', done: phase === 'done' },
              ].map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className={cx('grid size-6 place-items-center rounded-full text-xs font-bold', s.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500')}>
                    {s.done ? '✓' : i + 1}
                  </span>
                  <span className={s.done ? 'text-slate-800' : 'text-slate-500'}>{s.label}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recognition model</p>
              {service?.kind === 'face-api' ? <Badge tone="green">Real model</Badge> : service ? <SimulatedTag label="Demo adapter" /> : <Badge>Loading</Badge>}
            </div>
            <p className="mt-2 text-sm text-slate-700">{service?.modelName ?? 'Loading…'}</p>
            {service?.kind === 'demo' && (
              <Notice tone="warning" className="mt-3">
                The face recognition model could not load, so this step runs in <b>demo mode</b>: faces are not compared and the confidence shown is simulated.
              </Notice>
            )}
            {result && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Identity confidence</span>
                  <span className="flex items-center gap-2 font-bold text-slate-900">
                    {pct(result.confidence)} {result.simulated && <SimulatedTag />}
                  </span>
                </div>
                <ProgressBar value={(result.confidence ?? 0) * 100} color={result.passed ? '#10b981' : '#f59e0b'} className="mt-2" />
                <p className="mt-1 text-[11px] text-slate-500">Match threshold {pct(threshold)}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Database className="size-4 text-indigo-500" /> What is stored
            </div>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              <li>• A 128-number face embedding linked to your Student ID.</li>
              <li>• No photo or video of you is saved during this step.</li>
              <li>• The embedding is only used to check it is you during this exam.</li>
            </ul>
          </Card>

          {phase === 'done' && (
            <Button size="lg" className="w-full" onClick={() => navigate('/guidelines')} icon={<ArrowRight className="size-5" />}>
              Continue to guidelines
            </Button>
          )}
          {phase === 'failed' && (
            <Card className="border-amber-200 p-5">
              <div className="flex gap-3">
                <ShieldAlert className="size-5 shrink-0 text-amber-500" />
                <div className="text-sm text-slate-700">
                  We could not confirm your identity after {MAX_ATTEMPTS} attempts. You may continue — your session will be marked
                  <b> “identity check required”</b> for an examiner to review. This is not an accusation.
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => { setAttempts(0); setError(null); setPhase('position'); }} icon={<RefreshCw className="size-4" />}>
                  Try again
                </Button>
                <Button onClick={continueFlagged} icon={<ShieldCheck className="size-4" />}>
                  Continue for review
                </Button>
              </div>
            </Card>
          )}
          {identity && phase !== 'done' && (
            <button onClick={() => navigate('/guidelines')} className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
              Already verified this login — skip to guidelines
            </button>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
