// Shared domain model used by both the browser client and the Express server.

export type EventType =
  | 'LOOK_AWAY'
  | 'PHONE_DETECTED'
  | 'BOOK_DETECTED'
  | 'PAPER_DETECTED'
  | 'MULTIPLE_FACES'
  | 'FACE_MISSING'
  | 'IDENTITY_MISMATCH'
  | 'CAMERA_ISSUE'
  | 'HEAD_MOVEMENT'
  | 'NORMAL';

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReviewStatus = 'PENDING' | 'REVIEWED' | 'FALSE_POSITIVE' | 'NOT_REQUIRED';
export type SessionStatus = 'ACTIVE' | 'SUBMITTED' | 'TIMED_OUT';
export type SessionReviewStatus = 'PENDING_REVIEW' | 'IN_REVIEW' | 'CLEARED' | 'ESCALATED';

/**
 * Where an event came from. Anything other than `demo-simulator` / `seed-data`
 * was produced by a real model or a real measurement in the browser.
 */
export type DetectionSource =
  | 'mediapipe-face-landmarker'
  | 'mediapipe-object-detector'
  | 'yolo-http'
  | 'face-api'
  | 'frame-heuristics'
  | 'system'
  | 'demo-simulator'
  | 'seed-data';

export interface Student {
  id: string;
  studentId: string;
  name: string;
  email: string;
  examId: string | null;
  /** True when a face embedding exists. The embedding itself is never sent to examiners. */
  hasFaceReference: boolean;
  faceReferenceModel: string | null;
  verificationStatus: 'UNREGISTERED' | 'REGISTERED' | 'VERIFIED' | 'REVIEW';
  createdAt: number;
}

export interface Question {
  id: string;
  topic: string;
  text: string;
  options: string[];
}

export interface Exam {
  id: string;
  code: string;
  name: string;
  subject: string;
  durationMinutes: number;
  startTime: number;
  endTime: number;
  questions: Question[];
}

export interface ProctoringEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  /** When the condition cleared. `null` = still ongoing (no decay yet). */
  endedAt: number | null;
  eventType: EventType;
  severity: Severity;
  label: string;
  /** Model confidence 0..1, or null when not applicable. */
  confidence: number | null;
  riskContribution: number;
  details: Record<string, unknown>;
  simulated: boolean;
  source: DetectionSource;
  /** Optional small JPEG data URL captured when the event fired. */
  evidence: string | null;
  reviewStatus: ReviewStatus;
  examinerNote: string;
  reviewedAt: number | null;
}

export type NewEventInput = Pick<ProctoringEvent, 'eventType' | 'label' | 'confidence' | 'simulated' | 'source'> & {
  clientId: string;
  timestamp: number;
  endedAt?: number | null;
  details?: Record<string, unknown>;
  evidence?: string | null;
};

export type ModelMode = 'real' | 'remote' | 'demo' | 'loading' | 'error' | 'off';

export interface LiveStatus {
  face: 'DETECTED' | 'NOT_DETECTED' | 'MULTIPLE' | 'UNKNOWN';
  facesCount: number;
  identity: 'VERIFIED' | 'CHECK_REQUIRED' | 'PENDING' | 'UNAVAILABLE';
  identityConfidence: number | null;
  camera: 'ACTIVE' | 'CHECK_CAMERA' | 'UNAVAILABLE';
  microphone: 'ACTIVE' | 'UNAVAILABLE';
  gaze: 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'UNKNOWN';
  head: 'NORMAL' | 'EXCESSIVE_MOVEMENT' | 'UNKNOWN';
  headPose: { yaw: number; pitch: number } | null;
  objects: string[];
  models: { face: ModelMode; objects: ModelMode; identity: ModelMode };
  proctoring: 'ACTIVE' | 'PAUSED';
  updatedAt: number;
}

export interface RiskBreakdownItem {
  eventType: EventType;
  label: string;
  count: number;
  /** Sum of contributions when the events fired. */
  initial: number;
  /** Contribution right now, after decay. */
  current: number;
}

export interface RiskSnapshot {
  score: number;
  level: RiskLevel;
  breakdown: RiskBreakdownItem[];
  computedAt: number;
}

export interface RiskPoint {
  t: number;
  score: number;
}

export interface SessionSummary {
  id: string;
  student: { id: string; studentId: string; name: string };
  exam: { id: string; code: string; name: string; subject: string };
  status: SessionStatus;
  reviewStatus: SessionReviewStatus;
  startTime: number;
  endTime: number | null;
  risk: RiskSnapshot;
  lastEvent: { label: string; eventType: EventType; timestamp: number; severity: Severity } | null;
  warnings: number;
  pendingReview: number;
  live: LiveStatus | null;
  /** Heartbeat received recently (always true for simulated sessions while active). */
  online: boolean;
  /** True for seeded / simulator-driven sessions that are not a real person. */
  simulatedSession: boolean;
}

export interface SessionDetail extends SessionSummary {
  events: ProctoringEvent[];
  riskHistory: RiskPoint[];
  examinerNotes: string;
  answeredCount: number;
  questionCount: number;
  examScore: number | null;
  durationMinutes: number;
  riskResetAt: number | null;
}

export interface Alert {
  event: ProctoringEvent;
  session: { id: string; studentId: string; studentName: string; examName: string; simulatedSession: boolean };
}

export interface DashboardOverview {
  totals: { active: number; low: number; medium: number; high: number; critical: number; completed: number; pendingReview: number };
  sessions: SessionSummary[];
  alerts: Alert[];
  riskTrend: { t: number; avg: number; max: number }[];
}
