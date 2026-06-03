'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Playfair_Display, Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/client'

const playfair = Playfair_Display({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

const inter = Inter({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

const LOGIN_BUTTON = {
  bg: '#F37021',
  hover: '#E0661E',
  active: '#D15F1A',
} as const

const FOCUS_RING =
  'focus:outline-none focus:border-[#5A3A20]/35 focus:ring-1 focus:ring-[#5A3A20]/12'

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
    <main className="min-h-screen bg-[#F7F4EF] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-5 sm:px-6 py-10 sm:py-12">
        <div className="w-full max-w-[420px]">
          <section
            className="rounded-[24px] bg-white px-7 sm:px-8 pt-9 sm:pt-10 pb-8 sm:pb-9
                       border border-[#E7E2DA]
                       shadow-[0_18px_45px_rgba(17,24,39,0.08)]"
            aria-labelledby="login-heading"
          >
            <header className="flex flex-col items-center text-center mb-7 sm:mb-8">
              <p
                className={`m-0 ${playfair.className} text-[30px] sm:text-[34px] font-normal leading-none
                           tracking-[0.02em] text-[#5A3A20] select-none`}
                aria-label="Mtour"
              >
                <span className="text-[1.12em] leading-none">M</span>tour
              </p>
              <p
                id="login-heading"
                className={`mt-3.5 ${inter.className} text-[14px] font-normal tracking-[0.5px] text-[#7A746E]`}
              >
                Guide Operations Platform
              </p>
            </header>

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
                  className={`block text-sm font-normal text-[#374151] ${inter.className}`}
                >
                  Email
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
                  className={`w-full px-4 py-3.5 bg-white border border-[#DDD6CC] rounded-xl
                             text-[#111111] placeholder:text-[#9CA3AF]
                             disabled:opacity-50 transition-[border-color,box-shadow] ${FOCUS_RING}`}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className={`block text-sm font-normal text-[#374151] ${inter.className}`}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                    disabled={pending}
                    className={`w-full px-4 py-3.5 pr-12 bg-white border border-[#DDD6CC] rounded-xl
                               text-[#111111] placeholder:text-[#9CA3AF]
                               disabled:opacity-50 transition-[border-color,box-shadow] ${FOCUS_RING}`}
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
                className="w-full h-[50px] mt-2 flex items-center justify-center
                           bg-[#F37021] hover:bg-[var(--btn-hover)]
                           active:bg-[var(--btn-active)]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-white text-[0.9375rem] font-semibold rounded-[10px]
                           transition-colors"
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
                    Signing in…
                  </span>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          </section>

          <p
            className={`text-center text-[#B5AFA8] text-xs sm:text-[0.8125rem] mt-6 leading-relaxed ${inter.className}`}
          >
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
        <div className="min-h-screen bg-[#F7F4EF] flex items-center justify-center">
          <div
            className="w-8 h-8 border-2 border-[#F37021] border-t-transparent rounded-full animate-spin"
            aria-label="로딩"
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
