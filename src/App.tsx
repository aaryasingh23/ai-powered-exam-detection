import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingBlock } from './components/ui';
import { RequireExaminer, RequireStudent } from './modules/auth/guards';
import { LoginPage } from './modules/auth/LoginPage';
import { NotFoundPage } from './components/NotFoundPage';

// Heavier screens are split so the login page loads instantly.
const RegisterPage = lazy(() => import('./modules/auth/RegisterPage'));
const ExaminerLoginPage = lazy(() => import('./modules/auth/ExaminerLoginPage'));
const IdentityPage = lazy(() => import('./modules/face-verification/IdentityPage'));
const GuidelinesPage = lazy(() => import('./modules/exam/GuidelinesPage'));
const SystemCheckPage = lazy(() => import('./modules/exam/SystemCheckPage'));
const ExamPage = lazy(() => import('./modules/exam/ExamPage'));
const SubmittedPage = lazy(() => import('./modules/exam/SubmittedPage'));
const ExaminerLayout = lazy(() => import('./modules/dashboard/ExaminerLayout'));
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'));
const LiveMonitoringPage = lazy(() => import('./modules/dashboard/LiveMonitoringPage'));
const StudentsPage = lazy(() => import('./modules/dashboard/StudentsPage'));
const StudentDetailPage = lazy(() => import('./modules/dashboard/StudentDetailPage'));
const AlertsPage = lazy(() => import('./modules/dashboard/AlertsPage'));
const AnalyticsPage = lazy(() => import('./modules/dashboard/AnalyticsPage'));
const SettingsPage = lazy(() => import('./modules/dashboard/SettingsPage'));
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'));
const ReportPage = lazy(() => import('./modules/reports/ReportPage'));
const DocsPage = lazy(() => import('./modules/docs/DocsPage'));

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route
            path="/verify-identity"
            element={
              <RequireStudent step="identity">
                <IdentityPage />
              </RequireStudent>
            }
          />
          <Route
            path="/guidelines"
            element={
              <RequireStudent step="guidelines">
                <GuidelinesPage />
              </RequireStudent>
            }
          />
          <Route
            path="/system-check"
            element={
              <RequireStudent step="system">
                <SystemCheckPage />
              </RequireStudent>
            }
          />
          <Route
            path="/exam"
            element={
              <RequireStudent step="exam">
                <ExamPage />
              </RequireStudent>
            }
          />
          <Route
            path="/exam/submitted"
            element={
              <RequireStudent>
                <SubmittedPage />
              </RequireStudent>
            }
          />
          <Route path="/examiner/login" element={<ExaminerLoginPage />} />
          <Route
            path="/examiner"
            element={
              <RequireExaminer>
                <ExaminerLayout />
              </RequireExaminer>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="live" element={<LiveMonitoringPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="sessions/:id" element={<StudentDetailPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
