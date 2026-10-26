import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, FlaskConical, Inbox, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { RiskLevel, Severity } from '@shared/types';

export const cx = clsx;

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-700 focus-visible:ring-indigo-500',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 focus-visible:ring-indigo-500',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-indigo-500',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
  dark: 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15 focus-visible:ring-indigo-400',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.98]',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-soft', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  dark: 'bg-white/10 text-slate-100 ring-white/15',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const RISK_TONE: Record<RiskLevel, Tone> = { LOW: 'green', MEDIUM: 'amber', HIGH: 'orange', CRITICAL: 'red' };
export const RISK_COLOR: Record<RiskLevel, string> = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#e11d48' };
export const SEVERITY_TONE: Record<Severity, Tone> = { INFO: 'sky', LOW: 'slate', MEDIUM: 'amber', HIGH: 'orange', CRITICAL: 'red' };

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  return (
    <Badge tone={RISK_TONE[level]} dot className={className}>
      {level === 'CRITICAL' ? 'Critical' : level.charAt(0) + level.slice(1).toLowerCase()} risk
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{severity}</Badge>;
}

/** Marks anything that did not come from a real model run. */
export function SimulatedTag({ label = 'Demo / Simulated', className }: { label?: string; className?: string }) {
  return (
    <span
      title="Generated by the demo simulator — not a real AI detection"
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700',
        className,
      )}
    >
      <FlaskConical className="size-3" />
      {label}
    </span>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cx('flex items-center gap-2 text-sm text-slate-500', className)}>
      <Loader2 className="size-4 animate-spin text-indigo-500" />
      {label}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[240px] place-items-center">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">{icon ?? <Inbox className="size-6" />}</div>
      <p className="font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline">
          <RefreshCw className="size-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'success' | 'warning'; children: ReactNode; className?: string }) {
  const styles = {
    info: 'border-indigo-200 bg-indigo-50/70 text-indigo-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : ShieldCheck;
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border p-3.5 text-sm', styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Input({ icon, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      <input
        {...rest}
        className={cx(
          'h-11 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50',
          icon ? 'pl-10 pr-3' : 'px-3',
          className,
        )}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-indigo-600' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function ProgressBar({ value, color = '#6366f1', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-slate-100', className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'indigo',
  hint,
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'indigo' | 'green' | 'amber' | 'orange' | 'red' | 'violet';
  hint?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const tones = {
    indigo: 'from-indigo-500 to-violet-500',
    green: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-400 to-orange-400',
    orange: 'from-orange-500 to-rose-500',
    red: 'from-rose-500 to-red-600',
    violet: 'from-violet-500 to-fuchsia-500',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cx(
        'group relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-soft transition',
        active ? 'border-indigo-300 ring-2 ring-indigo-500/20' : 'border-slate-200/80',
        onClick && 'hover:-translate-y-0.5 hover:shadow-lg',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="tabular mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={cx('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', tones[tone])}>{icon}</div>
      </div>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </Comp>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('w-full overflow-hidden rounded-2xl bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-md')}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Logo({ dark, compact }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 shadow-glow">
        <ShieldCheck className="size-5 text-white" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className={cx('text-[15px] font-extrabold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
            ProctorGuard<span className="text-indigo-500"> AI</span>
          </p>
          <p className={cx('text-[10px] font-semibold uppercase tracking-[0.16em]', dark ? 'text-slate-400' : 'text-slate-500')}>
            LCG Examination Cell
          </p>
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className={cx('grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-xs font-bold text-indigo-700', className)}>
      {initials}
    </div>
  );
}
