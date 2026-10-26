// Webcam / microphone access with errors mapped to student-friendly messages.

export type CameraErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'IN_USE' | 'INSECURE_CONTEXT' | 'UNSUPPORTED' | 'UNKNOWN';

export class CameraError extends Error {
  constructor(
    public code: CameraErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const CAMERA_HELP: Record<CameraErrorCode, string> = {
  PERMISSION_DENIED:
    'Camera permission was denied. Click the camera icon in your browser’s address bar, choose “Allow”, then press Retry.',
  NOT_FOUND: 'No camera was found. Connect a webcam (or enable the built-in one) and press Retry.',
  IN_USE: 'The camera is being used by another application (Zoom, Teams, another tab). Close it and press Retry.',
  INSECURE_CONTEXT: 'Camera access needs a secure page. Open the app via http://localhost or HTTPS.',
  UNSUPPORTED: 'This browser does not support camera access. Please use a recent Chrome, Edge or Firefox.',
  UNKNOWN: 'The camera could not be started. Check your device and press Retry.',
};

function mapError(err: unknown): CameraError {
  const name = (err as DOMException)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new CameraError('PERMISSION_DENIED', CAMERA_HELP.PERMISSION_DENIED);
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new CameraError('NOT_FOUND', CAMERA_HELP.NOT_FOUND);
  if (name === 'NotReadableError' || name === 'AbortError') return new CameraError('IN_USE', CAMERA_HELP.IN_USE);
  return new CameraError('UNKNOWN', CAMERA_HELP.UNKNOWN);
}

export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('INSECURE_CONTEXT', CAMERA_HELP.INSECURE_CONTEXT);
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('UNSUPPORTED', CAMERA_HELP.UNSUPPORTED);
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user', frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (err) {
    throw mapError(err);
  }
}

/** Microphone is optional: used only for a level meter, never recorded. */
export async function openMicrophone(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch {
    return null;
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function attachStream(video: HTMLVideoElement, stream: MediaStream) {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadeddata', done, { once: true });
      setTimeout(done, 3000);
    });
  }
  await video.play().catch(() => undefined);
}

/** Live microphone level 0..1 via an AnalyserNode (audio is not stored or sent). */
export function createLevelMeter(stream: MediaStream): { level(): number; close(): void } {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  return {
    level() {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    },
    close() {
      source.disconnect();
      ctx.close().catch(() => undefined);
    },
  };
}
