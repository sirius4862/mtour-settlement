import type { NextConfig } from 'next'

const gitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_GIT_SHA ||
  process.env.NEXT_PUBLIC_DEPLOY_SHA ||
  ''

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_DEPLOY_SHA: gitSha,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb', // 영수증 업로드 여유 크기
    },
  },
}

export default nextConfig
