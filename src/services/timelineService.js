import { runScript, pyString } from './disguiseService.js'

// Bounds for loops in Designer scripts: a script runs on the main thread and must never be unbounded.
const MAX_TAG_WALK = 20000

// Snapshot of one track: sections, cue tags, and (for the track open in the timeline) playhead and
// the extents of the selected layers. Also lists all project tracks for the track picker.
// trackPath '' means the track open in the timeline. Shared by all tools.
export async function getTimelineSnapshot(trackPath = '') {
  const script = `
def run():
    gui_track = guisystem.track
    target_path = ${pyString(trackPath)}
    current_track = None if target_path else gui_track
    current_tracks = []
    for t in resourceManager.allResources(Track):
        p = str(t.path)
        if p.startswith("objects/"):
            current_tracks.append({"name": t.description, "path": p})
            # Looked up among existing tracks: resourceManager.load() creates a missing one.
            if target_path and p == target_path:
                current_track = t
    result = {
        "status": "success",
        "tracks": current_tracks,
        "guiTrackPath": str(gui_track.path) if gui_track else "",
        "track": None,
    }
    if not current_track:
        return result

    is_gui = bool(gui_track) and gui_track.uid == current_track.uid

    current_fps = 30.0
    try:
        current_fps = float(state.globalRefreshRate.asDouble)
    except Exception:
        pass

    current_sections = []
    for i in range(current_track.nSections()):
        b = current_track.sectionToBeat(i)
        current_sections.append({"beat": b, "seconds": current_track.beatToTime(b)})

    current_cues = []
    b = -1.0
    for _ in range(${MAX_TAG_WALK}):
        nb = current_track.findBeatOfNextTag(b)
        if nb > 1e300 or nb <= b:
            break
        b = nb
        current_tag = current_track.tagAtBeat(b, Tag.CUE)
        if current_tag:
            current_cues.append({"beat": b, "text": current_tag.text})

    # Playhead and layer selection only exist for the track open in the timeline.
    current_selection = None
    playhead_beat = None
    if is_gui:
        playhead_beat = guisystem.player.tCurrent
        try:
            current_layers = [l for l in guisystem.selectedLayers]
        except Exception:
            current_layers = []
        if current_layers:
            current_selection = {
                "count": len(current_layers),
                "startBeat": min(l.tStart for l in current_layers),
                "endBeat": max(l.tEnd for l in current_layers),
            }

    result.update({
        "track": {
            "name": current_track.description,
            "path": str(current_track.path),
            "lengthBeats": current_track.lengthInBeats,
            "lengthSeconds": current_track.lengthInSec,
            "isGui": is_gui,
        },
        "fps": current_fps,
        "playheadBeat": playhead_beat,
        "playheadSeconds": current_track.beatToTime(playhead_beat) if is_gui else None,
        "sections": current_sections,
        "cues": current_cues,
        "selection": current_selection,
    })
    return result
return run()
`
  const { status, ...snapshot } = await runScript(script)
  return snapshot
}
