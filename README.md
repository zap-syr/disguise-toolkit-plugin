# Disguise Toolkit Plugin

A set of small timeline utilities for Disguise Designer in one plugin window. Pick a tool, choose the track it works on, and check the preview before anything is written to the project.

<!-- Screenshot: the Cue Tagger with settings and preview -->
<!-- ![Cue Tagger](https://github.com/zap-syr/disguise-toolkit-plugin/blob/main/.github/aux-images/cue-tagger.png) -->

## Download

Download the latest release - [Disguise Toolkit](https://github.com/zap-syr/disguise-toolkit-plugin/releases/latest/download/Disguise.Toolkit.zip)

To install the plugin, follow the official Disguise documentation steps - [Installing Plugins](https://help.disguise.one/designer/plugins/designer-plugin-overview#installing-plugins)

## Tools

### Cue Tagger

Writes cue tags on section starts of a track, with automatic numbering.

- **Range** - the selection on the timeline, a range of sections, from the playhead to the end, or the whole track. Tag every section or only every Nth one
- **Numbering** - continue from the last cue tag before the range or start from your own number, in `X`, `X.Y` or `X.Y.Z` format with a chosen step
- **Existing tags** - skip or overwrite them
- **Preview** - shows the new cue of every section before writing. Exclude single sections, type a cue by hand, and see duplicate numbers at a glance

Changes can be undone with Ctrl+Z in Designer.

## Issues

Found a bug or have a feature request? [Open an issue](https://github.com/zap-syr/disguise-toolkit-plugin/issues/new)

## License

This project is licensed under the terms of the MIT License.
