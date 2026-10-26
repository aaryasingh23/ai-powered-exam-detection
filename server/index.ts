import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from './auth';
import { all, run } from './db';
import { dropFrame } from './frames';
import { finalizeSession, ONLINE_WINDOW_MS } from './repo';
import { authRouter } from './routes/auth';
import { examinerRouter } from './routes/examiner';
import { studentRouter } from './routes/student';
import { seedIfNeeded } from './seed';
import { tickSimulator } from './simulator';

// Port priority: `--port 5000` argument (works the same on Windows / macOS / Linux),
// then PORT (injected by hosts like Render), then API_PORT, then 4000.
const portArg = process.argv.indexOf('--port');
const PORT = Number((portArg > -1 ? process.argv[portArg + 1] : undefined) ?? process.env.PORT ?? process.env.API_PORT ?? 4000);
const app = express();

app.disable('x-powered-by');
// Behind an HTTPS proxy in production (needed for correct protocol/IP info).
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/examiner', examinerRouter);
app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'API route not found.')));

// Production: serve the built client.
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed request body.' } });
    return;
  }
  console.error('[api] unexpected error', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' } });
});

seedIfNeeded();

// Housekeeping: time out abandoned real sessions and close their open events.
setInterval(() => {
  const now = Date.now();
  try {
    for (const s of all(
      `SELECT s.id, s.start_time, s.last_heartbeat, x.duration_minutes FROM sessions s JOIN exams x ON x.id = s.exam_id
       WHERE s.status = 'ACTIVE' AND s.simulated = 0`,
    )) {
      const deadline = s.start_time + s.duration_minutes * 60_000;
      if (now > deadline + 2 * 60_000) {
        finalizeSession(s.id, 'TIMED_OUT', deadline);
        dropFrame(s.id);
      } else if ((s.last_heartbeat ?? 0) < now - ONLINE_WINDOW_MS * 3) {
        run(`UPDATE events SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL`, s.last_heartbeat ?? now, s.id);
      }
    }
  } catch (err) {
    console.error('[sweeper]', err);
  }
}, 15_000);

if (process.env.DEMO_SIMULATOR !== 'false') {
  setInterval(() => {
    try {
      tickSimulator();
    } catch (err) {
      console.error('[simulator]', err);
    }
  }, 5_000);
}

// Windows can let two servers share a port silently, so the browser would talk to
// an old copy. Refuse to start if something already answers on this port.
try {
  const probe = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(800) });
  if (probe.ok) {
    console.error(`[api] Port ${PORT} is already in use by another ProctorGuard server. Stop it (Ctrl+C in its terminal) and try again.`);
    process.exit(1);
  }
} catch {
  // Nothing listening — good.
}

const server = app.listen(PORT, () => {
  console.log(`[api] ProctorGuard listening on port ${PORT}${existsSync(dist) ? ' (serving built frontend)' : ''}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? `[api] Port ${PORT} is already in use. Close the other program or start with: npx tsx server/index.ts --port 5050`
      : `[api] Server failed to start: ${err.message}`,
  );
  process.exit(1);
});
