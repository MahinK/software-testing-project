import { formatInputs, type Report, useLoad } from '../api'
import { Button, Empty, ErrorBanner, Loading, StatusBadge, VerdictBadge } from '../components/ui'

const th = 'border-b border-line px-2 py-1.5 text-left text-xs font-medium text-muted'
const td = 'border-b border-line px-2 py-1.5 align-top'

export default function ReportPage() {
  const { data, error, loading } = useLoad<Report>('/report')
  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBanner error={error} />
  if (!data.requirements.length) return <Empty title="Nothing to report yet">Add requirements and test cases first.</Empty>

  const s = data.summary
  const rows = data.requirements.map((t) => {
    const cases = t.scenarios.flatMap((sc) => sc.test_cases)
    const n = (st: string) => cases.filter((c) => c.status === st).length
    return { t, cases, pass: n('Pass'), fail: n('Fail'), blocked: n('Blocked'), notRun: n('Not Run'), defects: cases.flatMap((c) => c.defects) }
  })
  const verified = rows.filter((r) => r.t.verification_status === 'VERIFIED').length

  return (
    <article className="rounded-xl border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-accent pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Verification report</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Requirement verification summary</h1>
          <p className="mt-1 text-sm text-ink-2">Generated {new Date(data.generated_at).toLocaleString()}</p>
        </div>
        <Button variant="secondary" onClick={() => window.print()} className="print:hidden">⎙ Print / save as PDF</Button>
      </header>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-ink">1. Summary</h2>
        <p className="mt-2 text-sm text-ink-2">
          {verified} of {rows.length} requirements are fully verified. {s.total_test_cases} test cases exist, of which{' '}
          {s.passed + s.failed + s.blocked} were executed with a pass rate of {s.pass_percentage}%.
          {s.code_coverage !== null && <> Branch coverage of the code under test is {s.code_coverage}%.</>} {s.open_defects} defect
          {s.open_defects === 1 ? ' is' : 's are'} open.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm tabular-nums">
            <thead>
              <tr>
                {['Test cases', 'Passed', 'Failed', 'Blocked', 'Not run', 'Pass rate', 'Coverage', 'Open defects'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>{s.total_test_cases}</td>
                <td className={td}>{s.passed}</td>
                <td className={td}>{s.failed}</td>
                <td className={td}>{s.blocked}</td>
                <td className={td}>{s.not_run}</td>
                <td className={td}>{s.pass_percentage}%</td>
                <td className={td}>{s.code_coverage === null ? '—' : `${s.code_coverage}%`}</td>
                <td className={td}>{s.open_defects}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">2. Requirements traceability matrix</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                {['Req.', 'Requirement', 'Module', 'Cases', 'Pass', 'Fail', 'Blocked', 'Not run', 'Defects', 'Verdict'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.t.requirement.id}>
                  <td className={`${td} font-mono text-xs`}>{r.t.requirement.code}</td>
                  <td className={td}>{r.t.requirement.title}</td>
                  <td className={`${td} text-ink-2`}>{r.t.requirement.module}</td>
                  <td className={td}>{r.cases.length}</td>
                  <td className={td}>{r.pass}</td>
                  <td className={td}>{r.fail}</td>
                  <td className={td}>{r.blocked}</td>
                  <td className={td}>{r.notRun}</td>
                  <td className={`${td} font-mono text-xs`}>{r.defects.map((d) => d.code).join(', ') || '—'}</td>
                  <td className={td}><VerdictBadge verdict={r.t.verification_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">3. Detailed results</h2>
        {rows.map((r) => (
          <div key={r.t.requirement.id} className="mt-5 break-inside-avoid-page">
            <h3 className="text-sm font-semibold text-ink">
              <span className="font-mono text-ink-2">{r.t.requirement.code}</span> {r.t.requirement.title}
            </h3>
            {r.cases.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No test cases.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr>
                      {['Test case', 'Scenario', 'Input', 'Expected', 'Actual (latest)', 'Result', 'Defect'].map((h) => <th key={h} className={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {r.t.scenarios.flatMap((sc) =>
                      sc.test_cases.map((tc) => (
                        <tr key={tc.id}>
                          <td className={td}><span className="font-mono">{tc.code}</span><div className="text-muted">{tc.title}</div></td>
                          <td className={`${td} text-ink-2`}>{sc.title}</td>
                          <td className={`${td} font-mono`}>{formatInputs(tc.inputs) || '—'}</td>
                          <td className={td}>{tc.expected_outcome || '—'}</td>
                          <td className={`${td} text-ink-2`}>{tc.executions.at(-1)?.actual || '—'}</td>
                          <td className={td}><StatusBadge status={tc.status} /></td>
                          <td className={`${td} font-mono`}>{tc.defects.map((d) => `${d.code} (${d.severity}, ${d.status})`).join(', ') || '—'}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </section>

      <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
        Test cases generated with Equivalence Partitioning and robust Boundary Value Analysis (single-fault assumption). A requirement is
        verified when every linked test case passes.
      </footer>
    </article>
  )
}
