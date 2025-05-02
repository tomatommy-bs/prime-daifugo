import { CONFIG } from '@/constants/config'
import { PARTYKIT_HOST } from '@/constants/env'
import { redirect } from 'next/navigation'
import PartySocket from 'partysocket'

type Response = {
  roomId: number
}

export default async function RandomRoomPage() {
  const res = await PartySocket.fetch(
    {
      host: PARTYKIT_HOST,
      room: CONFIG.SINGLETON_LOBBY_ROOM_ID,
      party: 'lobby',
      query: {
        q: 'random',
      },
    },
    { cache: 'no-cache' },
  )

  const data: Response = await res.json()
  const roomId = data.roomId
  redirect(`/room/${roomId}`)
}
