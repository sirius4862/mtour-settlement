'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Receipt, SettlementStatus } from '@/types'
import { GUIDE_EDITABLE } from '@/types'
import { buildReceiptStoragePath } from '@/lib/receipt/paths'
import { receiptTargetToColumns } from '@/lib/receipt/targets'
import type { ReceiptTarget } from '@/lib/receipt/types'
import { RECEIPT_ALLOWED_MIME, RECEIPT_BUCKET, RECEIPT_MAX_BYTES } from '@/lib/receipt/types'

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id,role')
    .eq('id', user.id)
    .single()
  return data as { id: string; role: string } | null
}

async function assertReceiptEditable(settlementId: string, guideId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settlements')
    .select('id, status, guide_id')
    .eq('id', settlementId)
    .maybeSingle()

  if (!data || data.guide_id !== guideId) {
    return { ok: false as const, error: '정산서를 찾을 수 없습니다.' }
  }
  if (!GUIDE_EDITABLE.includes(data.status as SettlementStatus)) {
    return { ok: false as const, error: '제출된 정산서는 영수증을 수정할 수 없습니다.' }
  }
  return { ok: true as const, status: data.status as SettlementStatus }
}

function validateMime(mimeType: string): string | null {
  if (!RECEIPT_ALLOWED_MIME.includes(mimeType as (typeof RECEIPT_ALLOWED_MIME)[number])) {
    return '지원하지 않는 파일 형식입니다. (JPEG, PNG, WebP, HEIC)'
  }
  return null
}

/** Step 1 of upload: signed PUT URL for direct client upload to Storage. */
export async function createReceiptUploadUrl(params: {
  settlementId: string
  fileName: string
  mimeType: string
  fileSize: number
}): Promise<{ ok: boolean; signedUrl?: string; path?: string; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide' && !['admin', 'staff'].includes(profile.role)) {
    return { ok: false, error: '권한이 없습니다.' }
  }

  if (params.fileSize > RECEIPT_MAX_BYTES) {
    return { ok: false, error: '파일 크기는 5MB 이하여야 합니다.' }
  }
  const mimeErr = validateMime(params.mimeType)
  if (mimeErr) return { ok: false, error: mimeErr }

  const editable = await assertReceiptEditable(params.settlementId, profile.id)
  if (!editable.ok) return { ok: false, error: editable.error }

  const storagePath = buildReceiptStoragePath(params.settlementId, params.fileName)
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (error || !data) return { ok: false, error: error?.message ?? '업로드 URL 생성 실패' }

  return { ok: true, signedUrl: data.signedUrl, path: storagePath }
}

/** Step 2 of upload: persist metadata in receipts table after Storage PUT succeeds. */
export async function registerReceiptMetadata(params: {
  settlementId: string
  storagePath: string
  fileName: string
  fileSize: number
  mimeType: string
  target: ReceiptTarget
}): Promise<{ ok: boolean; receipt?: Receipt; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }

  const mimeErr = validateMime(params.mimeType)
  if (mimeErr) return { ok: false, error: mimeErr }

  const editable = await assertReceiptEditable(params.settlementId, profile.id)
  if (!editable.ok) return { ok: false, error: editable.error }

  if (params.target.kind !== 'settlement' && !params.target.rowId) {
    return { ok: false, error: '항목 ID가 필요합니다. 임시저장 후 다시 시도하세요.' }
  }

  const supabase = await createClient()
  const fk = receiptTargetToColumns(params.target)

  if (params.target.rowId) {
    const tableMap = {
      hotel: 'hotel_items',
      meal: 'meal_items',
      entrance: 'entrance_items',
      other: 'other_expense_items',
      shopping: 'shopping_items',
      option: 'option_items',
    } as const
    const table = tableMap[params.target.kind as keyof typeof tableMap]
    if (table) {
      const { data: row } = await supabase
        .from(table)
        .select('id')
        .eq('id', params.target.rowId)
        .eq('settlement_id', params.settlementId)
        .maybeSingle()
      if (!row) return { ok: false, error: '연결할 항목을 찾을 수 없습니다.' }
    }
  }

  const { data, error } = await supabase
    .from('receipts')
    .insert({
      settlement_id: params.settlementId,
      ...fk,
      storage_path: params.storagePath,
      file_name: params.fileName,
      file_size: params.fileSize,
      mime_type: params.mimeType,
      uploaded_by: profile.id,
    })
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? '메타 저장 실패' }

  revalidatePath(`/guide/settlements/${params.settlementId}`)
  revalidatePath(`/guide/settlements/${params.settlementId}/edit`)
  return { ok: true, receipt: data as Receipt }
}

export async function deleteReceipt(receiptId: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', receiptId)
    .maybeSingle()

  if (!receipt) return { ok: false, error: '영수증을 찾을 수 없습니다.' }

  const editable = await assertReceiptEditable(receipt.settlement_id, profile.id)
  if (!editable.ok) return { ok: false, error: editable.error }

  if (profile.role === 'guide' && receipt.uploaded_by !== profile.id) {
    return { ok: false, error: '본인이 업로드한 영수증만 삭제할 수 있습니다.' }
  }

  const { error: storageErr } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .remove([receipt.storage_path])
  if (storageErr) return { ok: false, error: storageErr.message }

  const { error: metaErr } = await supabase.from('receipts').delete().eq('id', receiptId)
  if (metaErr) return { ok: false, error: metaErr.message }

  revalidatePath(`/guide/settlements/${receipt.settlement_id}`)
  revalidatePath(`/guide/settlements/${receipt.settlement_id}/edit`)
  return { ok: true }
}

export async function getReceiptSignedUrls(
  receiptIds: string[],
): Promise<{ ok: boolean; urls?: Record<string, string>; error?: string }> {
  if (!receiptIds.length) return { ok: true, urls: {} }

  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, storage_path, settlement_id')
    .in('id', receiptIds)

  if (!receipts?.length) return { ok: true, urls: {} }

  const urls: Record<string, string> = {}
  for (const r of receipts) {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(r.storage_path, 3600)
    if (!error && data?.signedUrl) urls[r.id] = data.signedUrl
  }

  return { ok: true, urls }
}

export async function listSettlementReceipts(
  settlementId: string,
): Promise<{ ok: boolean; receipts?: Receipt[]; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data: settlement } = await supabase
    .from('settlements')
    .select('guide_id')
    .eq('id', settlementId)
    .maybeSingle()

  if (!settlement) return { ok: false, error: '정산서를 찾을 수 없습니다.' }
  if (
    profile.role === 'guide' &&
    settlement.guide_id !== profile.id
  ) {
    return { ok: false, error: '권한이 없습니다.' }
  }

  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('settlement_id', settlementId)
    .order('created_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, receipts: (data ?? []) as Receipt[] }
}
