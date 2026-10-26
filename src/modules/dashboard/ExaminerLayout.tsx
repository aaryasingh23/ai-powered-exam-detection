import { Activity, BarChart3, Bell, BookOpen, FileText, LayoutDashboard, LogOut, Menu, MonitorPlay, Settings, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Alert } from '@shared/types';
import { cx, Logo, SimulatedTag } from '../../components/ui';
import { fmtTime } from '../../lib/format';
import { useAuth } from '../auth/authStore';
import { examinerApi } from '../telemetry/examinerApi';

const NAV = [
  { to: '/examiner', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/examiner/live', label: 'Live Monitoring', icon: MonitorPlay },
  { to: '/examiner/students', label: 'Students', icon: Users },
  { to: '/examiner/alerts', label: 'Alerts', icon: Bell },
  { to: '/examiner/analytics', label: 'Risk Analytics', icon: BarChart3 },
  { to: '/examiner/reports', label: 'Reports', icon: FileText },
  { to: '/examiner/settings', label: 'Settings', icon: Settings },
];

/** Pops a toast when a new HIGH / CRITICAL flag arrives from any session. */
function useAlertToasts() {
  const [toasts, setToasts] = useState<Alert[]>([]);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { alerts } = await examinerApi.alerts({ severity: 'HIGH' });
        if (cancelled) return;
        if (seen.current == null) {
          seen.current = new Set(alerts.map((a) => a.event.id));
        } else {
          // Toasts only for real candidate sessions; seeded demo sessions would be noise.
          const fresh = alerts.filter((a) => !seen.current!.has(a.event.id) && !a.session.simulatedSession);
          fresh.forEach((a) => seen.current!.add(a.event.id));
          if (fresh.length) setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 4));
        }
      } catch {
        /* the pages show connection errors; toasts just skip a beat */
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((x) => x.slice(0, -1)), 7000);
    return () => clearTimeout(t);
  }, [toasts]);
  return { toasts, dismiss: (id: string) => setToasts((t) => t.filter((a) => a.event.id !== id)) };
}

export default function ExaminerLayout() {
  const { examiner, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toasts, dismiss } = useAlertToasts();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo dark />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-400 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
        <div className="my-3 border-t border-white/5" />
        <Link to="/docs" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white">
          <BookOpen className="size-[18px]" /> Project docs
        </Link>
      </nav>
      <div className="m-3 rounded-xl border border-white/5 bg-white/5 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
          <Activity className="size-3.5" /> Telemetry live · 3 s refresh
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">AI flags are review aids. Final decisions are always made by an examiner.</p>
      </div>
      <div className="flex items-center gap-3 border-t border-white/5 px-4 py-4">
        <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
          {examiner?.name
            .replace(/^Dr\.\s*/, '')
            .split(/\s+/)
            .filter((w) => /^[A-Za-z]/.test(w))
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{examiner?.name}</p>
          <p className="text-xs text-slate-500">Examiner</p>
        </div>
        <button
          onClick={() => {
            logout();
            navigate('/examiner/login');
          }}
          className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full bg-slate-50">
      <aside className="no-print bg-grid-dark sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="bg-grid-dark absolute inset-y-0 left-0 w-64 animate-slide-in">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen((v) => !v)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Menu">
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Logo compact />
          <span className="w-9" />
        </div>
        <main className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <div className="no-print fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] space-y-2">
        {toasts.map((a) => (
          <div key={a.event.id} className="overflow-hidden rounded-xl border border-rose-200 bg-white shadow-2xl animate-slide-in">
            <div className={cx('h-1', a.event.severity === 'CRITICAL' ? 'bg-rose-600' : 'bg-orange-500')} />
            <button
              onClick={() => {
                dismiss(a.event.id);
                navigate(`/examiner/sessions/${a.session.id}`);
              }}
              className="block w-full p-3 text-left hover:bg-slate-50"
            >
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-rose-600">
                🔴 {a.event.severity === 'CRITICAL' ? 'Critical — review required' : 'High priority'}
                {a.event.simulated && <SimulatedTag className="!py-0" />}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{a.event.label}</p>
              <p className="text-xs text-slate-500">
                {a.session.studentName} · {a.session.studentId} · {fmtTime(a.event.timestamp)}
              </p>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
