import { Analytics } from '@vercel/analytics/react'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import '@mantine/core/styles.layer.css'
import '@mantine/notifications/styles.layer.css'
import { geistMono, geistSans } from '@/design/fonts'
import { MotionProvider } from '@/design/motion-provider'
import { theme } from '@/design/theme'
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'
import DeviceRotateRecommender from './_ui/device-rotate-recommender'
import { NavBurger } from './_ui/nav-burger'

export const metadata: Metadata = {
  title: '素数大富豪 - 素数で遊ぶカードゲーム',
  description: '素数大富豪は、素数を使って遊ぶカードゲームです。オンラインで気楽に遊びましょう',
  openGraph: {
    title: '素数大富豪 - 素数で遊ぶカードゲーム',
    description: '素数大富豪は、素数を使って遊ぶカードゲームです。オンラインで気楽に遊びましょう',
    type: 'website',
    images: [
      {
        url: '/prime-icon-dark.png',
        alt: '素数大富豪 - 素数で遊ぶカードゲーム',
      },
    ],
    locale: 'ja-JP',
    siteName: '素数大富豪',
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
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <MotionProvider>
            <Notifications position="top-right" />
            {children}
            <NavBurger />
            <DeviceRotateRecommender />
          </MotionProvider>
        </MantineProvider>
        <Analytics />
      </body>
    </html>
  )
}
