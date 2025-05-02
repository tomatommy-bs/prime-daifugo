import { redirect } from 'next/navigation'

export default function RandomRoomPage() {
  const roomId = Math.floor(Math.random() * 1000000)
  redirect(`/room/${roomId}`)
}
