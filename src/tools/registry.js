import { defineAsyncComponent } from 'vue'

// Every tool of the toolkit. Adding a tool = a folder in src/tools/ + one entry here.
// icon: SVG path data for a 24x24 viewBox, drawn with a stroke.
export const tools = [
  {
    id: 'cue-tagger',
    title: 'Cue Tagger',
    description: 'Cue tags on section starts',
    icon: 'M5 4h10l4 4v12H5z M9 10h6 M9 14h6 M9 18h3',
    component: defineAsyncComponent(() => import('./cue-tagger/CueTaggerTool.vue')),
  },
  {
    id: 'note-editor',
    title: 'Note Editor',
    description: 'Create and edit timeline notes',
    icon: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
    component: defineAsyncComponent(() => import('./note-editor/NoteEditorTool.vue')),
  },
]

export function findTool(id) {
  return tools.find((t) => t.id === id) || tools[0]
}
