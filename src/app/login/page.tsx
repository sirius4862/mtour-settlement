'use client'

import Image from 'next/image'
import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LOGIN_BUTTON = {
  bg: '#1F2937',
  hover: '#111827',
  active: '#374151',
  shadow: 'shadow-sm shadow-gray-900/10 hover:shadow-md hover:shadow-gray-900/15',
} as const

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed':
    '이메일 인증이 필요합니다. Supabase → Authentication → Settings에서 "Enable email confirmations"를 해제하세요.',
  'Invalid email or password': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Too many requests': '시도 횟수 초과. 잠시 후 다시 시도해주세요.',
}

function resolveError(msg: string): string {
  for (const [key, val] of Object.entries(AUTH_ERROR_MESSAGES)) {
    if (msg.includes(key)) return val
  }
  return `로그인 실패: ${msg}`
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') ?? ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [pending, start] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg('')

    start(async () => {
      let supabase: ReturnType<typeof createClient>
      try {
        supabase = createClient()
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : '클라이언트 초기화 실패')
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        console.error('[login] auth error:', error.status, error.message)
        setErrMsg(resolveError(error.message))
        return
      }

      console.log('[login] success:', data.user.email)

      const isSafeNext =
        nextPath.startsWith('/') &&
        !nextPath.startsWith('//') &&
        nextPath !== '/login'

      const destination =
        isSafeNext && nextPath !== '/' ? nextPath : '/guide'

      router.refresh()
      router.push(destination)
    })
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-5 sm:px-6 py-10 sm:py-12">
        <div className="w-full max-w-[400px]">
          <section
            className="rounded-2xl bg-white px-6 sm:px-8 pt-7 sm:pt-8 pb-8 sm:pb-9
                       border border-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            aria-labelledby="login-heading"
          >
            <div className="flex justify-center mb-6 sm:mb-7">
              <Image
                src="/MTour_logo_transparent.png"
                alt="MTour"
                width={435}
                height={120}
                priority
                className="h-auto w-[min(100%,168px)] sm:w-[min(100%,180px)] max-w-[180px] object-contain"
              />
            </div>

            <h1 id="login-heading" className="sr-only">
              MTour 로그인
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {errMsg && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3"
                  role="alert"
                >
                  <p className="text-sm text-red-800 whitespace-pre-line">{errMsg}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-[#374151]"
                >
                  이메일
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  inputMode="email"
                  required
                  disabled={pending}
                  className="w-full px-4 py-3.5 bg-white border border-[#E5E7EB] rounded-xl
                             text-[#111111] placeholder:text-[#9CA3AF]
                             focus:outline-none focus:border-[#9CA3AF] focus:ring-2 focus:ring-[#111111]/8
                             disabled:opacity-50 transition-[border-color,box-shadow]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-[#374151]"
                >
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    autoComplete="current-password"
                    required
                    disabled={pending}
                    className="w-full px-4 py-3.5 pr-12 bg-white border border-[#E5E7EB] rounded-xl
                               text-[#111111] placeholder:text-[#9CA3AF]
                               focus:outline-none focus:border-[#9CA3AF] focus:ring-2 focus:ring-[#111111]/8
                               disabled:opacity-50 transition-[border-color,box-shadow]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2
                               text-[#9CA3AF] hover:text-[#374151] transition-colors"
                    aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPw ? (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path
                          d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"
                          stroke="currentColor"
                          strokeWidth="1.25"
                        />
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.25" />
                        <path
                          d="M3 3l14 14"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path
                          d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"
                          stroke="currentColor"
                          strokeWidth="1.25"
                        />
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.25" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={pending || !email || !password}
                style={
                  {
                    '--btn-bg': LOGIN_BUTTON.bg,
                    '--btn-hover': LOGIN_BUTTON.hover,
                    '--btn-active': LOGIN_BUTTON.active,
                  } as React.CSSProperties
                }
                className={`w-full py-3.5 mt-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)]
                           active:bg-[var(--btn-active)]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-white text-[0.9375rem] font-semibold rounded-xl
                           transition-[background-color,box-shadow] ${LOGIN_BUTTON.shadow}`}
              >
                {pending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="white"
                        strokeOpacity="0.3"
                        strokeWidth="2"
                      />
                      <path
                        d="M8 2a6 6 0 016 6"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    로그인 중…
                  </span>
                ) : (
                  '로그인'
                )}
              </button>
            </form>
          </section>

          <p className="text-center text-[#9CA3AF] text-xs sm:text-[0.8125rem] mt-6 leading-relaxed">
            계정이 없으면 관리자에게 문의하세요
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
          <div
            className="w-8 h-8 border-2 border-[#1F2937] border-t-transparent rounded-full animate-spin"
            aria-label="로딩"
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
