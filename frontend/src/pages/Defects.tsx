import { useState } from 'react'
import { api, type Defect, DEFECT_STATUSES, type DefectStatus, SEVERITIES, type Severity, useLoad } from '../api'
import { Empty, ErrorBanner, Loading, PageHeader, SeverityBadge } from '../components/ui'

const select = 'rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink'

export default function Defects() {
  const { data, error, loading, reload } = useLoad<Defect[]>('/defects')
  const [filter, setFilter] = useState<DefectStatus | 'All'>('All')
  const [saveError, setSaveError] = useState<string>()

  const update = async (d: Defect, patch: Partial<Defect>) => {
    setSaveError(undefined)
    try {
      await api.patch(`/defects/${d.id}`, patch)
      reload()
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  const defects = data ?? []
  const shown = defects.filter((d) => filter === 'All' || d.status === filter)
  const count = (s: DefectStatus | 'All') => (s === 'All' ? defects.length : defects.filter((d) => d.status === s).length)

  return (
    <>
      <PageHeader
        title="Defects"
        description="Failing test executions open a defect automatically, linked back to the test case with the expected and actual behaviour. Triage severity and status here."
      />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
        {(['All', ...DEFECT_STATUSES] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${filter === s ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink-2 hover:bg-surface-2'}`}
          >
            {s} <span className="tabular-nums opacity-70">{count(s)}</span>
          </button>
        ))}
      </div>
      <div className="mb-3"><ErrorBanner error={saveError ?? error} /></div>

      {loading && !data ? (
        <Loading />
      ) : !shown.length ? (
        <Empty title={defects.length ? 'No defects with this status' : 'No defects'}>
          {defects.length ? null : 'Defects appear here when a test execution fails.'}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((d) => (
            <article key={d.id} className="rounded-xl border border-line bg-surface p-4">
              <header className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-critical-text">{d.code}</span>
                <SeverityBadge severity={d.severity} />
                <span className="text-xs text-muted">{d.priority} · {d.module}</span>
                <span className="ml-auto font-mono text-xs text-ink-2">{d.test_case_code}</span>
              </header>
              <h3 className="mt-2 text-sm font-medium text-ink">{d.title}</h3>
              <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-surface-2 p-3 font-mono text-xs">
                <dt className="text-muted">Expected</dt>
                <dd className="text-ink break-words">{d.expected || '—'}</dd>
                <dt className="text-muted">Actual</dt>
                <dd className="text-ink break-words">{d.actual || '—'}</dd>
              </dl>
              <footer className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-2">
                <label className="flex items-center gap-1.5">
                  Status
                  <select className={select} value={d.status} onChange={(e) => update(d, { status: e.target.value as DefectStatus })}>
                    {DEFECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  Severity
                  <select className={select} value={d.severity} onChange={(e) => update(d, { severity: e.target.value as Severity })}>
                    {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <span className="ml-auto text-muted">Opened {new Date(d.created_at).toLocaleDateString()}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
