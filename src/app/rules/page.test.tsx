import { renderWithProviders } from '@/test-utils'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FAQS, HOW_TO_STEPS, SECTIONS } from './content'
import RulesPage from './page'

const jsonLd = (container: HTMLElement) =>
  [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) =>
    JSON.parse(s.textContent ?? ''),
  ) as Record<string, unknown>[]

describe('/rules', () => {
  it('has one h1 and an h2 for every section', () => {
    renderWithProviders(<RulesPage />)
    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent('素数大富豪のルールと遊び方')
    for (const section of SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(section.title) }))
    }
  })

  it('links every table-of-contents entry to an existing section', () => {
    const { container } = renderWithProviders(<RulesPage />)
    const toc = screen.getByRole('navigation', { name: '目次' })
    const links = within(toc).getAllByRole('link')
    expect(links).toHaveLength(SECTIONS.length)
    for (const link of links) {
      const id = link.getAttribute('href')?.slice(1) ?? ''
      expect(container.querySelector(`section#${id}`)).not.toBeNull()
    }
  })

  it('explains the rules this app implements', () => {
    const { container } = renderWithProviders(<RulesPage />)
    const text = container.textContent ?? ''
    for (const phrase of [
      'グロタンディーク素数',
      '累乗は 1 段',
      'ジョーカーは使いません',
      '1729',
      '15・60・300 秒',
      '4・8・11 枚',
      '40 枚',
      '120 秒',
    ]) {
      expect(text).toContain(phrase)
    }
    // the term lists are real description lists
    expect(container.querySelectorAll('dl dt').length).toBeGreaterThan(10)
  })

  it('credits the official rules', () => {
    renderWithProviders(<RulesPage />)
    const links = screen.getAllByRole('link', { name: /公式ルール/ })
    expect(
      links.some(
        (a) => a.getAttribute('href') === 'https://primeqk.themedia.jp/pages/4500251/rules',
      ),
    ).toBe(true)
  })

  it('links to the game with crawlable anchors', () => {
    renderWithProviders(<RulesPage />)
    expect(screen.getAllByRole('link', { name: /ルームを作/ })[0]).toHaveAttribute(
      'href',
      '/room/new',
    )
    expect(screen.getByRole('link', { name: /素数判定ラボ/ })).toHaveAttribute('href', '/labo/calc')
    expect(screen.getByRole('link', { name: 'ホーム' })).toHaveAttribute('href', '/')
  })

  it('renders every FAQ and step visibly', () => {
    renderWithProviders(<RulesPage />)
    for (const faq of FAQS) {
      expect(screen.getByText(faq.question)).toBeInTheDocument()
    }
    for (const step of HOW_TO_STEPS) {
      expect(screen.getByRole('heading', { level: 3, name: step.name })).toBeInTheDocument()
    }
  })

  it('publishes BreadcrumbList, FAQPage and HowTo JSON-LD matching the page', () => {
    const { container } = renderWithProviders(<RulesPage />)
    const data = jsonLd(container)
    expect(data.map((d) => d['@type'])).toEqual(['BreadcrumbList', 'FAQPage', 'HowTo'])
    const faq = data[1] as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
    expect(faq.mainEntity.map((q) => q.name)).toEqual(FAQS.map((f) => f.question))
    expect(faq.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(FAQS.map((f) => f.answer))
    const howTo = data[2] as { step: { name: string }[] }
    expect(howTo.step.map((s) => s.name)).toEqual(HOW_TO_STEPS.map((s) => s.name))
    for (const d of data) {
      expect(d['@context']).toBe('https://schema.org')
    }
  })
})

describe('/rules content', () => {
  it('shows only real card ranks in the example chips (the 1 is the A)', () => {
    const { container } = renderWithProviders(<RulesPage />)
    const chips = [...container.querySelectorAll('[aria-label^="カード "]')].flatMap((el) =>
      (el.getAttribute('aria-label') ?? '').replace('カード ', '').split('、'),
    )
    expect(chips.length).toBeGreaterThan(0)
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    for (const chip of chips) {
      expect(ranks).toContain(chip)
    }
  })

  it('says the count rules apply to the played cards only, not the expression', () => {
    renderWithProviders(<RulesPage />)
    expect(screen.getByText(/式に使うカードの枚数は数えません/)).toBeInTheDocument()
    expect(screen.getByText(/形が正しくない式.*ペナルティはありません/)).toBeInTheDocument()
  })

  it('links the 57 exception to its section', () => {
    renderWithProviders(<RulesPage />)
    expect(screen.getByRole('link', { name: '57 切り' })).toHaveAttribute('href', '#grothendieck')
  })
})
