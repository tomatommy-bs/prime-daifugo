"use client";

import {
  ActionIcon,
  Button,
  Center,
  Group,
  Paper,
  Text,
  TextInput,
} from "@mantine/core";
import { useInputState } from "@mantine/hooks";
import Cookies from "js-cookie";
import { useRouter, useSearchParams } from "next/navigation";

export default function Page() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [name, setName] = useInputState(Cookies.get("name") || "");
  const isValid = name.length >= 3 && name.length <= 10;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    console.log("first");
    Cookies.set("name", name, { expires: 365 });
    const callback = searchParams.get("callback");
    typeof callback == "string" ? router.push(callback) : router.push("/");
  };

  return (
    <Paper withBorder p={"md"}>
      <Center>
        <Group align="end">
          <ActionIcon>
            <Text>🗑️</Text>
          </ActionIcon>
          <TextInput
            label="name"
            description="3 ~ 10 letters"
            value={name}
            onChange={setName}
          />
          <Button disabled={!isValid} onClick={handleClick}>
            OK
          </Button>
        </Group>
      </Center>
    </Paper>
  );
}
