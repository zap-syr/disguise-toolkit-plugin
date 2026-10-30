# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-10-30

### Added
- **Toolkit shell** - a tool rail on the left to switch between tools and a track bar on top that shows which track the tools work on. The track can follow the one open in the Designer timeline or be picked from the project's tracks. The rail can be collapsed to icons, and the last tool and track are remembered.
- **Cue Tagger** - writes CUE tags on section starts of a track:
  - Range: from the section at the playhead to the end, the time range selected on the timeline ruler (or the extents of the selected layers), a span of sections, or the whole track.
  - Tag every section or only every Nth one.
  - Numbering continues from the last cue tag before the range or starts from a number you set, in `X`, `X.Y` or `X.Y.Z` format, with a chosen level and step.
  - Existing tags are skipped or overwritten. When continuing, a kept numeric tag becomes the base for the next numbers.
  - Preview of every section in the range before anything is written, with warnings for duplicate numbers and numbers longer than 11 characters. Single sections can be excluded or given a cue typed by hand.
  - Tags are written in chunks, so large tracks stay within Designer's script timeout.
- Track data is re-read when the plugin window gets focus and right before tags are written.
- The layout adapts to small plugin windows.
