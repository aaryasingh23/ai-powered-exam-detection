// Typed client for the examiner (telemetry) API.
import type { RiskConfig } from '@shared/risk-engine';
import type {
  Alert,
  DashboardOverview,
  EventType,
  ProctoringEvent,
  ReviewStatus,
  RiskLevel,
  SessionDetail,
  SessionReviewStatus,
  SessionSummary,
  Student,
} from '@shared/types';
import { api } from '../../lib/api';

export interface Analytics {
  byType: { eventType: EventType; count: number; falsePositives: number; simulated: number; avgConfidence: number | null }[];
  distribution: { level: RiskLevel; count: number }[];
  buckets: { range: string; count: number }[];
  eventsOverTime: { t: number; count: number }[];
  byExam: { exam: string; code: string; sessions: number; avgRisk: number; flagged: number }[];
  review: { reviewed: number; falsePositives: number; falsePositiveRate: number };
  topSessions: SessionSummary[];
}

export interface Report {
  generatedAt: number;
  generatedBy: string;
  student: Student;
  exam: { id: string; code: string; name: string; subject: string; durationMinutes: number };
  session: SessionDetail;
}

export type StudentRecord = Student & { seeded: boolean; sessionCount: number; latestSessionId: string | null };

export const examinerApi = {
  overview: (signal?: AbortSignal) => api<DashboardOverview>('/examiner/overview', { signal }),
  sessions: (params: { risk?: string; status?: string; q?: string }, signal?: AbortSignal) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return api<{ sessions: SessionSummary[] }>(`/examiner/sessions${qs ? `?${qs}` : ''}`, { signal });
  },
  session: (id: string, signal?: AbortSignal) => api<{ session: SessionDetail }>(`/examiner/sessions/${id}`, { signal }),
  frame: (id: string, signal?: AbortSignal) => api<{ frame: string | null; at: number | null }>(`/examiner/sessions/${id}/frame`, { signal }),
  updateSession: (id: string, body: { reviewStatus?: SessionReviewStatus; examinerNotes?: string }) =>
    api<{ session: SessionDetail }>(`/examiner/sessions/${id}`, { method: 'PATCH', body }),
  updateEvent: (id: string, body: { reviewStatus?: ReviewStatus; examinerNote?: string }) =>
    api<{ event: ProctoringEvent }>(`/examiner/events/${id}`, { method: 'PATCH', body }),
  alerts: (params: { severity?: string; status?: string }, signal?: AbortSignal) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return api<{ alerts: Alert[] }>(`/examiner/alerts${qs ? `?${qs}` : ''}`, { signal });
  },
  analytics: (signal?: AbortSignal) => api<Analytics>('/examiner/analytics', { signal }),
  students: (signal?: AbortSignal) => api<{ students: StudentRecord[] }>('/examiner/students', { signal }),
  report: (id: string, signal?: AbortSignal) => api<{ report: Report }>(`/examiner/sessions/${id}/report`, { signal }),
  settings: () => api<{ config: RiskConfig; defaults: RiskConfig }>('/examiner/settings'),
  saveSettings: (config: RiskConfig) => api<{ config: RiskConfig }>('/examiner/settings', { method: 'PUT', body: { config } }),
  resetSettings: () => api<{ config: RiskConfig }>('/examiner/settings/reset', { method: 'POST' }),
  resetRequests: () =>
    api<{ requests: { id: string; student_id: string; created_at: number; status: string }[] }>('/examiner/reset-requests'),
  resolveResetRequest: (id: string) => api(`/examiner/reset-requests/${id}`, { method: 'PATCH', body: {} }),
  refreshDemo: () => api('/examiner/demo/refresh', { method: 'POST' }),
};
