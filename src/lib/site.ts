/**
 * Site-wide facts for metadata, robots, the sitemap and structured data. The canonical origin
 * is the www host; the apex domain redirects there, and on the production deployment the
 * middleware 308-redirects the `*.vercel.app` aliases there too.
 */
import type { Metadata } from 'next'

export const SITE_URL = 'https://www.prime-daifugo.jp'
export const SITE_HOST = new URL(SITE_URL).host
/** Hosts whose pages may be indexed (the apex only redirects, but listing it is harmless). */
export const PRODUCTION_HOSTS: readonly string[] = [SITE_HOST, 'prime-daifugo.jp']

export const SITE_NAME = '素数大富豪'
export const SITE_NAME_EN = 'Prime Daifugo'
export const SITE_TITLE = '素数大富豪 - 素数で遊ぶオンライン対戦カードゲーム'
export const SITE_DESCRIPTION =
  '素数大富豪（Prime Daifugo）は、トランプを並べて素数をつくり、場より大きな素数を出し合うカードゲームです。登録不要・無料で、ブラウザから友だちと2〜4人でオンライン対戦できます。ルール解説と素数判定ラボもあります。'
export const SITE_KEYWORDS = [
  '素数大富豪',
  '素数大富豪 オンライン',
  '素数大富豪 ルール',
  '素数',
  'カードゲーム',
  'トランプ',
  'オンライン対戦',
  'ブラウザゲーム',
  'Prime Daifugo',
]

/** Last meaningful content change of each public page (sitemap `lastmod`). */
export const CONTENT_UPDATED = '2026-11-25'

export const EXTERNAL_URLS = {
  /** the official rules this app follows (credited on /rules) */
  officialRules: 'https://primeqk.themedia.jp/pages/4500251/rules',
  feedback: 'https://forms.gle/1Aaexb2zNy39nPPF8',
  releaseNotes: 'https://tomatommy.notion.site/Prime-Daifugo-1fa4870920958036adabf9f4a7185fa2',
  x: 'https://x.com/TomaTommy123',
} as const

/** The public, indexable pages (the sitemap lists exactly these). */
export const PUBLIC_PATHS = ['/', '/rules', '/labo/calc'] as const
export type PublicPath = (typeof PUBLIC_PATHS)[number]

/** Absolute URL on the canonical origin. */
export const absoluteUrl = (path: string): string => new URL(path, SITE_URL).toString()

type Env = Record<string, string | undefined>

/**
 * Whether this deployment may be indexed. Only the Vercel production deployment qualifies;
 * previews, local builds and `next dev` are kept out of search results. Read per request
 * (middleware, robots.txt), never baked into prerendered pages, so a page can never ship a
 * build-time `noindex` that disagrees with robots.txt.
 */
export const isProductionDeployment = (env: Env = process.env): boolean =>
  env.VERCEL_ENV === 'production'

/**
 * Whether this is the production deployment running on Vercel itself. Only then do requests on
 * other hosts (`*.vercel.app` aliases) get redirected to the canonical origin; a local
 * `next start` with `VERCEL_ENV=production` keeps serving localhost.
 */
export const isVercelProduction = (env: Env = process.env): boolean =>
  env.VERCEL === '1' && isProductionDeployment(env)

/** `X-Robots-Tag` value for responses that must stay out of search results. */
export const X_ROBOTS_NOINDEX = 'noindex, nofollow'

/** Whether a request host (from the `host` header, port allowed) serves indexable pages. */
export const isProductionHost = (host: string | null | undefined): boolean => {
  if (!host) {
    return false
  }
  const name = host.split(':')[0]?.toLowerCase() ?? ''
  return PRODUCTION_HOSTS.includes(name)
}

/** The generated share card (`app/opengraph-image.tsx`), used for Open Graph and X alike. */
export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_ALT = '素数大富豪 - 素数を出し合うオンライン対戦カードゲーム'
/**
 * Bump whenever the card's design changes. The image is served `immutable` for a year and
 * unfurlers (X, Facebook, LINE) cache by URL, so a new version needs a new URL.
 */
export const OG_IMAGE_VERSION = 1
export const OG_IMAGE_PATH = `/opengraph-image?v=${OG_IMAGE_VERSION}`
export const OG_IMAGE = {
  url: OG_IMAGE_PATH,
  ...OG_SIZE,
  alt: OG_ALT,
  type: 'image/png',
} as const

/** The site's X account (`twitter:site` / `twitter:creator`). */
export const X_HANDLE = '@TomaTommy123'
export const TWITTER_ACCOUNT = { site: X_HANDLE, creator: X_HANDLE } as const

/** Robots metadata for pages that must never appear in search results. */
export const NOINDEX: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
}

type PageMetadataInput = {
  /**
   * the page title; the root layout's template appends ` | 素数大富豪` unless `absoluteTitle`
   * is set (for titles that already start with the site name)
   */
  title: string
  absoluteTitle?: boolean
  description: string
  path: PublicPath
}

/**
 * Metadata for an indexable page: title, description, a canonical link and Open Graph /
 * Twitter fields for that URL. A page that sets `openGraph` replaces the root's, including
 * the images Next.js derives from the root image files, so the card is restated here.
 */
export function pageMetadata({
  title,
  absoluteTitle = false,
  description,
  path,
}: PageMetadataInput): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      type: 'article',
      siteName: SITE_NAME,
      locale: 'ja_JP',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      ...TWITTER_ACCOUNT,
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
  }
}

type PrivatePageInput = {
  title: string
  /** link-preview text, e.g. for a room invite; defaults to the site's */
  share?: { title: string; description: string }
}

/**
 * Metadata for a page that must not be indexed (rooms, the name gate, tools). It still gets a
 * link preview, without `og:url`, so a shared invite link keeps pointing at itself rather than
 * at the home page the root metadata names.
 */
export function privatePageMetadata({ title, share }: PrivatePageInput): Metadata {
  const card = share ?? { title: SITE_TITLE, description: SITE_DESCRIPTION }
  return {
    title,
    robots: NOINDEX,
    openGraph: {
      ...card,
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ja_JP',
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', ...TWITTER_ACCOUNT, ...card, images: [OG_IMAGE] },
  }
}
