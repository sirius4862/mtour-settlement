/**
 * Storage object path inside bucket `receipts`:
 *   {settlement_id}/{receipt_uuid}.{ext}
 *
 * Example:
 *   a1b2c3d4-....-....-....-............../f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg
 */
export function buildReceiptStoragePath(settlementId: string, fileName: string): string {
  const ext = extractExtension(fileName)
  const id = crypto.randomUUID()
  return `${settlementId}/${id}.${ext}`
}

export function extractExtension(fileName: string): string {
  const parts = fileName.split('.')
  const ext = (parts.length > 1 ? parts.pop() : 'jpg')?.toLowerCase() ?? 'jpg'
  if (ext === 'jpeg') return 'jpg'
  return ext.replace(/[^a-z0-9]/g, '') || 'jpg'
}

export function mimeToExtension(mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('heic')) return 'heic'
  if (mimeType.includes('heif')) return 'heif'
  return 'jpg'
}
