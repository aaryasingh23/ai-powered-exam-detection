// Glue between the browser (camera, engine) and the server (telemetry).
import { useCallback, useEffect, useRef, useState } from 'react';
import { contributionFor, DEFAULT_RISK_CONFIG, mergeConfig, severityFor, type RiskConfig } from '@shared/risk-engine';
import type { EventType, NewEventInput, Severity } from '@shared/types';
import { api } from '../../lib/api';
import { useAuth } from '../auth/authStore';
import { TelemetryClient, type StudentSessionState } from '../telemetry/telemetryClient';
import { createLevelMeter, openMicrophone, stopStream } from './camera';
import { snapshot } from './frameAnalysis';
import { ProctoringEngine, type EngineState, type SimulationKind } from './ProctoringEngine';
import { useCamera } from './useCamera';

export interface FeedItem {
  clientId: string;
  timestamp: number;
  eventType: EventType;
  label: string;
  severity: Severity;
  contribution: number;
  confidence: number | null;
  simulated: boolean;
  ended: boolean;
}

export function useProctoringSession(sessionId: string | null, opts: { cameraWanted: boolean; onClosed: () => void }) {
  const camera = useCamera(opts.cameraWanted);
  const identity = useAuth((s) => s.identity);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [session, setSession] = useState<StudentSessionState | null>(null);
  const [online, setOnline] = useState(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [config, setConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const engineRef = useRef<ProctoringEngine | null>(null);
  const telemetryRef = useRef<TelemetryClient | null>(null);
  const history = useRef<{ eventType: EventType; timestamp: number; reviewStatus: 'PENDING' }[]>([]);
  const onClosedRef = useRef(opts.onClosed);
  onClosedRef.current = opts.onClosed;
  const cameraSettled = camera.status === 'active' || camera.status === 'error' || !opts.cameraWanted;

  // Start engine + telemetry once the session exists and the camera has settled.
  useEffect(() => {
    if (!sessionId || !cameraSettled) return;
    let disposed = false;
    let micStream: MediaStream | null = null;
    let meter: ReturnType<typeof createLevelMeter> | null = null;
    let meterTimer: ReturnType<typeof setInterval> | null = null;

    const telemetry = new TelemetryClient(sessionId, {
      onSession: (s) => !disposed && setSession(s),
      onConnection: (o) => !disposed && setOnline(o),
      onClosed: () => onClosedRef.current(),
    });
    telemetryRef.current = telemetry;

    (async () => {
      const [cfgRes, refRes] = await Promise.all([
        api<{ config: RiskConfig }>('/student/config').catch(() => ({ config: DEFAULT_RISK_CONFIG })),
        api<{ descriptor: number[] | null; model: string | null }>('/auth/face-reference').catch(() => ({ descriptor: null, model: null })),
      ]);
      micStream = await openMicrophone();
      if (disposed) {
        stopStream(micStream);
        return;
      }
      const cfg = mergeConfig(cfgRes.config);
      setConfig(cfg);
      if (micStream) {
        meter = createLevelMeter(micStream);
        meterTimer = setInterval(() => setMicLevel(meter!.level()), 120);
      }

      const record = (e: NewEventInput) => {
        const { value } = contributionFor(e.eventType, e.timestamp, history.current, cfg);
        if (e.eventType !== 'NORMAL') history.current.push({ eventType: e.eventType, timestamp: e.timestamp, reviewStatus: 'PENDING' });
        setFeed((f) =>
          [
            {
              clientId: e.clientId,
              timestamp: e.timestamp,
              eventType: e.eventType,
              label: e.label,
              severity: severityFor(e.eventType, value, cfg),
              contribution: value,
              confidence: e.confidence,
              simulated: e.simulated,
              ended: e.eventType === 'NORMAL',
            },
            ...f,
          ].slice(0, 60),
        );
        telemetry.pushEvent(e);
      };

      // Carry the pre-exam identity result into the session (once).
      const marker = `pre-identity-${sessionId}`;
      let alreadyLogged = false;
      try {
        alreadyLogged = sessionStorage.getItem(marker) === '1';
        sessionStorage.setItem(marker, '1');
      } catch {
        alreadyLogged = false;
      }
      if (identity && !alreadyLogged) {
        const now = Date.now();
        if (identity.model === 'none') {
          record({ clientId: `pre_${sessionId}`, timestamp: now, eventType: 'NORMAL', label: 'Pre-exam identity check skipped — camera unavailable (demo)', confidence: null, simulated: true, source: 'demo-simulator' });
        } else if (!identity.passed) {
          record({
            clientId: `pre_${sessionId}`,
            timestamp: now,
            endedAt: now,
            eventType: 'IDENTITY_MISMATCH',
            label: 'Pre-exam identity verification failed — review required',
            confidence: identity.confidence == null ? null : Math.round((1 - identity.confidence) * 100) / 100,
            simulated: identity.simulated,
            source: identity.simulated ? 'demo-simulator' : 'face-api',
            details: { matchConfidence: identity.confidence },
          });
        } else {
          record({
            clientId: `pre_${sessionId}`,
            timestamp: now,
            eventType: 'NORMAL',
            label: `Face verified before exam — identity confidence ${Math.round((identity.confidence ?? 0) * 100)}%${identity.simulated ? ' (demo)' : ''}`,
            confidence: identity.confidence,
            simulated: identity.simulated,
            source: identity.simulated ? 'demo-simulator' : 'face-api',
          });
        }
      }

      const video = camera.videoRef.current ?? document.createElement('video');
      const engine = new ProctoringEngine({
        video,
        stream: camera.stream,
        microphoneActive: !!micStream,
        config: cfg,
        reference: { descriptor: refRes.descriptor, model: refRes.model },
        callbacks: {
          onEvent: record,
          onEventEnd: (clientId, endedAt, label, details) => {
            setFeed((f) => f.map((x) => (x.clientId === clientId ? { ...x, ended: true, label: label ?? x.label } : x)));
            telemetry.pushEnd({ clientId, endedAt, label, details });
          },
          onState: (s) => !disposed && setEngineState(s),
        },
      });
      engineRef.current = engine;
      engine.start();
      telemetry.startHeartbeat(
        () => engine.getLive(),
        () => (cfg.livePreview && camera.videoRef.current && camera.stream ? snapshot(camera.videoRef.current, 320, 0.5) : null),
      );
    })();

    return () => {
      disposed = true;
      engineRef.current?.stop();
      engineRef.current = null;
      telemetry.flushNow().finally(() => telemetry.close());
      if (meterTimer) clearInterval(meterTimer);
      meter?.close();
      stopStream(micStream);
    };
    // The engine is created once per session; camera changes are pushed via setStream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cameraSettled]);

  // Camera reconnect → hand the new stream to the running engine.
  useEffect(() => {
    if (engineRef.current && camera.stream) engineRef.current.setStream(camera.stream);
  }, [camera.stream]);

  const simulate = useCallback((kind: SimulationKind) => engineRef.current?.simulate(kind), []);
  const recalibrate = useCallback(() => engineRef.current?.recalibrate(), []);

  const resetRisk = useCallback(async () => {
    if (!sessionId) return;
    const res = await api<{ session: StudentSessionState }>(`/student/session/${sessionId}/reset-risk`, { method: 'POST' });
    history.current = [];
    setSession(res.session);
  }, [sessionId]);

  const finish = useCallback(async () => {
    engineRef.current?.stop();
    await telemetryRef.current?.flushNow();
  }, []);

  return { camera, engineState, session, setSession, online, feed, micLevel, config, simulate, recalibrate, resetRisk, finish };
}
