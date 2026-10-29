import { ref, watch } from 'vue'
import { getTimelineSnapshot } from '../services/timelineService.js'
import { loadValue, saveValue } from './useToolSettings.js'

// One shared snapshot for the whole app. Refreshed on demand (button, window focus, track change,
// before Apply): the execute endpoint must not be polled.
const snapshot = ref(null)
const loading = ref(false)
const error = ref('')
// '' follows the track open in the Designer timeline; otherwise a track path.
const trackPath = ref(loadValue('track-path', ''))
let pending = null
let queued = false

async function refresh() {
  if (pending) {
    // A refresh started before a track change must not win, so run once more after it.
    queued = true
    return pending
  }
  loading.value = true
  pending = getTimelineSnapshot(trackPath.value)
    .then((data) => {
      snapshot.value = data
      error.value = ''
      return data
    })
    .catch((e) => {
      error.value = e.message
      throw e
    })
    .finally(() => {
      loading.value = false
      pending = null
      if (queued) {
        queued = false
        refresh().catch(() => {})
      }
    })
  return pending
}

watch(trackPath, (path) => {
  saveValue('track-path', path)
  refresh().catch(() => {})
})

export function useTimeline() {
  return { snapshot, loading, error, trackPath, refresh }
}
