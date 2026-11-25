import { JsonLdScript } from '@/components/json-ld'
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '@/lib/site'
import { publisherJsonLd, videoGameJsonLd, websiteJsonLd } from '@/lib/structured-data'
import type { Metadata } from 'next'
import { HomeView } from './_ui/home-view'

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  alternates: { canonical: '/' },
  // replaces the root's Open Graph block, so the card is restated with the home URL
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    type: 'website',
    locale: 'ja_JP',
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
}

export default function Home() {
  return (
    <>
      <JsonLdScript data={[websiteJsonLd(), publisherJsonLd(), videoGameJsonLd()]} />
      <HomeView />
    </>
  )
}
