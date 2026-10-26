// The proctoring engine turns raw per-frame model output into debounced,
// explainable events. It never decides anything about the student: it raises
// flags with timestamps, confidence and duration for an examiner to review.
//
// Pipeline per tick (~10 Hz):
//   camera frame ─┬─ GazeDetectionService  → face count, head pose, eye gaze
//                 ├─ ObjectDetectionService → phone / book / person (2 Hz)
//                 ├─ FaceVerificationService → identity check (every N s)
//                 └─ frame heuristics        → dark / blocked camera (2 Hz)
//   → condition state machines (threshold + hysteresis + cooldown)
//   → events (onEvent / onEventEnd) → telemetry → server risk engine
//
// Demo simulations plug in as overrides on the *raw observations*, so a
// simulated phone travels through exactly the same thresholds and UI as a
// real one — but every resulting event is flagged `simulated: true`.
import { EVENT_META, severityFor, contributionFor, type RiskConfig } from '@shared/risk-engine';
import type { DetectionSource, EventType, LiveStatus, ModelMode, NewEventInput, Severity } from '@shared/types';
import {
  demoFaceVerification,
  loadFaceVerification,
  type FaceVerificationService,
} from '../face-verification/FaceVerificationService';
import { getGazeService, type FaceObservation } from '../gaze-detection/GazeDetectionService';
import {
  applyCalibration,
  classifyGaze,
  DEFAULT_CALIBRATION,
  stdDev,
  type Calibration,
  type FacePose,
  type GazeDirection,
} from '../gaze-detection/headPose';
import { getObjectDetectionService, type DetectedObject, type ObjectLabel } from '../object-detection/ObjectDetectionService';
import { measureFrame, snapshot, type FrameStats } from './frameAnalysis';

export type SimulationKind =
  | 'LOOK_AWAY'
  | 'PHONE'
  | 'BOOK'
  | 'PAPER'
  | 'MULTIPLE_FACES'
  | 'IDENTITY_MISMATCH'
  | 'FACE_MISSING'
  | 'CAMERA_BLOCK';

/** How long each simulated condition is held (ms). */
export const SIMULATION_DURATION: Record<SimulationKind, number> = {
  LOOK_AWAY: 3400,
  PHONE: 8000,
  BOOK: 8000,
  PAPER: 8000,
  MULTIPLE_FACES: 6000,
  IDENTITY_MISMATCH: 9000,
  FACE_MISSING: 7000,
  CAMERA_BLOCK: 6000,
};

type ConditionKey = 'lookAway' | 'faceMissing' | 'multipleFaces' | 'phone' | 'book' | 'paper' | 'identity' | 'camera' | 'headMovement';

const CONDITION_EVENT: Record<ConditionKey, EventType> = {
  lookAway: 'LOOK_AWAY',
  faceMissing: 'FACE_MISSING',
  multipleFaces: 'MULTIPLE_FACES',
  phone: 'PHONE_DETECTED',
  book: 'BOOK_DETECTED',
  paper: 'PAPER_DETECTED',
  identity: 'IDENTITY_MISMATCH',
  camera: 'CAMERA_ISSUE',
  headMovement: 'HEAD_MOVEMENT',
};

interface Condition {
  since: number | null;
  offSince: number | null;
  active: boolean;
  clientId: string | null;
  firedAt: number;
  lastCleared: number;
  simulated: boolean;
  frames: number;
  hits: number;
  peakScore: number;
  title: string;
  detail: Record<string, unknown>;
}

export interface ActiveCondition {
  key: ConditionKey;
  eventType: EventType;
  title: string;
  startedAt: number;
  severity: Severity;
  simulated: boolean;
}

export interface ModelInfo {
  status: ModelMode;
  name: string;
  error: string | null;
}

export interface EngineState {
  live: LiveStatus;
  conditions: ActiveCondition[];
  pending: { key: ConditionKey; title: string; progress: number; elapsedMs: number } | null;
  faces: { box: FacePose['box'] }[];
  objects: (DetectedObject & { simulated: boolean })[];
  pose: { yaw: number; pitch: number } | null;
  counts: Partial<Record<EventType, number>>;
  calibrated: boolean;
  fps: number;
  frame: FrameStats | null;
  models: { face: ModelInfo; objects: ModelInfo; identity: ModelInfo };
  identityChecks: { confidence: number; match: boolean; simulated: boolean; at: number }[];
  simulations: SimulationKind[];
  hasVideo: boolean;
}

export interface EngineCallbacks {
  onEvent(event: NewEventInput): void;
  onEventEnd(clientId: string, endedAt: number, label?: string, details?: Record<string, unknown>): void;
  onState(state: EngineState): void;
}

export interface EngineOptions {
  video: HTMLVideoElement;
  stream: MediaStream | null;
  microphoneActive: boolean;
  config: RiskConfig;
  reference: { descriptor: number[] | null; model: string | null } | null;
  callbacks: EngineCallbacks;
}

const uid = () => `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
const DIRECTION_TEXT: Record<GazeDirection, string> = { CENTER: 'center', LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down' };

function emptyCondition(): Condition {
  return {
    since: null,
    offSince: null,
    active: false,
    clientId: null,
    firedAt: 0,
    lastCleared: 0,
    simulated: false,
    frames: 0,
    hits: 0,
    peakScore: 0,
    title: '',
    detail: {},
  };
}

export class ProctoringEngine {
  private video: HTMLVideoElement;
  private stream: MediaStream | null;
  private config: RiskConfig;
  private cb: EngineCallbacks;
  private reference: EngineOptions['reference'];
  private microphoneActive: boolean;

  private gaze = getGazeService();
  private objects = getObjectDetectionService();
  private identity: FaceVerificationService | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private conds = {} as Record<ConditionKey, Condition>;
  private sims = new Map<SimulationKind, number>();
  private counts: Partial<Record<EventType, number>> = {};
  /** Every fired event (for local repeated-look-away weighting). */
  private fired: { eventType: EventType; timestamp: number; reviewStatus: 'PENDING' }[] = [];

  private lastFace: FaceObservation | null = null;
  private primary: FacePose | null = null;
  private direction: GazeDirection | 'UNKNOWN' = 'UNKNOWN';
  private calibration: Calibration = { ...DEFAULT_CALIBRATION };
  private calSamples: { yaw: number; v: number }[] = [];
  private calibrated = false;
  private yawHistory: { t: number; yaw: number }[] = [];

  private objectHistory: DetectedObject[][] = [];
  private objectBusy = false;
  private lastObjectRun = 0;
  private presentObjects: (DetectedObject & { simulated: boolean })[] = [];

  private frameStats: FrameStats | null = null;
  private lastFrameCheck = 0;
  private trackEnded = false;

  private identityChecks: EngineState['identityChecks'] = [];
  private identityBusy = false;
  private lastSimIdentity = 0;
  private lastIdentityRun = 0;

  private lastEmit = 0;
  private frameTimes: number[] = [];

  constructor(opts: EngineOptions) {
    this.video = opts.video;
    this.stream = opts.stream;
    this.config = opts.config;
    this.cb = opts.callbacks;
    this.reference = opts.reference;
    this.microphoneActive = opts.microphoneActive;
    (Object.keys(CONDITION_EVENT) as ConditionKey[]).forEach((k) => (this.conds[k] = emptyCondition()));
    this.watchTrack();
  }

  // ---------------------------------------------------------------- lifecycle

  async start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), 100);
    const tasks: Promise<unknown>[] = [
      this.gaze.load().catch(() => this.info('Face / gaze model unavailable — face monitoring paused', 'system')),
      this.objects.load().catch(() => this.info('Object detection model unavailable — phone / book detection paused', 'system')),
      loadFaceVerification().then((svc) => {
        this.identity = svc;
        if (svc.kind === 'demo') this.info('Face recognition model unavailable — identity checks use the DEMO adapter', 'system');
      }),
    ];
    await Promise.allSettled(tasks);
    if (!this.stream) {
      this.info('Camera unavailable — proctoring running in demo mode without video', 'system');
    }
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = Date.now();
    for (const key of Object.keys(this.conds) as ConditionKey[]) {
      const c = this.conds[key];
      if (c.active && c.clientId) this.cb.onEventEnd(c.clientId, now);
    }
  }

  setStream(stream: MediaStream | null) {
    this.stream = stream;
    this.trackEnded = false;
    this.watchTrack();
  }

  updateConfig(config: RiskConfig) {
    this.config = config;
  }

  recalibrate() {
    this.calSamples = [];
    this.calibrated = false;
    this.calibration = { ...DEFAULT_CALIBRATION };
  }

  simulate(kind: SimulationKind) {
    this.sims.set(kind, Date.now() + SIMULATION_DURATION[kind]);
  }

  /** Current status snapshot, used for heartbeats. */
  getLive(): LiveStatus {
    return this.buildState(Date.now()).live;
  }

  // ---------------------------------------------------------------- helpers

  private watchTrack() {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    track.addEventListener('ended', () => {
      this.trackEnded = true;
    });
  }

  private simActive(kind: SimulationKind, now: number) {
    const until = this.sims.get(kind);
    if (until == null) return false;
    if (until < now) {
      this.sims.delete(kind);
      return false;
    }
    return true;
  }

  private info(label: string, source: DetectionSource, simulated = false) {
    this.cb.onEvent({
      clientId: uid(),
      timestamp: Date.now(),
      eventType: 'NORMAL',
      label,
      confidence: null,
      simulated,
      source,
    });
  }

  private hasVideo() {
    return !!this.stream && !this.trackEnded && this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  /**
   * Generic condition state machine:
   *  raw true for `thresholdMs` → fire event (respecting cooldown)
   *  raw false for `clearMs`    → end event + "cleared" timeline entry
   */
  private step(
    key: ConditionKey,
    raw: boolean,
    now: number,
    o: {
      thresholdMs: number;
      clearMs: number;
      simulated: boolean;
      source: DetectionSource;
      title: () => string;
      confidence?: () => number | null;
      details?: () => Record<string, unknown>;
      endLabel?: (durationMs: number) => string;
      clearLabel: string;
      score?: number;
    },
  ) {
    const c = this.conds[key];
    if (raw) {
      c.offSince = null;
      if (c.since == null) {
        c.since = now;
        c.frames = 0;
        c.hits = 0;
        c.peakScore = 0;
      }
      c.hits++;
      c.peakScore = Math.max(c.peakScore, o.score ?? 0);
      c.simulated = c.simulated || o.simulated;
      // Demo-panel clicks skip the cooldown so every button press is visible.
      const cooledDown = o.simulated || now - c.lastCleared >= this.config.detection.cooldownSeconds * 1000;
      if (!c.active && now - c.since >= o.thresholdMs && cooledDown) {
        this.fire(key, c, now, o);
      }
    } else if (c.active) {
      if (c.offSince == null) c.offSince = now;
      if (now - c.offSince >= o.clearMs) this.clear(key, c, c.offSince, o);
    } else {
      c.since = null;
      c.simulated = false;
    }
    if (c.since != null) c.frames++;
  }

  private fire(
    key: ConditionKey,
    c: Condition,
    now: number,
    o: Parameters<ProctoringEngine['step']>[3],
  ) {
    const eventType = CONDITION_EVENT[key];
    const { value } = contributionFor(eventType, now, this.fired, this.config);
    const severity = severityFor(eventType, value, this.config);
    c.active = true;
    c.clientId = uid();
    c.firedAt = c.since ?? now;
    c.title = o.title();
    c.detail = o.details?.() ?? {};
    const wantsEvidence = this.config.evidenceSnapshots && (severity === 'HIGH' || severity === 'CRITICAL') && this.hasVideo();
    this.counts[eventType] = (this.counts[eventType] ?? 0) + 1;
    this.fired.push({ eventType, timestamp: now, reviewStatus: 'PENDING' });
    this.cb.onEvent({
      clientId: c.clientId,
      timestamp: c.firedAt,
      eventType,
      label: c.title,
      confidence: o.confidence ? o.confidence() : null,
      simulated: c.simulated,
      source: c.simulated ? 'demo-simulator' : o.source,
      details: { ...c.detail, thresholdMs: o.thresholdMs, simulated: c.simulated || undefined },
      evidence: wantsEvidence ? snapshot(this.video, 240, 0.6) : null,
    });
  }

  private clear(key: ConditionKey, c: Condition, endedAt: number, o: Parameters<ProctoringEngine['step']>[3]) {
    const duration = endedAt - c.firedAt;
    if (c.clientId) {
      this.cb.onEventEnd(c.clientId, endedAt, o.endLabel?.(duration), { durationMs: duration });
    }
    this.cb.onEvent({
      clientId: uid(),
      timestamp: endedAt,
      eventType: 'NORMAL',
      label: o.clearLabel,
      confidence: null,
      simulated: c.simulated,
      source: c.simulated ? 'demo-simulator' : o.source,
      details: { relatedEvent: CONDITION_EVENT[key], durationMs: duration },
    });
    c.active = false;
    c.clientId = null;
    c.since = null;
    c.offSince = null;
    c.lastCleared = endedAt;
    c.simulated = false;
  }

  private consistency(key: ConditionKey) {
    const c = this.conds[key];
    return c.frames > 0 ? Math.min(1, Math.round((c.hits / c.frames) * 100) / 100) : null;
  }

  // ---------------------------------------------------------------- main loop

  private tick() {
    if (!this.running) return;
    const now = Date.now();
    const det = this.config.detection;
    const videoOk = this.hasVideo();

    // 1) Face landmarks / head pose / gaze (real model, every tick).
    let face: FaceObservation | null = null;
    if (videoOk && this.gaze.status === 'real') {
      face = this.gaze.detect(this.video, performance.now());
      if (face) {
        this.frameTimes.push(now);
        while (this.frameTimes.length && this.frameTimes[0] < now - 1000) this.frameTimes.shift();
      }
    }
    if (face) this.lastFace = face;
    const faceModelLive = videoOk && this.gaze.status === 'real' && this.lastFace != null;

    // Demo overrides on raw observations.
    const simFaceMissing = this.simActive('FACE_MISSING', now);
    const simMultiple = this.simActive('MULTIPLE_FACES', now);
    const simLook = this.simActive('LOOK_AWAY', now);
    const simCamera = this.simActive('CAMERA_BLOCK', now);
    let facesCount = faceModelLive ? this.lastFace!.facesCount : -1;
    if (simFaceMissing) facesCount = 0;
    else if (simMultiple) facesCount = Math.max(2, facesCount);

    // Primary face = largest box.
    const faces = faceModelLive ? this.lastFace!.faces : [];
    const largest = faces.reduce<FacePose | null>((best, f) => (!best || f.box.w * f.box.h > best.box.w * best.box.h ? f : best), null);
    this.primary = largest && !simFaceMissing ? largest : null;

    // Calibration: median of the first ~2 s of a single, roughly frontal face.
    if (!this.calibrated && this.primary && faces.length === 1 && Math.abs(this.primary.yaw) < 25) {
      this.calSamples.push({ yaw: this.primary.yaw, v: this.primary.verticalRatio });
      if (this.calSamples.length >= 20) {
        const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
        this.calibration = { yaw: med(this.calSamples.map((s) => s.yaw)), verticalRatio: med(this.calSamples.map((s) => s.v)) };
        this.calibrated = true;
      }
    }

    let pose: FacePose | null = this.primary ? applyCalibration(this.primary, this.calibration) : null;
    if (simLook) {
      pose = pose ? { ...pose, yaw: -34, pitch: -4 } : null;
      this.direction = 'LEFT';
    } else if (pose) {
      this.direction = classifyGaze(pose, det.yawThresholdDeg, det.pitchThresholdDeg);
    } else {
      this.direction = 'UNKNOWN';
    }
    if (pose && !simLook) {
      this.yawHistory.push({ t: now, yaw: pose.yaw });
    }
    while (this.yawHistory.length && this.yawHistory[0].t < now - 10_000) this.yawHistory.shift();

    // 2) Frame heuristics (2 Hz).
    if (videoOk && now - this.lastFrameCheck > 500) {
      this.lastFrameCheck = now;
      this.frameStats = measureFrame(this.video);
    }

    // 3) Object detection (async, throttled).
    if (videoOk && !this.objectBusy && now - this.lastObjectRun >= this.objects.intervalMs && (this.objects.status === 'real' || this.objects.status === 'remote')) {
      this.objectBusy = true;
      this.lastObjectRun = now;
      this.objects
        .detect(this.video, performance.now())
        .then((list) => {
          if (list) {
            this.objectHistory.push(list);
            if (this.objectHistory.length > 3) this.objectHistory.shift();
          }
        })
        .finally(() => (this.objectBusy = false));
    }
    const minScore = det.objectConfidence;
    const presentReal = (label: ObjectLabel) => {
      const hits = this.objectHistory.filter((frame) => frame.some((o) => o.label === label && o.score >= minScore)).length;
      return hits >= 2;
    };
    const latest = (label: ObjectLabel) =>
      this.objectHistory
        .at(-1)
        ?.filter((o) => o.label === label && o.score >= minScore)
        .sort((a, b) => b.score - a.score)[0];
    const simObj = (kind: SimulationKind, label: ObjectLabel, score: number, box: DetectedObject['box']) =>
      this.simActive(kind, now) ? { label, score, box, simulated: true } : null;
    const objects: (DetectedObject & { simulated: boolean })[] = [];
    for (const label of ['cell phone', 'book', 'paper'] as ObjectLabel[]) {
      const real = presentReal(label) ? latest(label) : undefined;
      if (real) objects.push({ ...real, simulated: false });
    }
    const simPhone = simObj('PHONE', 'cell phone', 0.91, { x: 0.12, y: 0.55, w: 0.16, h: 0.3 });
    const simBook = simObj('BOOK', 'book', 0.84, { x: 0.64, y: 0.6, w: 0.3, h: 0.32 });
    const simPaper = simObj('PAPER', 'paper', 0.8, { x: 0.58, y: 0.66, w: 0.34, h: 0.28 });
    for (const s of [simPhone, simBook, simPaper]) if (s && !objects.some((o) => o.label === s.label)) objects.push(s);
    this.presentObjects = objects;
    const persons = this.objectHistory.at(-1)?.filter((o) => o.label === 'person' && o.score >= 0.6).length ?? 0;

    // 4) Identity checks (async, every N seconds; faster while simulating).
    const simIdentity = this.simActive('IDENTITY_MISMATCH', now);
    const idInterval = simIdentity ? 1000 : det.identityIntervalSeconds * 1000;
    if (!this.identityBusy && now - this.lastIdentityRun >= idInterval) {
      this.lastIdentityRun = now;
      if (simIdentity) {
        this.identityChecks.push({ confidence: 0.22 + Math.random() * 0.12, match: false, simulated: true, at: now });
      } else if (this.identity && (facesCount === 1 || (!videoOk && this.identity.kind === 'demo'))) {
        const svc = this.identity;
        if (svc.kind === 'demo' || !this.reference?.descriptor) {
          const cmp = demoFaceVerification().compare(null, null, det.identityThreshold);
          this.identityChecks.push({ confidence: cmp.confidence, match: true, simulated: true, at: now });
        } else if (videoOk) {
          this.identityBusy = true;
          svc
            .embed(this.video)
            .then((emb) => {
              if (!emb) return;
              const cmp = svc.compare(this.reference!.descriptor, emb, det.identityThreshold);
              this.identityChecks.push({ confidence: cmp.confidence, match: cmp.match, simulated: false, at: Date.now() });
            })
            .finally(() => (this.identityBusy = false));
        }
      }
      if (this.identityChecks.length > 20) this.identityChecks.splice(0, this.identityChecks.length - 20);
    }

    // ---------------------------------------------------- condition updates
    const noCamera = !this.stream || this.trackEnded;
    const cameraRaw = noCamera || simCamera || (!!this.frameStats?.blocked && videoOk);
    this.step('camera', cameraRaw, now, {
      thresholdMs: noCamera ? 0 : det.cameraDarkSeconds * 1000,
      clearMs: 1000,
      simulated: simCamera,
      source: 'frame-heuristics',
      title: () =>
        !this.stream
          ? 'Camera unavailable — exam running without video'
          : this.trackEnded
            ? 'Camera disconnected or permission revoked'
            : 'Camera frame too dark / possibly blocked',
      confidence: () =>
        noCamera ? 1 : this.frameStats ? Math.round(Math.max(0.5, Math.min(0.99, 1 - this.frameStats.brightness / 80)) * 100) / 100 : null,
      details: () => ({ brightness: this.frameStats ? Math.round(this.frameStats.brightness) : null }),
      endLabel: (d) => `Camera issue — ${(d / 1000).toFixed(1)} seconds`,
      clearLabel: 'Camera feed restored',
    });

    const canJudgeFace = (faceModelLive && !(cameraRaw && !simCamera)) || simFaceMissing || simMultiple;
    this.step('faceMissing', canJudgeFace && facesCount === 0, now, {
      thresholdMs: det.faceMissingSeconds * 1000,
      clearMs: 800,
      simulated: simFaceMissing,
      source: 'mediapipe-face-landmarker',
      title: () => `Face not visible for ${det.faceMissingSeconds}+ seconds`,
      confidence: () => this.consistency('faceMissing'),
      details: () => ({ confidenceBasis: 'share of frames with no face during the threshold window' }),
      endLabel: (d) => `Face not visible — ${(d / 1000).toFixed(1)} seconds`,
      clearLabel: 'Face visible again',
    });

    const multipleRaw = (canJudgeFace && facesCount >= 2) || (videoOk && persons >= 2);
    this.step('multipleFaces', multipleRaw, now, {
      thresholdMs: det.multipleFacesSeconds * 1000,
      clearMs: 1000,
      simulated: simMultiple,
      source: 'mediapipe-face-landmarker',
      title: () => 'Multiple faces detected — review required',
      confidence: () => this.consistency('multipleFaces'),
      details: () => ({ faces: Math.max(facesCount, persons), personsFromObjectModel: persons }),
      endLabel: (d) => `Multiple faces detected (${Math.max(2, facesCount)}) — ${(d / 1000).toFixed(1)} seconds`,
      clearLabel: 'Single face restored',
    });

    const lookRaw = this.direction !== 'UNKNOWN' && this.direction !== 'CENTER' && (simLook || facesCount === 1);
    const dirText = this.direction === 'UNKNOWN' ? 'away' : DIRECTION_TEXT[this.direction];
    this.step('lookAway', lookRaw, now, {
      thresholdMs: det.lookAwaySeconds * 1000,
      clearMs: 600,
      simulated: simLook,
      source: 'mediapipe-face-landmarker',
      title: () => `Prolonged look-away (${dirText})`,
      confidence: () => this.consistency('lookAway'),
      details: () => ({ direction: dirText, yaw: pose ? Math.round(pose.yaw) : null, pitch: pose ? Math.round(pose.pitch) : null }),
      endLabel: (d) => `Look-away detected (${(this.conds.lookAway.detail.direction as string) ?? 'away'}) — ${(d / 1000).toFixed(1)} seconds`,
      clearLabel: 'Normal gaze restored',
    });

    const yawStd = stdDev(this.yawHistory.map((s) => s.yaw));
    this.step('headMovement', this.yawHistory.length >= 30 && yawStd > det.headMovementStdDeg, now, {
      thresholdMs: 0,
      clearMs: 3000,
      simulated: false,
      source: 'mediapipe-face-landmarker',
      title: () => 'Excessive head movement over 10 seconds',
      confidence: () => Math.min(1, Math.round((yawStd / (det.headMovementStdDeg * 2)) * 100) / 100),
      details: () => ({ yawStdDeg: Math.round(yawStd) }),
      clearLabel: 'Head movement back to normal',
    });

    const objectStep = (key: 'phone' | 'book' | 'paper', label: ObjectLabel, title: string, clearLabel: string) => {
      const obj = objects.find((o) => o.label === label);
      this.step(key, !!obj, now, {
        thresholdMs: 0,
        clearMs: 1500,
        simulated: !!obj?.simulated,
        source: this.objects.source,
        title: () => title,
        confidence: () => (obj ? Math.round(Math.max(obj.score, this.conds[key].peakScore) * 100) / 100 : null),
        details: () => ({ object: label, model: obj?.simulated ? 'demo' : this.objects.modelName }),
        endLabel: (d) => `${title} — visible ${(d / 1000).toFixed(1)} seconds`,
        clearLabel,
        score: obj?.score,
      });
    };
    objectStep('phone', 'cell phone', 'Mobile phone detected in camera frame', 'Phone no longer detected');
    objectStep('book', 'book', 'Possible book/notes detected', 'Book/notes no longer detected');
    objectStep('paper', 'paper', 'Possible paper detected', 'Paper no longer detected');

    // Once a simulated mismatch is over, its fake checks are discarded so they
    // cannot keep the flag alive when no real check is possible (e.g. no camera).
    if (simIdentity) this.lastSimIdentity = now;
    const simOver = !simIdentity && now - this.lastSimIdentity > 3000;
    if (simOver && this.identityChecks.some((c) => c.simulated && !c.match)) {
      this.identityChecks = this.identityChecks.filter((c) => !(c.simulated && !c.match));
    }
    const idWindow = this.identityChecks.slice(-det.identityWindow);
    const failures = idWindow.filter((c) => !c.match).length;
    const lastTwoPass = this.identityChecks.length >= 2 && this.identityChecks.slice(-2).every((c) => c.match);
    const idActive = this.conds.identity.active;
    const identityRaw = idActive ? !(lastTwoPass || (this.conds.identity.simulated && simOver)) : failures >= det.identityFailures;
    const simIdentityWindow = simIdentity || idWindow.some((c) => c.simulated && !c.match);
    this.step('identity', identityRaw, now, {
      thresholdMs: 0,
      clearMs: 0,
      simulated: simIdentityWindow,
      source: this.identity?.kind === 'face-api' ? 'face-api' : 'demo-simulator',
      title: () => 'Identity verification requires review',
      confidence: () => {
        const avg = idWindow.reduce((a, c) => a + c.confidence, 0) / Math.max(1, idWindow.length);
        return Math.round((1 - avg) * 100) / 100;
      },
      details: () => ({
        failedChecks: failures,
        window: idWindow.length,
        avgMatchConfidence: Math.round((idWindow.reduce((a, c) => a + c.confidence, 0) / Math.max(1, idWindow.length)) * 100) / 100,
      }),
      clearLabel: 'Identity verified again',
    });

    if (now - this.lastEmit > 150) {
      this.lastEmit = now;
      this.cb.onState(this.buildState(now));
    }
  }

  private buildState(now: number): EngineState {
    const videoOk = this.hasVideo();
    const faceModelLive = videoOk && this.gaze.status === 'real';
    const simFaceMissing = this.simActive('FACE_MISSING', now);
    const simMultiple = this.simActive('MULTIPLE_FACES', now);
    let facesCount = faceModelLive && this.lastFace ? this.lastFace.facesCount : -1;
    if (simFaceMissing) facesCount = 0;
    else if (simMultiple) facesCount = Math.max(2, facesCount);

    const lastCheck = this.identityChecks.at(-1);
    const recent = this.identityChecks.slice(-3);
    const identityConfidence = recent.length ? recent.reduce((a, c) => a + c.confidence, 0) / recent.length : null;
    const identity: LiveStatus['identity'] = this.conds.identity.active || (lastCheck && !lastCheck.match)
      ? 'CHECK_REQUIRED'
      : lastCheck
        ? 'VERIFIED'
        : !this.stream || this.trackEnded
          ? 'UNAVAILABLE'
          : 'PENDING';

    const camera: LiveStatus['camera'] = !this.stream || this.trackEnded ? 'UNAVAILABLE' : this.conds.camera.since != null ? 'CHECK_CAMERA' : 'ACTIVE';
    const face: LiveStatus['face'] = facesCount < 0 ? 'UNKNOWN' : facesCount === 0 ? 'NOT_DETECTED' : facesCount >= 2 ? 'MULTIPLE' : 'DETECTED';

    const conditions: ActiveCondition[] = (Object.keys(this.conds) as ConditionKey[])
      .filter((k) => this.conds[k].active)
      .map((k) => ({
        key: k,
        eventType: CONDITION_EVENT[k],
        title: this.conds[k].title,
        startedAt: this.conds[k].firedAt,
        severity: EVENT_META[CONDITION_EVENT[k]].severity,
        simulated: this.conds[k].simulated,
      }));

    let pending: EngineState['pending'] = null;
    for (const [key, title, threshold] of [
      ['lookAway', 'Looking away from screen', this.config.detection.lookAwaySeconds],
      ['faceMissing', 'Face not visible', this.config.detection.faceMissingSeconds],
      ['multipleFaces', 'Additional face in frame', this.config.detection.multipleFacesSeconds],
    ] as const) {
      const c = this.conds[key];
      if (!c.active && c.since != null) {
        const elapsed = now - c.since;
        pending = { key, title, progress: Math.min(1, elapsed / (threshold * 1000)), elapsedMs: elapsed };
        break;
      }
    }

    const pose = this.primary ? applyCalibration(this.primary, this.calibration) : null;
    const simLook = this.simActive('LOOK_AWAY', now);
    const modelInfo = (status: ModelMode, name: string, error: string | null): ModelInfo => ({ status, name, error });
    const live: LiveStatus = {
      face,
      facesCount: Math.max(0, facesCount),
      identity,
      identityConfidence: identityConfidence == null ? null : Math.round(identityConfidence * 100) / 100,
      camera,
      microphone: this.microphoneActive ? 'ACTIVE' : 'UNAVAILABLE',
      gaze: this.direction,
      head: this.conds.headMovement.active ? 'EXCESSIVE_MOVEMENT' : pose ? 'NORMAL' : 'UNKNOWN',
      headPose: simLook ? { yaw: -34, pitch: -4 } : pose ? { yaw: Math.round(pose.yaw), pitch: Math.round(pose.pitch) } : null,
      objects: this.presentObjects.map((o) => o.label),
      models: {
        face: this.gaze.status,
        objects: this.objects.status,
        identity: this.identity ? (this.identity.kind === 'demo' ? 'demo' : 'real') : 'loading',
      },
      proctoring: this.running ? 'ACTIVE' : 'PAUSED',
      updatedAt: now,
    };

    return {
      live,
      conditions,
      pending,
      faces: faceModelLive && this.lastFace && !simFaceMissing ? this.lastFace.faces.map((f) => ({ box: f.box })) : [],
      objects: this.presentObjects,
      pose: live.headPose,
      counts: { ...this.counts },
      calibrated: this.calibrated,
      fps: this.frameTimes.length,
      frame: this.frameStats,
      models: {
        face: modelInfo(this.gaze.status, this.gaze.modelName, this.gaze.error),
        objects: modelInfo(this.objects.status, this.objects.modelName, this.objects.error),
        identity: this.identity
          ? modelInfo(this.identity.kind === 'demo' ? 'demo' : 'real', this.identity.modelName, this.identity.error)
          : modelInfo('loading', 'face-api.js ResNet-34 face embedding (128-d)', null),
      },
      identityChecks: this.identityChecks.slice(-10),
      simulations: [...this.sims.keys()].filter((k) => this.simActive(k, now)),
      hasVideo: videoOk,
    };
  }
}
