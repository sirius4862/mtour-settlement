'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials':  '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed':         '이메일 인증이 필요합니다. Supabase → Authentication → Settings에서 "Enable email confirmations"를 해제하세요.',
  'Invalid email or password':  '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Too many requests':           '시도 횟수 초과. 잠시 후 다시 시도해주세요.',
}

function resolveError(msg: string): string {
  for (const [key, val] of Object.entries(AUTH_ERROR_MESSAGES)) {
    if (msg.includes(key)) return val
  }
  return `로그인 실패: ${msg}`
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const nextPath     = searchParams.get('next') ?? ''

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [errMsg,   setErrMsg]   = useState('')
  const [pending,  start]       = useTransition()

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
        email:    email.trim().toLowerCase(),
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

      router.refresh()
      router.push(isSafeNext ? nextPath : '/')
    })
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M4 7h20M4 11h14M6 7v14a1 1 0 001 1h14a1 1 0 001-1V7"
                stroke="white" strokeWidth="1.75"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">M투어 정산</h1>
          <p className="text-slate-400 text-sm mt-1">다낭 현지 가이드 정산 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>

          {errMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm whitespace-pre-line">{errMsg}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              required
              disabled={pending}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl
                         text-white placeholder:text-slate-500
                         focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                         disabled:opacity-50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              비밀번호
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                autoComplete="current-password"
                required
                disabled={pending}
                className="w-full px-4 py-3 pr-12 bg-slate-800 border border-slate-700 rounded-xl
                           text-white placeholder:text-slate-500
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50 transition-colors"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2
                           text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                {showPw ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"
                      stroke="currentColor" strokeWidth="1.25"/>
                    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.25"/>
                    <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"
                      stroke="currentColor" strokeWidth="1.25"/>
                    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.25"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending || !email || !password}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-white font-semibold rounded-xl transition-colors"
          >
            {pending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="white" strokeOpacity="0.3" strokeWidth="2"/>
                  <path d="M8 2a6 6 0 016 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                로그인 중…
              </span>
            ) : '로그인'}
          </button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          계정이 없으면 관리자에게 문의하세요
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}