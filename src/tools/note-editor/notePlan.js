import { sectionIndexAt, BEAT_EPS as EPS } from '../../utils/sections.js'

// Per-row edits, keyed by String(beat): draft[key] = { beat, seconds, text, original }.
// original is the Designer text when the edit started ('' for a new note); it detects notes
// changed in Designer while the edit was pending. An empty text removes the note.
export const NO_DRAFT = Object.freeze({})

// Designer notes are single-line: line breaks become spaces, outer spaces are dropped.
export function normalizeNote(text) {
  return String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

// Every note of the track plus an empty slot on each section start without a note, sorted by
// beat, with the draft applied. Pure function: same inputs give the same list.
// Row actions:
//   'keep'     note unchanged (or an edit that ends up equal to the Designer text)
//   'empty'    section start without a note, nothing typed
//   'new'      note to create
//   'change'   note to rewrite
//   'remove'   note to delete
//   'conflict' the note changed in Designer after the edit started: not written
export function buildNoteList(snapshot, draft = NO_DRAFT) {
  const list = { rows: [], errors: [] }
  if (!snapshot) return list
  if (!snapshot.track) {
    list.errors.push('Track not found in Designer')
    return list
  }

  const { sections } = snapshot
  const notes = snapshot.notes ?? []
  const byKey = new Map()
  for (const n of notes) byKey.set(String(n.beat), { beat: n.beat, seconds: n.seconds, current: n.text })
  for (const s of sections) {
    // A note on a section start already holds that slot.
    if (!notes.some((n) => Math.abs(n.beat - s.beat) < EPS)) {
      byKey.set(String(s.beat), { beat: s.beat, seconds: s.seconds, current: null })
    }
  }
  for (const [key, d] of Object.entries(draft)) {
    if (!byKey.has(key)) byKey.set(key, { beat: d.beat, seconds: d.seconds, current: null })
  }

  for (const [key, item] of byKey) {
    const section = sections.length ? sectionIndexAt(sections, item.beat) + 1 : null
    const atSectionStart = sections.some((s) => Math.abs(s.beat - item.beat) < EPS)
    const current = item.current
    const d = draft[key]
    const row = { key, beat: item.beat, seconds: item.seconds, section, atSectionStart, current, text: current ?? '', action: current === null ? 'empty' : 'keep', edited: false }

    if (d) {
      const text = normalizeNote(d.text)
      row.text = text
      row.edited = text !== (current ?? '')
      // Nothing to write when the text already matches Designer, even if it changed there meanwhile.
      if (!row.edited) row.action = current === null ? 'empty' : 'keep'
      else if ((current ?? '') !== d.original) row.action = 'conflict'
      else if (current === null) row.action = 'new'
      else row.action = text ? 'change' : 'remove'
    }
    // A draft note typed off a section start and then cleared again leaves nothing to show.
    if (row.action === 'empty' && !atSectionStart) continue
    list.rows.push(row)
  }

  list.rows.sort((a, b) => a.beat - b.beat)
  return list
}

export function isWritten(row) {
  return row.action === 'new' || row.action === 'change' || row.action === 'remove'
}

// Operations for writeNotes(): an empty text removes the note.
export function buildOps(list) {
  return list.rows.filter(isWritten).map((r) => ({ beat: r.beat, text: r.action === 'remove' ? '' : r.text }))
}

export function summarize(list) {
  const count = (action) => list.rows.filter((r) => r.action === action).length
  return {
    notes: list.rows.filter((r) => r.current !== null).length,
    create: count('new'),
    change: count('change'),
    remove: count('remove'),
    conflict: count('conflict'),
  }
}

// --- Fill selected rows from a template ---

export const DEFAULT_FILL = {
  template: 'Panel {n}',
  start: 1,
  step: 1,
  digits: 1,
  existing: 'overwrite', // 'overwrite' | 'skip'
}

export const FILL_TOKENS = [
  { token: '{n}', title: 'Counter: Start, Step, Digits' },
  { token: '{s}', title: 'Section number' },
  { token: '{cue}', title: 'CUE tag at the note; rows without a tag are skipped' },
  { token: '{text}', title: 'Current note text; rows without a note are skipped' },
]

export function fillErrors(settings) {
  const errors = []
  if (!normalizeNote(settings.template)) errors.push('Template is empty')
  if (!Number.isInteger(settings.start)) errors.push('Start must be a whole number')
  if (!Number.isInteger(settings.step)) errors.push('Step must be a whole number')
  if (!(settings.digits >= 1 && settings.digits <= 6)) errors.push('Digits: 1 to 6')
  return errors
}

// Texts for the given rows (in beat order). Skipped rows do not take a number, so the counter has
// no gaps. A row is skipped when a {cue} / {text} it uses is empty: "GO {cue}" without a tag
// would leave a bare "GO". Returns [{ row, text }] for the rows to change.
export function buildFill(rows, settings, cues = []) {
  if (fillErrors(settings).length) return []
  const cueAt = new Map(cues.map((c) => [c.beat, c.text]))
  const usesCue = settings.template.includes('{cue}')
  const usesText = settings.template.includes('{text}')
  const result = []
  let n = settings.start
  for (const row of rows) {
    const shown = row.action === 'remove' ? '' : row.text
    if (settings.existing === 'skip' && shown) continue
    if ((usesCue && !cueAt.get(row.beat)) || (usesText && !shown)) continue
    const counter = String(Math.abs(n)).padStart(settings.digits, '0')
    const text = normalizeNote(
      settings.template.replace(/\{(n|s|cue|text)\}/g, (_, token) => {
        if (token === 'n') return (n < 0 ? '-' : '') + counter
        if (token === 's') return row.section ?? ''
        if (token === 'cue') return cueAt.get(row.beat) ?? ''
        return shown
      }),
    )
    if (!text) continue
    result.push({ row, text })
    n += settings.step
  }
  return result
}

// --- Find and replace (literal, case-insensitive like the filter) ---

export function buildReplace(rows, find, replacement) {
  const needle = find.trim()
  if (!needle) return []
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const result = []
  for (const row of rows) {
    if (row.action === 'remove' || !pattern.test(row.text)) continue
    pattern.lastIndex = 0
    result.push({ row, text: normalizeNote(row.text.replace(pattern, () => replacement)) })
  }
  return result
}

// Draft keys with nothing left to do: the Designer text already equals the typed one (e.g. after
// Apply, or an edit reverted by hand). Conflicts stay until the user resolves them.
export function settledKeys(snapshot, draft) {
  const current = new Map((snapshot?.notes ?? []).map((n) => [String(n.beat), n.text]))
  return Object.entries(draft)
    .filter(([key, d]) => normalizeNote(d.text) === (current.get(key) ?? ''))
    .map(([key]) => key)
}
