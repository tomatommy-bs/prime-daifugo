import { ActionIcon } from '@mantine/core'
import { IconArrowBackUp } from '@tabler/icons-react'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="pt-4">
        <Link href="/" className="text-2xl font-bold text-center m-4">
          <ActionIcon variant="white">
            <IconArrowBackUp />
          </ActionIcon>
        </Link>
      </header>
      <main className="px-2 min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Suspense>{children}</Suspense>
      </main>
    </>
  )
}
