/**
 * schema.org structured data (JSON-LD) for the public pages. Builders are pure, so tests can
 * check the shapes Google's rich-result parsers expect.
 */
import { SITE_DESCRIPTION, SITE_NAME, SITE_NAME_EN, SITE_URL, absoluteUrl } from './site'

export type JsonLd = {
  '@context': 'https://schema.org'
  '@type': string | string[]
} & Record<string, unknown>

const CONTEXT = 'https://schema.org' as const
const WEBSITE_ID = `${SITE_URL}/#website`
const GAME_ID = `${SITE_URL}/#game`

export function websiteJsonLd(): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: absoluteUrl('/'),
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    description: SITE_DESCRIPTION,
    inLanguage: 'ja',
  }
}

/** The app itself: a free, browser-based multiplayer card game. */
export function videoGameJsonLd(): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': ['VideoGame', 'WebApplication'],
    '@id': GAME_ID,
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    url: absoluteUrl('/'),
    description: SITE_DESCRIPTION,
    image: absoluteUrl('/opengraph-image'),
    inLanguage: 'ja',
    genre: ['カードゲーム', 'パズル', '教育'],
    gamePlatform: 'Web ブラウザ',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    playMode: 'MultiPlayer',
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 4 },
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
    isPartOf: { '@id': WEBSITE_ID },
  }
}

export type Crumb = { name: string; path: string }

export function breadcrumbJsonLd(crumbs: readonly Crumb[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}

export type Faq = { question: string; answer: string }

export function faqJsonLd(faqs: readonly Faq[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}

export type HowToStep = { name: string; text: string; path?: string }

export function howToJsonLd({
  name,
  description,
  steps,
}: {
  name: string
  description: string
  steps: readonly HowToStep[]
}): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'HowTo',
    name,
    description,
    inLanguage: 'ja',
    totalTime: 'PT1M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'JPY', value: '0' },
    step: steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      text: step.text,
      ...(step.path ? { url: absoluteUrl(step.path) } : {}),
    })),
  }
}

/**
 * Serialise for a `<script type="application/ld+json">`. `<` is escaped so no string in the
 * data can close the script element early.
 */
export function serializeJsonLd(data: JsonLd | readonly JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
