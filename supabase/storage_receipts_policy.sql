-- =============================================================
-- Supabase Dashboard › SQL Editor 에서 실행
-- receipts 버킷 생성 + Storage RLS 정책
-- =============================================================

-- 1. 버킷 생성 (비공개 — signed URL로만 접근)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,                          -- 비공개 버킷
  5242880,                        -- 5MB 제한
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',                 -- iOS 카메라 기본 포맷
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- =============================================================
-- 2. Storage RLS 정책
--    경로 구조: receipts/{settlement_id}/{uuid}.{ext}
--    settlement_id가 경로 첫 번째 폴더 = 소유권 판단 기준
-- =============================================================

-- 헬퍼: 경로에서 settlement_id 추출
-- 'receipts/abc-123/file.jpg' → 'abc-123'
CREATE OR REPLACE FUNCTION storage.get_settlement_id_from_path(path text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (string_to_array(path, '/'))[1]::uuid
$$;


-- ── 2-1. SELECT (다운로드 / signed URL 생성) ────────────────────────────

CREATE POLICY "receipts_guide_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    -- 관리자/스태프: 전체 접근
    (SELECT role FROM public.profiles WHERE id = auth.uid())
      IN ('admin', 'master_admin')
    OR
    -- 가이드: 본인 정산서 폴더만
    EXISTS (
      SELECT 1 FROM public.settlements s
      WHERE s.id = storage.get_settlement_id_from_path(name)
        AND s.guide_id = auth.uid()
    )
  )
);


-- ── 2-2. INSERT (업로드) ────────────────────────────────────────────────

CREATE POLICY "receipts_guide_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (
    -- 관리자: 제한 없음
    (SELECT role FROM public.profiles WHERE id = auth.uid())
      IN ('admin', 'master_admin')
    OR
    -- 가이드: 본인 + draft/rejected 상태 정산서만 업로드
    EXISTS (
      SELECT 1 FROM public.settlements s
      WHERE s.id = storage.get_settlement_id_from_path(name)
        AND s.guide_id  = auth.uid()
        AND s.status   IN ('draft', 'rejected', 'edit_requested')
    )
  )
);


-- ── 2-3. DELETE (삭제) ──────────────────────────────────────────────────

CREATE POLICY "receipts_guide_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    -- 관리자: 전체 삭제 가능
    (SELECT role FROM public.profiles WHERE id = auth.uid())
      IN ('admin', 'master_admin')
    OR
    -- 가이드: 본인 + draft/rejected 상태만 삭제 가능 (제출 후 삭제 불가)
    EXISTS (
      SELECT 1 FROM public.settlements s
      WHERE s.id = storage.get_settlement_id_from_path(name)
        AND s.guide_id  = auth.uid()
        AND s.status   IN ('draft', 'rejected', 'edit_requested')
    )
  )
);


-- ── 2-4. UPDATE (덮어쓰기 방지) ─────────────────────────────────────────
-- 영수증은 수정하지 않고 삭제 후 재업로드 방식을 사용
-- UPDATE 정책을 만들지 않으면 자동으로 거부됨 (Storage 기본 동작)


-- =============================================================
-- 3. receipts 메타 테이블 RLS (이미 스키마 파일에 있으나 확인용)
-- =============================================================

-- guide가 본인 정산서 영수증만 조회
CREATE POLICY "receipts_meta_guide_select"
ON public.receipts FOR SELECT
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  OR EXISTS (
    SELECT 1 FROM public.settlements s
    WHERE s.id = receipts.settlement_id
      AND s.guide_id = auth.uid()
  )
);

-- guide가 업로드 시 메타 INSERT (draft/rejected 상태 정산서만)
CREATE POLICY "receipts_meta_guide_insert"
ON public.receipts FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.settlements s
    WHERE s.id = settlement_id
      AND s.guide_id = auth.uid()
      AND s.status  IN ('draft', 'rejected', 'edit_requested')
  )
);

-- guide가 본인 영수증 삭제 (draft/rejected만)
CREATE POLICY "receipts_meta_guide_delete"
ON public.receipts FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.settlements s
    WHERE s.id = settlement_id
      AND s.guide_id = auth.uid()
      AND s.status  IN ('draft', 'rejected', 'edit_requested')
  )
);

-- 관리자: 전체 접근
CREATE POLICY "receipts_meta_admin_all"
ON public.receipts FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
);
