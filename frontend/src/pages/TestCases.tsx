import { Fragment, useState } from 'react'
import {
  api,
  CASE_STATUSES,
  CASE_TYPES,
  type CaseType,
  type ExecutionResult,
  formatInputs,
  PRIORITIES,
  type Priority,
  type Requirement,
  type TestCase,
  useLoad,
} from '../api'
import { Button, Card, Empty, ErrorBanner, Field, inputCls, Loading, PageHeader, StatusBadge, Tag, td, th } from '../components/ui'

const ALL = ''

function ResultForm({ tc, onDone }: { tc: TestCase; onDone: (message: string) => void }) {
  const [result, setResult] = useState<ExecutionResult>('Pass')
  const [actual, setActual] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const r = await api.post<{ defect: { code: string } | null; defect_created: boolean }>(`/test-cases/${tc.id}/executions`, { result, actual })
      onDone(r.defect_created ? `${tc.code} failed, so ${r.defect!.code} was opened.` : `Recorded ${result} for ${tc.code}.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 bg-surface-2 px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Field label="Result">
          <select className={inputCls} value={result} onChange={(e) => setResult(e.target.value as ExecutionResult)}>
            <option>Pass</option>
            <option>Fail</option>
            <option>Blocked</option>
          </select>
        </Field>
        <Field label="Actual result / notes">
          <input className={inputCls} value={actual} placeholder={`Expected: ${tc.expected_outcome || '—'}`} onChange={(e) => setActual(e.target.value)} />
        </Field>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record'}</Button>
      </div>
      <ErrorBanner error={error} />
    </div>
  )
}

function NewCaseForm({ requirements, onCreated }: { requirements: Requirement[]; onCreated: (tc: TestCase) => void }) {
  const [form, setForm] = useState({
    title: '',
    requirement_id: requirements[0]?.id ?? 0,
    priority: 'P2' as Priority,
    test_type: 'ui' as CaseType,
    expected_outcome: '',
    description: '',
  })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (!requirements.length) return <p className="text-sm text-ink-2">Create a requirement first (Traceability page) so the test case can be linked to it.</p>

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      onCreated(await api.post<TestCase>('/test-cases', form))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Title" className="sm:col-span-2">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Login page rejects a wrong password" />
        </Field>
        <Field label="Requirement" className="sm:col-span-2">
          <select className={inputCls} value={form.requirement_id} onChange={(e) => setForm({ ...form, requirement_id: Number(e.target.value) })}>
            {requirements.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Test type">
          <select className={inputCls} value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value as CaseType })}>
            {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Expected outcome" className="sm:col-span-2">
          <input className={inputCls} value={form.expected_outcome} onChange={(e) => setForm({ ...form, expected_outcome: e.target.value })} placeholder="e.g. Error message is shown" />
        </Field>
      </div>
      <ErrorBanner error={error} />
      <Button onClick={submit} disabled={busy || !form.title.trim()}>{busy ? 'Creating…' : 'Create test case'}</Button>
    </div>
  )
}

export default function TestCases() {
  const cases = useLoad<TestCase[]>('/test-cases')
  const requirements = useLoad<Requirement[]>('/requirements')
  const [filters, setFilters] = useState({ requirement: ALL, status: ALL, type: ALL, q: '' })
  const [openId, setOpenId] = useState<number>()
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const reqById = new Map(requirements.data?.map((r) => [r.id, r]))
  const rows = (cases.data ?? []).filter(
    (c) =>
      (filters.requirement === ALL || String(c.requirement_id) === filters.requirement) &&
      (filters.status === ALL || c.status === filters.status) &&
      (filters.type === ALL || c.test_type === filters.type) &&
      (filters.q === '' || `${c.code} ${c.title}`.toLowerCase().includes(filters.q.toLowerCase())),
  )

  const update = async (tc: TestCase, patch: Partial<TestCase>) => {
    setError(undefined)
    try {
      await api.patch(`/test-cases/${tc.id}`, patch)
      cases.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (tc: TestCase) => {
    if (!window.confirm(`Delete ${tc.code}? Its executions and defects are deleted too.`)) return
    setError(undefined)
    try {
      await api.del(`/test-cases/${tc.id}`)
      setMessage(`Deleted ${tc.code}.`)
      cases.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        title="Test cases"
        description="Every test case is mapped to the requirement it verifies. Edit priority and status inline, record manual results, or add manual test cases (e.g. UI checks)."
        action={<Button onClick={() => setCreating((c) => !c)}>{creating ? 'Close' : '+ New test case'}</Button>}
      />
      {creating && requirements.data && (
        <Card title="New manual test case" className="mb-4">
          <NewCaseForm
            requirements={requirements.data}
            onCreated={(tc) => {
              setCreating(false)
              setMessage(`Created ${tc.code}.`)
              cases.reload()
            }}
          />
        </Card>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <input className={inputCls} placeholder="Search ID or title" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className={inputCls} value={filters.requirement} onChange={(e) => setFilters({ ...filters, requirement: e.target.value })} aria-label="Requirement">
          <option value={ALL}>All requirements</option>
          {requirements.data?.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
        </select>
        <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status">
          <option value={ALL}>All statuses</option>
          {CASE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={inputCls} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Test type">
          <option value={ALL}>All types</option>
          {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="mb-3 space-y-2">
        <ErrorBanner error={error ?? cases.error} />
        {message && <div role="status" className="tone-good rounded-lg px-3 py-2 text-sm">{message}</div>}
      </div>

      {cases.loading && !cases.data ? (
        <Loading />
      ) : !cases.data?.length ? (
        <Empty title="No test cases yet">Generate some from the Upload &amp; Generate page, or create one manually.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Test case</th>
                <th className={th}>Req.</th>
                <th className={th}>Type</th>
                <th className={th}>Priority</th>
                <th className={th}>Status</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((tc) => (
                <Fragment key={tc.id}>
                  <tr>
                    <td className={`${td} font-mono text-xs text-ink-2`}>{tc.code}</td>
                    <td className={td}>
                      <div className="text-ink">{tc.title}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {Object.keys(tc.inputs).length > 0 && <span className="font-mono">{formatInputs(tc.inputs)} → </span>}
                        expected {tc.expected_outcome || '—'}
                        {tc.technique !== 'Manual' && <> · {tc.technique}</>}
                      </div>
                    </td>
                    <td className={`${td} font-mono text-xs text-ink-2`} title={reqById.get(tc.requirement_id)?.title}>
                      {reqById.get(tc.requirement_id)?.code}
                    </td>
                    <td className={td}><Tag>{tc.test_type}</Tag></td>
                    <td className={td}>
                      <select
                        className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-ink"
                        value={tc.priority}
                        aria-label={`Priority of ${tc.code}`}
                        onChange={(e) => update(tc, { priority: e.target.value as Priority })}
                      >
                        {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className={td}><StatusBadge status={tc.status} /></td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === tc.id ? undefined : tc.id)}>
                        Record result
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => remove(tc)} aria-label={`Delete ${tc.code}`}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                  {openId === tc.id && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <ResultForm
                          tc={tc}
                          onDone={(m) => {
                            setOpenId(undefined)
                            setMessage(m)
                            cases.reload()
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted">No test cases match these filters.</p>}
        </div>
      )}
      {cases.data && <p className="mt-2 text-xs text-muted">{rows.length} of {cases.data.length} test cases</p>}
    </>
  )
}
