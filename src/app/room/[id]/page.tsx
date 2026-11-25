'use client'
/**
 * The room page (§6.4): RoomHeader, the board and the proof log.
 * - SSR-safe: the invite URL is read from `window` in an effect, never during render.
 * - `cardSizeOption` (localStorage, unchanged key) sets `data-card-size` on the board root.
 * - During play on compact screens the header collapses into the `⋯` menu.
 * - The log is a ProofLog: a 320px sidebar in `wide`, a Drawer elsewhere (`L` toggles it).
 * - 「退出」 (header): once confirmed, the board's session `leave` runs, then the page goes to
 *   `/` (rebuild spec §3.6). A reload never leaves.
 */
import { useLayoutMode } from '@/design/use-layout-mode'
import { useLocalStorage } from '@mantine/hooks'
import { useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type BoardInfo, RoomChromeContext, RoomHeader } from './_ui/RoomHeader'
import { type LogEntry, ProofLog, useBoardShortcuts } from './_ui/board'
import { GameBoard } from './_ui/game-board'
import { logKindOf } from './_ui/notification-message'

interface Props {
  params: Record<'id', string>
  searchParams: Record<string, string | string[] | undefined>
}

const Page = ({ params: { id } }: Props) => {
  const mode = useLayoutMode()
  const [compSizeOption, setCompSizeOption] = useLocalStorage<'S' | 'M' | 'L'>({
    key: 'cardSizeOption',
    defaultValue: 'M',
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(window.location.href)
  }, [])

  const [logs, setLogs] = useState<LogEntry[]>(() => [
    { id: 'log-0', node: `ここにログが表示されます. RoomID: ${id}`, kind: 'system' },
  ])
  const seq = useRef(0)
  const onLogNotification = useCallback((node: ReactNode) => {
    seq.current += 1
    const entry: LogEntry = { id: `log-${seq.current}`, node, kind: logKindOf(node) }
    setLogs((prev) => [entry, ...prev])
  }, [])

  const [logOpen, setLogOpen] = useState(false)
  const [sidebar, setSidebar] = useState(true)
  const toggleLog = useCallback(() => {
    if (mode === 'wide') {
      setSidebar((v) => !v)
    } else {
      setLogOpen((v) => !v)
    }
  }, [mode])
  useBoardShortcuts({ l: toggleLog })

  const [info, setInfo] = useState<BoardInfo>({ status: null, n: 0 })
  const [leave, setLeave] = useState<(() => Promise<void>) | null>(null)
  const chrome = useMemo(
    () => ({
      onBoardInfo: setInfo,
      toggleLog,
      // wrapped: a bare function passed to setState would be called as an updater
      setLeave: (fn: (() => Promise<void>) | null) => setLeave(() => fn),
    }),
    [toggleLog],
  )
  const router = useRouter()
  const onLeave = leave
    ? async () => {
        await leave()
        router.push('/')
      }
    : undefined
  // phones (landscape and portrait) give the 36px bar to the SeatLine while playing
  const collapsed = (mode === 'compact' || mode === 'portrait') && info.status === 'playing'
  const wideLog = mode === 'wide' && sidebar

  return (
    <RoomChromeContext.Provider value={chrome}>
      <div
        data-card-size={compSizeOption}
        data-layout-mode={mode}
        className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg"
      >
        <RoomHeader
          roomId={id}
          url={url}
          size={compSizeOption}
          onSizeChange={setCompSizeOption}
          onOpenLog={toggleLog}
          n={info.n || undefined}
          collapsed={collapsed}
          qrDefaultOpened={mode !== 'compact'}
          onLeave={onLeave}
        />
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: wideLog ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)' }}
        >
          <main className="min-h-0 overflow-auto py-fib-1 compact:py-0">
            <GameBoard id={id} size={compSizeOption} onLogNotification={onLogNotification} />
          </main>
          {wideLog ? (
            <aside className="min-h-0 border-l border-line">
              <ProofLog entries={logs} variant="sidebar" />
            </aside>
          ) : null}
        </div>
        {mode !== 'wide' ? (
          <ProofLog
            entries={logs}
            variant="drawer"
            opened={logOpen}
            onClose={() => setLogOpen(false)}
          />
        ) : null}
      </div>
    </RoomChromeContext.Provider>
  )
}

export default Page
