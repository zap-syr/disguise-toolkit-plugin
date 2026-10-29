import { reactive, watch } from 'vue'

// Per-tool settings remembered in the browser. Storage may be unavailable, so every access is guarded.
export function useToolSettings(toolId, defaults) {
  const key = `disguise-toolkit:${toolId}`
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(key) || '{}')
  } catch (e) { /* storage unavailable */ }

  const settings = reactive({ ...defaults })
  for (const name of Object.keys(defaults)) {
    if (name in saved && typeof saved[name] === typeof defaults[name]) settings[name] = saved[name]
  }

  watch(settings, () => {
    try { localStorage.setItem(key, JSON.stringify(settings)) } catch (e) { /* storage unavailable */ }
  }, { deep: true })

  return settings
}

export function loadValue(key, fallback) {
  try { return localStorage.getItem(`disguise-toolkit:${key}`) ?? fallback } catch (e) { return fallback }
}

export function saveValue(key, value) {
  try { localStorage.setItem(`disguise-toolkit:${key}`, value) } catch (e) { /* storage unavailable */ }
}
