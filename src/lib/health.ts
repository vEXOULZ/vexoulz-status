// What the checks mean: a service's health, the whole network's, and the words and numbers the pages show.
// Pure functions of Gatus's answers, so they are tested without a browser.
import type { Health, Tone, UptimeTick } from '@vexoulz/ui'
import type { Announcement, CheckResult, EndpointEvent, EndpointStatus } from './gatus'

export const ms = (r: CheckResult) => r.duration / 1e6

/** A service is down when its latest check failed, unstable when an earlier one in view did, up otherwise. */
export function healthOf(results: CheckResult[]): Health {
  const last = results.at(-1)
  if (!last) return 'off'
  if (!last.success) return 'down'
  return results.some((r) => !r.success) ? 'warn' : 'ok'
}

export const HEALTH_WORD: Record<Health, string> = { ok: 'Up', warn: 'Unstable', down: 'Down', off: 'No data' }

export interface Overall {
  health: Health
  title: string
}

/** The banner: one line for everything. */
export function overallOf(endpoints: EndpointStatus[]): Overall {
  const h = endpoints.map((e) => healthOf(e.results)).filter((x) => x !== 'off')
  const down = h.filter((x) => x === 'down').length
  if (!h.length) return { health: 'off', title: 'No checks yet' }
  if (down === h.length) return { health: 'down', title: 'Everything is down' }
  if (down) return { health: 'down', title: `${down} of ${h.length} ${h.length === 1 ? 'service' : 'services'} down` }
  if (h.includes('warn')) return { health: 'warn', title: 'Up, with recent failures' }
  return { health: 'ok', title: 'All services up' }
}

export interface Group {
  name: string
  endpoints: EndpointStatus[]
}

/** Endpoints by group, in the order Gatus lists them; ungrouped ones last. */
export function groupsOf(endpoints: EndpointStatus[]): Group[] {
  const map = new Map<string, EndpointStatus[]>()
  for (const e of endpoints) {
    const g = e.group ?? ''
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(e)
  }
  return [...map].sort(([a], [b]) => Number(a === '') - Number(b === '')).map(([name, endpoints]) => ({ name, endpoints }))
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** 1 → "100%", 0.99931 → "99.93%", never rounding a miss up to 100. */
export function percent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  if (ratio >= 1) return '100%'
  const floored = Math.floor(ratio * 10000) / 100
  return `${floored.toFixed(2).replace(/\.?0+$/, '')}%`
}

export const millis = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${Math.round(n)} ms`)

/** Why a check failed, in one line: the failed conditions, else the error, else the status code. */
export function failureOf(r: CheckResult): string {
  const failed = (r.conditionResults ?? []).filter((c) => !c.success).map((c) => c.condition)
  if (failed.length) return failed.join(', ')
  if (r.errors?.length) return r.errors[0]!
  return r.status ? `HTTP ${r.status}` : 'no answer'
}

/** One tick per check, labelled with its time and either its response or why it failed. */
export const ticksOf = (results: CheckResult[]): UptimeTick[] =>
  results.map((r) => ({
    status: r.success ? 'ok' : 'down',
    label: r.success
      ? `${clock(r.timestamp)} · ${r.status ? `${r.status} · ` : ''}${Math.round(ms(r))} ms`
      : `${clock(r.timestamp)} · ${failureOf(r)}`,
  }))

export const averageMs = (results: CheckResult[]) => (results.length ? results.reduce((s, r) => s + ms(r), 0) / results.length : null)

/** "3 min", "2 h 5 min", "1 d 4 h". */
export function span(msSpan: number): string {
  const m = Math.max(1, Math.round(msSpan / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

export interface Incident {
  start: string
  /** null while still down. */
  end: string | null
  /** How long it lasted (so far). */
  length: string
}

/** Outages from Gatus's events: each UNHEALTHY up to the HEALTHY after it. Newest first. */
export function incidentsOf(events: EndpointEvent[] = [], now = Date.now()): Incident[] {
  const out: Incident[] = []
  let open: string | null = null
  for (const e of events) {
    if (e.type === 'UNHEALTHY' && !open) open = e.timestamp
    else if (e.type === 'HEALTHY' && open) {
      out.push({ start: open, end: e.timestamp, length: span(Date.parse(e.timestamp) - Date.parse(open)) })
      open = null
    }
  }
  if (open) out.push({ start: open, end: null, length: span(now - Date.parse(open)) })
  return out.reverse()
}

/** Gatus's announcement types as callout tones. */
export const announcementTone = (a: Announcement): Tone =>
  a.type === 'outage' ? 'error' : a.type === 'warning' ? 'warn' : a.type === 'operational' ? 'ok' : 'info'
