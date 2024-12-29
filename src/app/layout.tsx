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
  title: '素数大富豪🃏',
  description: '新たな素数との出会いを',
  icons:
    'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text x=%2250%%22 y=%2250%%22 style=%22dominant-baseline:central;text-anchor:middle;font-size:90px;%22>🃏</text></svg>',
  openGraph: {
    title: 'FIND GEMS 💎',
    description: '素数を使った大富豪ゲームです。新たな素数との出会いを。',
    type: 'website',
    images: [`/api/og?${new URLSearchParams(openGraphImage)}`],
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
