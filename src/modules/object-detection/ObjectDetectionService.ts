// Object detection for unauthorised items (phone, book/notes, extra people).
//
// Two interchangeable adapters behind one interface:
//  • MediaPipeObjectAdapter — REAL, in-browser EfficientDet-Lite0 trained on
//    COCO. Detects "cell phone", "book" and "person". It cannot recognise loose
//    paper (not a COCO class) — PAPER_DETECTED is only produced by a custom
//    model behind the YOLO adapter or by the demo panel.
//  • YoloHttpAdapter — REAL when you run a YOLO service (see /yolo-service)
//    and set VITE_YOLO_ENDPOINT. Sends a small JPEG, receives detections.
import { ObjectDetector } from '@mediapipe/tasks-vision';
import type { DetectionSource, ModelMode } from '@shared/types';
import { modelUrl, visionFileset, withDelegateFallback } from '../proctoring/visionRuntime';

export type ObjectLabel = 'cell phone' | 'book' | 'paper' | 'person';

export interface DetectedObject {
  label: ObjectLabel;
  score: number;
  /** Normalised 0..1 in the raw (un-mirrored) frame. */
  box: { x: number; y: number; w: number; h: number };
}

export interface ObjectDetectionService {
  readonly source: Extract<DetectionSource, 'mediapipe-object-detector' | 'yolo-http'>;
  readonly modelName: string;
  /** Suggested minimum milliseconds between calls. */
  readonly intervalMs: number;
  status: ModelMode;
  error: string | null;
  load(): Promise<void>;
  detect(video: HTMLVideoElement, timestamp: number): Promise<DetectedObject[] | null>;
}

const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
const LABELS: ObjectLabel[] = ['cell phone', 'book', 'person'];

class MediaPipeObjectAdapter implements ObjectDetectionService {
  readonly source = 'mediapipe-object-detector' as const;
  readonly modelName = 'MediaPipe EfficientDet-Lite0 (COCO)';
  readonly intervalMs = 500;
  status: ModelMode = 'off';
  error: string | null = null;
  private detector: ObjectDetector | null = null;
  private loading: Promise<void> | null = null;
  private lastTs = 0;

  load(): Promise<void> {
    if (this.detector) return Promise.resolve();
    if (!this.loading) {
      this.status = 'loading';
      this.loading = (async () => {
        try {
          const fileset = await visionFileset();
          const modelAssetPath = await modelUrl('/models/efficientdet_lite0.tflite', REMOTE_MODEL);
          this.detector = await withDelegateFallback((delegate) =>
            ObjectDetector.createFromOptions(fileset, {
              baseOptions: { modelAssetPath, delegate },
              runningMode: 'VIDEO',
              scoreThreshold: 0.3,
              maxResults: 8,
              categoryAllowlist: LABELS,
            }),
          );
          this.status = 'real';
          this.error = null;
        } catch (err) {
          console.error('[objects] model load failed', err);
          this.status = 'error';
          this.error = 'Object detection model could not be loaded.';
          this.loading = null;
          throw err;
        }
      })();
    }
    return this.loading;
  }

  async detect(video: HTMLVideoElement, timestamp: number): Promise<DetectedObject[] | null> {
    if (!this.detector || video.readyState < 2 || !video.videoWidth) return null;
    const ts = Math.max(timestamp, this.lastTs + 1);
    this.lastTs = ts;
    try {
      const result = this.detector.detectForVideo(video, ts);
      const w = video.videoWidth;
      const h = video.videoHeight;
      return result.detections.flatMap((d) => {
        const c = d.categories[0];
        if (!c || !d.boundingBox || !LABELS.includes(c.categoryName as ObjectLabel)) return [];
        const b = d.boundingBox;
        return [{ label: c.categoryName as ObjectLabel, score: c.score, box: { x: b.originX / w, y: b.originY / h, w: b.width / w, h: b.height / h } }];
      });
    } catch (err) {
      console.warn('[objects] detect failed', err);
      return null;
    }
  }
}

/**
 * Connects to an external YOLO (e.g. YOLOv8) inference service.
 * Contract: POST {endpoint}/detect  { image: "data:image/jpeg;base64,..." }
 *        →  { detections: [{ label, confidence, box: [x, y, w, h] (0..1) }] }
 */
class YoloHttpAdapter implements ObjectDetectionService {
  readonly source = 'yolo-http' as const;
  readonly modelName: string;
  readonly intervalMs = 1000;
  status: ModelMode = 'off';
  error: string | null = null;
  private canvas = document.createElement('canvas');
  private inFlight = false;

  constructor(private endpoint: string) {
    this.modelName = `YOLO service @ ${endpoint}`;
  }

  async load() {
    this.status = 'loading';
    try {
      const res = await fetch(`${this.endpoint}/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      this.status = 'remote';
      this.error = null;
    } catch (err) {
      this.status = 'error';
      this.error = `YOLO service unreachable at ${this.endpoint}.`;
      throw err;
    }
  }

  async detect(video: HTMLVideoElement): Promise<DetectedObject[] | null> {
    if (this.inFlight || video.readyState < 2 || !video.videoWidth) return null;
    this.inFlight = true;
    try {
      this.canvas.width = 416;
      this.canvas.height = Math.round((video.videoHeight / video.videoWidth) * 416);
      this.canvas.getContext('2d')!.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
      const res = await fetch(`${this.endpoint}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: this.canvas.toDataURL('image/jpeg', 0.7) }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { detections: { label: string; confidence: number; box: [number, number, number, number] }[] };
      return data.detections
        .map((d) => ({ ...d, label: d.label === 'notebook' || d.label === 'notes' ? 'book' : d.label }))
        .filter((d): d is typeof d & { label: ObjectLabel } => ['cell phone', 'book', 'paper', 'person'].includes(d.label))
        .map((d) => ({ label: d.label, score: d.confidence, box: { x: d.box[0], y: d.box[1], w: d.box[2], h: d.box[3] } }));
    } catch {
      return null;
    } finally {
      this.inFlight = false;
    }
  }
}

let instance: ObjectDetectionService | null = null;
export function getObjectDetectionService(): ObjectDetectionService {
  if (!instance) {
    const endpoint = (import.meta.env.VITE_YOLO_ENDPOINT as string | undefined)?.trim();
    instance = endpoint ? new YoloHttpAdapter(endpoint.replace(/\/$/, '')) : new MediaPipeObjectAdapter();
  }
  return instance;
}
