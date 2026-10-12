import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { CaseStatus, DefectStatus, Severity, Verdict } from '../api'

export const inputCls =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25'

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'text-critical-text hover:bg-critical/10',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`tone-${tone} inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium`}>
      {children}
    </span>
  )
}

const STATUS: Record<CaseStatus, [string, string]> = {
  Pass: ['good', '✓'],
  Fail: ['critical', '✕'],
  Blocked: ['warning', '!'],
  'Not Run': ['neutral', '–'],
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const [tone, icon] = STATUS[status]
  return (
    <Pill tone={tone}>
      <span aria-hidden>{icon}</span>
      {status}
    </Pill>
  )
}

const SEVERITY: Record<Severity, string> = {
  Critical: 'critical',
  High: 'serious',
  Medium: 'warning',
  Low: 'neutral',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Pill tone={SEVERITY[severity]}>{severity}</Pill>
}

const DEFECT_STATUS: Record<DefectStatus, string> = {
  Open: 'critical',
  'In Progress': 'warning',
  Resolved: 'good',
  Closed: 'neutral',
}

export function DefectStatusBadge({ status }: { status: DefectStatus }) {
  return <Pill tone={DEFECT_STATUS[status]}>{status}</Pill>
}

const VERDICT: Record<Verdict, [string, string, string]> = {
  VERIFIED: ['good', '✓', 'Verified'],
  FAILED: ['critical', '✕', 'Failed'],
  NOT_VERIFIED: ['neutral', '–', 'Not verified'],
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const [tone, icon, label] = VERDICT[verdict]
  return (
    <Pill tone={tone}>
      <span aria-hidden>{icon}</span>
      {label}
    </Pill>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return <Pill tone="neutral">{children}</Pill>
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5 text-3xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-2">{hint}</div>}
    </div>
  )
}

export function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null
  return (
    <div role="alert" className="tone-critical rounded-lg px-3 py-2 text-sm">
      {error}
    </div>
  )
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-muted">Loading…</p>
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
    </label>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
    </div>
  )
}

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>
      </div>
      {action}
    </div>
  )
}

export const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted'
export const td = 'px-3 py-2.5 align-top'
