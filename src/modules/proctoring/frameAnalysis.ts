// Cheap, model-free frame measurements (real, not simulated).

const probe = document.createElement('canvas');
probe.width = 32;
probe.height = 24;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });

export interface FrameStats {
  /** Mean luminance 0..255. */
  brightness: number;
  /** Luminance standard deviation — a covered lens is dark AND flat. */
  contrast: number;
  blocked: boolean;
}

export function measureFrame(video: HTMLVideoElement): FrameStats | null {
  if (!probeCtx || video.readyState < 2 || !video.videoWidth) return null;
  probeCtx.drawImage(video, 0, 0, probe.width, probe.height);
  const { data } = probeCtx.getImageData(0, 0, probe.width, probe.height);
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += y;
    sumSq += y * y;
  }
  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));
  return { brightness, contrast, blocked: brightness < 22 || (brightness < 70 && contrast < 7) };
}

/** Small JPEG of the current frame (used for evidence and the examiner preview). */
export function snapshot(video: HTMLVideoElement, width = 320, quality = 0.6): string | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Mirror so the examiner sees the same orientation as the student.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
