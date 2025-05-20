import { Container } from '@mantine/core'
import {} from '@tabler/icons-react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <Container>
        <main>{children}</main>
      </Container>
    </section>
  )
}
