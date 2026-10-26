// Latest low-resolution preview frame per session, kept in memory only.
// Frames are never written to disk and are dropped when the session ends.
const frames = new Map<string, { frame: string; at: number }>();

export function putFrame(sessionId: string, frame: string) {
  frames.set(sessionId, { frame, at: Date.now() });
}
export function getFrame(sessionId: string) {
  return frames.get(sessionId) ?? null;
}
export function dropFrame(sessionId: string) {
  frames.delete(sessionId);
}
