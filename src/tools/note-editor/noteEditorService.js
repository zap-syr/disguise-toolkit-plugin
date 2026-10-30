import { runScript, pyString } from '../../services/disguiseService.js'

// 200 notes take ~16 ms in Designer; chunks keep each script well under the ~1 s timeout.
const CHUNK_SIZE = 200

// Python lookup of the target track. Among existing tracks: resourceManager.load() creates a missing one.
const findTrack = (trackPath) => `
    target_path = ${pyString(trackPath)}
    current_track = next((t for t in resourceManager.allResources(Track) if str(t.path) == target_path), None)
    if not current_track:
        return {"status": "error", "message": "Track not found in Designer, refresh the data"}`

// ops: [{ beat, text }], an empty text removes the note. Beats must be passed exactly as read
// from the snapshot: noteAtBeat() only matches the exact beat.
// Never setNoteAtBeat(b, ""): it leaves an empty Cue on the track that removeNoteAtBeat()
// no longer cleans up (verified r34.2.2).
export async function writeNotes(trackPath, ops) {
  let set = 0
  let removed = 0
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    // Note text is free text: each item goes through pyString(), not JSON.stringify.
    const items = ops
      .slice(i, i + CHUNK_SIZE)
      .map((op) => `(${JSON.stringify(op.beat)}, ${pyString(op.text.trim())})`)
      .join(', ')
    const script = `
def run():${findTrack(trackPath)}
    current_items = [${items}]
    markDirty(current_track)
    set_count = 0
    removed_count = 0
    for beat, text in current_items:
        if text:
            current_track.setNoteAtBeat(beat, text)
            set_count += 1
        elif current_track.noteAtBeat(beat):
            current_track.removeNoteAtBeat(beat)
            removed_count += 1
    current_track.saveOnDelete()
    return {"status": "success", "set": set_count, "removed": removed_count}
return run()
`
    const result = await runScript(script)
    set += result.set
    removed += result.removed
  }
  return { set, removed }
}

// Moves the playhead of the timeline's transport to a beat. Only when that transport plays the
// given track: REST gotonote matches by text (notes repeat) and gototime needs a transport locator.
// The command lands on a later frame: a snapshot read right after still shows the old playhead.
export async function jumpToBeat(trackPath, beat) {
  const script = `
def run():${findTrack(trackPath)}
    tm = guisystem.currentTransportManager
    if not tm or not tm.track or tm.track.uid != current_track.uid:
        return {"status": "error", "message": "The track is not playing in the timeline"}
    tm.addCommand(TransportCommand.makeJumpToBeat(state, tm, ${JSON.stringify(beat)}))
    return {"status": "success"}
return run()
`
  await runScript(script)
}
