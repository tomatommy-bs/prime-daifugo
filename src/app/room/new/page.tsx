import { createRoom } from '@/lib/realtime-http'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

// Every visit reserves a fresh room id; never prerender or cache this route.
export const dynamic = 'force-dynamic'

/**
 * `/room/new` (spec §8.3, RQ-L3): reserve a prime room id from the realtime backend and redirect
 * to it. A failure throws, so the sibling `error.tsx` boundary shows; `loading.tsx` covers the wait.
 */
export default async function NewRoomPage() {
  const { roomId } = await createRoom({ clientIp: clientIp() })
  redirect(`/room/${roomId}`)
}

/** The visitor's IP as the platform proxy reports it (first `x-forwarded-for` hop). */
function clientIp(): string | null {
  const h = headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || h.get('x-real-ip') || null
}
