import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { InfoButton } from '../InfoButton';

/* ------------------------------------------------------------------ */
/* SettingSection — a titled card grouping related rows               */
/* ------------------------------------------------------------------ */

interface SettingSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}

export const SettingSection: React.FC<SettingSectionProps> = ({
  id,
  title,
  icon: Icon,
  iconClassName = 'text-red-500',
  description,
  badge,
  actions,
  children,
  tone = 'default',
}) => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    className={`rounded-2xl border p-4 sm:p-5 shadow-sm space-y-3 scroll-mt-24 ${
      tone === 'danger'
        ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/60'
        : 'bg-surface-1 border-line'
    }`}
  >
    <header className="flex items-start justify-between gap-3 pb-3 border-b border-line">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className={`mt-0.5 w-7 h-7 rounded-lg bg-surface-2 border border-line flex items-center justify-center shrink-0 ${iconClassName}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-xs sm:text-sm font-bold font-mono text-content-1 uppercase tracking-wider flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {badge}
          </h3>
          {description && <p className="text-[10px] sm:text-[11px] text-content-3 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
    <div className="divide-y divide-line">{children}</div>
  </section>
);

/* ------------------------------------------------------------------ */
/* SettingRow — label · description · control                          */
/* ------------------------------------------------------------------ */

interface SettingRowProps {
  label: string;
  description?: string;
  infoId?: string;
  infoTitle?: string;
  infoContent?: React.ReactNode;
  badge?: React.ReactNode;
  /** Control rendered on the right (switch, button, select…). */
  children?: React.ReactNode;
  /** Render children below the label instead of to the right (for wide controls). */
  stacked?: boolean;
  htmlFor?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  infoId,
  infoTitle,
  infoContent,
  badge,
  children,
  stacked = false,
  htmlFor,
}) => {
  const LabelTag: 'label' | 'div' = htmlFor ? 'label' : 'div';
  return (
    <div className={`py-3 first:pt-1 last:pb-1 gap-3 ${stacked ? 'flex flex-col' : 'flex items-center justify-between'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <LabelTag htmlFor={htmlFor} className="text-xs font-mono font-bold text-content-1">
            {label}
          </LabelTag>
          {badge}
          {infoContent && (
            <InfoButton id={infoId} title={infoTitle || label} content={infoContent} align="left" />
          )}
        </div>
        {description && <p className="text-[10px] sm:text-[11px] text-content-3 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {children && <div className={stacked ? 'w-full' : 'shrink-0 flex items-center gap-2'}>{children}</div>}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* SettingSwitch — accessible on/off toggle                            */
/* ------------------------------------------------------------------ */

interface SettingSwitchProps {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  tone?: 'red' | 'emerald' | 'blue' | 'indigo';
}

const SWITCH_ON: Record<NonNullable<SettingSwitchProps['tone']>, string> = {
  red: 'bg-red-600',
  emerald: 'bg-emerald-600',
  blue: 'bg-blue-600',
  indigo: 'bg-indigo-600',
};

export const SettingSwitch: React.FC<SettingSwitchProps> = ({
  id,
  checked,
  onChange,
  disabled = false,
  busy = false,
  label,
  tone = 'red',
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    aria-busy={busy || undefined}
    disabled={disabled || busy}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 ${
      checked ? SWITCH_ON[tone] : 'bg-slate-300 dark:bg-zinc-700'
    }`}
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      } ${busy ? 'animate-pulse' : ''}`}
    />
  </button>
);

/* ------------------------------------------------------------------ */
/* SegmentedControl — small exclusive option picker                    */
/* ------------------------------------------------------------------ */

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, size = 'sm' }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-xl">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`${size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} font-mono font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              active ? 'bg-red-600 text-white shadow-sm' : 'text-content-2 hover:text-content-1 hover:bg-surface-3'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SettingButton — secondary/primary/danger action                     */
/* ------------------------------------------------------------------ */

interface SettingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  iconClassName?: string;
  variant?: 'secondary' | 'primary' | 'danger' | 'ghost';
}

export const SettingButton: React.FC<SettingButtonProps> = ({
  icon: Icon,
  iconClassName = '',
  variant = 'secondary',
  className = '',
  children,
  ...rest
}) => {
  const variantClasses: Record<NonNullable<SettingButtonProps['variant']>, string> = {
    secondary: 'bg-surface-2 hover:bg-surface-3 border border-line text-content-1',
    primary: 'bg-red-600 hover:bg-red-700 border border-red-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 border border-red-600 text-white',
    ghost: 'bg-transparent hover:bg-surface-2 border border-transparent text-content-2 hover:text-content-1',
  };
  return (
    <button
      type="button"
      {...rest}
      className={`px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
    >
      {Icon && <Icon className={`w-3.5 h-3.5 ${iconClassName}`} />}
      {children}
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* StatusPill                                                          */
/* ------------------------------------------------------------------ */

export const StatusPill: React.FC<{ tone: 'red' | 'emerald' | 'blue' | 'indigo' | 'amber' | 'neutral'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones: Record<string, string> = {
    red: 'bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
    blue: 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
    amber: 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    neutral: 'bg-surface-2 text-content-3 border-line',
  };
  return (
    <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${tones[tone]}`}>{children}</span>
  );
};
