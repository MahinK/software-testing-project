import { type ReactNode, useState } from 'react'
import { api, formatInputs, type Report, type Trace, type TraceCase, useLoad } from '../api'
import {
  Button,
  Card,
  DefectStatusBadge,
  Empty,
  ErrorBanner,
  Field,
  inputCls,
  Loading,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  Tag,
  VerdictBadge,
} from '../components/ui'

function counts(t: Trace) {
  const cases = t.scenarios.flatMap((s) => s.test_cases)
  return {
    total: cases.length,
    pass: cases.filter((c) => c.status === 'Pass').length,
    defects: cases.reduce((n, c) => n + c.defects.length, 0),
  }
}

function Node({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative border-l border-line pl-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  )
}

function CaseTrace({ tc }: { tc: TraceCase }) {
  const last = tc.executions.at(-1)
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-2">{tc.code}</span>
        <span className="text-sm text-ink">{tc.title}</span>
        <span className="ml-auto"><StatusBadge status={tc.status} /></span>
      </div>
      <div className="mt-1 text-xs text-muted">
        {Object.keys(tc.inputs).length > 0 && <span className="font-mono">{formatInputs(tc.inputs)} · </span>}
        expected {tc.expected_outcome || '—'} · <Tag>{tc.test_type}</Tag>
      </div>
      {last && (
        <div className="mt-2 space-y-2">
          <Node label={`Execution${tc.executions.length > 1 ? ` (latest of ${tc.executions.length})` : ''}`}>
            <div className="text-xs text-ink-2">
              {new Date(last.executed_at).toLocaleString()} · result <b className="font-medium text-ink">{last.result}</b>
              {last.actual && <> · actual: {last.actual}</>}
            </div>
          </Node>
          {tc.defects.map((d) => (
            <Node key={d.id} label="Defect">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-medium text-ink">{d.code}</span>
                <SeverityBadge severity={d.severity} />
                <DefectStatusBadge status={d.status} />
                <span className="text-ink-2">{d.title}</span>
              </div>
            </Node>
          ))}
        </div>
      )}
    </div>
  )
}

function NewRequirement({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', module: 'general', description: '' })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await api.post('/requirements', form)
      onCreated()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Title">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Withdrawals cannot exceed the balance" />
        </Field>
        <Field label="Module">
          <input className={inputCls} value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
      <ErrorBanner error={error} />
      <Button onClick={submit} disabled={busy || !form.title.trim()}>{busy ? 'Creating…' : 'Create requirement'}</Button>
    </div>
  )
}

export default function Requirements() {
  const { data, error, loading, reload } = useLoad<Report>('/report')
  const [selected, setSelected] = useState<number>()
  const [creating, setCreating] = useState(false)

  const traces = data?.requirements ?? []
  const current = traces.find((t) => t.requirement.id === selected) ?? traces[0]

  return (
    <>
      <PageHeader
        title="Verification traceability"
        description="Each requirement traces through its test scenarios and test cases to their executions and any defects they produced: Requirement → Scenario → Test case → Execution → Result → Defect."
        action={<Button onClick={() => setCreating((c) => !c)}>{creating ? 'Close' : '+ New requirement'}</Button>}
      />
      {creating && (
        <Card title="New requirement" className="mb-4">
          <NewRequirement onCreated={() => { setCreating(false); reload() }} />
        </Card>
      )}
      <ErrorBanner error={error} />
      {loading && !data ? (
        <Loading />
      ) : !traces.length ? (
        <Empty title="No requirements yet">Create one here, or generate test cases from the Upload &amp; Generate page.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-2">
            {traces.map((t) => {
              const c = counts(t)
              const active = t.requirement.id === current?.requirement.id
              return (
                <button
                  key={t.requirement.id}
                  onClick={() => setSelected(t.requirement.id)}
                  className={`block w-full rounded-lg border p-3 text-left transition-colors ${active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-ink-2">{t.requirement.code}</span>
                    <VerdictBadge verdict={t.verification_status} />
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink">{t.requirement.title}</div>
                  <div className="mt-1 text-xs text-muted">
                    {t.requirement.module} · {c.pass}/{c.total} passing · {c.defects} defect{c.defects === 1 ? '' : 's'}
                  </div>
                </button>
              )
            })}
          </div>

          {current && (
            <Card
              title={<><span className="font-mono text-ink-2">{current.requirement.code}</span> {current.requirement.title}</>}
              subtitle={current.requirement.description || `Module: ${current.requirement.module}`}
              action={<VerdictBadge verdict={current.verification_status} />}
            >
              {current.scenarios.length === 0 ? (
                <p className="text-sm text-muted">No test cases are linked to this requirement yet.</p>
              ) : (
                <div className="space-y-5">
                  {current.scenarios.map((s) => (
                    <Node key={s.id ?? 'none'} label="Test scenario">
                      <div className="mb-2 text-sm font-medium text-ink">{s.title}</div>
                      <div className="space-y-2">
                        {s.test_cases.length === 0 && <p className="text-xs text-muted">No test cases in this scenario.</p>}
                        {[...s.test_cases]
                          .sort((a, b) => Number(b.status === 'Fail') - Number(a.status === 'Fail'))
                          .map((tc) => <CaseTrace key={tc.id} tc={tc} />)}
                      </div>
                    </Node>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  )
}
