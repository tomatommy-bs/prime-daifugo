// RQ-O2: a production deploy must point at a public realtime backend.
if (process.env.VERCEL_ENV === 'production') {
  const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() ?? ''
  if (!realtimeUrl || /localhost|127\.0\.0\.1/.test(realtimeUrl)) {
    throw new Error(
      `NEXT_PUBLIC_REALTIME_URL must be set to the public realtime backend for production builds (got "${realtimeUrl}").`,
    )
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A second `next dev` (E2E, screens) next to the owner's dev server must not share `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async redirects() {
    return [
      // the manifest moved to the file convention (`app/manifest.ts`); older installs ask here
      { source: '/manifest.json', destination: '/manifest.webmanifest', permanent: true },
    ]
  },
}

export default nextConfig
