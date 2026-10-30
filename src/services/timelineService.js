import { runScript, pyString } from './disguiseService.js'

// Bounds for loops in Designer scripts: a script runs on the main thread and must never be unbounded.
const MAX_TAG_WALK = 20000

// Snapshot of one track: sections, cue tags, and (for the track open in the timeline) playhead and
// selection. Also lists all project tracks for the track picker.
// trackPath '' means the track open in the timeline. Shared by all tools.
// selection: the time range selected on the timeline ruler, or else the extents of the selected
// layers: { source: 'timeline' | 'layers', startBeat, endBeat, count? } or null.
export async function getTimelineSnapshot(trackPath = '') {
  const snapshot = await readSnapshot(trackPath)
  const layers = snapshot.layerSelection
  delete snapshot.layerSelection
  snapshot.selection = null
  if (snapshot.track?.isGui) {
    const range = await readTimelineRange()
    if (range) snapshot.selection = { source: 'timeline', ...range }
    else if (layers) snapshot.selection = { source: 'layers', ...layers }
  }
  return snapshot
}

// Set once the timeline range read fails inside Designer (e.g. a version without the workaround);
// from then on only the layer selection is used.
let timelineRangeUnavailable = false

// The ruler's selection lives on the BarWidget, which is not public API: reading the widget
// object is blocked ("Access to object of type 'BarWidget' is not allowed"), but the class
// property getter is not. Kept in its own script so a failure here never breaks the snapshot.
// Verified on r34.2.2. Without a selection both values are 0.
async function readTimelineRange() {
  if (timelineRangeUnavailable) return null
  const script = `
def run():
    import gui.track.trackwidget as tw
    B = tw.BarWidget
    bars = resourceManager.allResources(B)
    if not bars:
        return {"status": "success", "range": None}
    w = bars[0]
    s = B.selectionStart.fget(w)
    e = B.selectionEnd.fget(w)
    t = guisystem.track
    return {"status": "success", "range": [s, e, t.beatToTime(s), t.beatToTime(e)]}
return run()
`
  try {
    const { range } = await runScript(script)
    if (!range || !(range[1] > range[0])) return null
    return { startBeat: range[0], endBeat: range[1], startSeconds: range[2], endSeconds: range[3] }
  } catch (e) {
    // Python errors mean the workaround does not work here; network errors are left to the next refresh.
    if (String(e.message).startsWith('Failed to run plugin')) {
      timelineRangeUnavailable = true
      console.warn('Timeline range is not readable, using the layer selection', e)
    }
    return null
  }
}

async function readSnapshot(trackPath) {
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
    layer_selection = None
    playhead_beat = None
    if is_gui:
        playhead_beat = guisystem.player.tCurrent
        try:
            current_layers = [l for l in guisystem.selectedLayers]
        except Exception:
            current_layers = []
        if current_layers:
            layer_selection = {
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
        "layerSelection": layer_selection,
    })
    return result
return run()
`
  const { status, ...snapshot } = await runScript(script)
  return snapshot
}
