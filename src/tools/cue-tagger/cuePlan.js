import { parseCue, formatCue, incrementCue, CUE_MAX_LENGTH } from './cueNumbers.js'
import { sectionIndexAt, BEAT_EPS as EPS } from '../../utils/sections.js'

export const DEFAULT_SETTINGS = {
  rangeMode: 'playhead', // 'selection' | 'sections' | 'playhead' | 'track'
  fromSection: 1,
  toSection: 1,
  every: 1,
  numberMode: 'continue', // 'continue' | 'manual'
  startNumber: '1',
  level: 1,
  step: 1,
  conflict: 'skip', // 'skip' | 'overwrite'
}

export function resolveRange(snapshot, settings) {
  const { sections, track } = snapshot
  const end = track.lengthBeats

  switch (settings.rangeMode) {
    case 'track':
      return { startBeat: 0, endBeat: end }

    case 'playhead': {
      if (!track.isGui) return { error: 'Playhead is only available for the track open in the timeline' }
      if (!sections.length) return { startBeat: 0, endBeat: end }
      const index = sectionIndexAt(sections, snapshot.playheadBeat)
      return { startBeat: sections[index].beat, endBeat: end }
    }

    case 'selection':
      if (!track.isGui) return { error: 'Selection is only available for the track open in the timeline' }
      if (!snapshot.selection) return { error: 'No time range or layers selected in Designer' }
      return { startBeat: snapshot.selection.startBeat, endBeat: snapshot.selection.endBeat }

    case 'sections': {
      const from = Math.trunc(settings.fromSection)
      const to = Math.trunc(settings.toSection)
      if (!(from >= 1 && to >= from && to <= sections.length)) {
        return { error: `Sections: 1 to ${sections.length}, "From" must not exceed "To"` }
      }
      return {
        startBeat: sections[from - 1].beat,
        endBeat: to < sections.length ? sections[to].beat : end,
      }
    }
  }
  return { error: 'Unknown range mode' }
}

// Per-row edits from the preview, keyed by String(section beat) so they survive range changes:
// off[key] = true excludes the section, custom[key] = text sets the cue by hand.
export const NO_EDITS = Object.freeze({ off: {}, custom: {} })

// Builds the full list of tags to write. Pure function: same inputs give the same plan.
// Excluded sections and custom cues do not take a number: the auto sequence runs on without them.
export function buildPlan(snapshot, settings, edits = NO_EDITS) {
  const plan = { rows: [], errors: [], notes: [], previousCue: null, range: null }
  if (!snapshot) return plan
  if (!snapshot.track) {
    plan.errors.push('Track not found in Designer')
    return plan
  }

  const range = resolveRange(snapshot, settings)
  if (range.error) {
    plan.errors.push(range.error)
    return plan
  }
  plan.range = range

  const every = Math.trunc(settings.every)
  const step = Math.trunc(settings.step)
  if (!(every >= 1)) plan.errors.push('Every Nth section must be 1 or more')
  if (!(step >= 1)) plan.errors.push('Number step must be 1 or more')

  // Last cue strictly before the range: the base for "continue" numbering.
  const cuesBefore = snapshot.cues.filter((c) => c.beat < range.startBeat - EPS)
  plan.previousCue = cuesBefore.length ? cuesBefore[cuesBefore.length - 1] : null

  let current = null
  if (settings.numberMode === 'continue' && plan.previousCue) {
    const previous = parseCue(plan.previousCue.text)
    if (previous) current = incrementCue(previous, settings.level, step)
    else plan.errors.push(`Previous tag "${plan.previousCue.text}" is not numeric, set the number manually`)
  } else {
    if (settings.numberMode === 'continue') plan.notes.push('No cue tags before the range, numbering starts from the start number')
    current = parseCue(settings.startNumber)
    if (!current) plan.errors.push('Start number format: X, X.Y or X.Y.Z')
  }
  if (plan.errors.length) return plan

  const cueAtBeat = new Map(snapshot.cues.map((c) => [c.beat, c.text]))
  const targets = snapshot.sections
    .map((s, i) => ({ ...s, index: i + 1 }))
    .filter((s) => s.beat >= range.startBeat - EPS && s.beat < range.endBeat - EPS)
    .filter((_, k) => k % every === 0)

  if (!targets.length) {
    plan.errors.push('No section starts inside the range')
    return plan
  }

  for (const section of targets) {
    const existing = cueAtBeat.get(section.beat) ?? null
    const key = String(section.beat)
    const base = { section: section.index, beat: section.beat, seconds: section.seconds, existing, custom: false, invalid: false, tooLong: false, duplicate: false }

    if (edits.off[key]) {
      plan.rows.push({ ...base, text: '', action: 'off' })
      continue
    }
    const customText = edits.custom[key]
    if (customText != null) {
      // A cue typed by hand is always written, also over an existing tag.
      plan.rows.push({
        ...base,
        text: customText,
        action: existing === null ? 'new' : 'overwrite',
        custom: true,
        invalid: !parseCue(customText),
        tooLong: customText.length > CUE_MAX_LENGTH,
      })
      continue
    }

    const text = formatCue(current)
    const action = existing === null ? 'new' : settings.conflict === 'overwrite' ? 'overwrite' : 'skip'
    plan.rows.push({ ...base, text, action, tooLong: text.length > CUE_MAX_LENGTH })
    if (action !== 'skip') {
      current = incrementCue(current, settings.level, step)
    } else if (settings.numberMode === 'continue') {
      // Continue: a kept numeric tag becomes the new base, so numbering follows it.
      // Manual: kept tags are ignored and the next new tag takes the next number of the sequence.
      const kept = parseCue(existing)
      if (kept) current = incrementCue(kept, settings.level, step)
    }
  }

  // Duplicates: the same number on a tag that stays on the track or on another new tag.
  const replaced = new Set(plan.rows.filter((r) => r.action === 'overwrite').map((r) => r.beat))
  const used = new Set(snapshot.cues.filter((c) => !replaced.has(c.beat)).map((c) => c.text))
  for (const row of plan.rows) {
    if (!isWritten(row)) continue
    row.duplicate = used.has(row.text)
    used.add(row.text)
  }

  if (plan.rows.some((r) => isWritten(r) && r.invalid)) {
    plan.errors.push('Custom cue format: X, X.Y or X.Y.Z')
  }
  if (plan.rows.some((r) => isWritten(r) && r.tooLong)) {
    plan.errors.push(`Cue number longer than ${CUE_MAX_LENGTH} characters`)
  }
  return plan
}

export function isWritten(row) {
  return row.action === 'new' || row.action === 'overwrite'
}

export function summarize(plan) {
  const count = (action) => plan.rows.filter((r) => r.action === action).length
  return {
    create: count('new'),
    overwrite: count('overwrite'),
    skip: count('skip'),
    off: count('off'),
    custom: plan.rows.filter((r) => r.custom).length,
    duplicates: plan.rows.filter((r) => r.duplicate).length,
  }
}
