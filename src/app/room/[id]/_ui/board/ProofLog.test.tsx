import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProofLog } from './ProofLog'
import type { LogEntry } from './types'

const entries: LogEntry[] = [
  { id: 'c', node: 'carol がパスしました', kind: 'pass' },
  { id: 'b', node: <span>bob が 1013 を出しました</span>, kind: 'play' },
  { id: 'a', node: 'ゲームを開始します' },
]

describe('ProofLog', () => {
  it('numbers entries newest first', () => {
    renderWithProviders(<ProofLog entries={entries} variant="sidebar" />)
    const items = within(screen.getByRole('list', { name: '証明ログ' })).getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-n'))).toEqual(['3', '2', '1'])
    expect(items[0]).toHaveTextContent('(3)')
    expect(items[0]).toHaveTextContent('carol がパスしました')
    expect(items[0]).toHaveAttribute('data-kind', 'pass')
    expect(items[2]).toHaveAttribute('data-kind', 'system')
  })

  it('is a polite live region', () => {
    renderWithProviders(<ProofLog entries={entries} variant="sidebar" />)
    expect(screen.getByRole('list', { name: '証明ログ' })).toHaveAttribute('aria-live', 'polite')
  })

  it('shows margin glyphs per kind', () => {
    renderWithProviders(
      <ProofLog
        entries={[
          { id: 'e', node: 'end', kind: 'end' },
          { id: 'f', node: 'fail', kind: 'fail' },
        ]}
        variant="sidebar"
      />,
    )
    expect(screen.getByText('∎')).toBeInTheDocument()
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    renderWithProviders(<ProofLog entries={[]} variant="sidebar" />)
    expect(screen.getByText('まだ何も証明されていません')).toBeInTheDocument()
  })

  it('drawer variant opens and closes', async () => {
    const onClose = vi.fn()
    const { rerender } = renderWithProviders(
      <ProofLog entries={entries} variant="drawer" opened={false} onClose={onClose} />,
    )
    expect(screen.queryByText('carol がパスしました')).toBeNull()
    rerender(<ProofLog entries={entries} variant="drawer" opened={true} onClose={onClose} />)
    expect(await screen.findByText('carol がパスしました')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalled()
  })
})
