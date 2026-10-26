// Face verification = "is this the same person who registered?"
//
//  • FaceApiAdapter — REAL. @vladmandic/face-api (TensorFlow.js) computes a
//    128-number face embedding (FaceNet-style ResNet). Two embeddings of the
//    same person have a small Euclidean distance (< ~0.5).
//  • DemoFaceAdapter — DEMO FALLBACK used only if the model cannot load. It
//    does NOT compare faces; it returns clearly-labelled simulated values so
//    the flow can still be demonstrated.
//
// Only the embedding is stored on the server — never a photo.
import type { ModelMode } from '@shared/types';

export interface FaceEmbedding {
  descriptor: number[];
  detectionScore: number;
}

export interface FaceComparison {
  distance: number | null;
  /** 0..1 */
  confidence: number;
  match: boolean;
  simulated: boolean;
}

export interface FaceVerificationService {
  readonly kind: 'face-api' | 'demo';
  readonly modelName: string;
  status: ModelMode;
  error: string | null;
  load(): Promise<void>;
  embed(input: HTMLVideoElement): Promise<FaceEmbedding | null>;
  compare(reference: number[] | null, probe: FaceEmbedding | null, threshold: number): FaceComparison;
}

/** Maps embedding distance to an intuitive confidence (0.5 at distance 0.5). */
export function distanceToConfidence(distance: number): number {
  return 1 / (1 + Math.exp((distance - 0.5) * 14));
}

export function averageDescriptors(list: number[][]): number[] {
  const out = new Array(list[0].length).fill(0);
  for (const d of list) d.forEach((v, i) => (out[i] += v / list.length));
  return out;
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

type FaceApi = typeof import('@vladmandic/face-api');

class FaceApiAdapter implements FaceVerificationService {
  readonly kind = 'face-api' as const;
  readonly modelName = 'face-api.js ResNet-34 face embedding (128-d)';
  status: ModelMode = 'off';
  error: string | null = null;
  private api: FaceApi | null = null;
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.api) return Promise.resolve();
    if (!this.loading) {
      this.status = 'loading';
      this.loading = (async () => {
        try {
          // Loaded lazily: it bundles TensorFlow.js (~1.3 MB).
          const faceapi = await import('@vladmandic/face-api');
          // The bundled tfjs typings are partial; these calls exist at runtime.
          const tf = faceapi.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
          try {
            await tf.setBackend('webgl');
          } catch {
            await tf.setBackend('cpu');
          }
          await tf.ready();
          const base = '/models/face-api';
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(base),
            faceapi.nets.faceLandmark68Net.loadFromUri(base),
            faceapi.nets.faceRecognitionNet.loadFromUri(base),
          ]);
          this.api = faceapi;
          this.status = 'real';
          this.error = null;
        } catch (err) {
          console.error('[face-verification] model load failed', err);
          this.status = 'error';
          this.error = 'Face recognition model could not be loaded.';
          this.loading = null;
          throw err;
        }
      })();
    }
    return this.loading;
  }

  async embed(input: HTMLVideoElement): Promise<FaceEmbedding | null> {
    const faceapi = this.api;
    if (!faceapi || input.readyState < 2 || !input.videoWidth) return null;
    try {
      const result = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!result) return null;
      return { descriptor: Array.from(result.descriptor), detectionScore: result.detection.score };
    } catch (err) {
      console.warn('[face-verification] embed failed', err);
      return null;
    }
  }

  compare(reference: number[] | null, probe: FaceEmbedding | null, threshold: number): FaceComparison {
    if (!reference || !probe || reference.length !== probe.descriptor.length) {
      return { distance: null, confidence: 0, match: false, simulated: false };
    }
    const distance = euclidean(reference, probe.descriptor);
    const confidence = distanceToConfidence(distance);
    return { distance, confidence, match: confidence >= threshold, simulated: false };
  }
}

class DemoFaceAdapter implements FaceVerificationService {
  readonly kind = 'demo' as const;
  readonly modelName = 'Demo adapter (no biometric comparison)';
  status: ModelMode = 'demo';
  error: string | null = null;
  async load() {}
  async embed(): Promise<FaceEmbedding | null> {
    return { descriptor: [], detectionScore: 1 };
  }
  compare(): FaceComparison {
    return { distance: null, confidence: 0.94 + Math.random() * 0.04, match: true, simulated: true };
  }
}

let real: FaceApiAdapter | null = null;
const demo = new DemoFaceAdapter();

/** Returns the real adapter once loaded, or the demo adapter if loading failed. */
export async function loadFaceVerification(): Promise<FaceVerificationService> {
  real ??= new FaceApiAdapter();
  try {
    await real.load();
    return real;
  } catch {
    return demo;
  }
}

export function faceVerificationStatus(): FaceVerificationService | null {
  return real;
}

export function demoFaceVerification(): FaceVerificationService {
  return demo;
}
