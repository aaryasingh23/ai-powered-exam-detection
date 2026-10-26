// Transparent, deterministic risk scoring. The same module runs in the browser
// (instant feedback) and on the server (authoritative score for examiners).
//
// Rules, in plain words:
//  1. Every suspicious event adds a configurable weight when it fires.
//  2. Look-aways escalate: once N happen inside a time window, each further one
//     uses the higher "repeated look-away" weight.
//  3. While a condition is still ongoing (e.g. phone still visible) its
//     contribution does not decay.
//  4. After the condition clears and a grace period passes, the contribution
//     halves every `halfLifeSeconds`, so the score falls when behaviour stops.
//  5. Events an examiner marks FALSE_POSITIVE no longer count.
//  6. The score is capped at 100. It is a review aid, never a verdict.

import type { EventType, ProctoringEvent, RiskBreakdownItem, RiskLevel, RiskPoint, RiskSnapshot, Severity } from './types';

export type WeightKey =
  | 'lookAway'
  | 'repeatedLookAway'
  | 'phone'
  | 'book'
  | 'paper'
  | 'multipleFaces'
  | 'faceMissing'
  | 'identityMismatch'
  | 'cameraIssue'
  | 'headMovement';

export interface RiskConfig {
  weights: Record<WeightKey, number>;
  repeatedLookAway: { count: number; windowSeconds: number };
  decay: { graceSeconds: number; halfLifeSeconds: number };
  thresholds: { medium: number; high: number; critical: number };
  detection: {
    /** Seconds the gaze/head must stay away before LOOK_AWAY fires. */
    lookAwaySeconds: number;
    /** Seconds with no face before FACE_MISSING fires. */
    faceMissingSeconds: number;
    /** Seconds 2+ faces must persist before MULTIPLE_FACES fires. */
    multipleFacesSeconds: number;
    /** Minimum object-detector score for phone / book. */
    objectConfidence: number;
    /** Minimum identity confidence counted as a match. */
    identityThreshold: number;
    /** Rolling window of identity checks and how many must fail. */
    identityWindow: number;
    identityFailures: number;
    /** Seconds between identity checks. */
    identityIntervalSeconds: number;
    /** Seconds a dark / blocked frame must persist before CAMERA_ISSUE fires. */
    cameraDarkSeconds: number;
    /** Head yaw standard deviation (degrees, 10 s window) counted as excessive movement. */
    headMovementStdDeg: number;
    /** Minimum seconds between two events of the same type. */
    cooldownSeconds: number;
    /** Head yaw / pitch (degrees, relative to calibration) counted as "away". */
    yawThresholdDeg: number;
    pitchThresholdDeg: number;
  };
  /** Store a small evidence snapshot with HIGH / CRITICAL events. */
  evidenceSnapshots: boolean;
  /** Stream a low-res preview frame (memory only, never stored) to examiners. */
  livePreview: boolean;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  weights: {
    lookAway: 5,
    repeatedLookAway: 10,
    phone: 20,
    book: 15,
    paper: 15,
    multipleFaces: 25,
    faceMissing: 10,
    identityMismatch: 30,
    cameraIssue: 5,
    headMovement: 5,
  },
  repeatedLookAway: { count: 3, windowSeconds: 180 },
  decay: { graceSeconds: 60, halfLifeSeconds: 240 },
  thresholds: { medium: 20, high: 50, critical: 75 },
  detection: {
    lookAwaySeconds: 2.5,
    faceMissingSeconds: 5,
    multipleFacesSeconds: 1.5,
    objectConfidence: 0.5,
    identityThreshold: 0.5,
    identityWindow: 5,
    identityFailures: 3,
    identityIntervalSeconds: 5,
    cameraDarkSeconds: 3,
    headMovementStdDeg: 18,
    cooldownSeconds: 8,
    yawThresholdDeg: 22,
    pitchThresholdDeg: 18,
  },
  evidenceSnapshots: true,
  livePreview: true,
};

export interface EventMeta {
  label: string;
  shortLabel: string;
  weightKey: WeightKey | null;
  severity: Severity;
  description: string;
}

export const EVENT_META: Record<EventType, EventMeta> = {
  LOOK_AWAY: {
    label: 'Prolonged look-away',
    shortLabel: 'Look-away',
    weightKey: 'lookAway',
    severity: 'LOW',
    description: 'Head or gaze stayed away from the screen longer than the configured threshold.',
  },
  PHONE_DETECTED: {
    label: 'Mobile phone detected',
    shortLabel: 'Phone detected',
    weightKey: 'phone',
    severity: 'HIGH',
    description: 'The object detector found a mobile phone in the camera frame.',
  },
  BOOK_DETECTED: {
    label: 'Possible book / notes detected',
    shortLabel: 'Book / notes',
    weightKey: 'book',
    severity: 'MEDIUM',
    description: 'The object detector found a book or notebook in the camera frame.',
  },
  PAPER_DETECTED: {
    label: 'Possible paper detected',
    shortLabel: 'Paper',
    weightKey: 'paper',
    severity: 'MEDIUM',
    description: 'Loose paper / notes. Requires a custom-trained detector (see YOLO service); demo-only in the browser.',
  },
  MULTIPLE_FACES: {
    label: 'Multiple faces detected',
    shortLabel: 'Multiple faces',
    weightKey: 'multipleFaces',
    severity: 'HIGH',
    description: 'More than one face was visible for longer than the configured threshold.',
  },
  FACE_MISSING: {
    label: 'Face not visible',
    shortLabel: 'Face missing',
    weightKey: 'faceMissing',
    severity: 'MEDIUM',
    description: 'No face was visible for longer than the configured threshold.',
  },
  IDENTITY_MISMATCH: {
    label: 'Identity verification requires review',
    shortLabel: 'Identity check',
    weightKey: 'identityMismatch',
    severity: 'CRITICAL',
    description: 'Repeated identity checks scored below the match threshold.',
  },
  CAMERA_ISSUE: {
    label: 'Camera issue',
    shortLabel: 'Camera issue',
    weightKey: 'cameraIssue',
    severity: 'LOW',
    description: 'Camera unavailable, permission revoked, or the frame is dark / blocked.',
  },
  HEAD_MOVEMENT: {
    label: 'Excessive head movement',
    shortLabel: 'Head movement',
    weightKey: 'headMovement',
    severity: 'LOW',
    description: 'Head orientation varied far more than usual over a 10 second window.',
  },
  NORMAL: {
    label: 'Status update',
    shortLabel: 'Normal',
    weightKey: null,
    severity: 'INFO',
    description: 'Informational timeline entry (session start, condition cleared, verification passed).',
  },
};

export const WEIGHT_LABELS: Record<WeightKey, string> = {
  lookAway: 'Prolonged look-away',
  repeatedLookAway: 'Repeated look-away',
  phone: 'Phone detected',
  book: 'Book / notes detected',
  paper: 'Paper detected',
  multipleFaces: 'Multiple faces',
  faceMissing: 'Face missing (extended)',
  identityMismatch: 'Identity mismatch',
  cameraIssue: 'Camera issue',
  headMovement: 'Excessive head movement',
};

export function mergeConfig(partial: Partial<RiskConfig> | null | undefined): RiskConfig {
  const p = partial ?? {};
  return {
    ...DEFAULT_RISK_CONFIG,
    ...p,
    weights: { ...DEFAULT_RISK_CONFIG.weights, ...(p.weights ?? {}) },
    repeatedLookAway: { ...DEFAULT_RISK_CONFIG.repeatedLookAway, ...(p.repeatedLookAway ?? {}) },
    decay: { ...DEFAULT_RISK_CONFIG.decay, ...(p.decay ?? {}) },
    thresholds: { ...DEFAULT_RISK_CONFIG.thresholds, ...(p.thresholds ?? {}) },
    detection: { ...DEFAULT_RISK_CONFIG.detection, ...(p.detection ?? {}) },
  };
}

export function riskLevel(score: number, config: RiskConfig = DEFAULT_RISK_CONFIG): RiskLevel {
  if (score >= config.thresholds.critical) return 'CRITICAL';
  if (score >= config.thresholds.high) return 'HIGH';
  if (score >= config.thresholds.medium) return 'MEDIUM';
  return 'LOW';
}

type ScorableEvent = Pick<ProctoringEvent, 'eventType' | 'timestamp' | 'endedAt' | 'riskContribution' | 'reviewStatus'>;

/** Weight an event earns at the moment it fires, plus the rule that applied. */
export function contributionFor(
  eventType: EventType,
  at: number,
  previous: Pick<ProctoringEvent, 'eventType' | 'timestamp' | 'reviewStatus'>[],
  config: RiskConfig,
): { value: number; rule: string } {
  const meta = EVENT_META[eventType];
  if (!meta.weightKey) return { value: 0, rule: 'Informational' };
  if (eventType === 'LOOK_AWAY') {
    const windowStart = at - config.repeatedLookAway.windowSeconds * 1000;
    const recent = previous.filter(
      (e) => e.eventType === 'LOOK_AWAY' && e.reviewStatus !== 'FALSE_POSITIVE' && e.timestamp >= windowStart && e.timestamp <= at,
    ).length;
    if (recent + 1 >= config.repeatedLookAway.count) {
      return {
        value: config.weights.repeatedLookAway,
        rule: `Repeated look-away (${recent + 1} in ${Math.round(config.repeatedLookAway.windowSeconds / 60)} min)`,
      };
    }
  }
  return { value: config.weights[meta.weightKey], rule: WEIGHT_LABELS[meta.weightKey] };
}

export function decayFactor(event: Pick<ScorableEvent, 'endedAt'>, at: number, config: RiskConfig): number {
  if (event.endedAt == null || event.endedAt > at) return 1;
  const idleSeconds = (at - event.endedAt) / 1000 - config.decay.graceSeconds;
  if (idleSeconds <= 0) return 1;
  return Math.pow(0.5, idleSeconds / config.decay.halfLifeSeconds);
}

export function computeRisk(
  events: ScorableEvent[],
  at: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
  resetAt: number | null = null,
): RiskSnapshot {
  const groups = new Map<EventType, RiskBreakdownItem>();
  let total = 0;
  for (const e of events) {
    if (e.eventType === 'NORMAL' || e.riskContribution <= 0) continue;
    if (e.reviewStatus === 'FALSE_POSITIVE') continue;
    if (e.timestamp > at) continue;
    if (resetAt != null && e.timestamp < resetAt) continue;
    // An event that was still open at evaluation time counts as ongoing.
    const current = e.riskContribution * decayFactor(e, at, config);
    total += current;
    const g = groups.get(e.eventType) ?? {
      eventType: e.eventType,
      label: EVENT_META[e.eventType].shortLabel,
      count: 0,
      initial: 0,
      current: 0,
    };
    g.count += 1;
    g.initial += e.riskContribution;
    g.current += current;
    groups.set(e.eventType, g);
  }
  const score = Math.min(100, Math.round(total));
  const breakdown = [...groups.values()]
    .map((g) => ({ ...g, current: Math.round(g.current * 10) / 10 }))
    .sort((a, b) => b.current - a.current);
  return { score, level: riskLevel(score, config), breakdown, computedAt: at };
}

/** Re-evaluates the score at regular steps — used for the "time vs risk" chart. */
export function riskTimeline(
  events: ScorableEvent[],
  from: number,
  to: number,
  stepMs: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
  resetAt: number | null = null,
): RiskPoint[] {
  const points: RiskPoint[] = [];
  if (to <= from) return [{ t: from, score: computeRisk(events, from, config, resetAt).score }];
  const steps = Math.min(400, Math.ceil((to - from) / stepMs));
  const step = (to - from) / steps;
  for (let i = 0; i <= steps; i++) {
    const t = Math.round(from + i * step);
    const visible = events.map((e) => (e.endedAt != null && e.endedAt > t ? { ...e, endedAt: null } : e));
    points.push({ t, score: computeRisk(visible, t, config, resetAt).score });
  }
  return points;
}

export const RISK_LEVEL_TEXT: Record<RiskLevel, string> = {
  LOW: 'Low risk',
  MEDIUM: 'Medium risk',
  HIGH: 'High risk',
  CRITICAL: 'Critical — review required',
};

export function severityRank(s: Severity): number {
  return ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(s);
}

/** Look-aways become MEDIUM once they are repeated. */
export function severityFor(eventType: EventType, contribution: number, config: RiskConfig): Severity {
  if (eventType === 'LOOK_AWAY' && contribution >= config.weights.repeatedLookAway) return 'MEDIUM';
  return EVENT_META[eventType].severity;
}
