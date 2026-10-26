// Copies browser model assets that ship inside npm packages into /public so the
// app can load them locally (no CDN needed at exam time).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm'],
  ...['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model'].flatMap((m) => [
    [`node_modules/@vladmandic/face-api/model/${m}-weights_manifest.json`, `public/models/face-api/${m}-weights_manifest.json`],
    [`node_modules/@vladmandic/face-api/model/${m}.bin`, `public/models/face-api/${m}.bin`],
  ]),
];

for (const [from, to] of copies) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[assets] missing ${from} (skipped)`);
    continue;
  }
  mkdirSync(dirname(join(root, to)), { recursive: true });
  cpSync(src, join(root, to), { recursive: true });
}
console.log('[assets] MediaPipe wasm + face-api models copied to /public');
