import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Exam, Student } from '@shared/types';
import { api, configureApi } from '../../lib/api';

export interface Examiner {
  id: string;
  username: string;
  name: string;
}

/** Result of the pre-exam identity check, carried into the exam session. */
export interface IdentityResult {
  passed: boolean;
  confidence: number | null;
  model: string;
  simulated: boolean;
  at: number;
}

interface AuthState {
  token: string | null;
  role: 'student' | 'examiner' | null;
  expiresAt: number | null;
  student: Student | null;
  exam: Exam | null;
  examiner: Examiner | null;
  identity: IdentityResult | null;
  guidelinesAccepted: boolean;
  systemCheck: { camera: boolean; microphone: boolean; demoWithoutCamera: boolean } | null;
  /** Message shown on the login screen after a forced logout. */
  notice: string | null;

  loginStudent(input: { studentId: string; password: string; examCode: string }): Promise<void>;
  loginExaminer(input: { username: string; password: string }): Promise<void>;
  logout(notice?: string): void;
  setStudent(student: Student): void;
  setIdentity(result: IdentityResult): void;
  acceptGuidelines(): void;
  setSystemCheck(result: AuthState['systemCheck']): void;
  clearNotice(): void;
}

const blank = {
  token: null,
  role: null,
  expiresAt: null,
  student: null,
  exam: null,
  examiner: null,
  identity: null,
  guidelinesAccepted: false,
  systemCheck: null,
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      ...blank,
      notice: null,
      async loginStudent(input) {
        const res = await api<{ token: string; expiresAt: number; student: Student; exam: Exam }>('/auth/login', { body: input });
        set({ ...blank, token: res.token, role: 'student', expiresAt: res.expiresAt, student: res.student, exam: res.exam, notice: null });
      },
      async loginExaminer(input) {
        const res = await api<{ token: string; expiresAt: number; examiner: Examiner }>('/auth/examiner/login', { body: input });
        set({ ...blank, token: res.token, role: 'examiner', expiresAt: res.expiresAt, examiner: res.examiner, notice: null });
      },
      logout(notice) {
        const token = get().token;
        if (token) api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        set({ ...blank, notice: notice ?? null });
      },
      setStudent: (student) => set({ student }),
      setIdentity: (identity) => set({ identity }),
      acceptGuidelines: () => set({ guidelinesAccepted: true }),
      setSystemCheck: (systemCheck) => set({ systemCheck }),
      clearNotice: () => set({ notice: null }),
    }),
    {
      name: 'proctorguard-auth',
      // sessionStorage: closing the tab ends the login. Tokens are never put in URLs.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        token: s.token,
        role: s.role,
        expiresAt: s.expiresAt,
        student: s.student,
        exam: s.exam,
        examiner: s.examiner,
        identity: s.identity,
        guidelinesAccepted: s.guidelinesAccepted,
        systemCheck: s.systemCheck,
        notice: s.notice,
      }),
    },
  ),
);

configureApi({
  getToken: () => useAuth.getState().token,
  onUnauthorized: (code) => {
    const role = useAuth.getState().role;
    useAuth.getState().logout(
      code === 'SESSION_EXPIRED' ? 'Your session has expired. Please sign in again.' : 'Please sign in to continue.',
    );
    const target = role === 'examiner' ? '/examiner/login' : '/login';
    if (window.location.pathname !== target) window.location.assign(target);
  },
});
