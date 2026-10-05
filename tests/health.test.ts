import { describe, expect, it } from 'vitest'
import type { CheckResult, EndpointStatus } from '../src/lib/gatus'
import { announcementTone, failureOf, groupsOf, healthOf, historyOf, incidentsOf, outagesOf, overallOf, percent, span, ticksOf } from '../src/lib/health'

const ok = (t = '2026-09-28T12:00:00Z'): CheckResult => ({ status: 200, duration: 21e6, success: true, timestamp: t })
const bad = (extra: Partial<CheckResult> = {}): CheckResult => ({ status: 502, duration: 5e6, success: false, timestamp: '2026-09-28T12:01:00Z', ...extra })
const ep = (key: string, results: CheckResult[], group?: string): EndpointStatus => ({ key, name: key, group, results })

describe('healthOf', () => {
  it('is off with no checks', () => expect(healthOf([])).toBe('off'))
  it('is down when the latest check failed', () => expect(healthOf([ok(), bad()])).toBe('down'))
  it('is unstable when an earlier check failed', () => expect(healthOf([bad(), ok()])).toBe('warn'))
  it('is up when every check passed', () => expect(healthOf([ok(), ok()])).toBe('ok'))
})

describe('overallOf', () => {
  it('ignores services with no data', () => expect(overallOf([ep('a', [])])).toEqual({ health: 'off', title: 'No checks yet' }))
  it('counts the down ones', () => expect(overallOf([ep('a', [bad()]), ep('b', [ok()]), ep('c', [ok()])]).title).toBe('1 of 3 services down'))
  it('says when everything is down', () => expect(overallOf([ep('a', [bad()])]).title).toBe('Everything is down'))
  it('mentions recent failures', () => expect(overallOf([ep('a', [bad(), ok()]), ep('b', [ok()])]).health).toBe('warn'))
  it('is all up', () => expect(overallOf([ep('a', [ok()])])).toEqual({ health: 'ok', title: 'All services up' }))
})

describe('groupsOf', () => {
  const at = (key: string, group: string | undefined, hostname?: string): EndpointStatus => ({
    key,
    name: key,
    group,
    results: hostname ? [{ ...ok(), hostname }] : [],
  })
  it('orders groups websites, API, infrastructure, then others alphabetically, then ungrouped', () => {
    const g = groupsOf([at('x', undefined), at('n', 'infrastructure'), at('z', 'zeta'), at('a', 'API'), at('w', 'websites'), at('b', 'beta')])
    expect(g.map((x) => x.name)).toEqual(['websites', 'API', 'infrastructure', 'beta', 'zeta', ''])
  })
  it('orders a group by the host of its first check in SITES, then by name; other hosts last', () => {
    const g = groupsOf([
      at('status', 'websites', 'status.vexoul.net'),
      at('b-other', 'websites', 'ntfy.vexoul.net'),
      at('dtp', 'websites', 'dtp.vexoul.net'),
      at('a-other', 'websites'),
      at('root', 'websites', 'vexoul.net'),
      at('vods', 'websites', 'vods.vexoul.net'),
    ])
    expect(g[0]!.endpoints.map((e) => e.key)).toEqual(['root', 'vods', 'dtp', 'status', 'a-other', 'b-other'])
  })
})

describe('outagesOf', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 8, 28, 12, m)).toISOString()
  it('pairs UNHEALTHY with the HEALTHY after it; an open one runs to now', () => {
    const o = outagesOf([
      { type: 'START', timestamp: t(0) },
      { type: 'HEALTHY', timestamp: t(0) },
      { type: 'UNHEALTHY', timestamp: t(5) },
      { type: 'HEALTHY', timestamp: t(8) },
      { type: 'UNHEALTHY', timestamp: t(20) },
    ], Date.parse(t(30)))
    expect(o.since).toBe(Date.parse(t(0)))
    expect(o.down).toEqual([[Date.parse(t(5)), Date.parse(t(8))], [Date.parse(t(20)), Date.parse(t(30))]])
  })
  it('reads the state before dropped events as the opposite of the first one left', () => {
    const o = outagesOf([{ type: 'HEALTHY', timestamp: t(8) }], Date.parse(t(30)))
    expect(o.since).toBe(-Infinity)
    expect(o.down).toEqual([[-Infinity, Date.parse(t(8))]])
  })
})

describe('historyOf', () => {
  // Local time, since slots line up on local midnight.
  const now = new Date(2026, 8, 28, 12, 0, 30).getTime()
  const iso = (h: number, m = 0, s = 0) => new Date(2026, 8, 28, h, m, s).toISOString()
  it('has a slot per period step, the last holding now', () => {
    expect(historyOf([], [], '1h', now)).toHaveLength(60)
    expect(historyOf([], [], '24h', now)).toHaveLength(48)
    expect(historyOf([], [], '7d', now)).toHaveLength(42)
    expect(historyOf([], [], '30d', now)).toHaveLength(30)
  })
  it('is off before checking began, down over an outage, unstable on a stray failure', () => {
    const events = [
      { type: 'START' as const, timestamp: iso(6) },
      { type: 'HEALTHY' as const, timestamp: iso(6) },
      { type: 'UNHEALTHY' as const, timestamp: iso(9, 10) },
      { type: 'HEALTHY' as const, timestamp: iso(9, 25) },
    ]
    const results = [{ ...bad(), timestamp: iso(11, 50, 5) }, { ...ok(), timestamp: iso(12, 0, 5) }]
    const h = historyOf(results, events, '24h', now)
    // Slots are half-hours; the last starts at 12:00, so index 47 - 2k is k hours earlier.
    expect(h[47 - 12]!.status).toBe('ok') // 06:00–06:30: checking began at its start
    expect(h[47 - 13]!.status).toBe('off') // 05:30–06:00: before it
    expect(h[47 - 6]!.status).toBe('down') // 09:00–09:30 holds the outage
    expect(h[47 - 6]!.label).toMatch(/down 15 min$/)
    expect(h[46]!.status).toBe('warn') // 11:30–12:00 holds the failed check
    expect(h[47]!.status).toBe('ok')
  })
})

describe('percent', () => {
  it('never rounds a miss up to 100', () => expect(percent(0.99999)).toBe('99.99%'))
  it('floors to two decimals', () => expect(percent(0.99931)).toBe('99.93%'))
  it('trims zeros', () => expect(percent(0.5)).toBe('50%'))
  it('is 100 when perfect', () => expect(percent(1)).toBe('100%'))
  it('is a dash with no number', () => expect(percent(null)).toBe('—'))
})

describe('failureOf', () => {
  it('lists failed conditions', () =>
    expect(failureOf(bad({ conditionResults: [{ condition: '[STATUS] == 200', success: false }, { condition: '[RESPONSE_TIME] < 500', success: true }] }))).toBe(
      '[STATUS] == 200',
    ))
  it('falls back to the error', () => expect(failureOf(bad({ errors: ['timeout'] }))).toBe('timeout'))
  it('then the status', () => expect(failureOf(bad())).toBe('HTTP 502'))
  it('then nothing answered', () => expect(failureOf(bad({ status: 0 }))).toBe('no answer'))
})

describe('ticksOf', () => {
  it('marks failures down and labels them with why', () => {
    const [a, b] = ticksOf([ok(), bad()])
    expect(a!.status).toBe('ok')
    expect(a!.label).toMatch(/200 · 21 ms$/)
    expect(b!).toMatchObject({ status: 'down' })
    expect(b!.label).toMatch(/HTTP 502$/)
  })
})

describe('span', () => {
  it('minutes', () => expect(span(3 * 60000)).toBe('3 min'))
  it('at least a minute', () => expect(span(1000)).toBe('1 min'))
  it('hours', () => expect(span(125 * 60000)).toBe('2 h 5 min'))
  it('days', () => expect(span(28 * 3600000)).toBe('1 d 4 h'))
})

describe('incidentsOf', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 8, 28, 12, m)).toISOString()
  it('pairs each outage with its recovery, newest first', () => {
    const out = incidentsOf([
      { type: 'START', timestamp: t(0) },
      { type: 'UNHEALTHY', timestamp: t(1) },
      { type: 'HEALTHY', timestamp: t(4) },
      { type: 'UNHEALTHY', timestamp: t(10) },
    ], Date.parse(t(15)))
    expect(out).toEqual([
      { start: t(10), end: null, length: '5 min' },
      { start: t(1), end: t(4), length: '3 min' },
    ])
  })
  it('is empty without events', () => expect(incidentsOf(undefined)).toEqual([]))
})

describe('announcementTone', () => {
  it('maps Gatus types', () => {
    expect(announcementTone({ timestamp: '', message: '', type: 'outage' })).toBe('error')
    expect(announcementTone({ timestamp: '', message: '', type: 'warning' })).toBe('warn')
    expect(announcementTone({ timestamp: '', message: '', type: 'operational' })).toBe('ok')
    expect(announcementTone({ timestamp: '', message: '' })).toBe('info')
  })
})
