<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import TextField from '../../components/ui/TextField.vue'
import CheckBox from '../../components/ui/CheckBox.vue'
import NumberStepper from '../../components/ui/NumberStepper.vue'
import SegmentedControl from '../../components/ui/SegmentedControl.vue'
import { useTimeline } from '../../composables/useTimeline.js'
import { useToast } from '../../composables/useToast.js'
import { useToolSettings } from '../../composables/useToolSettings.js'
import { formatTimecode } from '../../utils/timecode.js'
import { BEAT_EPS } from '../../utils/sections.js'
import {
  buildNoteList, buildOps, summarize, settledKeys, normalizeNote, NO_DRAFT,
  buildFill, fillErrors, buildReplace, DEFAULT_FILL, FILL_TOKENS,
} from './notePlan.js'
import { writeNotes, jumpToBeat } from './noteEditorService.js'

const { snapshot, loading, refresh } = useTimeline()
const { show: showToast } = useToast()
const applying = ref(false)
const filter = ref('')

const isGuiTrack = computed(() => !!snapshot.value?.track?.isGui)
const GUI_ONLY = 'Only for the track open in the timeline'

// --- Draft: per track, for this session only ---

const draftsByTrack = reactive({})
const trackKey = computed(() => snapshot.value?.track?.path ?? '')
const draft = computed(() => draftsByTrack[trackKey.value] ?? NO_DRAFT)

function editableDraft() {
  return (draftsByTrack[trackKey.value] ??= {})
}

const list = computed(() => buildNoteList(snapshot.value, draft.value))
const counts = computed(() => summarize(list.value))
const toWrite = computed(() => counts.value.create + counts.value.change + counts.value.remove)
const hasDraft = computed(() => Object.keys(draft.value).length > 0)

// Every refresh drops edits that Designer already matches (after Apply, or the same text typed there).
watch(snapshot, (s) => {
  const d = s?.track && draftsByTrack[s.track.path]
  if (d) for (const key of settledKeys(s, d)) delete d[key]
})

// Filtering hides the empty section slots: only notes can match.
const visibleRows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return list.value.rows
  return list.value.rows.filter((r) => r.action !== 'empty' && `${r.text}\n${r.current ?? ''}`.toLowerCase().includes(q))
})

// The original text is kept from the first edit: it is what Designer had when editing started.
function setDraft(row, text) {
  const d = editableDraft()
  const value = normalizeNote(text)
  if (value === (row.current ?? '')) {
    delete d[row.key]
    return
  }
  d[row.key] = { beat: row.beat, seconds: row.seconds, text: value, original: d[row.key]?.original ?? row.current ?? '' }
}

function revert(row) {
  delete editableDraft()[row.key]
}

function removeNote(row) {
  setDraft(row, '')
}

// Conflict: the note changed in Designer meanwhile. Keep mine writes over the new Designer text.
function keepMine(row) {
  editableDraft()[row.key].original = row.current ?? ''
}

function discard() {
  delete draftsByTrack[trackKey.value]
  editingKey.value = null
}

// --- Selection: per track, keyed like the draft. Actions use the selected rows the filter shows ---

const selectedByTrack = reactive({})
const selected = computed(() => selectedByTrack[trackKey.value] ?? {})
const selectedRows = computed(() => visibleRows.value.filter((r) => selected.value[r.key]))

function editableSelection() {
  return (selectedByTrack[trackKey.value] ??= {})
}

// Shift+click selects every row between the last clicked one and this one.
let lastToggled = null
function toggleRow(row, value, event) {
  const rows = visibleRows.value
  const index = rows.indexOf(row)
  const anchor = event?.shiftKey && lastToggled !== null ? rows.findIndex((r) => r.key === lastToggled) : -1
  const [from, to] = anchor >= 0 ? [Math.min(anchor, index), Math.max(anchor, index)] : [index, index]
  const s = editableSelection()
  for (let i = from; i <= to; i++) {
    if (value) s[rows[i].key] = true
    else delete s[rows[i].key]
  }
  lastToggled = row.key
}

const allSelected = computed(() => visibleRows.value.length > 0 && selectedRows.value.length === visibleRows.value.length)
// With any row selected, the first click clears the selection; with none it selects all shown rows.
function toggleAll() {
  const s = editableSelection()
  const select = selectedRows.value.length === 0
  for (const row of visibleRows.value) {
    if (select) s[row.key] = true
    else delete s[row.key]
  }
}

function clearSelection() {
  delete selectedByTrack[trackKey.value]
  lastToggled = null
}

// Re-reads the track first: the operator has just selected on the Designer timeline.
async function selectFromTimeline() {
  let fresh
  try {
    fresh = await refresh()
  } catch (e) {
    showToast(e.message, 'error')
    return
  }
  const range = fresh?.selection
  if (!range) {
    showToast('Select a range or layers on the timeline first', 'error')
    return
  }
  const rows = visibleRows.value.filter((r) => r.beat >= range.startBeat - BEAT_EPS && r.beat < range.endBeat - BEAT_EPS)
  if (!rows.length) {
    showToast('No notes or section starts inside the timeline selection', 'error')
    return
  }
  clearSelection()
  const s = editableSelection()
  for (const row of rows) s[row.key] = true
}

function removeSelected() {
  for (const row of selectedRows.value) {
    if (row.current !== null) setDraft(row, '')
    else revert(row)
  }
}

// --- Fill the selected rows from a template ---

const fill = useToolSettings('note-editor', DEFAULT_FILL)
const fillOpen = ref(false)
const fillErrorList = computed(() => fillErrors(fill))
const fillPlan = computed(() => buildFill(selectedRows.value, fill, snapshot.value?.cues))
const fillPreview = computed(() => {
  const texts = fillPlan.value.map((f) => f.text)
  return texts.length > 4 ? `${texts.slice(0, 3).join(', ')}, ... ${texts.at(-1)}` : texts.join(', ')
})
const fillEmptyReason = computed(() =>
  fill.existing === 'skip' && selectedRows.value.every((r) => r.text && r.action !== 'remove')
    ? 'Nothing to fill: every selected row has a note and Skip is on'
    : 'Nothing to fill: {cue} or {text} is empty in the selected rows',
)
const EXISTING_OPTIONS = [
  { value: 'overwrite', label: 'Overwrite', title: 'Replace notes that already have text' },
  { value: 'skip', label: 'Skip', title: 'Keep notes that already have text; they do not take a number' },
]

watch(() => selectedRows.value.length, (n) => {
  if (!n) fillOpen.value = false
})

function openFill() {
  fillOpen.value = true
  nextTick(() => document.querySelector('.fill-template input')?.focus())
}

function insertToken(token) {
  fill.template += token
  nextTick(() => document.querySelector('.fill-template input')?.focus())
}

function applyFill() {
  if (fillErrorList.value.length || !fillPlan.value.length) return
  for (const { row, text } of fillPlan.value) setDraft(row, text)
  fillOpen.value = false
}

// --- Find (the filter text) and replace, in the selected rows or else in all filtered rows ---

const replaceOpen = ref(false)
const replacement = ref('')
const replaceScope = computed(() => (selectedRows.value.length ? selectedRows.value : visibleRows.value))
const replacePlan = computed(() => buildReplace(replaceScope.value, filter.value, replacement.value))

function applyReplace() {
  for (const { row, text } of replacePlan.value) setDraft(row, text)
}

// --- Inline editing: Enter or leaving the cell saves, Tab / Shift+Tab move to the next / previous
// row, Esc cancels, an empty text removes the note ---

const editingKey = ref(null)
const editText = ref('')

function startEdit(row) {
  editingKey.value = row.key
  editText.value = row.text
  nextTick(() => {
    const input = document.querySelector('.note-input')
    input?.focus()
    input?.select()
  })
}

function commitEdit(row) {
  if (editingKey.value !== row.key) return
  setDraft(row, editText.value)
  editingKey.value = null
}

function cancelEdit() {
  editingKey.value = null
}

function editNext(row, step) {
  commitEdit(row)
  const rows = visibleRows.value
  const next = rows[rows.findIndex((r) => r.key === row.key) + step]
  if (next) startEdit(next)
}

// --- Go to a note: moves the Designer playhead, so only on an explicit action ---

async function goTo(row) {
  if (!isGuiTrack.value) return
  try {
    await jumpToBeat(snapshot.value.track.path, row.beat)
  } catch (e) {
    showToast(e.message, 'error')
  }
}

const fps = computed(() => snapshot.value?.fps ?? 30)
const tc = (seconds) => formatTimecode(seconds, fps.value)

// --- Apply ---

const ACTION_LABELS = { new: 'New', change: 'Change', remove: 'Remove', conflict: 'Conflict' }

const canApply = computed(() => !!snapshot.value?.track && toWrite.value > 0 && !applying.value && !loading.value)

async function apply() {
  applying.value = true
  const shown = JSON.stringify(buildOps(list.value))
  try {
    // Re-read the track right before writing: notes may have changed in Designer since.
    const fresh = await refresh()
    const ops = buildOps(buildNoteList(fresh, draft.value))
    if (JSON.stringify(ops) !== shown) {
      showToast('Notes changed in Designer. Check the list and press again', 'error')
      return
    }
    const result = await writeNotes(fresh.track.path, ops)
    await refresh().catch(() => {})
    const parts = [result.set && `written: ${result.set}`, result.removed && `removed: ${result.removed}`].filter(Boolean)
    showToast(`Notes ${parts.join(', ')}. Undo with Ctrl+Z in Designer`)
  } catch (e) {
    showToast(e.message, 'error', 6000)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="note-editor">
    <div class="toolbar">
      <div class="filter">
        <TextField v-model="filter" :placeholder="replaceOpen ? 'Find' : 'Filter notes'" :aria-label="replaceOpen ? 'Find' : 'Filter notes'" />
      </div>
      <button
        type="button"
        class="ghost icon-text"
        :class="{ active: replaceOpen }"
        title="Find and replace in the notes"
        aria-label="Find and replace"
        @click="replaceOpen = !replaceOpen"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11l-3-3 M20 17H9l3 3" /></svg>
        <span class="btn-label">Replace</span>
      </button>
      <template v-if="replaceOpen">
        <div class="filter">
          <TextField v-model="replacement" placeholder="Replace with" aria-label="Replace with" />
        </div>
        <button
          type="button"
          class="ghost"
          :disabled="!replacePlan.length"
          :title="filter.trim() ? `Replace in ${selectedRows.length ? 'the selected' : 'the filtered'} notes; check and press Apply` : 'Type the text to find first'"
          @click="applyReplace"
        >
          Replace all ({{ replacePlan.length }})
        </button>
      </template>
      <button
        type="button"
        class="ghost icon-text"
        :disabled="!isGuiTrack"
        :title="isGuiTrack ? 'Select the rows inside the range or layers selected on the timeline' : GUI_ONLY"
        aria-label="Select from timeline"
        @click="selectFromTimeline"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18 M7 7v10 M17 7v10" /></svg>
        <span class="btn-label">From timeline</span>
      </button>
      <span v-if="snapshot?.track" class="count">{{ counts.notes }} notes</span>
    </div>

    <div class="table-wrap scrollable" :class="{ 'has-bar': selectedRows.length }">
      <table v-if="visibleRows.length" class="note-table">
        <thead>
          <tr>
            <th class="check">
              <CheckBox
                :model-value="allSelected"
                :partial="selectedRows.length > 0"
                aria-label="Select all shown rows"
                title="Select all shown rows, or clear the selection"
                @toggle="toggleAll"
              />
            </th>
            <th class="num"><span class="label-long">Section</span><span class="label-short" title="Section">#</span></th>
            <th class="col-time">Time</th>
            <th>Note</th>
            <th class="col-action">Action</th>
            <th class="col-tools"><span class="sr-only">Row actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.key" :class="[row.action, { selected: selected[row.key] }]">
            <td class="check">
              <CheckBox
                :model-value="!!selected[row.key]"
                :aria-label="`Select the row at ${tc(row.seconds)}`"
                title="Select. Shift+click for a range"
                @toggle="(value, event) => toggleRow(row, value, event)"
              />
            </td>
            <td class="num">{{ row.atSectionStart ? row.section : '' }}</td>
            <td class="meta time" :title="isGuiTrack ? 'Double-click to move the playhead here' : ''" @dblclick="goTo(row)">
              {{ tc(row.seconds) }}
            </td>
            <td class="note">
              <input
                v-if="editingKey === row.key"
                v-model="editText"
                class="note-input"
                aria-label="Note"
                spellcheck="false"
                autocomplete="off"
                @keydown.enter.prevent="commitEdit(row)"
                @keydown.esc.prevent="cancelEdit"
                @keydown.tab.exact.prevent="editNext(row, 1)"
                @keydown.shift.tab.prevent="editNext(row, -1)"
                @blur="commitEdit(row)"
              />
              <button
                v-else
                type="button"
                class="note-value"
                :class="{ edited: row.edited, placeholder: !row.text }"
                :title="row.text || 'Click to add a note'"
                @click="startEdit(row)"
              >
                <template v-if="row.action === 'remove'">{{ row.current }}</template>
                <template v-else>{{ row.text || '+ add note' }}</template>
              </button>
            </td>
            <td>
              <span
                v-if="ACTION_LABELS[row.action]"
                class="badge"
                :class="row.action"
                :title="row.action === 'conflict' ? `Changed in Designer to: ${row.current ?? '(no note)'}` : ''"
              >
                {{ ACTION_LABELS[row.action] }}
              </span>
            </td>
            <td class="tools">
              <button
                v-if="row.action === 'conflict'"
                type="button"
                class="icon-btn"
                title="Keep my text and write it over the Designer one"
                aria-label="Keep my text"
                @click="keepMine(row)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
              </button>
              <button
                v-if="row.edited"
                type="button"
                class="icon-btn"
                :title="row.action === 'conflict' ? 'Take the Designer text' : 'Revert to the Designer text'"
                aria-label="Revert"
                @click="revert(row)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.34-5.66 M4 4v5h5" /></svg>
              </button>
              <button
                v-else-if="row.current !== null"
                type="button"
                class="icon-btn danger hover-only"
                title="Remove the note"
                aria-label="Remove the note"
                @click="removeNote(row)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12 M18 6L6 18" /></svg>
              </button>
              <button
                type="button"
                class="icon-btn hover-only"
                :disabled="!isGuiTrack"
                :title="isGuiTrack ? 'Move the playhead here' : GUI_ONLY"
                aria-label="Move the playhead here"
                @click="goTo(row)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18 M7 3h10l-5 5z" /></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <template v-if="!snapshot">No track data</template>
        <template v-else-if="list.errors.length">{{ list.errors[0] }}</template>
        <template v-else-if="filter.trim()">No notes match the filter</template>
        <template v-else>No notes or sections on this track</template>
      </div>
    </div>

    <!-- Floats over the list, so nothing moves when it appears. -->
    <div v-if="selectedRows.length" class="sel-bar">
      <span class="sel-count">{{ selectedRows.length }}</span>
      <span class="sel-label">selected</span>
      <span class="bar-sep" />
      <button type="button" class="bar-btn" :class="{ active: fillOpen }" title="Fill the selected rows from a template" @click="fillOpen ? (fillOpen = false) : openFill()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13 7l4 4" /></svg>
        <span class="btn-label">Fill</span>
      </button>
      <button type="button" class="bar-btn danger" title="Remove the notes of the selected rows" @click="removeSelected">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12 M18 6L6 18" /></svg>
        <span class="btn-label">Remove</span>
      </button>
      <span class="bar-sep" />
      <button type="button" class="link-btn" @click="clearSelection">Clear</button>
    </div>

    <div v-if="fillOpen" class="fill-pop" role="dialog" aria-label="Fill from a template" @keydown.esc.stop="fillOpen = false">
      <div class="pop-head">
        <span class="pop-title">Fill</span>
        <span class="pop-tag">{{ selectedRows.length }} {{ selectedRows.length === 1 ? 'row' : 'rows' }}</span>
        <button type="button" class="icon-btn pop-close" aria-label="Close" title="Close (Esc)" @click="fillOpen = false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12 M18 6L6 18" /></svg>
        </button>
      </div>
      <div class="pop-body">
        <label class="pop-label">Template</label>
        <div class="fill-template" @keydown.enter.prevent="applyFill">
          <TextField v-model="fill.template" placeholder="Panel {n}" :invalid="!normalizeNote(fill.template)" aria-label="Template" />
        </div>
        <div class="tokens">
          <button v-for="t in FILL_TOKENS" :key="t.token" type="button" class="token" :title="t.title" @click="insertToken(t.token)">
            {{ t.token }}
          </button>
        </div>
        <div class="pop-grid">
          <div>
            <label class="pop-label">Start</label>
            <NumberStepper v-model="fill.start" :invalid="!Number.isInteger(fill.start)" aria-label="Start" />
          </div>
          <div>
            <label class="pop-label">Step</label>
            <NumberStepper v-model="fill.step" :invalid="!Number.isInteger(fill.step)" aria-label="Step" />
          </div>
          <div>
            <label class="pop-label">Digits</label>
            <NumberStepper v-model="fill.digits" :min="1" :max="6" :invalid="!(fill.digits >= 1 && fill.digits <= 6)" aria-label="Digits" />
          </div>
        </div>
        <label class="pop-label">Rows with a note</label>
        <SegmentedControl v-model="fill.existing" :options="EXISTING_OPTIONS" />
        <p v-if="fillErrorList.length" class="pop-error">{{ fillErrorList[0] }}</p>
        <p v-else class="pop-preview" :title="fillPreview">{{ fillPlan.length ? fillPreview : fillEmptyReason }}</p>
      </div>
      <div class="pop-foot">
        <span class="pop-hint">Goes to the draft, then Apply</span>
        <button type="button" class="btn-secondary" @click="fillOpen = false">Cancel</button>
        <button type="button" class="btn-primary" :disabled="!!fillErrorList.length || !fillPlan.length" @click="applyFill">
          Fill ({{ fillPlan.length }})
        </button>
      </div>
    </div>

    <footer class="action-bar">
      <div class="status">
        <span v-if="list.errors.length" class="status-error" :title="list.errors[0]">{{ list.errors[0] }}</span>
        <template v-else-if="hasDraft">
          <span>New: <b>{{ counts.create }}</b></span>
          <span>Change: <b>{{ counts.change }}</b></span>
          <span>Remove: <b>{{ counts.remove }}</b></span>
          <span v-if="counts.conflict" class="status-error" title="Changed in Designer while edited: not written">Conflicts: {{ counts.conflict }}</span>
        </template>
        <span v-else class="status-note">Click a note to edit it, Tab moves to the next one</span>
        <button v-if="hasDraft" type="button" class="link-btn" title="Drop all unsaved edits" @click="discard">Discard</button>
      </div>
      <button type="button" class="btn-primary" :disabled="!canApply" @click="apply">
        {{ applying ? 'Writing...' : toWrite ? `Apply (${toWrite})` : 'Apply' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.note-editor {
  container: notes / inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 8px;
}
.filter {
  flex: 0 1 280px;
  min-width: 0;
}
.count {
  margin-left: auto;
  color: #9c9c9c;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ghost {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid #333333;
  border-radius: 6px;
  color: #aeaeae;
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ghost:hover:not(:disabled) {
  border-color: #555555;
  background: #1f1f1f;
  color: #ffffff;
}
.ghost.active {
  border-color: #0a84ff;
  background: rgba(10, 132, 255, 0.15);
  color: #ffffff;
}
.ghost:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.ghost:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ghost svg,
.bar-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 12px;
}
/* Room for the selection bar, so it never covers the last rows. */
.table-wrap.has-bar {
  padding-bottom: 64px;
}
/* Fixed layout: widths come from the header, so editing a cell never moves the columns. */
.note-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.note-table th {
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
.note-table td {
  height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid #222222;
  white-space: nowrap;
}
.note-table tbody tr {
  transition: background 0.15s ease;
}
.note-table tbody tr:hover {
  background: #242424;
}
.note-table tbody tr.selected {
  background: rgba(10, 132, 255, 0.1);
}
.note-table .check {
  width: 36px;
  padding: 0 4px 0 10px;
}
.check > * {
  vertical-align: middle;
}
.num {
  width: 64px;
  color: #9c9c9c;
}
.col-time {
  width: 110px;
}
.col-action {
  width: 92px;
}
.col-tools {
  width: 76px;
}
.meta {
  color: #9c9c9c;
}
.time {
  cursor: default;
  user-select: none;
}
.note-table .note {
  overflow: hidden;
}
.note-value {
  display: block;
  width: calc(100% + 7px);
  height: 24px;
  margin-left: -7px;
  padding: 0 6px;
  overflow: hidden;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #f2f2f2;
  font: inherit;
  font-weight: 500;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
  transition: all 0.2s ease;
}
.note-value:hover {
  border-color: #3a3a3a;
  background: #181818;
}
.note-value:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.note-value.placeholder {
  color: #888888;
  font-weight: 400;
}
.note-value.edited {
  color: #ffd60a;
}
tr.remove .note-value {
  color: #888888;
  text-decoration: line-through;
}
.note-input {
  width: calc(100% + 7px);
  height: 24px;
  margin-left: -7px;
  padding: 0 6px;
  background: #181818;
  border: 1px solid #0a84ff;
  border-radius: 4px;
  color: #ffffff;
  font: inherit;
  font-weight: 500;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}
.note-input:focus {
  outline: none;
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
.badge.change {
  border: 1px solid rgba(255, 214, 10, 0.55);
  color: #ffd60a;
}
.badge.remove {
  background: #2a2a2a;
  color: #aeaeae;
}
.badge.conflict {
  border: 1px solid #ef4444;
  color: #ef4444;
  cursor: help;
}
.tools {
  text-align: right;
}
.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-left: 2px;
  vertical-align: middle;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9c9c9c;
  cursor: pointer;
  transition: all 0.2s ease;
}
.icon-btn:hover:not(:disabled) {
  background: #333333;
  color: #ffffff;
}
.icon-btn.danger:hover {
  color: #ef4444;
}
.icon-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
  stroke-linecap: round;
}
/* Remove and Go show on the hovered or focused row only, so the list stays calm. */
.icon-btn.hover-only {
  opacity: 0;
}
tr:hover .icon-btn.hover-only:not(:disabled),
.icon-btn.hover-only:focus-visible {
  opacity: 1;
}
tr:hover .icon-btn.hover-only:disabled {
  opacity: 0.4;
}
.label-short {
  display: none;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
/* Not .empty: that is a row action class. */
.empty-state {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 120px;
  color: #888888;
  font-size: 12px;
  text-align: center;
}

/* --- Selection bar: floats bottom centre over the list, above the action bar --- */
.sel-bar {
  position: absolute;
  left: 50%;
  bottom: 64px;
  z-index: 2;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  background: #242424;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
}
.sel-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #0a84ff;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.sel-label {
  color: #d4d4d4;
  font-size: 12px;
}
.bar-sep {
  width: 1px;
  height: 20px;
  background: #3a3a3a;
}
.bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  color: #d4d4d4;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.bar-btn:hover {
  background: #2a2a2a;
  border-color: #555555;
  color: #ffffff;
}
.bar-btn.active {
  border-color: #0a84ff;
  background: rgba(10, 132, 255, 0.15);
  color: #ffffff;
}
.bar-btn.danger:hover {
  border-color: #ef4444;
  color: #ef4444;
}
.bar-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}

/* --- Fill popover: above the selection bar, glowing frame of floating windows --- */
.fill-pop {
  position: absolute;
  left: 50%;
  bottom: 116px;
  z-index: 3;
  transform: translateX(-50%);
  width: min(320px, calc(100% - 24px));
  background: #1e1e1e;
  border: 1px solid rgba(10, 132, 255, 0.55);
  border-radius: 6px;
  box-shadow: 0 0 0 1px rgba(10, 132, 255, 0.12), 0 0 14px rgba(10, 132, 255, 0.22), 0 10px 28px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.pop-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px 0 12px;
  background: #242424;
}
.pop-title {
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}
.pop-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: #0a84ff;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.pop-close {
  margin-left: auto;
}
.pop-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}
.pop-label {
  display: block;
  margin-top: 4px;
  margin-bottom: 4px;
  color: #d4d4d4;
  font-size: 12px;
  font-weight: 600;
}
.tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.token {
  padding: 2px 7px;
  background: #181818;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #aeaeae;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.token:hover {
  border-color: #555555;
  color: #ffffff;
}
.token:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.pop-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.pop-preview,
.pop-error {
  margin: 4px 0 0;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.pop-preview {
  color: #9c9c9c;
}
.pop-error {
  color: #ef4444;
}
.pop-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #1a1a1a;
  border-top: 1px solid #2a2a2a;
}
.pop-hint {
  min-width: 0;
  margin-right: auto;
  overflow: hidden;
  color: #888888;
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pop-foot .btn-primary {
  margin-left: 0;
}
.btn-secondary {
  flex: none;
  padding: 8px 14px;
  background: #2a2a2a;
  border: none;
  border-radius: 6px;
  color: #aeaeae;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.btn-secondary:hover {
  background: #333333;
}
.btn-secondary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
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
.status-note {
  color: #888888;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link-btn {
  flex: none;
  padding: 0;
  background: none;
  border: none;
  border-radius: 4px;
  color: #d4d4d4;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.2s ease;
}
.link-btn:hover {
  color: #f2f2f2;
}
.link-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
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

/* Narrow window: compact columns leave the note at least ~180px. */
@container notes (max-width: 600px) {
  .toolbar {
    padding: 8px 12px;
  }
  .table-wrap {
    padding: 0 8px 8px;
  }
  .num {
    width: 40px;
  }
  .label-long {
    display: none;
  }
  .label-short {
    display: inline;
  }
  /* Toolbar and bar buttons keep only their icons (they have aria-labels / titles). */
  .icon-text .btn-label,
  .sel-label {
    display: none;
  }
  .toolbar {
    gap: 8px;
  }
  .col-time {
    width: 92px;
  }
  .col-action {
    width: 80px;
  }
  .action-bar {
    padding: 0 12px;
  }
}
</style>
