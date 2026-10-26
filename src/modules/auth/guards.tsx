import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authStore';

/** Student pages require a login; flow steps must be completed in order. */
export function RequireStudent({ children, step }: { children: ReactNode; step?: 'identity' | 'guidelines' | 'system' | 'exam' }) {
  const { role, token, identity, guidelinesAccepted, systemCheck } = useAuth();
  const location = useLocation();
  if (!token || role !== 'student') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (step === 'guidelines' || step === 'system' || step === 'exam') {
    if (!identity) return <Navigate to="/verify-identity" replace />;
  }
  if (step === 'system' || step === 'exam') {
    if (!guidelinesAccepted) return <Navigate to="/guidelines" replace />;
  }
  if (step === 'exam' && !systemCheck) return <Navigate to="/system-check" replace />;
  return <>{children}</>;
}

export function RequireExaminer({ children }: { children: ReactNode }) {
  const { role, token } = useAuth();
  if (!token || role !== 'examiner') return <Navigate to="/examiner/login" replace />;
  return <>{children}</>;
}
