<script setup lang="ts">
// Response time of each check, oldest on the left: one line, failed checks marked red. Hover (or tap) shows a
// crosshair and that check; tapping picks it, the same pick as the uptime bar above it.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CheckResult } from '@/lib/gatus'
import { clock, failureOf, ms } from '@/lib/health'

const props = defineProps<{ results: CheckResult[] }>()
const selected = defineModel<number | null>('selected', { default: null })

const H = 150
const PAD = { top: 10, right: 8, bottom: 22, left: 44 }
const box = ref<HTMLElement | null>(null)
const width = ref(600)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.max(200, entry!.contentRect.width)))
  if (box.value) observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

/** A round top for the axis: 1, 2 or 5 times a power of ten, above the slowest check. */
const top = computed(() => {
  const max = Math.max(1, ...props.results.map(ms))
  const p = 10 ** Math.floor(Math.log10(max))
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max * 1.1) ?? 10 * p
})
const plotW = computed(() => width.value - PAD.left - PAD.right)
const plotH = H - PAD.top - PAD.bottom
const x = (i: number) => PAD.left + (props.results.length > 1 ? (i / (props.results.length - 1)) * plotW.value : plotW.value / 2)
const y = (v: number) => PAD.top + plotH - (v / top.value) * plotH
const points = computed(() => props.results.map((r, i) => ({ x: x(i), y: y(ms(r)), r })))
const line = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(''))
const area = computed(() =>
  points.value.length ? `${line.value}L${points.value.at(-1)!.x.toFixed(1)},${PAD.top + plotH}L${points.value[0]!.x.toFixed(1)},${PAD.top + plotH}Z` : '',
)
const grid = computed(() => [0, 0.5, 1].map((f) => ({ v: Math.round(top.value * f), y: y(top.value * f) })))

const hover = ref<number | null>(null)
const shown = computed(() => hover.value ?? selected.value)
function nearest(e: PointerEvent): number | null {
  const n = props.results.length
  if (!n) return null
  const rel = (e.offsetX - PAD.left) / plotW.value
  return Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1))))
}
const tip = computed(() => {
  const i = shown.value
  const p = i === null ? null : points.value[i]
  if (!p) return null
  const text = `${clock(p.r.timestamp)} · ${Math.round(ms(p.r))} ms${p.r.success ? '' : ` · ${failureOf(p.r)}`}`
  // Keep the bubble inside the chart: anchor it by its left, middle or right depending on where the point is.
  const align = p.x < width.value * 0.25 ? 'left' : p.x > width.value * 0.75 ? 'right' : 'center'
  return { ...p, text, align }
})
</script>

<template>
  <div ref="box" class="chart">
    <svg
      :width="width"
      :height="H"
      role="img"
      :aria-label="`Response time of the last ${results.length} checks, up to ${top} ms`"
      @pointermove="hover = nearest($event)"
      @pointerleave="hover = null"
      @click="selected = nearest($event as PointerEvent)"
    >
      <g class="grid">
        <template v-for="g in grid" :key="g.v">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="g.y" :y2="g.y" />
          <text :x="PAD.left - 6" :y="g.y" dy="0.32em" text-anchor="end">{{ g.v }} ms</text>
        </template>
        <text v-if="results.length" :x="PAD.left" :y="H - 6">{{ clock(results[0]!.timestamp) }}</text>
        <text v-if="results.length" :x="width - PAD.right" :y="H - 6" text-anchor="end">{{ clock(results.at(-1)!.timestamp) }}</text>
      </g>
      <path class="area" :d="area" />
      <path class="line" :d="line" />
      <circle v-for="(p, i) in points.filter((q) => !q.r.success)" :key="i" class="fail" :cx="p.x" :cy="p.y" r="4" />
      <g v-if="tip">
        <line class="cross" :x1="tip.x" :x2="tip.x" :y1="PAD.top" :y2="PAD.top + plotH" />
        <circle class="dot" :class="{ 'is-fail': !tip.r.success }" :cx="tip.x" :cy="tip.y" r="4.5" />
      </g>
    </svg>
    <span v-if="tip" class="vx-tooltip-bubble tip" :class="`is-${tip.align}`" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">{{ tip.text }}</span>
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; min-width: 0; }
svg { display: block; touch-action: pan-y; cursor: crosshair; }
.grid line { stroke: var(--vx-line); stroke-width: 1; }
.grid text { fill: var(--vx-muted); font-family: var(--vx-font-mono); font-size: 10px; }
.area { fill: color-mix(in srgb, var(--vx-accent) 10%, transparent); }
.line { fill: none; stroke: var(--vx-accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.fail { fill: var(--vx-bad); stroke: var(--vx-bg); stroke-width: 2; }
.cross { stroke: var(--vx-muted); stroke-width: 1; stroke-dasharray: 3 3; }
.dot { fill: var(--vx-accent); stroke: var(--vx-bg); stroke-width: 2; }
.dot.is-fail { fill: var(--vx-bad); }
.tip { bottom: auto; white-space: nowrap; margin-top: -12px; transform: translate(-50%, -100%); }
.tip.is-left { transform: translate(-12px, -100%); }
.tip.is-right { transform: translate(calc(-100% + 12px), -100%); }
</style>
