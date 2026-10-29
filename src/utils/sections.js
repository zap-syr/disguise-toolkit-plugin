export const BEAT_EPS = 1e-6

// Index of the section that contains `beat` (last section starting at or before it).
export function sectionIndexAt(sections, beat) {
  let index = 0
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].beat <= beat + BEAT_EPS) index = i
    else break
  }
  return index
}
