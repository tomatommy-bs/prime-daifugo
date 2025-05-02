'use client'

import { CONFIG } from '@/constants/config'
import { PARTYKIT_HOST } from '@/constants/env'
import { Button, Tooltip } from '@mantine/core'
import Link from 'next/link'
import usePartySocket from 'partysocket/react'
import { useState } from 'react'

type LobbyInfo = {
  lobby: number
  room: Record<string, number>
}

export default function Home() {
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null)
  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: 'lobby',
    room: CONFIG.SINGLETON_LOBBY_ROOM_ID,
    onMessage: (e) => {
      setLobbyInfo(JSON.parse(e.data))
    },
  })

  const nRooms = Object.keys(lobbyInfo?.room ?? {}).length
  return (
    <main className="md:container mx-auto py-32">
      <h1 className="text-4xl text-center text-white font-bold">素数大富豪</h1>
      <p className="text-center text-white text-xl">Prime Daifugō</p>

      <p className="text-center mt-8 text-white">
        現在 {lobbyInfo?.lobby ?? '--'} 名がロビーにいます <br />
        {nRooms} つの部屋でゲームプレイ中
      </p>
      <section className="p-4 bg-white rounded w-fit mx-auto mt-8 flex gap-4">
        <Link href={'https://primeqk.themedia.jp/pages/4500251/rules'}>
          <Button variant="outline">ゲームルール</Button>
        </Link>
        <Link href={'/room/new'}>
          <Button className="uppercase">ルーム作成</Button>
        </Link>
        <Link href={'/room/random'}>
          <Tooltip label="coming soon ..." withArrow={true}>
            <Button disabled={true} className="uppercase">
              ランダムマッチ
            </Button>
          </Tooltip>
        </Link>
      </section>
    </main>
  )
}
