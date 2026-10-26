// REAL IMPLEMENTATION — MediaPipe Face Landmarker running in the browser
// (WebAssembly + WebGL). Provides face count, face boxes, head pose and eye
// gaze for every analysed frame. Nothing leaves the device.
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { ModelMode } from '@shared/types';
import { modelUrl, visionFileset, withDelegateFallback } from '../proctoring/visionRuntime';
import { estimatePose, type FacePose } from './headPose';

export interface FaceObservation {
  facesCount: number;
  faces: FacePose[];
  timestamp: number;
}

export interface GazeDetectionService {
  readonly source: 'mediapipe-face-landmarker';
  readonly modelName: string;
  status: ModelMode;
  error: string | null;
  load(): Promise<void>;
  detect(video: HTMLVideoElement, timestamp: number): FaceObservation | null;
}

const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

class MediaPipeGazeService implements GazeDetectionService {
  readonly source = 'mediapipe-face-landmarker' as const;
  readonly modelName = 'MediaPipe Face Landmarker (478 landmarks + blendshapes)';
  status: ModelMode = 'off';
  error: string | null = null;
  private landmarker: FaceLandmarker | null = null;
  private loading: Promise<void> | null = null;
  private lastTs = 0;

  load(): Promise<void> {
    if (this.landmarker) return Promise.resolve();
    if (!this.loading) {
      this.status = 'loading';
      this.loading = (async () => {
        try {
          const fileset = await visionFileset();
          const modelAssetPath = await modelUrl('/models/face_landmarker.task', REMOTE_MODEL);
          this.landmarker = await withDelegateFallback((delegate) =>
            FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath, delegate },
              runningMode: 'VIDEO',
              numFaces: 4,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
              outputFaceBlendshapes: true,
            }),
          );
          this.status = 'real';
          this.error = null;
        } catch (err) {
          console.error('[gaze] model load failed', err);
          this.status = 'error';
          this.error = 'Face landmark model could not be loaded (offline or unsupported browser).';
          this.loading = null;
          throw err;
        }
      })();
    }
    return this.loading;
  }

  detect(video: HTMLVideoElement, timestamp: number): FaceObservation | null {
    if (!this.landmarker || video.readyState < 2 || !video.videoWidth) return null;
    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(timestamp, this.lastTs + 1);
    this.lastTs = ts;
    try {
      const result = this.landmarker.detectForVideo(video, ts);
      const faces = result.faceLandmarks.map((lm, i) => estimatePose(lm, result.faceBlendshapes?.[i]?.categories));
      return { facesCount: faces.length, faces, timestamp };
    } catch (err) {
      console.warn('[gaze] detect failed', err);
      return null;
    }
  }
}

let instance: GazeDetectionService | null = null;
export function getGazeService(): GazeDetectionService {
  return (instance ??= new MediaPipeGazeService());
}
