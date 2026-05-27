-- =============================================================
-- Supabase Dashboard > SQL Editor 에서 실행
-- JWT access_token에 role을 custom claim으로 삽입
-- 미들웨어가 DB 조회 없이 role을 읽을 수 있게 됨
-- =============================================================

-- 1. user_role ENUM이 아직 없으면 생성 (스키마 파일에 있으면 생략)
-- CREATE TYPE user_role AS ENUM ('guide', 'admin', 'staff');

-- 2. JWT custom claims hook 함수
--    Supabase가 JWT 발급 시 자동으로 호출 → app_metadata.role 삽입
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims      jsonb;
  user_role   text;
BEGIN
  -- profiles 테이블에서 role 조회
  SELECT role::text INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- role이 있으면 app_metadata에 삽입
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata}',
      COALESCE(claims->'app_metadata', '{}'::jsonb) || jsonb_build_object('role', user_role)
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- 3. hook 함수에 supabase_auth_admin 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- 4. 일반 사용자는 실행 불가
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;

-- =============================================================
-- Supabase Dashboard > Authentication > Hooks 에서 설정:
--   Hook type : Custom Access Token
--   Schema    : public
--   Function  : custom_access_token_hook
-- =============================================================

-- 5. profiles INSERT/UPDATE 시 app_metadata 동기화 함수 (선택)
--    role이 바뀔 때 기존 세션도 반영하려면 세션 갱신 필요
--    (자동화가 필요하면 Supabase Edge Function으로 처리)

-- 6. 확인용 쿼리
-- SELECT id, email, role FROM public.profiles LIMIT 5;
