import { Button, Group, Text } from "@mantine/core";
import Link from "next/link";

export default function Home() {
  const rooms = [
    "room1",
    "room2",
    "room3",
    "room4",
    "room5",
    "room6",
    "room7",
    "room8",
  ];

  return (
    <main className="md:container mx-auto">
      <h1 className="text-4xl text-center text-white">
        Welcome to prime-daifugo!
      </h1>
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
        <Link href={"/login"} className="text-right">
          <Button>Change Name</Button>
        </Link>
      </Group>
    </main>
  );
}
