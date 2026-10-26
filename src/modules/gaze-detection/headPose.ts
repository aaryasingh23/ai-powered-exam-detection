// Head-pose and gaze estimation from MediaPipe Face Landmarker output.
//
// Angles are derived from landmark geometry in the RAW (un-mirrored) camera
// image, which keeps the sign conventions unambiguous:
//   yaw   > 0  → student turned to THEIR right
//   pitch > 0  → student looking up
// Values are approximate degrees, good enough for "is the student facing the
// screen" — not a calibrated 3-D pose.
import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type GazeDirection = 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export interface FacePose {
  yaw: number;
  pitch: number;
  /** Raw vertical ratio before calibration (nose below eye line / eye distance). */
  verticalRatio: number;
  /** Eye gaze from blendshapes: + = looking to their right / up. */
  eyeHorizontal: number;
  eyeDown: number;
  eyeUp: number;
  box: { x: number; y: number; w: number; h: number };
}

const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 263; // subject's left eye (image right side)
const RIGHT_EYE_OUTER = 33; // subject's right eye
const NOSE_DEPTH_RATIO = 0.55;

function blend(categories: Category[] | undefined, name: string): number {
  return categories?.find((c) => c.categoryName === name)?.score ?? 0;
}

export function estimatePose(landmarks: NormalizedLandmark[], blendshapes?: Category[]): FacePose {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const nose = landmarks[NOSE_TIP];
  const le = landmarks[LEFT_EYE_OUTER];
  const re = landmarks[RIGHT_EYE_OUTER];
  const midX = (le.x + re.x) / 2;
  const midY = (le.y + re.y) / 2;
  const eyeDist = Math.max(1e-4, Math.hypot(le.x - re.x, le.y - re.y));
  // Turning to their right moves the nose towards the image LEFT (smaller x).
  const horizontal = (nose.x - midX) / (eyeDist / 2);
  const yaw = -(Math.atan(horizontal / NOSE_DEPTH_RATIO) * 180) / Math.PI;
  const verticalRatio = (nose.y - midY) / eyeDist;

  const eyeHorizontal =
    (blend(blendshapes, 'eyeLookOutRight') + blend(blendshapes, 'eyeLookInLeft') - blend(blendshapes, 'eyeLookOutLeft') - blend(blendshapes, 'eyeLookInRight')) / 2;
  const eyeDown = (blend(blendshapes, 'eyeLookDownLeft') + blend(blendshapes, 'eyeLookDownRight')) / 2;
  const eyeUp = (blend(blendshapes, 'eyeLookUpLeft') + blend(blendshapes, 'eyeLookUpRight')) / 2;

  return {
    yaw,
    pitch: 0,
    verticalRatio,
    eyeHorizontal,
    eyeDown,
    eyeUp,
    box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

export interface Calibration {
  yaw: number;
  verticalRatio: number;
}

/** Typical neutral values when no calibration is available yet. */
export const DEFAULT_CALIBRATION: Calibration = { yaw: 0, verticalRatio: 0.5 };

export function applyCalibration(pose: FacePose, cal: Calibration): FacePose {
  const dv = pose.verticalRatio - cal.verticalRatio;
  return {
    ...pose,
    yaw: pose.yaw - cal.yaw,
    // Nose dropping towards the chin (larger ratio) = looking down.
    pitch: -(Math.atan(dv / NOSE_DEPTH_RATIO) * 180) / Math.PI,
  };
}

export function classifyGaze(pose: FacePose, yawThreshold: number, pitchThreshold: number): GazeDirection {
  if (pose.yaw > yawThreshold) return 'RIGHT';
  if (pose.yaw < -yawThreshold) return 'LEFT';
  if (pose.pitch < -pitchThreshold || pose.eyeDown > 0.62) return 'DOWN';
  if (pose.pitch > pitchThreshold || pose.eyeUp > 0.65) return 'UP';
  if (pose.eyeHorizontal > 0.55) return 'RIGHT';
  if (pose.eyeHorizontal < -0.55) return 'LEFT';
  return 'CENTER';
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}
