<script setup>
import { computed } from 'vue'
import MenuSelect from '../ui/MenuSelect.vue'
import { useTimeline } from '../../composables/useTimeline.js'
import { formatTimecode } from '../../utils/timecode.js'
import { sectionIndexAt } from '../../utils/sections.js'

const { snapshot, loading, error, trackPath, refresh } = useTimeline()

const trackOptions = computed(() => {
  const s = snapshot.value
  const tracks = [...(s?.tracks ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const guiTrack = tracks.find((t) => t.path === s?.guiTrackPath)
  const options = [
    { value: '', label: guiTrack ? `Timeline track: ${guiTrack.name}` : 'Timeline track', separatorAfter: true },
    ...tracks.map((t) => ({ value: t.path, label: t.name, meta: t.path === s?.guiTrackPath ? 'in timeline' : '' })),
  ]
  // Keep a remembered track that is gone visible, so the picker never looks empty.
  if (trackPath.value && !tracks.some((t) => t.path === trackPath.value)) {
    options.push({ value: trackPath.value, label: `${trackPath.value} (not found)` })
  }
  return options
})

const info = computed(() => {
  const s = snapshot.value
  if (!s?.track) return null
  const t = s.track
  return {
    sections: s.sections.length,
    cues: s.cues.length,
    playhead: t.isGui
      ? `${formatTimecode(s.playheadSeconds, s.fps)}, section ${s.sections.length ? sectionIndexAt(s.sections, s.playheadBeat) + 1 : 0}`
      : 'not in timeline',
    selection: !t.isGui ? '-' : s.selection ? `${s.selection.count} layers` : 'none',
  }
})

function onRefresh() {
  refresh().catch(() => {})
}
</script>

<template>
  <header class="track-bar">
    <div class="track-picker">
      <MenuSelect v-model="trackPath" :options="trackOptions" aria-label="Track" />
    </div>

    <div v-if="error && !snapshot" class="track-error" role="alert">{{ error }}</div>
    <template v-else-if="info">
      <dl class="track-stats">
        <div><dt>Sections</dt><dd>{{ info.sections }}</dd></div>
        <div><dt>Cues</dt><dd>{{ info.cues }}</dd></div>
        <div><dt>Playhead</dt><dd>{{ info.playhead }}</dd></div>
        <div class="optional"><dt>Selected</dt><dd>{{ info.selection }}</dd></div>
      </dl>
      <span v-if="error" class="stale" :title="error">not updated</span>
    </template>
    <div v-else-if="snapshot" class="track-error">Track not found in Designer</div>
    <div v-else class="track-empty">Loading track data...</div>

    <button
      type="button"
      class="ghost refresh"
      :disabled="loading"
      aria-label="Refresh track data"
      title="Read the track from Designer again"
      @click="onRefresh"
    >
      <svg viewBox="0 0 24 24" :class="{ spinning: loading }" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66 M20 4v5h-5" />
      </svg>
      <span class="refresh-label">Refresh</span>
    </button>
  </header>
</template>

<style scoped>
.track-bar {
  container-type: inline-size;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 44px;
  padding: 0 12px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  white-space: nowrap;
}
.track-picker {
  flex: none;
  display: flex;
  width: 240px;
}
.track-picker > :deep(.dropdown-trigger) {
  flex: 1;
}
.track-stats {
  display: flex;
  gap: 16px;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 11px;
}
.track-stats div {
  display: flex;
  gap: 5px;
}
.track-stats dt {
  color: #888888;
}
.track-stats dd {
  margin: 0;
  color: #d4d4d4;
  font-variant-numeric: tabular-nums;
}
.track-error {
  color: #ef4444;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-empty {
  color: #888888;
  font-size: 12px;
}
.stale {
  color: #ffd60a;
  font-size: 11px;
}
.ghost {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  background: transparent;
  border: 1px solid #333333;
  color: #aeaeae;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ghost:hover:not(:disabled) {
  border-color: #555555;
  color: #ffffff;
  background: #1f1f1f;
}
.ghost:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.ghost:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ghost svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.spinning {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

@container (max-width: 700px) {
  .track-picker {
    width: 180px;
  }
  .optional,
  .refresh-label {
    display: none;
  }
}
</style>
