import assert from 'node:assert/strict'
import test from 'node:test'
import { findEvidenceRange, findingFingerprint } from '../lib/draftReview.js'

function paragraph(textContent, elementType = 'action') {
  return {
    type: { name:'screenplayParagraph' },
    attrs: { elementType },
    textContent,
    content: { size:textContent.length },
  }
}

function mockEditor(entries) {
  return {
    state: {
      doc: {
        content: { size:1000 },
        descendants(callback) {
          entries.forEach(entry => callback(entry.node, entry.pos))
        },
      },
    },
  }
}

test('evidence navigation selects an exact dialogue block', () => {
  const editor = mockEditor([
    { pos:0, node:paragraph('INT. ARCHIVE - LATER', 'scene') },
    { pos:30, node:paragraph('Omar examines it. There is no visible damage.') },
    { pos:90, node:paragraph('Impossible. Nobody entered this floor after Director Chen left.', 'dialogue') },
  ])
  const range = findEvidenceRange(editor, {
    quote:'Impossible. Nobody entered this floor after Director Chen left.',
    location:'INT. ARCHIVE - LATER',
  })
  assert.equal(range.from, 91)
  assert.ok(range.to > range.from)
})

test('evidence navigation falls back to the cited scene heading', () => {
  const editor = mockEditor([
    { pos:10, node:paragraph('INT. PARKING GARAGE - NIGHT', 'scene') },
    { pos:50, node:paragraph('Maya crosses the garage.') },
  ])
  const range = findEvidenceRange(editor, {
    quote:'A paraphrase that is not present verbatim.',
    location:'INT. PARKING GARAGE - NIGHT',
  })
  assert.equal(range.from, 11)
})

test('finding decisions remain stable when only AI wording changes', () => {
  const evidence = [
    { quote:'The brass key is still attached.', location:'INT. ARCHIVE - LATER' },
    { quote:'There is no visible damage.', location:'INT. ARCHIVE - LATER' },
  ]
  const first = findingFingerprint({ category:'continuity', title:'How was it opened?', evidence })
  const rerun = findingFingerprint({ category:'continuity', title:'The locked locker', evidence:[...evidence].reverse() })
  assert.equal(first, rerun)
  assert.notEqual(first, findingFingerprint({ category:'timeline', title:'The locked locker', evidence }))
})
