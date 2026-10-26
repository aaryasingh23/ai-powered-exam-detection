// Shared MediaPipe Tasks runtime. Assets are served locally from /public
// (copied by `npm install`), with Google's CDN as a fallback.
import { FilesetResolver } from '@mediapipe/tasks-vision';

const LOCAL_WASM = '/mediapipe/wasm';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let fileset: Promise<Fileset> | null = null;

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    // Vite answers unknown paths with index.html — that is not a model.
    return res.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

export function visionFileset(): Promise<Fileset> {
  if (!fileset) {
    fileset = (async () => {
      const local = await exists(`${LOCAL_WASM}/vision_wasm_internal.wasm`);
      return FilesetResolver.forVisionTasks(local ? LOCAL_WASM : CDN_WASM);
    })();
    fileset.catch(() => {
      fileset = null;
    });
  }
  return fileset;
}

/** Prefers the locally downloaded model file, falls back to the official URL. */
export async function modelUrl(localPath: string, remote: string): Promise<string> {
  return (await exists(localPath)) ? localPath : remote;
}

/** Tries GPU first and falls back to CPU (some laptops/VMs lack WebGL2). */
export async function withDelegateFallback<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU');
  } catch (err) {
    console.warn('[vision] GPU delegate failed, using CPU', err);
    return create('CPU');
  }
}
