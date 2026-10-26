import { Info } from 'lucide-react';
import { RISK_LEVEL_TEXT, type RiskConfig } from '@shared/risk-engine';
import type { RiskLevel, RiskSnapshot } from '@shared/types';
import { cx, RISK_COLOR } from '../../components/ui';

/** Semi-circular gauge with the score and level. */
export function RiskGauge({ score, level, size = 180, dark }: { score: number; level: RiskLevel; size?: number; dark?: boolean }) {
  const r = 70;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - Math.min(100, score) / 100);
  const color = RISK_COLOR[level];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 180 104" className="size-full">
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : '#eef0f6'} strokeWidth="14" strokeLinecap="round" />
        <path
          d="M20 95 A70 70 0 0 1 160 95"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .6s ease, stroke .4s' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className={cx('tabular text-4xl font-extrabold leading-none tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
          {score}
          <span className={cx('text-base font-semibold', dark ? 'text-slate-400' : 'text-slate-400')}> / 100</span>
        </p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color }}>
          {RISK_LEVEL_TEXT[level]}
        </p>
      </div>
    </div>
  );
}

/** "Why is the score this high?" — every contributing flag type. */
export function RiskBreakdown({ risk, dark, compact }: { risk: RiskSnapshot; dark?: boolean; compact?: boolean }) {
  if (!risk.breakdown.length) {
    return (
      <p className={cx('rounded-xl px-3 py-2.5 text-center text-xs', dark ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500')}>
        No suspicious activity is contributing to the score.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {risk.breakdown.map((b) => (
        <li
          key={b.eventType}
          className={cx('flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm', dark ? 'bg-white/5 text-slate-200' : 'bg-slate-50 text-slate-700')}
        >
          <span className="truncate">
            {b.label} <span className={dark ? 'text-slate-500' : 'text-slate-400'}>× {b.count}</span>
          </span>
          <span className="tabular shrink-0 font-semibold">
            +{Math.round(b.current)}
            {!compact && b.current < b.initial - 0.5 && (
              <span className={cx('ml-1 text-[11px] font-normal', dark ? 'text-slate-500' : 'text-slate-400')}>of {Math.round(b.initial)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RiskScaleLegend({ config, dark }: { config: RiskConfig; dark?: boolean }) {
  const t = config.thresholds;
  const bands: [RiskLevel, string][] = [
    ['LOW', `0–${t.medium - 1}`],
    ['MEDIUM', `${t.medium}–${t.high - 1}`],
    ['HIGH', `${t.high}–${t.critical - 1}`],
    ['CRITICAL', `${t.critical}–100`],
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-1.5 overflow-hidden rounded-full">
        {bands.map(([lvl]) => (
          <div key={lvl} className="flex-1" style={{ background: RISK_COLOR[lvl] }} />
        ))}
      </div>
      <div className={cx('grid grid-cols-4 text-center text-[10px]', dark ? 'text-slate-400' : 'text-slate-500')}>
        {bands.map(([lvl, range]) => (
          <span key={lvl}>
            <b className="block font-semibold">{lvl === 'CRITICAL' ? 'Review' : lvl[0] + lvl.slice(1).toLowerCase()}</b>
            {range}
          </span>
        ))}
      </div>
      <p className={cx('flex items-start gap-1.5 text-[11px] leading-snug', dark ? 'text-slate-500' : 'text-slate-500')}>
        <Info className="mt-px size-3 shrink-0" />
        Flags decay after {config.decay.graceSeconds}s once behaviour stops (half-life {Math.round(config.decay.halfLifeSeconds / 60)} min). The score
        supports human review — it is never a verdict.
      </p>
    </div>
  );
}
