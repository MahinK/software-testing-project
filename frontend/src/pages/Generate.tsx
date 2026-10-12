import { type ChangeEvent, type ReactNode, useState } from 'react'
import type { PageId } from '../App'
import {
  api,
  CASE_TYPES,
  type CaseType,
  formatInputs,
  type FunctionInfo,
  type GenerateResponse,
  type ParamSpec,
  PRIORITIES,
  type Priority,
  type Requirement,
  type RunSummary,
  type Scenario,
  type Upload,
  useLoad,
} from '../api'
import { Button, Card, ErrorBanner, Field, inputCls, PageHeader, StatTile, StatusBadge, Tag, td, th } from '../components/ui'

interface ParamDraft {
  type: 'int' | 'float'
  min: string
  max: string
  step: string
}

const NEW = 'new'

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink-2'}`}>
          {done ? '✓' : n}
        </div>
        <div className="mt-1 w-px flex-1 bg-line" />
      </div>
      <div className="min-w-0 flex-1 pb-8">
        <h2 className="mb-3 pt-0.5 text-[15px] font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export default function Generate({ go }: { go: (p: PageId) => void }) {
  const uploads = useLoad<Upload[]>('/uploads')
  const requirements = useLoad<Requirement[]>('/requirements')

  const [uploadId, setUploadId] = useState<number>()
  const [fnName, setFnName] = useState<string>()
  const [params, setParams] = useState<Record<string, ParamDraft>>({})
  const [reqChoice, setReqChoice] = useState<string>(NEW)
  const [newReq, setNewReq] = useState({ title: '', module: 'general' })
  const [scenarioTitle, setScenarioTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [testType, setTestType] = useState<CaseType>('unit')
  const [preview, setPreview] = useState<GenerateResponse>()
  const [saved, setSaved] = useState<GenerateResponse>()
  const [run, setRun] = useState<RunSummary>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const upload = uploads.data?.find((u) => u.id === uploadId)
  const fn = upload?.functions.find((f) => f.name === fnName)

  const act = async (label: string, work: () => Promise<void>) => {
    setBusy(label)
    setError(undefined)
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  const selectUpload = (u: Upload) => {
    setUploadId(u.id)
    setFnName(undefined)
    setPreview(undefined)
    setSaved(undefined)
    setRun(undefined)
  }

  const selectFunction = (f: FunctionInfo) => {
    setFnName(f.name)
    setParams(Object.fromEntries(f.params.map((p) => [p, params[p] ?? { type: 'int', min: '0', max: '100', step: '' }])))
    setPreview(undefined)
    setSaved(undefined)
    if (!newReq.title) setNewReq({ title: `${f.name}() accepts only valid inputs`, module: newReq.module })
  }

  const addUpload = (filename: string, source: string) =>
    act('upload', async () => {
      const u = await api.post<Upload>('/uploads', { filename, source })
      uploads.reload()
      selectUpload(u)
      if (u.functions.length === 1) selectFunction(u.functions[0])
    })

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) addUpload(file.name, await file.text())
  }

  const loadSample = () =>
    act('upload', async () => {
      const s = await api.get<{ filename: string; source: string }>('/sample')
      const u = await api.post<Upload>('/uploads', s)
      uploads.reload()
      selectUpload(u)
    })

  const buildSpecs = (): Record<string, ParamSpec> | string => {
    if (!fn) return 'Choose a function first.'
    const out: Record<string, ParamSpec> = {}
    for (const p of fn.params) {
      const d = params[p]
      if (!d) return `Set a range for ${p}.`
      const min = Number(d.min)
      const max = Number(d.max)
      const step = d.step.trim() === '' ? null : Number(d.step)
      if (d.min.trim() === '' || d.max.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max))
        return `${p}: min and max must be numbers.`
      if (min > max) return `${p}: min must not be greater than max.`
      if (step !== null && !(step > 0)) return `${p}: step must be a positive number.`
      out[p] = { type: d.type, min, max, step }
    }
    return out
  }

  const body = () => {
    const specs = buildSpecs()
    if (typeof specs === 'string') throw new Error(specs)
    return { signature: fn!.signature, params: specs, upload_id: uploadId, priority, test_type: testType }
  }

  const doPreview = () =>
    act('preview', async () => {
      setPreview(await api.post<GenerateResponse>('/generate', body()))
      setSaved(undefined)
    })

  const doSave = () =>
    act('save', async () => {
      const b = body()
      let requirementId: number
      if (reqChoice === NEW) {
        if (!newReq.title.trim()) throw new Error('Give the new requirement a title.')
        const r = await api.post<Requirement>('/requirements', { title: newReq.title.trim(), module: newReq.module.trim() || 'general' })
        requirementId = r.id
        requirements.reload()
        setReqChoice(String(r.id))
      } else {
        requirementId = Number(reqChoice)
      }
      let scenarioId: number | undefined
      if (scenarioTitle.trim()) {
        scenarioId = (await api.post<Scenario>('/scenarios', { requirement_id: requirementId, title: scenarioTitle.trim() })).id
      }
      const res = await api.post<GenerateResponse>('/generate', { ...b, persist: true, requirement_id: requirementId, scenario_id: scenarioId })
      setSaved(res)
      setPreview(res)
      setRun(undefined)
      uploads.reload()
    })

  const doRun = () =>
    act('run', async () => {
      setRun(await api.post<RunSummary>(`/uploads/${uploadId}/run`, { run_label: 'manual run from UI' }))
    })

  const setParam = (p: string, patch: Partial<ParamDraft>) => setParams((ps) => ({ ...ps, [p]: { ...ps[p], ...patch } }))
  const shown = saved ?? preview

  return (
    <>
      <PageHeader
        title="Upload & generate"
        description="Upload a Python module, pick a function and describe its valid input ranges. Test cases are generated with Equivalence Partitioning and robust Boundary Value Analysis, then executed against the real code."
      />
      <div className="mb-4"><ErrorBanner error={error ?? uploads.error} /></div>

      <Step n={1} title="Upload code" done={!!upload}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover">
            {busy === 'upload' ? 'Uploading…' : 'Choose .py file'}
            <input type="file" accept=".py,text/x-python" className="sr-only" onChange={onFile} disabled={!!busy} />
          </label>
          <Button variant="secondary" onClick={loadSample} disabled={!!busy}>Use sample bank.py</Button>
        </div>
        {!!uploads.data?.length && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {uploads.data.map((u) => (
              <button
                key={u.id}
                onClick={() => selectUpload(u)}
                className={`rounded-lg border p-3 text-left transition-colors ${u.id === uploadId ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'}`}
              >
                <div className="font-mono text-sm font-medium text-ink">{u.filename}</div>
                <div className="mt-0.5 text-xs text-ink-2">
                  {u.functions.length} function{u.functions.length === 1 ? '' : 's'} · {u.test_case_count} test cases · upload #{u.id}
                </div>
              </button>
            ))}
          </div>
        )}
      </Step>

      {upload && (
        <Step n={2} title="Choose a function and define valid input ranges" done={!!saved}>
          <div className="grid gap-2 sm:grid-cols-2">
            {upload.functions.map((f) => (
              <button
                key={f.name}
                onClick={() => selectFunction(f)}
                className={`rounded-lg border p-3 text-left transition-colors ${f.name === fnName ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'}`}
              >
                <div className="font-mono text-sm text-ink">{f.signature}</div>
                {f.docstring && <div className="mt-1 line-clamp-2 text-xs text-ink-2">{f.docstring}</div>}
              </button>
            ))}
          </div>

          {fn && (
            <Card className="mt-4">
              {fn.params.length === 0 ? (
                <p className="text-sm text-ink-2">{fn.name}() takes no parameters, so there is nothing to partition.</p>
              ) : (
                <>
                  <h3 className="text-sm font-medium text-ink">Valid equivalence class per parameter</h3>
                  <p className="mb-3 text-xs text-ink-2">Values inside [min, max] are expected to be accepted; anything outside should be rejected (raise an exception or return False).</p>
                  <div className="space-y-2">
                    {fn.params.map((p) => (
                      <div key={p} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_7rem_1fr_1fr_1fr]">
                        <div className="col-span-2 pb-1.5 font-mono text-sm text-ink sm:col-span-1">{p}</div>
                        <Field label="Type">
                          <select className={inputCls} value={params[p]?.type} onChange={(e) => setParam(p, { type: e.target.value as 'int' | 'float' })}>
                            <option value="int">integer</option>
                            <option value="float">decimal</option>
                          </select>
                        </Field>
                        <Field label="Min (valid)">
                          <input className={inputCls} inputMode="decimal" value={params[p]?.min} onChange={(e) => setParam(p, { min: e.target.value })} />
                        </Field>
                        <Field label="Max (valid)">
                          <input className={inputCls} inputMode="decimal" value={params[p]?.max} onChange={(e) => setParam(p, { max: e.target.value })} />
                        </Field>
                        <Field label="Step (optional)">
                          <input className={inputCls} inputMode="decimal" placeholder={params[p]?.type === 'float' ? '0.01' : '1'} value={params[p]?.step} onChange={(e) => setParam(p, { step: e.target.value })} />
                        </Field>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Requirement">
                      <select className={inputCls} value={reqChoice} onChange={(e) => setReqChoice(e.target.value)}>
                        <option value={NEW}>+ New requirement</option>
                        {requirements.data?.map((r) => (
                          <option key={r.id} value={r.id}>{r.code} · {r.title}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Test scenario (optional)">
                      <input className={inputCls} placeholder="e.g. Amount limits" value={scenarioTitle} onChange={(e) => setScenarioTitle(e.target.value)} />
                    </Field>
                    <Field label="Priority">
                      <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                        {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Test type">
                      <select className={inputCls} value={testType} onChange={(e) => setTestType(e.target.value as CaseType)}>
                        {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    {reqChoice === NEW && (
                      <>
                        <Field label="New requirement title" className="sm:col-span-2 lg:col-span-3">
                          <input className={inputCls} value={newReq.title} onChange={(e) => setNewReq({ ...newReq, title: e.target.value })} />
                        </Field>
                        <Field label="Module">
                          <input className={inputCls} value={newReq.module} onChange={(e) => setNewReq({ ...newReq, module: e.target.value })} />
                        </Field>
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={doPreview} disabled={!!busy}>{busy === 'preview' ? 'Generating…' : 'Preview test cases'}</Button>
                    <Button onClick={doSave} disabled={!!busy || !!saved}>{busy === 'save' ? 'Saving…' : saved ? `Saved ${saved.cases.length} test cases` : 'Generate & save'}</Button>
                  </div>
                </>
              )}
            </Card>
          )}

          {shown && (
            <Card className="mt-4" title={`${shown.cases.length} generated test cases`} subtitle={saved ? 'Saved and linked to the requirement.' : 'Preview — not saved yet.'}>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-line">
                    <tr>
                      {saved && <th className={th}>ID</th>}
                      <th className={th}>Input</th>
                      <th className={th}>Technique</th>
                      <th className={th}>Partition</th>
                      <th className={th}>Expected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.cases.map((c, i) => (
                      <tr key={i}>
                        {saved && <td className={`${td} font-mono text-xs text-ink-2`}>{c.code}</td>}
                        <td className={`${td} font-mono text-xs text-ink`}>{formatInputs(c.inputs)}</td>
                        <td className={td}><Tag>{c.technique === 'Boundary Value Analysis' ? 'BVA' : 'EP'}</Tag></td>
                        <td className={`${td} text-ink-2`}>{c.partition}</td>
                        <td className={td}>
                          <span className={c.expected_outcome === 'Accept' ? 'text-good-text' : 'text-critical-text'}>{c.expected_outcome}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Step>
      )}

      {upload && upload.test_case_count > 0 && (
        <Step n={3} title={`Execute all ${upload.test_case_count} test cases for ${upload.filename}`} done={!!run}>
          <Button onClick={doRun} disabled={!!busy}>{busy === 'run' ? 'Running…' : '▶ Run tests'}</Button>
          <p className="mt-2 text-xs text-muted">Runs in a separate Python process with coverage.py measuring branch coverage. Failures open defects automatically.</p>
          {run && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Passed" value={run.passed} hint={`of ${run.total}`} />
                <StatTile label="Failed" value={run.failed} />
                <StatTile label="Coverage" value={run.coverage === null ? '—' : `${run.coverage}%`} />
                <StatTile label="Defects opened" value={run.defects_created} hint={run.defects_created ? <button className="hover:underline" onClick={() => go('defects')}>View defects →</button> : undefined} />
              </div>
              <Card title="Results">
                <div className="-mx-4 overflow-x-auto sm:-mx-5">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-line">
                      <tr>
                        <th className={th}>ID</th>
                        <th className={th}>Input</th>
                        <th className={th}>Expected</th>
                        <th className={th}>Actual</th>
                        <th className={th}>Result</th>
                        <th className={th}>Defect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...run.results].sort((a, b) => (a.result === 'Fail' ? -1 : 0) - (b.result === 'Fail' ? -1 : 0)).map((r) => (
                        <tr key={r.test_case_id}>
                          <td className={`${td} font-mono text-xs text-ink-2`}>{r.code}</td>
                          <td className={`${td} font-mono text-xs`}>{formatInputs(r.inputs)}</td>
                          <td className={td}>{r.expected}</td>
                          <td className={`${td} text-ink-2`}>{r.actual}</td>
                          <td className={td}><StatusBadge status={r.result} /></td>
                          <td className={`${td} font-mono text-xs`}>{r.defect_code ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </Step>
      )}
    </>
  )
}
