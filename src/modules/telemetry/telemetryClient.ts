// Reliable delivery of proctoring telemetry to the server.
// Events are queued locally and flushed in order; if the network drops, the
// queue is kept and retried, so no event is lost during a short outage.
import type { LiveStatus, NewEventInput, RiskSnapshot } from '@shared/types';
import { api, ApiError } from '../../lib/api';

export interface StudentSessionState {
  id: string;
  status: 'ACTIVE' | 'SUBMITTED' | 'TIMED_OUT';
  startTime: number;
  endTime: number | null;
  deadline: number;
  remainingMs: number;
  answers: Record<string, number>;
  risk: RiskSnapshot;
  riskResetAt: number | null;
}

interface EndInput {
  clientId: string;
  endedAt: number;
  label?: string;
  details?: Record<string, unknown>;
}

export class TelemetryClient {
  private events: NewEventInput[] = [];
  private ends: EndInput[] = [];
  private flushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  online = true;

  constructor(
    private sessionId: string,
    private handlers: {
      onSession(state: StudentSessionState): void;
      onConnection(online: boolean, message?: string): void;
      onClosed(code: string): void;
    },
  ) {}

  pushEvent(event: NewEventInput) {
    this.events.push(event);
    this.scheduleFlush(0);
  }

  pushEnd(end: EndInput) {
    this.ends.push(end);
    this.scheduleFlush(50);
  }

  startHeartbeat(getLive: () => LiveStatus | null, getFrame: () => string | null, everyMs = 3000) {
    const beat = async () => {
      if (this.closed) return;
      try {
        const res = await api<{ session: StudentSessionState }>(`/student/session/${this.sessionId}/heartbeat`, {
          body: { live: getLive(), frame: getFrame() },
        });
        this.setOnline(true);
        this.handlers.onSession(res.session);
      } catch (err) {
        this.handleError(err);
      }
    };
    beat();
    this.heartbeatTimer = setInterval(beat, everyMs);
  }

  async flushNow() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush();
  }

  close() {
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private scheduleFlush(delay: number) {
    if (this.flushTimer || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, delay);
  }

  private async flush() {
    if (this.flushing || this.closed || (!this.events.length && !this.ends.length)) return;
    this.flushing = true;
    const events = this.events.slice(0, 50);
    const ends = this.ends.slice(0, 50);
    try {
      const res = await api<{ session: StudentSessionState }>(`/student/session/${this.sessionId}/events`, {
        body: { events, ends },
      });
      this.events.splice(0, events.length);
      this.ends.splice(0, ends.length);
      this.setOnline(true);
      this.handlers.onSession(res.session);
    } catch (err) {
      this.handleError(err);
    } finally {
      this.flushing = false;
      if (this.events.length || this.ends.length) this.scheduleFlush(this.online ? 100 : 3000);
    }
  }

  private handleError(err: unknown) {
    if (err instanceof ApiError && err.code === 'SESSION_CLOSED') {
      this.close();
      this.handlers.onClosed(err.code);
      return;
    }
    if (err instanceof ApiError && err.status === 401) return; // handled globally
    this.setOnline(false, err instanceof Error ? err.message : undefined);
  }

  private setOnline(online: boolean, message?: string) {
    if (this.online !== online) {
      this.online = online;
      this.handlers.onConnection(online, message);
    }
  }
}
