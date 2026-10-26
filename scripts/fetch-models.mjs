// Downloads the MediaPipe model files used by the in-browser AI services into
// /public/models. Run once: `npm run models:fetch`. If you skip this step the
// app falls back to Google's CDN at runtime.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const models = {
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'efficientdet_lite0.tflite':
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
};

mkdirSync(join(root, 'public/models'), { recursive: true });
for (const [name, url] of Object.entries(models)) {
  const target = join(root, 'public/models', name);
  if (existsSync(target)) {
    console.log(`[models] ${name} already present`);
    continue;
  }
  console.log(`[models] downloading ${name} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  console.log(`[models] saved ${name}`);
}
