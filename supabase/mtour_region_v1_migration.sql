-- MTour region v1 — seed five operating regions in branches (지사 = region).
-- Safe to run multiple times. Does not change workflow triggers or paid-lock rules.
--
-- Profile fields (existing):
--   korean_name      → display_name_ko (admin UI)
--   vietnamese_name  → display_name_en / local name (optional)
--   branch_id        → assigned region (guide required; admin primary region v1)
--
-- Tour/settlement:
--   branch_id        → region (required on create)

CREATE UNIQUE INDEX IF NOT EXISTS branches_code_unique ON public.branches (code);

INSERT INTO public.branches (id, name, code, created_at)
VALUES
  (gen_random_uuid(), 'Hanoi', 'HANOI', now()),
  (gen_random_uuid(), 'Da Nang', 'DANANG', now()),
  (gen_random_uuid(), 'Nha Trang', 'NHATRANG', now()),
  (gen_random_uuid(), 'Ho Chi Minh', 'HCM', now()),
  (gen_random_uuid(), 'Phu Quoc', 'PHUQUOC', now()),
  (gen_random_uuid(), 'Grand Ace', 'GRAND_ACE', now())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

COMMENT ON COLUMN public.profiles.korean_name IS 'Guide display name (KO) for Korean admins';
COMMENT ON COLUMN public.profiles.vietnamese_name IS 'Guide English/local display name (optional)';
COMMENT ON COLUMN public.profiles.branch_id IS 'Assigned MTour region (branches.id). Guide required; admin primary region v1.';
COMMENT ON COLUMN public.tours.branch_id IS 'MTour operating region for this tour';
COMMENT ON COLUMN public.settlements.branch_id IS 'MTour operating region (copied from tour/guide)';

-- Optional: assign existing admins/guides to a region manually, e.g.:
-- UPDATE public.profiles SET branch_id = (SELECT id FROM public.branches WHERE code = 'DANANG' LIMIT 1)
-- WHERE email = 'admin@example.com';
