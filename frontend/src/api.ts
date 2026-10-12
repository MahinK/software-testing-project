import { useCallback, useEffect, useState } from 'react'

export type CaseStatus = 'Not Run' | 'Pass' | 'Fail' | 'Blocked'
export type ExecutionResult = 'Pass' | 'Fail' | 'Blocked'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type CaseType = 'unit' | 'api' | 'integration' | 'regression' | 'ui'
export type Technique = 'Manual' | 'Equivalence Partitioning' | 'Boundary Value Analysis'
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export type DefectStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed'
export type Verdict = 'VERIFIED' | 'FAILED' | 'NOT_VERIFIED'
export type Inputs = Record<string, unknown>

export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']
export const CASE_TYPES: CaseType[] = ['unit', 'api', 'integration', 'regression', 'ui']
export const CASE_STATUSES: CaseStatus[] = ['Pass', 'Fail', 'Blocked', 'Not Run']
export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low']
export const DEFECT_STATUSES: DefectStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed']

export interface Requirement {
  id: number
  code: string
  title: string
  description: string
  module: string
}

export interface Scenario {
  id: number
  requirement_id: number
  title: string
}

export interface TestCase {
  id: number
  code: string
  title: string
  description: string
  requirement_id: number
  scenario_id: number | null
  suite_id: number | null
  upload_id: number | null
  priority: Priority
  status: CaseStatus
  test_type: CaseType
  technique: Technique
  module: string
  function_under_test: string | null
  inputs: Inputs
  expected_outcome: string
}

export interface Defect {
  id: number
  code: string
  test_case_id: number
  test_case_code: string
  title: string
  severity: Severity
  priority: Priority
  expected: string
  actual: string
  status: DefectStatus
  module: string
  created_at: string
}

export interface Dashboard {
  total_test_cases: number
  passed: number
  failed: number
  blocked: number
  not_run: number
  pass_percentage: number
  code_coverage: number | null
  open_defects: number
  defects_by_severity: Record<string, number>
  defects_by_module: Record<string, number>
  regression: { total: number; passed: number; failed: number; blocked: number; not_run: number }
}

export interface TraceCase {
  id: number
  code: string
  title: string
  status: CaseStatus
  test_type: CaseType
  technique: Technique
  inputs: Inputs
  expected_outcome: string
  executions: { id: number; result: ExecutionResult; actual: string; executed_at: string }[]
  defects: Defect[]
}

export interface Trace {
  requirement: Requirement
  verification_status: Verdict
  scenarios: { id: number | null; title: string; test_cases: TraceCase[] }[]
}

export interface Report {
  generated_at: string
  summary: Dashboard
  requirements: Trace[]
}

export interface FunctionInfo {
  name: string
  params: string[]
  signature: string
  docstring: string
}

export interface Upload {
  id: number
  filename: string
  created_at: string
  functions: FunctionInfo[]
  test_case_count: number
}

export interface ParamSpec {
  type: 'int' | 'float'
  min: number
  max: number
  step: number | null
}

export interface GeneratedCase {
  inputs: Inputs
  technique: Technique
  partition: string
  expected_outcome: string
  test_case_id: number | null
  code: string | null
}

export interface GenerateResponse {
  function: string
  parameters: string[]
  cases: GeneratedCase[]
}

export interface RunCaseResult {
  test_case_id: number
  code: string
  title: string
  inputs: Inputs
  expected: string
  actual: string
  result: ExecutionResult
  defect_code: string | null
  defect_created: boolean
}

export interface RunSummary {
  upload_id: number
  total: number
  passed: number
  failed: number
  blocked: number
  coverage: number | null
  defects_created: number
  results: RunCaseResult[]
}

function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI/Pydantic validation errors
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) =>
        [d.loc?.filter((l) => l !== 'body').join('.'), d.msg].filter(Boolean).join(': '),
      )
      .join('; ')
  }
  return JSON.stringify(detail)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('Cannot reach the API. Is the backend running (port 8001)?')
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data?.detail !== undefined) message = formatDetail(data.detail)
    } catch {
      if (res.status >= 500) message = 'Cannot reach the API. Is the backend running (port 8001)?'
    }
    throw new Error(message)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
}

export function useLoad<T>(path: string) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    // Reloads keep showing the previous data until the new response arrives.
    let live = true
    api.get<T>(path).then(
      (d) => {
        if (!live) return
        setData(d)
        setError(undefined)
        setLoading(false)
      },
      (e: Error) => {
        if (!live) return
        setError(e.message)
        setLoading(false)
      },
    )
    return () => {
      live = false
    }
  }, [path, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, loading, reload }
}

export function formatInputs(inputs: Inputs): string {
  return Object.entries(inputs)
    .map(([k, v]) => `${k} = ${v}`)
    .join(', ')
}
