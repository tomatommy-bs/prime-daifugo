import { mulberry32 } from '@/shared/rng'
import { renderWithProviders } from '@/test-utils'
import { beatQuestion } from '@/training/beat-field'
import { factorQuestion } from '@/training/factor-hunt'
import { QUESTIONS_PER_RUN } from '@/training/levels'
import { primeQuestion } from '@/training/prime-quiz'
import { RECORDS_KEY } from '@/training/records'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BeatRun } from './beat/beat-run'
import { FactorRun } from './factor/factor-run'
import HubPage from './page'
import { PrimeRun } from './prime/prime-run'

const SEED = 7

const press = (key: string) => fireEvent.keyDown(document.documentElement, { key })

const start = () => fireEvent.click(screen.getByRole('button', { name: /スタート/ }))

const clickHandCard = (card: string) => {
  const el = document.querySelector(`[data-hand] [data-card="${card}"]`)
  if (!el) {
    throw new Error(`no hand card ${card}`)
  }
  fireEvent.click(el)
}

const feedback = () => document.querySelector('[data-feedback]')

afterEach(() => window.localStorage.clear())

describe('/training hub', () => {
  it('links the three modes', () => {
    render(<HubPage />)
    const hrefs = [...document.querySelectorAll('[data-mode]')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/training/prime', '/training/beat', '/training/factor'])
    expect(screen.getByRole('heading', { name: /素数判定トレーニング/ })).toBeInTheDocument()
  })
})

describe('mode 1: prime quiz', () => {
  it('starts on the start screen with no record', () => {
    renderWithProviders(<PrimeRun rng={mulberry32(SEED)} />)
    expect(screen.getByRole('radio', { name: 'やさしい' })).toBeChecked()
    expect(document.querySelector('[data-best]')?.textContent).toBe('記録なし')
  })

  it('runs ten questions, explains each answer and saves the best', () => {
    renderWithProviders(<PrimeRun rng={mulberry32(SEED)} />)
    const mirror = mulberry32(SEED)
    const seen = new Set<number>()
    start()
    for (let i = 0; i < QUESTIONS_PER_RUN; i += 1) {
      const q = primeQuestion(mirror, 'easy', seen)
      seen.add(q.value)
      expect(screen.getByText(`Q${i + 1}`)).toBeInTheDocument()
      expect(screen.getByText(`n = ${q.value}`)).toBeInTheDocument()
      // answer the first one wrong, the rest right
      const right = i > 0
      press(q.prime === right ? 'ArrowLeft' : 'ArrowRight')
      expect(feedback()).toHaveAttribute('data-feedback', right ? 'correct' : 'wrong')
      if (!q.prime) {
        expect(
          within(feedback() as HTMLElement).getByText('なので合成数です。'),
        ).toBeInTheDocument()
      }
      // a second answer is ignored
      press('ArrowLeft')
      fireEvent.click(
        screen.getByRole('button', {
          name: i + 1 === QUESTIONS_PER_RUN ? /結果を見る/ : /次の問題/,
        }),
      )
    }
    const result = screen.getByRole('region', { name: '結果' })
    expect(within(result).getByText('9 問正解')).toBeInTheDocument()
    expect(result.querySelector('[data-new-best]')).not.toBeNull()
    const stored = JSON.parse(window.localStorage.getItem(RECORDS_KEY) ?? '{}')
    expect(stored['prime:easy']).toMatchObject({ correct: 9, total: 10 })
  })

  it('remembers the chosen level', () => {
    const { unmount } = renderWithProviders(<PrimeRun rng={mulberry32(SEED)} />)
    fireEvent.click(screen.getByRole('radio', { name: 'むずかしい' }))
    expect(document.querySelector('[data-level-detail]')?.textContent).toContain('4 枚の数')
    unmount()
    renderWithProviders(<PrimeRun rng={mulberry32(SEED)} />)
    expect(screen.getByRole('radio', { name: 'むずかしい' })).toBeChecked()
  })
})

describe('mode 2: beat the field', () => {
  it('accepts the best answer laid out from the hand', () => {
    renderWithProviders(<BeatRun rng={mulberry32(SEED)} />)
    const q = beatQuestion(mulberry32(SEED), 'easy')
    start()
    expect(screen.getByText(`場は ${q.fieldValue}`)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /出す/ })
    expect(submit).toBeDisabled()
    for (const card of q.solutions[0].cards) {
      clickHandCard(card)
    }
    expect(document.querySelector('[data-tray-value]')?.textContent).toContain(
      String(q.solutions[0].value),
    )
    expect(submit).toBeEnabled()
    press('Enter')
    expect(feedback()).toHaveAttribute('data-feedback', 'correct')
    expect(document.querySelector(`[data-solution="${q.solutions[0].value}"]`)).not.toBeNull()
  })

  it('takes a card back when it is tapped again, and lists the answers on give-up', () => {
    renderWithProviders(<BeatRun rng={mulberry32(SEED)} />)
    const q = beatQuestion(mulberry32(SEED), 'easy')
    start()
    clickHandCard(q.hand[0])
    clickHandCard(q.hand[0])
    expect(document.querySelector('[data-tray-value]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /わからない/ }))
    expect(feedback()).toHaveAttribute('data-feedback', 'wrong')
    expect(within(feedback() as HTMLElement).getByText('答え')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-solution]').length).toBe(
      Math.min(8, q.solutions.length),
    )
  })
})

describe('mode 3: composite play', () => {
  it('accepts a pattern built from the two trays', () => {
    renderWithProviders(<FactorRun rng={mulberry32(SEED)} />)
    const q = factorQuestion(mulberry32(SEED), 'easy')
    const pattern = q.patterns[0]
    start()
    for (const card of pattern.composite) {
      clickHandCard(card)
    }
    expect(document.querySelector('[data-composite-value]')?.textContent).toBe(
      String(pattern.value),
    )
    fireEvent.click(screen.getByRole('radio', { name: '式' }))
    for (const token of pattern.expression) {
      if (token === '*') {
        fireEvent.click(screen.getByRole('button', { name: '掛ける' }))
      } else if (token === '^') {
        fireEvent.click(screen.getByRole('button', { name: '累乗' }))
      } else {
        clickHandCard(token)
      }
    }
    fireEvent.click(screen.getByRole('button', { name: /出す/ }))
    expect(feedback()).toHaveAttribute('data-feedback', 'correct')
    const mine = document.querySelector(`[data-pattern="${pattern.key}"]`)
    expect(mine?.className).toContain('border-prime')
  })

  it('explains a wrong expression', () => {
    renderWithProviders(<FactorRun rng={mulberry32(SEED)} />)
    const q = factorQuestion(mulberry32(SEED), 'easy')
    start()
    clickHandCard(q.patterns[0].composite[0])
    // an operator alone is malformed
    fireEvent.click(screen.getByRole('button', { name: '掛ける' }))
    fireEvent.click(screen.getByRole('button', { name: /出す/ }))
    expect(feedback()).toHaveAttribute('data-feedback', 'wrong')
    expect(screen.getByText(/式の形が正しくありません/)).toBeInTheDocument()
  })
})
