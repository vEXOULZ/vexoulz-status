import { describe, expect, it } from 'vitest'
import type { CheckResult, EndpointStatus } from '../src/lib/gatus'
import { announcementTone, failureOf, groupsOf, healthOf, incidentsOf, overallOf, percent, span, ticksOf } from '../src/lib/health'

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
  it('keeps Gatus order and puts ungrouped last', () => {
    const g = groupsOf([ep('x', []), ep('a', [], 'sites'), ep('b', [], 'doomtp'), ep('c', [], 'sites')])
    expect(g.map((x) => [x.name, x.endpoints.map((e) => e.key).join()])).toEqual([
      ['sites', 'a,c'],
      ['doomtp', 'b'],
      ['', 'x'],
    ])
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
