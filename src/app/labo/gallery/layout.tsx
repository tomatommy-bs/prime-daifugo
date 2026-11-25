import { privatePageMetadata } from '@/lib/site'
import type { ReactNode } from 'react'

/** The design gallery is a development tool: titled, but kept out of search results. */
export const metadata = privatePageMetadata({ title: 'デザインギャラリー' })

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
