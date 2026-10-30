# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Disguise Designer (d3) web plugin: a Vue 3 + Vite single-page app that Designer opens in a plugin window. It hosts several small "tools" behind a shared shell (tool rail + track bar). Currently the only tool is the Cue Tagger, which writes CUE tags on section starts of a timeline track.

`public/d3plugin.json` is the plugin manifest (`requiresSession: true`). `vite.config.js` uses `base: './'` so the built `dist/` works when served from Designer's plugin folder.

## Commands

- `npm run dev` - Vite dev server. Without a `?director=` query param, API calls go to `localhost:80` (a local Designer); append `?director=<host:port>` to target another machine.
- `npm run build` - production build into `dist/`.
- `npm run preview` - serve the built `dist/`.

There are no tests, linter or formatter configured.

## Architecture

**Talking to Designer.** All Designer access goes through `src/services/disguiseService.js`, which POSTs Python scripts to `/api/session/python/execute` on the director (taken from `?director=`). Conventions every script follows:
- Scripts are wrapped as `def run(): ... return run()` and return a dict with `"status": "success"` or `{"status": "error", "message": ...}`; `runScript()` throws on anything else.
- Designer runs Python 2: embed JS strings with `pyString()` (escapes non-ASCII), never raw interpolation. `JSON.stringify` is only used for payloads that are also valid Python literals (numbers, ASCII strings).
- Scripts run on Designer's main thread with a ~1 s timeout: every loop is bounded (e.g. `MAX_TAG_WALK`) and bulk writes are chunked (`CHUNK_SIZE` in `cueTaggerService.js`).
- Find tracks by scanning `resourceManager.allResources(Track)`, never `resourceManager.load()` (it creates a missing resource). Writes call `markDirty(track)` and `track.saveOnDelete()`.
- The execute endpoint must not be polled. Data is refreshed on demand only: window focus, refresh button, track change, and right before applying changes.

**Shared timeline state.** `src/services/timelineService.js` reads one snapshot of a track (sections, cue tags, track list, and for the track open in the timeline: playhead and selection). `src/composables/useTimeline.js` holds that snapshot as a module-level singleton shared by the whole app, serializes concurrent refreshes, and persists the chosen track (`trackPath === ''` means "follow the track open in the Designer timeline"). The timeline ruler selection is read via a non-public `BarWidget` workaround in its own script, so its failure falls back to the layer selection without breaking the snapshot.

**Tools.** A tool is a folder in `src/tools/<id>/` plus one entry in `src/tools/registry.js` (id, title, description, SVG icon path, async component). `App.vue` renders the active tool inside `<KeepAlive>`. Tools follow the Cue Tagger split:
- `*Tool.vue` - UI; reads `useTimeline()`, persists settings with `useToolSettings(toolId, DEFAULT_SETTINGS)` (localStorage, keys prefixed `disguise-toolkit:`, all access guarded by try/catch).
- a pure planning module (`cuePlan.js`) that turns snapshot + settings + per-row edits into a previewable plan with errors/notes, no I/O.
- a service module (`cueTaggerService.js`) holding the Designer write scripts.

Generic helpers live in `src/utils/` (timecode formatting, section lookup with `BEAT_EPS`) and reusable inputs/toasts in `src/components/ui/`.

**Layout.** The plugin window can be very small: `.tool-host` is a CSS container (`container-type: inline-size`), and tools adapt with `@container` queries rather than viewport media queries.

## Conventions

- All UI text in English, ASCII only (no em dashes, ellipses or arrow characters).
- Styling is plain scoped CSS with hardcoded hex colors in a dark theme (no CSS variables, no Tailwind); the `disguise:disguise-css` skill has the palette and component recipes, and `disguise:disguise-api` covers the Designer APIs.
