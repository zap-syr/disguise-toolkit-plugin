const pad = (n) => String(n).padStart(2, '0')

// Seconds to "HH:MM:SS.FF" as Designer shows it on the timeline.
export function formatTimecode(seconds, fps = 30) {
  const rate = Math.max(1, Math.round(fps))
  const totalFrames = Math.round(Math.max(0, seconds) * rate)
  const frames = totalFrames % rate
  const totalSeconds = Math.floor(totalFrames / rate)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(frames)}`
}
