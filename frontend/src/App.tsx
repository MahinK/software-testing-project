import { useEffect, useState } from 'react'
import { api } from './api'
import { Button } from './components/ui'
import Dashboard from './pages/Dashboard'
import Defects from './pages/Defects'
import Generate from './pages/Generate'
import ReportPage from './pages/Report'
import Requirements from './pages/Requirements'
import TestCases from './pages/TestCases'

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'generate', label: 'Upload & Generate', icon: '↥' },
  { id: 'cases', label: 'Test Cases', icon: '☰' },
  { id: 'requirements', label: 'Traceability', icon: '⇣' },
  { id: 'defects', label: 'Defects', icon: '⚑' },
  { id: 'report', label: 'Verification Report', icon: '⎙' },
] as const
export type PageId = (typeof PAGES)[number]['id']

function pageFromHash(): PageId {
  const id = window.location.hash.slice(1)
  return PAGES.some((p) => p.id === id) ? (id as PageId) : 'dashboard'
}

export default function App() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  // Bumped after data-changing actions in the shell so the page remounts and refetches.
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<{ tone: 'good' | 'critical'; text: string }>()
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (id: PageId) => {
    window.location.hash = id
  }

  const loadDemo = async () => {
    setSeeding(true)
    setNotice(undefined)
    try {
      const r = await api.post<{ test_cases: number; failed: number; defects_created: number }>('/demo')
      setNotice({
        tone: 'good',
        text: `Demo loaded: ${r.test_cases} test cases generated and executed against bank.py, ${r.failed} failures, ${r.defects_created} defects opened.`,
      })
      setVersion((v) => v + 1)
    } catch (e) {
      setNotice({ tone: 'critical', text: (e as Error).message })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0 print:hidden">
        <div className="flex items-center gap-2.5 px-4 py-4 md:px-5 md:py-5">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">VeriTest</div>
            <div className="text-[11px] text-muted">Verification &amp; Testing</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-current={page === p.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                page === p.id ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              <span aria-hidden className="w-4 text-center">
                {p.icon}
              </span>
              {p.label}
            </a>
          ))}
        </nav>
        <div className="hidden px-5 pt-6 md:block">
          <p className="text-xs text-muted">Try the full pipeline on a sample banking module.</p>
          <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={loadDemo} disabled={seeding}>
            {seeding ? 'Loading…' : 'Load demo data'}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 md:hidden print:hidden">
            <Button variant="secondary" size="sm" onClick={loadDemo} disabled={seeding}>
              {seeding ? 'Loading…' : 'Load demo data'}
            </Button>
          </div>
          {notice && (
            <div role="status" className={`tone-${notice.tone} mb-5 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm print:hidden`}>
              <span>{notice.text}</span>
              <button className="opacity-70 hover:opacity-100" onClick={() => setNotice(undefined)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          )}
          <div key={`${page}-${version}`}>
            {page === 'dashboard' && <Dashboard go={go} onLoadDemo={loadDemo} seeding={seeding} />}
            {page === 'generate' && <Generate go={go} />}
            {page === 'cases' && <TestCases />}
            {page === 'requirements' && <Requirements />}
            {page === 'defects' && <Defects />}
            {page === 'report' && <ReportPage />}
          </div>
        </div>
      </main>
    </div>
  )
}
