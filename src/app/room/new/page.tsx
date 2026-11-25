import { createRoom } from '@/lib/realtime-http'
import { redirect } from 'next/navigation'

// Every visit reserves a fresh room id; never prerender or cache this route.
export const dynamic = 'force-dynamic'

/**
 * `/room/new` (spec §8.3, RQ-L3): reserve a prime room id from the realtime backend and redirect
 * to it. A failure throws, so the sibling `error.tsx` boundary shows; `loading.tsx` covers the wait.
 */
export default async function NewRoomPage() {
  const { roomId } = await createRoom()
  redirect(`/room/${roomId}`)
}
