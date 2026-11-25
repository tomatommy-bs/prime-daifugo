import { Analytics } from '@vercel/analytics/react'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { geistMono, geistSans } from '@/design/fonts'
import { MotionProvider } from '@/design/motion-provider'
import { ThemeProvider } from '@/design/theme-provider'
import {
  NOINDEX,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  isProductionDeployment,
} from '@/lib/site'
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'
import DeviceRotateRecommender from './_ui/device-rotate-recommender'
import { NavBurger } from './_ui/nav-burger'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  category: 'game',
  // Phone numbers and addresses are never auto-linked: long digit strings here are game numbers.
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
  // Preview and local builds stay out of search results; production pages are indexable.
  robots: isProductionDeployment() ? { index: true, follow: true } : NOINDEX,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    type: 'website',
    locale: 'ja_JP',
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F4EE' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0F13' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`} {...mantineHtmlProps}>
      <head>
        <meta
          name="google-site-verification"
          content="OM6MabqtLgm91v3FViWdePee1L56MH4XggcWidSiJFk"
        />
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className="min-h-dvh">
        <ThemeProvider>
          <MotionProvider>
            <Notifications position="top-right" />
            {children}
            <NavBurger />
            <DeviceRotateRecommender />
          </MotionProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
