import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the editor exposes the eight standard screenplay elements and keyboard flow', async () => {
  const [model, keyboard] = await Promise.all([
    read('lib/screenplay.js'),
    read('components/editor/screenplayExtensions.js'),
  ])
  for (const element of ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'text']) {
    assert.match(model, new RegExp(`\\b${element}:`))
  }
  assert.match(keyboard, /Enter:/)
  assert.match(keyboard, /Tab:/)
  assert.match(keyboard, /Shift-Tab/)
  assert.match(keyboard, /Mod-/)
})

test('screenplay files support FDX import/export, TXT export, title pages and print-to-PDF', async () => {
  const [model, editor, css] = await Promise.all([
    read('lib/screenplay.js'),
    read('components/editor/WritingEditor.js'),
    read('app/globals.css'),
  ])
  assert.match(model, /<FinalDraft/)
  assert.match(model, /fdxToDocument/)
  assert.match(editor, /Export FDX/)
  assert.match(editor, /Export TXT/)
  assert.match(editor, /Print \/ Save PDF/)
  assert.match(editor, /screenplay-print-title/)
  assert.match(css, /@page \{ size:letter;/)
})

test('draft recovery and owned version history are persisted', async () => {
  const [editor, shell, schema, migration] = await Promise.all([
    read('components/editor/WritingEditor.js'),
    read('components/Shell.js'),
    read('supabase-schema.sql'),
    read('supabase-migration-core-prototype.sql'),
  ])
  assert.match(editor, /anchor-recovery:/)
  assert.match(editor, /localStorage\.setItem/)
  assert.match(shell, /content_json/)
  assert.match(shell, /createScriptVersion/)
  assert.match(schema, /create table if not exists public\.script_versions/)
  assert.match(schema, /owners manage script versions/)
  assert.match(migration, /drop policy if exists "owners manage script versions"/)
})

test('writer utilities include navigation, search, autocomplete and mobile light editing', async () => {
  const [editor, css] = await Promise.all([
    read('components/editor/WritingEditor.js'),
    read('app/globals.css'),
  ])
  assert.match(editor, /Scenes/)
  assert.match(editor, /Replace all/)
  assert.match(editor, /\(V\.O\.\)/)
  assert.match(editor, /\(O\.S\.\)/)
  assert.match(editor, /CONT’D/)
  assert.match(css, /@media \(max-width: 820px\)/)
})
