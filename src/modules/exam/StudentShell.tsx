import { Check, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx, Logo } from '../../components/ui';
import { useAuth } from '../auth/authStore';

const STEPS = ['Login', 'Identity', 'Guidelines', 'System check', 'Exam'];

export function StudentShell({ step, children, wide }: { step: number; children: ReactNode; wide?: boolean }) {
  const { student, exam, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="bg-mesh min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <ol className="hidden items-center gap-1 md:flex">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                <span
                  className={cx(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    i < step && 'text-emerald-700',
                    i === step && 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
                    i > step && 'text-slate-400',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-4 place-items-center rounded-full text-[10px]',
                      i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500',
                    )}
                  >
                    {i < step ? <Check className="size-3" /> : i + 1}
                  </span>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-4 bg-slate-200" />}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{student?.name}</p>
              <p className="text-xs text-slate-500">
                {student?.studentId} · {exam?.code}
              </p>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className={cx('mx-auto px-4 py-8 sm:px-6', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</main>
    </div>
  );
}
