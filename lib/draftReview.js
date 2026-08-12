export function normalizeFindingText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

export function findingFingerprint(finding) {
  const evidence = (finding.evidence || [])
    .map(item => normalizeFindingText(item.quote))
    .filter(Boolean)
    .sort()
    .join('|')
  const source = `${finding.category || 'finding'}|${evidence || normalizeFindingText(finding.title)}`
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${finding.category || 'finding'}:${(hash >>> 0).toString(36)}`
}

const categoryFamilies = {
  continuity:'continuity',
  life_state:'continuity',
  timeline:'continuity',
  character:'character',
  relationship:'relationship',
}

function evidenceMatches(left, right) {
  const a = normalizeFindingText(left)
  const b = normalizeFindingText(right)
  if (a.length < 12 || b.length < 12) return false
  if (a.includes(b) || b.includes(a)) return true
  const aWords = new Set(a.split(' '))
  const bWords = new Set(b.split(' '))
  const overlap = [...aWords].filter(word => bWords.has(word)).length
  return overlap / Math.max(Math.min(aWords.size, bWords.size), 1) >= 0.8
}

export function findingMatchesDecision(finding, decision) {
  if (findingFingerprint(finding) === decision.fingerprint) return true
  if (categoryFamilies[finding.category] !== categoryFamilies[decision.category]) return false
  return (finding.evidence || []).some(current =>
    (decision.evidence || []).some(reviewed => evidenceMatches(current.quote, reviewed.quote))
  )
}

export function findEvidenceRange(editor, evidence) {
  if (!editor) return null
  const quote = normalizeFindingText(evidence?.quote)
  const location = normalizeFindingText(evidence?.location)
  const quoteWords = quote.split(' ').filter(Boolean)
  const quoteWordSet = new Set(quoteWords)
  let best = null

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'screenplayParagraph' || !node.textContent.trim()) return
    const paragraph = normalizeFindingText(node.textContent)
    const paragraphWords = paragraph.split(' ').filter(Boolean)
    let score = 0

    if (quote && paragraph.includes(quote)) score = 4
    else if (quote && paragraph.length >= 12 && quote.includes(paragraph)) score = 3 + (paragraph.length / Math.max(quote.length, 1))
    else if (quoteWords.length && paragraphWords.length) {
      const overlap = paragraphWords.filter(word => quoteWordSet.has(word)).length
      score = overlap / Math.max(Math.min(quoteWords.length, paragraphWords.length), 1)
      if (paragraphWords.length < 3 && quoteWords.length > paragraphWords.length) score *= 0.2
    }

    if (node.attrs.elementType === 'scene' && location && (location.includes(paragraph) || paragraph.includes(location))) {
      score = Math.max(score, 0.45)
    }

    if (!best || score > best.score) {
      const from = pos + 1
      best = {
        score,
        from,
        to: Math.max(from, Math.min(from + node.content.size, editor.state.doc.content.size)),
      }
    }
  })

  return best?.score >= 0.35 ? best : null
}
