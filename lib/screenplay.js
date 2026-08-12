export const SCREENPLAY_ELEMENTS = {
  scene:         { label: 'Scene Heading', shortcut: 'Ctrl+1', fdx: 'Scene Heading', next: 'action', upper: true },
  action:        { label: 'Action', shortcut: 'Ctrl+2', fdx: 'Action', next: 'action' },
  character:     { label: 'Character', shortcut: 'Ctrl+3', fdx: 'Character', next: 'dialogue', upper: true },
  dialogue:      { label: 'Dialogue', shortcut: 'Ctrl+4', fdx: 'Dialogue', next: 'action' },
  parenthetical: { label: 'Parenthetical', shortcut: 'Ctrl+5', fdx: 'Parenthetical', next: 'dialogue' },
  transition:    { label: 'Transition', shortcut: 'Ctrl+6', fdx: 'Transition', next: 'scene', upper: true },
  shot:          { label: 'Shot', shortcut: 'Ctrl+7', fdx: 'Shot', next: 'action', upper: true },
  text:          { label: 'General', shortcut: 'Ctrl+8', fdx: 'General', next: 'text' },
}

export const SCREENPLAY_ELEMENT_ORDER = Object.keys(SCREENPLAY_ELEMENTS)

const FDX_TO_ELEMENT = Object.fromEntries(
  Object.entries(SCREENPLAY_ELEMENTS).map(([key, value]) => [value.fdx.toLowerCase(), key])
)

export function normalizeElementType(type) {
  return SCREENPLAY_ELEMENTS[type] ? type : 'action'
}

function textFromJson(node) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content || []).map(textFromJson).join('')
}

function paragraph(type = 'action', text = '') {
  return {
    type: 'screenplayParagraph',
    attrs: { elementType: normalizeElementType(type) },
    ...(text ? { content: [{ type: 'text', text }] } : {}),
  }
}

export function inferElementType(text, previousType = 'action') {
  const trimmed = text.trim()
  if (/^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) return 'scene'
  if (/^[A-Z0-9 .'-]+ TO:$/.test(trimmed)) return 'transition'
  if (/^\(.+\)$/.test(trimmed)) return 'parenthetical'
  if (previousType === 'character' || previousType === 'parenthetical') return 'dialogue'
  if (trimmed && trimmed.length <= 40 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return 'character'
  return 'action'
}

export function legacyToDocument(content = '') {
  if (!content.trim()) return { type: 'doc', content: [paragraph('scene')] }
  let previousType = 'action'
  const blocks = content.split(/\r?\n/).map(line => {
    const tagged = line.match(/^\[(\w+)](.*)$/)
    const type = tagged ? normalizeElementType(tagged[1]) : inferElementType(line, previousType)
    const text = tagged ? tagged[2] : line
    previousType = type
    return paragraph(type, text)
  })
  return { type: 'doc', content: blocks.length ? blocks : [paragraph('scene')] }
}

export function documentToBlocks(doc) {
  return (doc?.content || [])
    .filter(node => node.type === 'screenplayParagraph' || node.type === 'paragraph')
    .map(node => {
      const type = normalizeElementType(node.attrs?.elementType)
      const rawText = textFromJson(node)
      return {
        type,
        text: SCREENPLAY_ELEMENTS[type]?.upper ? rawText.toUpperCase() : rawText,
      }
    })
}

export function documentToLegacy(doc) {
  return documentToBlocks(doc).map(block => `[${block.type}]${block.text}`).join('\n')
}

export function documentToPlainText(doc) {
  return documentToBlocks(doc).map(block => block.text).join('\n')
}

export function sceneHeadingsFromDocument(doc) {
  return documentToBlocks(doc)
    .map((block, index) => ({ ...block, index }))
    .filter(block => block.type === 'scene' && block.text.trim())
    .map((block, index) => ({ number: index + 1, label: block.text.trim(), blockIndex: block.index }))
}

export function countWords(doc) {
  const text = documentToPlainText(doc).trim()
  return text ? text.split(/\s+/).length : 0
}

export function estimateScreenplayPages(doc) {
  const lineWeights = { scene: 2.2, action: 1.2, character: 1.4, dialogue: 1.1, parenthetical: 1, transition: 1.5, shot: 1.8, text: 1.2 }
  const charsPerLine = { scene: 58, action: 60, character: 32, dialogue: 36, parenthetical: 28, transition: 58, shot: 58, text: 60 }
  const lines = documentToBlocks(doc).reduce((total, block) => {
    const wrapped = Math.max(1, Math.ceil(block.text.length / charsPerLine[block.type]))
    return total + wrapped * lineWeights[block.type]
  }, 0)
  return Math.max(1, Math.ceil(lines / 52))
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function documentToFdx(doc, titlePage = {}) {
  const content = documentToBlocks(doc).map(block => (
    `    <Paragraph Type="${SCREENPLAY_ELEMENTS[block.type].fdx}"><Text>${escapeXml(block.text)}</Text></Paragraph>`
  )).join('\n')
  const title = escapeXml(titlePage.title || '')
  const author = escapeXml(titlePage.author || '')
  const contact = escapeXml(titlePage.contact || '')
  const draftDate = escapeXml(titlePage.draftDate || '')
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="3">
  <Content>
${content}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center" Type="Title"><Text>${title}</Text></Paragraph>
      <Paragraph Alignment="Center" Type="Author"><Text>${author}</Text></Paragraph>
      <Paragraph Alignment="Center" Type="Source"><Text>${draftDate}</Text></Paragraph>
      <Paragraph Type="Contact"><Text>${contact}</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`
}

export function fdxToDocument(xml) {
  if (typeof DOMParser === 'undefined') throw new Error('FDX import requires a browser.')
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.querySelector('parsererror')) throw new Error('This does not appear to be a valid FDX file.')
  const contentRoot = parsed.querySelector('FinalDraft > Content') || parsed.querySelector('Content')
  if (!contentRoot) throw new Error('The FDX file has no script content.')
  const blocks = Array.from(contentRoot.children)
    .filter(node => node.tagName === 'Paragraph')
    .map(node => {
      const fdxType = (node.getAttribute('Type') || 'Action').toLowerCase()
      const type = FDX_TO_ELEMENT[fdxType] || 'action'
      const text = Array.from(node.querySelectorAll('Text')).map(textNode => textNode.textContent || '').join('')
      return paragraph(type, text)
    })
  return { type: 'doc', content: blocks.length ? blocks : [paragraph('scene')] }
}

export function titlePageFromFdx(xml) {
  if (typeof DOMParser === 'undefined') return {}
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  const titleRoot = parsed.querySelector('TitlePage > Content')
  const value = type => titleRoot?.querySelector(`Paragraph[Type="${type}"] Text`)?.textContent || ''
  return { title: value('Title'), author: value('Author'), draftDate: value('Source'), contact: value('Contact') }
}

export function downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function safeFilename(value = 'screenplay') {
  return value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'screenplay'
}
