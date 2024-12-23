import { Affix, Button, Container } from '@mantine/core'
import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <Container>
        <main>{children}</main>
        <footer>
          <Affix className="m-4">
            <Link href="/">
              <Button>Home</Button>
            </Link>
          </Affix>
        </footer>
      </Container>
    </section>
  )
}
