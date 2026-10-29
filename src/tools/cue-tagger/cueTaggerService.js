import { runScript, pyString } from '../../services/disguiseService.js'

// Tags are cheap, but each script must stay well under Designer's ~1 s execution timeout.
const CHUNK_SIZE = 200

// rows: [{ beat, text, overwrite }], written to the track at trackPath.
export async function writeCueTags(trackPath, rows) {
  let written = 0
  let skipped = 0
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    // Only numbers and digit strings: the JSON literal is also a valid Python literal.
    const items = rows.slice(i, i + CHUNK_SIZE).map((r) => ({
      beat: r.beat,
      text: r.text,
      overwrite: r.overwrite ? 1 : 0,
    }))
    const script = `
def run():
    # Looked up among existing tracks: resourceManager.load() creates a missing one.
    target_path = ${pyString(trackPath)}
    current_track = next((t for t in resourceManager.allResources(Track) if str(t.path) == target_path), None)
    if not current_track:
        return {"status": "error", "message": "Track not found in Designer, refresh the data"}
    current_items = ${JSON.stringify(items)}
    markDirty(current_track)
    written = 0
    skipped = 0
    for item in current_items:
        if current_track.tagAtBeat(item["beat"], Tag.CUE) and not item["overwrite"]:
            skipped += 1
            continue
        current_track.setTagAtBeat(item["beat"], Tag(Tag.CUE, item["text"]))
        written += 1
    current_track.saveOnDelete()
    return {"status": "success", "written": written, "skipped": skipped}
return run()
`
    const result = await runScript(script)
    written += result.written
    skipped += result.skipped
  }
  return { written, skipped }
}
