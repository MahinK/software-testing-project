import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Chart chrome follows the theme through CSS variables, so light/dark swap without re-rendering.
const tick = { fill: 'var(--muted)', fontSize: 12 }

export interface TipRow {
  label: string
  value: number | string
  color?: string
}

export function ChartTooltip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />}
          {r.label}
          <span className="ml-auto pl-5 tabular-nums text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; value?: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
          {i.value !== undefined && <span className="tabular-nums text-ink">{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

export interface Segment {
  key: string
  label: string
  color: string
}

/** Horizontal stacked bars, one row per category. */
export function StackedBars({
  data,
  segments,
  titleOf,
}: {
  data: (Record<string, number | string> & { name: string })[]
  segments: Segment[]
  titleOf: (row: Record<string, number | string>) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 36}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis type="number" allowDecimals={false} tick={tick} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={tick} axisLine={false} tickLine={false} width={72} />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as Record<string, number | string>
            return (
              <ChartTooltip
                title={titleOf(row)}
                rows={segments.map((s) => ({ label: s.label, value: Number(row[s.key] ?? 0), color: s.color }))}
              />
            )
          }}
        />
        {segments.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="stack" fill={s.color} stroke="var(--surface)" strokeWidth={2} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Single-series bars. Horizontal suits long category names (modules). */
export function SimpleBars({
  data,
  horizontal = false,
  unit,
}: {
  data: { name: string; value: number }[]
  horizontal?: boolean
  unit: string
}) {
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'var(--surface-2)' }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null
        const row = payload[0].payload as { name: string; value: number }
        return <ChartTooltip title={row.name} rows={[{ label: unit, value: row.value }]} />
      }}
    />
  )
  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.max(data.length, 1) * 40 + 36}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" allowDecimals={false} tick={tick} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={tick} axisLine={false} tickLine={false} width={84} />
          {tooltip}
          <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={24}>
            <LabelList dataKey="value" position="right" fill="var(--ink-2)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: -16 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="name" tick={tick} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
        {tooltip}
        <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={44}>
          <LabelList dataKey="value" position="top" fill="var(--ink-2)" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** A single 100% bar split by status, with a labelled legend underneath. */
export function StatusBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" role="img"
        aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(100 * p.value) / total}%`, background: p.color }} />
            ))}
      </div>
      <div className="mt-3">
        <Legend items={parts.map((p) => ({ label: p.label, color: p.color, value: p.value }))} />
      </div>
    </div>
  )
}
