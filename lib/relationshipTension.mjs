export function normalizeRelationshipTension(value, fallback = 0) {
  const fallbackNumber = Number(fallback)
  const safeFallback = Number.isFinite(fallbackNumber) ? fallbackNumber : 0
  const numericValue = Number(value)
  const safeValue = Number.isFinite(numericValue) ? numericValue : safeFallback

  return Math.max(0, Math.min(100, Math.round(safeValue)))
}
