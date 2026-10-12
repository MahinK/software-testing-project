import type { PageId } from '../App'
import { type Report, SEVERITIES, useLoad } from '../api'
import { Legend, SimpleBars, StackedBars, StatusBar } from '../components/charts'
import { Button, Card, Empty, ErrorBanner, Loading, PageHeader, StatTile } from '../components/ui'

const STATUS_SEGMENTS = [
  { key: 'Pass', label: 'Passed', color: 'var(--good)' },
  { key: 'Fail', label: 'Failed', color: 'var(--critical)' },
  { key: 'Blocked', label: 'Blocked', color: 'var(--warning)' },
  { key: 'Not Run', label: 'Not run', color: 'var(--neutral)' },
]

export default function Dashboard({
  go,
  onLoadDemo,
  seeding,
}: {
  go: (p: PageId) => void
  onLoadDemo: () => void
  seeding: boolean
}) {
  const { data, error, loading } = useLoad<Report>('/report')

  const header = (
    <PageHeader
      title="Testing dashboard"
      description="Live pass/fail metrics, coverage and defect distribution across every requirement under verification."
    />
  )
  if (loading && !data) return <>{header}<Loading /></>
  if (error || !data) return <>{header}<ErrorBanner error={error} /></>

  const s = data.summary
  if (s.total_test_cases === 0) {
    return (
      <>
        {header}
        <Empty title="No test cases yet">
          <p>Upload a Python module to generate EP/BVA test cases, or load the sample banking project.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={onLoadDemo} disabled={seeding}>{seeding ? 'Loading…' : 'Load demo data'}</Button>
            <Button variant="secondary" onClick={() => go('generate')}>Upload code</Button>
          </div>
        </Empty>
      </>
    )
  }

  const executed = s.passed + s.failed + s.blocked
  const byRequirement = data.requirements.map((t) => {
    const row: Record<string, number | string> & { name: string } = {
      name: t.requirement.code,
      title: t.requirement.title,
      Pass: 0,
      Fail: 0,
      Blocked: 0,
      'Not Run': 0,
    }
    for (const sc of t.scenarios) for (const tc of sc.test_cases) row[tc.status] = Number(row[tc.status]) + 1
    return row
  })
  const severity = SEVERITIES.map((name) => ({ name, value: s.defects_by_severity[name] ?? 0 }))
  const modules = Object.entries(s.defects_by_module)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const r = s.regression

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Test cases" value={s.total_test_cases} hint={`${executed} executed · ${s.not_run} not run`} />
        <StatTile label="Pass rate" value={`${s.pass_percentage}%`} hint={`${s.passed} of ${executed} executed passed`} />
        <StatTile
          label="Code coverage"
          value={s.code_coverage === null ? '—' : `${s.code_coverage}%`}
          hint="Branch coverage, coverage.py"
        />
        <StatTile label="Open defects" value={s.open_defects} hint={<button className="underline-offset-2 hover:underline" onClick={() => go('defects')}>View defects →</button>} />
      </div>

      <Card title="Execution status" subtitle="Latest result of every test case" className="mt-4">
        <StatusBar
          parts={[
            { label: 'Passed', value: s.passed, color: 'var(--good)' },
            { label: 'Failed', value: s.failed, color: 'var(--critical)' },
            { label: 'Blocked', value: s.blocked, color: 'var(--warning)' },
            { label: 'Not run', value: s.not_run, color: 'var(--neutral)' },
          ]}
        />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card
          title="Results by requirement"
          subtitle="Test case status per requirement"
          className="lg:col-span-3"
          action={<Legend items={STATUS_SEGMENTS.map(({ label, color }) => ({ label, color }))} />}
        >
          <StackedBars
            data={byRequirement}
            segments={STATUS_SEGMENTS}
            titleOf={(row) => `${row.name} · ${row.title}`}
          />
        </Card>
        <Card title="Defects by severity" subtitle="All defects, any status" className="lg:col-span-2">
          <SimpleBars data={severity} unit="Defects" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Defects by module" className="lg:col-span-3">
          {modules.length ? <SimpleBars data={modules} unit="Defects" horizontal /> : <p className="text-sm text-muted">No defects recorded.</p>}
        </Card>
        <Card title="Regression results" subtitle={`${r.total} regression test cases`} className="lg:col-span-2">
          {r.total ? (
            <StatusBar
              parts={[
                { label: 'Passed', value: r.passed, color: 'var(--good)' },
                { label: 'Failed', value: r.failed, color: 'var(--critical)' },
                { label: 'Blocked', value: r.blocked, color: 'var(--warning)' },
                { label: 'Not run', value: r.not_run, color: 'var(--neutral)' },
              ]}
            />
          ) : (
            <p className="text-sm text-muted">No test cases are marked as regression tests.</p>
          )}
        </Card>
      </div>
    </>
  )
}
