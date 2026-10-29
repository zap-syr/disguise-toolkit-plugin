// Single entry point for all HTTP calls to Designer.

// Designer opens the plugin with ?director=<host:port>; fall back to a local Designer in dev.
export const directorEndpoint =
  new URLSearchParams(window.location.search).get('director') || 'localhost:80'

export async function executePython(script) {
  let response
  try {
    response = await fetch(`http://${directorEndpoint}/api/session/python/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script }),
    })
  } catch (e) {
    throw new Error(`Cannot reach Designer (${directorEndpoint})`)
  }

  if (response.status === 502) throw new Error('No project is running in Designer')

  let data = null
  try {
    data = await response.json()
  } catch (e) {
    throw new Error(`Designer HTTP ${response.status}`)
  }
  if (!response.ok) {
    // Python exceptions and timeouts: HTTP 500, status.message holds the traceback
    throw new Error(data?.status?.message || `Designer HTTP ${response.status}`)
  }
  if (data.status?.code) console.warn('Designer status', data.status)

  let result = data.returnValue
  if (typeof result === 'string') {
    try { result = JSON.parse(result) } catch (e) { /* plain string result */ }
  }
  return result
}

// Embeds a JS string as a Python unicode literal; non-ASCII is escaped so Python 2 reads it correctly.
export function pyString(value) {
  const json = JSON.stringify(String(value ?? ''))
  return 'u' + json.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

// Scripts return {status: "error", message} for expected failures.
export async function runScript(script) {
  const result = await executePython(script)
  if (!result || result.status !== 'success') {
    throw new Error(result?.message || 'Designer script returned no result')
  }
  return result
}
