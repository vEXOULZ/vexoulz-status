// Loads a page's data, then again every minute (Gatus checks once a minute) while the tab is visible, and right
// away when it becomes visible again. A failed refresh keeps the last answer and sets `error`, so the page can say
// it's stale instead of going blank. Reloads from scratch when `source` changes (a route param).
import { onScopeDispose, ref, shallowRef, type Ref, watch, type WatchSource } from 'vue'
import { errorMessage } from './gatus'

export const REFRESH_MS = 60_000

export function useLive<T>(load: () => Promise<T>, source?: WatchSource) {
  const data = shallowRef<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const loading = ref(false)
  /** When the data shown was fetched (ms). */
  const updated = ref<number | null>(null)
  let run = 0

  async function reload() {
    const mine = ++run
    loading.value = true
    try {
      const value = await load()
      if (mine !== run) return
      data.value = value
      error.value = null
      updated.value = Date.now()
    } catch (e) {
      if (mine === run) error.value = errorMessage(e)
    } finally {
      if (mine === run) loading.value = false
    }
  }

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void reload()
  }, REFRESH_MS)
  const onVisible = () => {
    if (document.visibilityState === 'visible' && (!updated.value || Date.now() - updated.value > REFRESH_MS)) void reload()
  }
  document.addEventListener('visibilitychange', onVisible)
  onScopeDispose(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })

  if (source)
    watch(
      source,
      () => {
        data.value = null
        error.value = null
        void reload()
      },
      { immediate: true },
    )
  else void reload()
  return { data, error, loading, updated, reload }
}

/** A clock that ticks every few seconds, for "updated 12s ago". */
export function useNow(every = 5000) {
  const now = ref(Date.now())
  const t = setInterval(() => (now.value = Date.now()), every)
  onScopeDispose(() => clearInterval(t))
  return now
}
