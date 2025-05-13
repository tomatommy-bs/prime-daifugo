import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import './globals.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { ColorSchemeScript, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'

const openGraphImage = {
  title: '新たな素数との出会いを',
}

export const metadata: Metadata = {
  title: '素数大富豪 - 素数で遊ぶカードゲーム',
  description:
    '素数大富豪は、素数を使って遊ぶカードゲームです。オンラインで気楽に遊ぶことができるようになりました。',
  openGraph: {
    title: '素数大富豪 - 素数で遊ぶカードゲーム',
    description:
      '素数大富豪は、素数を使って遊ぶカードゲームです。オンラインで気楽に遊ぶことができるようになりました。',
    type: 'website',
    images: [`/api/og?${new URLSearchParams(openGraphImage)}`],
    locale: 'ja-JP',
    siteName: '素数大富豪',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta
          name="google-site-verification"
          content="OM6MabqtLgm91v3FViWdePee1L56MH4XggcWidSiJFk"
        />
        <Analytics />
        <ColorSchemeScript />
      </head>
      <body className="min-h-screen">
        <MantineProvider>
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
      </body>
    </html>
  )
}
