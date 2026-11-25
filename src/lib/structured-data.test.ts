import { describe, expect, it } from 'vitest'
import {
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
  publisherJsonLd,
  serializeJsonLd,
  videoGameJsonLd,
  websiteJsonLd,
} from './structured-data'

describe('structured data', () => {
  it('describes the website', () => {
    expect(websiteJsonLd()).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      url: 'https://www.prime-daifugo.jp/',
      name: '素数大富豪',
      inLanguage: 'ja',
    })
  })

  it('describes the game as a free 2–4 player video game', () => {
    const game = videoGameJsonLd()
    expect(game['@type']).toEqual(['VideoGame', 'WebApplication'])
    expect(game).toMatchObject({
      name: '素数大富豪',
      playMode: 'MultiPlayer',
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 4 },
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      applicationCategory: 'GameApplication',
    })
    expect(game.image).toBe('https://www.prime-daifugo.jp/opengraph-image?v=1')
    expect(game.author).toEqual({ '@id': 'https://www.prime-daifugo.jp/#publisher' })
  })

  it('names the publisher and links its X profile', () => {
    expect(websiteJsonLd().publisher).toEqual({ '@id': 'https://www.prime-daifugo.jp/#publisher' })
    expect(publisherJsonLd()).toMatchObject({
      '@type': 'Person',
      '@id': 'https://www.prime-daifugo.jp/#publisher',
      sameAs: ['https://x.com/TomaTommy123'],
    })
  })

  it('numbers breadcrumb items from 1 with absolute URLs', () => {
    expect(
      breadcrumbJsonLd([
        { name: 'ホーム', path: '/' },
        { name: 'ルール', path: '/rules' },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://www.prime-daifugo.jp/' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'ルール',
          item: 'https://www.prime-daifugo.jp/rules',
        },
      ],
    })
  })

  it('maps FAQs to Question / Answer pairs', () => {
    expect(faqJsonLd([{ question: 'Q?', answer: 'A.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } },
      ],
    })
  })

  it('numbers HowTo steps and resolves their URLs', () => {
    const howTo = howToJsonLd({
      name: 'N',
      description: 'D',
      steps: [
        { name: 'a', text: 'A', path: '/' },
        { name: 'b', text: 'B' },
      ],
    })
    expect(howTo['@type']).toBe('HowTo')
    expect(howTo.step).toEqual([
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'a',
        text: 'A',
        url: 'https://www.prime-daifugo.jp/',
      },
      { '@type': 'HowToStep', position: 2, name: 'b', text: 'B' },
    ])
  })

  it('escapes < so the JSON cannot close its script element', () => {
    const json = serializeJsonLd(faqJsonLd([{ question: '</script><b>', answer: 'x' }]))
    expect(json).not.toContain('<')
    expect(JSON.parse(json).mainEntity[0].name).toBe('</script><b>')
  })
})
