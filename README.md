# M투어 정산 관리 시스템

다낭 현지 가이드 정산 + 관리자 승인 웹앱 (MVP)

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) |
| 인증 | Supabase Auth |
| 데이터베이스 | Supabase PostgreSQL |
| 파일 저장 | Supabase Storage |
| 상태 관리 | Zustand (sessionStorage persist) |
| 스타일 | Tailwind CSS |
| 배포 | Vercel |

## 프로젝트 구조

```
settlement-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # 루트 레이아웃
│   │   ├── globals.css                   # 전역 스타일
│   │   ├── login/
│   │   │   ├── layout.tsx                # Suspense 래퍼
│   │   │   └── page.tsx                  # 로그인 페이지
│   │   ├── auth/callback/
│   │   │   └── route.ts                  # OAuth/매직링크 콜백
│   │   ├── guide/
│   │   │   ├── layout.tsx                # 가이드 레이아웃 + 하단 탭
│   │   │   ├── page.tsx                  # 가이드 홈 대시보드
│   │   │   └── settlements/
│   │   │       ├── page.tsx              # 정산서 목록
│   │   │       ├── new/page.tsx          # 정산서 작성 (8단계)
│   │   │       └── [id]/
│   │   │           ├── page.tsx          # 정산서 상세
│   │   │           └── SubmitButton.tsx  # 제출 버튼 (Client)
│   │   └── admin/
│   │       ├── layout.tsx                # 관리자 레이아웃
│   │       └── page.tsx                  # 관리자 대시보드 (placeholder)
│   ├── components/
│   │   ├── settlement/
│   │   │   ├── SettlementForm.tsx        # 8단계 폼 오케스트레이터
│   │   │   ├── StepperHeader.tsx         # 진행 헤더 + 하단 버튼
│   │   │   └── Steps.tsx                 # Step0~Step7 컴포넌트
│   │   ├── receipt/
│   │   │   ├── ReceiptUpload.tsx         # 카메라/갤러리 업로드 UI
│   │   │   ├── ReceiptPreviewSheet.tsx   # 전체화면 미리보기
│   │   │   ├── ReceiptGallery.tsx        # 관리자용 갤러리 (Server)
│   │   │   ├── ReceiptGalleryClient.tsx  # 갤러리 Client 컴포넌트
│   │   │   ├── ItemWithReceipt.tsx       # 항목 + 영수증 묶음
│   │   │   ├── useReceiptUpload.ts       # 업로드 훅 (XHR + 재시도)
│   │   │   └── index.ts                  # 배럴 export
│   │   └── ui/
│   │       └── FormPrimitives.tsx        # 모바일 최적화 UI 원자
│   ├── lib/
│   │   ├── actions/
│   │   │   ├── settlementActions.ts      # 정산서 Server Actions
│   │   │   └── receiptActions.ts         # 영수증 Server Actions
│   │   ├── auth/
│   │   │   ├── roles.ts                  # 역할 판단 유틸
│   │   │   └── session.ts                # 서버 guard 함수
│   │   ├── receipt/
│   │   │   └── utils.ts                  # 압축, 검증, 포맷
│   │   ├── stores/
│   │   │   └── settlementStore.ts        # Zustand 폼 상태
│   │   └── supabase/
│   │       ├── client.ts                 # 브라우저 클라이언트
│   │       ├── server.ts                 # 서버 클라이언트
│   │       └── middleware.ts             # 미들웨어 전용 클라이언트
│   ├── middleware.ts                     # 인증 + 역할별 라우팅
│   └── types/
│       ├── index.ts                      # 앱 타입 정의
│       └── database.ts                   # Supabase DB 타입 (스텁)
└── supabase/
    ├── jwt_role_hook.sql                 # JWT custom claim 설정
    └── storage_receipts_policy.sql       # Storage 버킷 + RLS
```

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 열고 Supabase 프로젝트 URL과 anon key를 입력하세요.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Supabase 설정

**순서대로** 실행해야 합니다.

#### ① DB 스키마 적용
Supabase Dashboard → SQL Editor에서 아래 파일을 순서대로 실행:
```
supabase/jwt_role_hook.sql
supabase/storage_receipts_policy.sql
```

별도로 작성된 전체 스키마 SQL (`supabase_schema.sql`)이 있다면 먼저 실행하세요.

#### ② JWT Custom Claim Hook 등록
Supabase Dashboard → Authentication → Hooks:
- Hook type: **Custom Access Token**
- Schema: `public`
- Function: `custom_access_token_hook`

#### ③ Storage 버킷 확인
Supabase Dashboard → Storage에서 `receipts` 버킷이 생성되었는지 확인하세요.

#### ④ 첫 관리자 계정 생성
Supabase Dashboard → Authentication → Users에서 사용자를 초대한 후,
SQL Editor에서 role을 admin으로 설정:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@example.com';
```

### 4. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인하세요.

## 역할별 접근 권한

| 경로 | guide | admin | staff |
|---|---|---|---|
| `/login` | ✅ | ✅ | ✅ |
| `/guide/*` | ✅ | ✅ | ✅ |
| `/admin/*` | ❌ | ✅ | ✅ |

- **guide**: 본인 정산서만 조회/작성/제출
- **admin**: 전체 정산서 조회/승인/반려/지급완료, 가이드 관리
- **staff**: admin과 동일한 조회 권한, 관리 기능 제한

## 정산서 상태 흐름

```
draft → pending → approved → paid
          ↓
       rejected → (가이드 수정 후) → pending
```

- `draft`: 가이드 작성 중 (수정/삭제 가능)
- `pending`: 제출 완료, 관리자 검토 대기
- `approved`: 관리자 승인
- `rejected`: 관리자 반려 (사유 포함, 가이드 재제출 가능)
- `paid`: 지급 완료

## 영수증 업로드 흐름

```
파일 선택 (카메라/갤러리)
  → 클라이언트 압축 (1920px, 82% JPEG)
  → Server Action: signed URL 발급
  → XHR PUT → Supabase Storage (진행률 추적)
  → Server Action: receipts 메타 저장
  → 썸네일 완료 표시
```

## Vercel 배포

```bash
vercel --prod
```

환경 변수를 Vercel Dashboard에서도 동일하게 설정해야 합니다:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 로드맵

**현재 우선순위:** Excel 정산 안정화 → 가이드/관리자 실전 테스트 → 저장/재로드 일관성

향후 단계(투어 배정, 차량회사 워크플로)는 아키텍처만 승인된 상태이며 **아직 구현하지 않습니다.**

→ [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/PRODUCT_WORKFLOW.md`](docs/PRODUCT_WORKFLOW.md)
