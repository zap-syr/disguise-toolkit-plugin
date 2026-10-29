// Cue numbers are kept as integer arrays ([4, 3] = "4.3") to avoid float rounding.

const CUE_PATTERN = /^\d+(\.\d+){0,2}$/

// Longest cue text Designer shows in full, e.g. "1000.1000.1".
export const CUE_MAX_LENGTH = 11
export const CUE_MAX_LEVEL = 3

export function parseCue(text) {
  const value = String(text ?? '').trim()
  if (!CUE_PATTERN.test(value)) return null
  return value.split('.').map(Number)
}

export function formatCue(parts) {
  return parts.join('.')
}

// Adds `step` at `level` (1 = X, 2 = X.Y, 3 = X.Y.Z): missing levels become 0, deeper ones are dropped.
// 4.3 +1 @1 = 5, 4 +1 @2 = 4.1, 4.3.7 +1 @2 = 4.4
export function incrementCue(parts, level, step) {
  const next = parts.slice(0, level)
  while (next.length < level) next.push(0)
  next[level - 1] += step
  return next
}
