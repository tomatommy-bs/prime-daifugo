'use client'

import { CONFIG } from '@/constants/config'
import { PARTYKIT_HOST } from '@/constants/env'
import { ActionIcon, Button, Group, Tooltip } from '@mantine/core'
import {
  IconBrandX,
  IconCalculator,
  IconExternalLink,
  IconMessageReport,
  IconSpeakerphone,
  IconTreadmill,
} from '@tabler/icons-react'
import _ from 'lodash'
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
  const nOnline = _.sum(Object.values(lobbyInfo?.room ?? {})) + (lobbyInfo?.lobby ?? 0)
  return (
    <main className="md:container mx-auto h-screen flex flex-col justify-center">
      <h1 className="text-4xl text-center text-white font-bold">素数大富豪</h1>
      <p className="text-center text-white text-xl">Prime Daifugō</p>

      <p className="text-center mt-8 text-white">
        現在 {nOnline} 名がオンライン <br />
        現在 {lobbyInfo?.lobby ?? '--'} 名がロビーにいます <br />
        {nRooms} つの部屋でゲームプレイ中 <br />
      </p>
      <section className="p-4 bg-white rounded-sm w-fit mx-auto mt-8 flex gap-4 flex-col md:flex-row items-center">
        <Link href={'https://primeqk.themedia.jp/pages/4500251/rules'}>
          <Button variant="outline" rightSection={<IconExternalLink />}>
            ゲームルール
          </Button>
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
        <Group>
          <Tooltip label="フィードバック">
            <Link href={'https://forms.gle/1Aaexb2zNy39nPPF8'}>
              <IconMessageReport />
            </Link>
          </Tooltip>
          <Tooltip label="リリースノート">
            <Link
              href={'https://tomatommy.notion.site/Prime-Daifugo-1fa4870920958036adabf9f4a7185fa2'}
            >
              <IconSpeakerphone />
            </Link>
          </Tooltip>
          <Link href={'https://x.com/TomaTommy123'}>
            <IconBrandX />
          </Link>
        </Group>
      </section>

      <section className="p-4 rounded-sm w-fit mx-auto mt-8 flex gap-4 flex-row items-center flex-nowrap">
        <Tooltip label="素数判定機">
          <Link href={'/labo/calc'} className="flex items-center gap-2">
            <ActionIcon size={'xl'} variant="white">
              <IconCalculator />
            </ActionIcon>
          </Link>
        </Tooltip>
        <Link href={'/labo/training'} className="flex items-center gap-2">
          <Tooltip label="coming soon ..." withArrow={true}>
            <ActionIcon size={'xl'} variant="white" disabled={true}>
              <IconTreadmill />
            </ActionIcon>
          </Tooltip>
        </Link>
      </section>
    </main>
  )
}
