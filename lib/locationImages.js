export const LOCATION_IMAGE_BUCKET = 'location-images'
export const LOCATION_IMAGE_URL_TTL_SECONDS = 60 * 60

const STORAGE_PATH_MARKERS = [
  `/storage/v1/object/public/${LOCATION_IMAGE_BUCKET}/`,
  `/storage/v1/object/authenticated/${LOCATION_IMAGE_BUCKET}/`,
  `/storage/v1/object/sign/${LOCATION_IMAGE_BUCKET}/`,
]

export function locationImageStoragePath(value) {
  const stored = String(value || '').trim()
  if (!stored) return ''
  if (!/^https?:\/\//i.test(stored)) return stored.replace(/^\/+/, '')

  try {
    const url = new URL(stored)
    const marker = STORAGE_PATH_MARKERS.find(candidate => url.pathname.includes(candidate))
    if (!marker) return ''
    return decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length))
  } catch {
    return ''
  }
}

export function locationImageExtension(file) {
  const mimeExtensions = {
    'image/avif':'avif',
    'image/gif':'gif',
    'image/heic':'heic',
    'image/heif':'heif',
    'image/jpeg':'jpg',
    'image/png':'png',
    'image/webp':'webp',
  }
  if (mimeExtensions[file?.type]) return mimeExtensions[file.type]
  return String(file?.name || '')
    .split('.')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'image'
}

export async function resolveLocationImageUrl(client, value, expiresIn = LOCATION_IMAGE_URL_TTL_SECONDS) {
  const stored = String(value || '').trim()
  if (!stored) return ''

  const path = locationImageStoragePath(stored)
  if (!path) return /^https?:\/\//i.test(stored) ? stored : ''

  const { data, error } = await client.storage
    .from(LOCATION_IMAGE_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data?.signedUrl || ''
}
