<script setup>
import { computed, ref } from 'vue'
import SettingsGroup from '../../components/ui/SettingsGroup.vue'
import SegmentedControl from '../../components/ui/SegmentedControl.vue'
import FormRow from '../../components/ui/FormRow.vue'
import TextField from '../../components/ui/TextField.vue'
import NumberStepper from '../../components/ui/NumberStepper.vue'
import { useTimeline } from '../../composables/useTimeline.js'
import { useToolSettings } from '../../composables/useToolSettings.js'
import { useToast } from '../../composables/useToast.js'
import { formatTimecode } from '../../utils/timecode.js'
import { sectionIndexAt } from '../../utils/sections.js'
import { buildPlan, summarize, DEFAULT_SETTINGS } from './cuePlan.js'
import { parseCue, CUE_MAX_LENGTH } from './cueNumbers.js'
import { writeCueTags } from './cueTaggerService.js'

const { snapshot, loading, refresh } = useTimeline()
const { show: showToast } = useToast()
const settings = useToolSettings('cue-tagger', DEFAULT_SETTINGS)
const applying = ref(false)

// Playhead and layer selection exist only for the track open in the Designer timeline.
const isGuiTrack = computed(() => !!snapshot.value?.track?.isGui)
const GUI_ONLY = 'Only for the track open in the timeline'

const rangeOptions = computed(() => [
  { value: 'selection', label: 'Selection', title: isGuiTrack.value ? 'From the start to the end of the selected layers' : GUI_ONLY, disabled: !isGuiTrack.value },
  { value: 'sections', label: 'Sections', title: 'A range of sections by number' },
  { value: 'playhead', label: 'From playhead', title: isGuiTrack.value ? 'From the section under the playhead to the end of the track' : GUI_ONLY, disabled: !isGuiTrack.value },
  { value: 'track', label: 'Whole track', title: 'All sections of the track' },
])
const NUMBER_OPTIONS = [
  { value: 'continue', label: 'Continue', title: 'Next number after the closest cue tag before the range' },
  { value: 'manual', label: 'Manual', title: 'Start from the given number' },
]
const LEVEL_OPTIONS = [
  { value: 1, label: 'X', title: '1, 2, 3' },
  { value: 2, label: 'X.Y', title: '1.1, 1.2, 1.3' },
  { value: 3, label: 'X.Y.Z', title: '1.1.1, 1.1.2, 1.1.3' },
]
const CONFLICT_OPTIONS = [
  { value: 'skip', label: 'Skip', title: 'Keep the existing tag and continue numbering from it' },
  { value: 'overwrite', label: 'Overwrite', title: 'Replace the existing tag with the new number' },
]

const plan = computed(() => buildPlan(snapshot.value, settings))
const counts = computed(() => summarize(plan.value))
const toWrite = computed(() => counts.value.create + counts.value.overwrite)
const fps = computed(() => snapshot.value?.fps ?? 30)
const tc = (seconds) => formatTimecode(seconds, fps.value)

const canApply = computed(() =>
  !!snapshot.value && !plan.value.errors.length && toWrite.value > 0 && !applying.value && !loading.value,
)

// --- Hints under the controls ---

const rangeHint = computed(() => {
  const s = snapshot.value
  if (!s?.track) return ''
  if ((settings.rangeMode === 'selection' || settings.rangeMode === 'playhead') && !s.track.isGui) {
    return `${GUI_ONLY}. Choose Sections or Whole track`
  }
  switch (settings.rangeMode) {
    case 'selection':
      return s.selection
        ? `${s.selection.count} layers: ${beatToTc(s.selection.startBeat)} - ${beatToTc(s.selection.endBeat)}`
        : 'Select layers on the timeline and press Refresh'
    case 'playhead': {
      if (!s.sections.length) return ''
      const i = sectionIndexAt(s.sections, s.playheadBeat)
      return `From section ${i + 1} (${tc(s.sections[i].seconds)}) to the end of the track`
    }
    case 'track':
      return `Sections 1 to ${s.sections.length}`
    default:
      return `Sections on track: ${s.sections.length}`
  }
})

// Section times are known exactly; other beats are mapped through the nearest section start.
function beatToTc(beat) {
  const s = snapshot.value
  const sections = s.sections
  if (!sections.length) return '-'
  const i = sectionIndexAt(sections, beat)
  const next = sections[i + 1] ?? { beat: s.track.lengthBeats, seconds: s.track.lengthSeconds }
  const span = next.beat - sections[i].beat
  const ratio = span > 0 ? (beat - sections[i].beat) / span : 0
  return tc(sections[i].seconds + ratio * (next.seconds - sections[i].seconds))
}

const previousHint = computed(() => {
  if (!snapshot.value || !plan.value.range) return ''
  const prev = plan.value.previousCue
  return prev ? `Previous tag: ${prev.text} (${beatToTc(prev.beat)})` : 'No cue tags before the range'
})

const startDisabled = computed(() => settings.numberMode === 'continue' && !!plan.value.previousCue)
const startInvalid = computed(() => !startDisabled.value && !parseCue(settings.startNumber))
const sequenceHint = computed(() => {
  const rows = plan.value.rows.filter((r) => r.action !== 'skip')
  if (!rows.length) return ''
  return 'Next: ' + rows.slice(0, 3).map((r) => r.text).join(', ') + (rows.length > 3 ? ', ...' : '')
})

const sectionCount = computed(() => snapshot.value?.sections?.length ?? 0)
const sectionsInvalid = computed(() => {
  const n = sectionCount.value
  const { fromSection: from, toSection: to } = settings
  return { from: !(from >= 1 && from <= n), to: !(to >= 1 && to <= n && to >= from) }
})

function takePlayheadSection(field) {
  const s = snapshot.value
  if (!s?.track?.isGui || !s.sections.length) return
  settings[field] = sectionIndexAt(s.sections, s.playheadBeat) + 1
}

// --- Apply ---

const ACTION_LABELS = { new: 'New', overwrite: 'Replace', skip: 'Skip' }

function writableRows(p) {
  return p.rows.filter((r) => r.action !== 'skip').map((r) => ({ beat: r.beat, text: r.text, overwrite: r.action === 'overwrite' }))
}

async function apply() {
  applying.value = true
  const shown = JSON.stringify(writableRows(plan.value))
  try {
    // Re-read the track right before writing: the timeline may have changed since the preview.
    const fresh = await refresh()
    const freshPlan = buildPlan(fresh, settings)
    const rows = writableRows(freshPlan)
    if (freshPlan.errors.length || JSON.stringify(rows) !== shown) {
      showToast('The track changed in Designer. Check the preview and press again', 'error')
      return
    }
    const result = await writeCueTags(fresh.track.path, rows)
    await refresh().catch(() => {})
    const skipped = counts.value.skip + result.skipped
    showToast(
      `Tags written: ${result.written}${skipped ? `, skipped: ${skipped}` : ''}. Undo with Ctrl+Z in Designer`,
    )
  } catch (e) {
    showToast(e.message, 'error', 6000)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="cue-tagger">
    <aside class="settings scrollable">
      <SettingsGroup title="Range">
        <SegmentedControl v-model="settings.rangeMode" :options="rangeOptions" :columns="2" />

        <div v-if="settings.rangeMode === 'sections'" class="pair">
          <FormRow v-for="field in ['fromSection', 'toSection']" :key="field" :label="field === 'fromSection' ? 'From section' : 'To section'">
            <template v-if="isGuiTrack" #action>
              <button type="button" class="icon-btn" title="Use the section under the playhead" aria-label="Use the section under the playhead" @click="takePlayheadSection(field)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18 M7 3h10l-5 5z" /></svg>
              </button>
            </template>
            <NumberStepper
              v-model="settings[field]"
              :min="1"
              :max="sectionCount || 1"
              :invalid="field === 'fromSection' ? sectionsInvalid.from : sectionsInvalid.to"
              :aria-label="field === 'fromSection' ? 'From section' : 'To section'"
            />
          </FormRow>
        </div>
        <p class="hint">{{ rangeHint }}</p>

        <FormRow label="Every Nth section" hint="1 tags every section, 2 every other one">
          <NumberStepper v-model="settings.every" :min="1" :invalid="!(settings.every >= 1)" aria-label="Every Nth section" />
        </FormRow>
      </SettingsGroup>

      <SettingsGroup title="Numbering">
        <SegmentedControl v-model="settings.numberMode" :options="NUMBER_OPTIONS" />
        <p v-if="settings.numberMode === 'continue'" class="hint">{{ previousHint }}</p>

        <FormRow
          label="Start number"
          :hint="startDisabled ? 'Not used: numbering continues from the previous tag' : `X, X.Y or X.Y.Z, up to ${CUE_MAX_LENGTH} characters`"
        >
          <TextField
            v-model="settings.startNumber"
            placeholder="1"
            :maxlength="CUE_MAX_LENGTH"
            :invalid="startInvalid"
            :disabled="startDisabled"
            aria-label="Start number"
          />
        </FormRow>

        <FormRow label="Increment level">
          <SegmentedControl v-model="settings.level" :options="LEVEL_OPTIONS" />
        </FormRow>
        <FormRow label="Number step" :hint="sequenceHint">
          <NumberStepper v-model="settings.step" :min="1" :invalid="!(settings.step >= 1)" aria-label="Number step" />
        </FormRow>
      </SettingsGroup>

      <SettingsGroup title="Section already has a cue">
        <SegmentedControl v-model="settings.conflict" :options="CONFLICT_OPTIONS" />
      </SettingsGroup>
    </aside>

    <section class="preview">
      <div class="preview-head">
        <span class="preview-title">Preview</span>
        <span v-if="plan.rows.length" class="preview-count">{{ plan.rows.length }} sections</span>
      </div>

      <div class="table-wrap scrollable">
        <table v-if="plan.rows.length" class="plan-table">
          <thead>
            <tr>
              <th class="num">Section</th>
              <th class="col-time">Time</th>
              <th class="col-time">Current</th>
              <th>New cue</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in plan.rows" :key="row.beat" :class="row.action">
              <td class="num">{{ row.section }}</td>
              <td class="meta">{{ tc(row.seconds) }}</td>
              <td class="meta">{{ row.existing ?? '-' }}</td>
              <td class="cue">
                <span v-if="row.action === 'skip'" class="meta">-</span>
                <span v-else :class="{ error: row.tooLong }">{{ row.text }}</span>
                <span v-if="row.duplicate" class="flag warn" title="This number already exists on the track">duplicate</span>
                <span v-if="row.tooLong && row.action !== 'skip'" class="flag err">over {{ CUE_MAX_LENGTH }} chars</span>
              </td>
              <td><span class="badge" :class="row.action">{{ ACTION_LABELS[row.action] }}</span></td>
            </tr>
          </tbody>
        </table>

        <div v-else class="empty">
          <template v-if="!snapshot">No track data</template>
          <template v-else-if="plan.errors.length">{{ plan.errors[0] }}</template>
          <template v-else>Nothing to create</template>
        </div>
      </div>

      <footer class="action-bar">
        <div class="status">
          <span v-if="plan.errors.length && plan.rows.length" class="status-error">{{ plan.errors[0] }}</span>
          <template v-else-if="plan.rows.length">
            <span>New: <b>{{ counts.create }}</b></span>
            <span v-if="counts.overwrite">Replace: <b>{{ counts.overwrite }}</b></span>
            <span v-if="counts.skip">Skip: <b>{{ counts.skip }}</b></span>
            <span v-if="counts.duplicates" class="status-warn">Duplicates: {{ counts.duplicates }}</span>
          </template>
          <span v-for="note in plan.notes" :key="note" class="status-note">{{ note }}</span>
        </div>
        <button type="button" class="btn-primary" :disabled="!canApply" @click="apply">
          {{ applying ? 'Writing...' : toWrite ? `Create tags (${toWrite})` : 'Create tags' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* The container is the tool host in App.vue. */
.cue-tagger {
  display: grid;
  grid-template-columns: minmax(280px, 320px) 1fr;
  height: 100%;
  min-height: 0;
}

/* --- Settings column --- */
.settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: #1e1e1e;
  border-right: 1px solid #2a2a2a;
  overflow-y: auto;
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.hint {
  margin: -4px 0 0;
  color: #9c9c9c;
  font-size: 11px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.hint:empty {
  display: none;
}
.icon-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: -2px 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9c9c9c;
  cursor: pointer;
  transition: all 0.2s ease;
}
.icon-btn:hover {
  background: #333333;
  color: #ffffff;
}
.icon-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.icon-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}

/* --- Preview column --- */
.preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.preview-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px 16px 8px;
}
.preview-title {
  color: #0a84ff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.preview-count {
  color: #9c9c9c;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 12px;
}
.plan-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.plan-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #1a1a1a;
  color: #888888;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid #2e2e2e;
}
.plan-table td {
  height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid #222222;
  white-space: nowrap;
}
.plan-table tbody tr {
  transition: background 0.15s ease;
}
.plan-table tbody tr:hover {
  background: #242424;
}
.plan-table tr.skip td {
  opacity: 0.55;
}
.num {
  width: 64px;
  color: #9c9c9c;
}
.col-time {
  width: 120px;
}
.meta {
  color: #9c9c9c;
}
.cue {
  color: #f2f2f2;
  font-weight: 600;
}
.cue .error {
  color: #ef4444;
}
.flag {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.flag.warn {
  color: #ffd60a;
}
.flag.err {
  color: #ef4444;
}
.badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.badge.new {
  background: rgba(10, 132, 255, 0.15);
  color: #0a84ff;
}
.badge.overwrite {
  border: 1px solid rgba(255, 214, 10, 0.55);
  color: #ffd60a;
}
.badge.skip {
  background: #2a2a2a;
  color: #888888;
}
.empty {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 120px;
  color: #888888;
  font-size: 12px;
  text-align: center;
}

/* --- Action bar --- */
.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 16px;
  background: #1a1a1a;
  border-top: 1px solid #2a2a2a;
}
.status {
  display: flex;
  gap: 14px;
  min-width: 0;
  overflow: hidden;
  color: #9c9c9c;
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.status b {
  color: #ffffff;
}
.status-error {
  color: #ef4444;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-warn {
  color: #ffd60a;
}
.status-note {
  color: #888888;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-primary {
  flex: none;
  margin-left: auto;
  background: #0a84ff;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.btn-primary:hover:not(:disabled) {
  background: #0060d1;
}
.btn-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #0a84ff;
}
.btn-primary:disabled {
  background: #3a3a3a;
  color: #777777;
  cursor: not-allowed;
}

.scrollable::-webkit-scrollbar {
  width: 6px;
}
.scrollable::-webkit-scrollbar-track {
  background: transparent;
}
.scrollable::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}
.scrollable::-webkit-scrollbar-thumb:hover {
  background: #555555;
}

@container (max-width: 620px) {
  .cue-tagger {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow-y: auto;
  }
  .settings {
    border-right: none;
    border-bottom: 1px solid #2a2a2a;
    overflow: visible;
  }
}
</style>
