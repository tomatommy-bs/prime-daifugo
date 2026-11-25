import { JsonLdScript } from '@/components/json-ld'
import { SITE_TITLE } from '@/lib/site'
import { publisherJsonLd, videoGameJsonLd, websiteJsonLd } from '@/lib/structured-data'
import type { Metadata } from 'next'
import { HomeView } from './_ui/home-view'

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  alternates: { canonical: '/' },
}

export default function Home() {
  return (
    <>
      <JsonLdScript data={[websiteJsonLd(), publisherJsonLd(), videoGameJsonLd()]} />
      <HomeView />
    </>
  )
}
