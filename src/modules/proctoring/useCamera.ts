import { useCallback, useEffect, useRef, useState } from 'react';
import { attachStream, CameraError, CAMERA_HELP, openCamera, stopStream, type CameraErrorCode } from './camera';

/** Opens the webcam into a <video> ref and exposes status + retry. */
export function useCamera(enabled = true) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [error, setError] = useState<{ code: CameraErrorCode; message: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);

  const start = useCallback(async () => {
    const gen = ++generation.current;
    setStatus('starting');
    setError(null);
    try {
      stopStream(streamRef.current);
      streamRef.current = null;
      const s = await openCamera();
      // A newer start (or unmount) happened while we waited: release this stream.
      if (gen !== generation.current) {
        stopStream(s);
        return;
      }
      streamRef.current = s;
      if (videoRef.current) await attachStream(videoRef.current, s);
      setStream(s);
      setStatus('active');
      s.getVideoTracks()[0]?.addEventListener('ended', () => {
        setStatus('error');
        setError({ code: 'UNKNOWN', message: 'The camera stopped. It may have been unplugged or the permission was revoked.' });
      });
    } catch (err) {
      if (gen !== generation.current) return;
      const e = err instanceof CameraError ? err : new CameraError('UNKNOWN', CAMERA_HELP.UNKNOWN);
      setError({ code: e.code, message: e.message });
      setStatus('error');
      setStream(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    start();
    return () => {
      generation.current++;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [enabled, start]);

  // Re-attach if the <video> element mounted after the stream was ready.
  useEffect(() => {
    const v = videoRef.current;
    if (stream && v && v.srcObject !== stream) attachStream(v, stream);
  });

  return { videoRef, stream, status, error, retry: start };
}
