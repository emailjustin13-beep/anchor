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
