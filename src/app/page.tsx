import { Button, Group, Text } from '@mantine/core'
import Link from 'next/link'

function* primeNumberGenerator(): Generator<number, number> {
  let num = 2
  while (true) {
    let isPrime = true
    for (let i = 2; i < num; i++) {
      if (num % i === 0) {
        isPrime = false
        break
      }
    }
    if (isPrime) {
      yield num
    }
    num++
  }
}
const CONFIG = {
  N_ROOM: 8,
} as const

export default function Home() {
  const primes = primeNumberGenerator()
  const rooms = Array.from({ length: CONFIG.N_ROOM }, () => `room-${primes.next().value}`)

  return (
    <main className="md:container mx-auto">
      <h1 className="text-4xl text-center text-white">Welcome to prime-daifugo!</h1>
      <div className="grid grid-cols-4 gap-4">
        {rooms.map((room) => (
          <div key={room} className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title">{room}</h2>
              <div className="card-actions justify-end">
                <Link className="w-full" href={`room/${room}`}>
                  <button className="btn w-full btn-primary">Join</button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Group className="flex justify-end m-4">
        <Link href={'/login'} className="text-right">
          <Button>Change Name</Button>
        </Link>
      </Group>
    </main>
  )
}
