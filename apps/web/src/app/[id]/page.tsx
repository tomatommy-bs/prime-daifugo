import { NextPageProps } from "@repo/ui/utils";
import { Card } from "@repo/ui/components";
import { Input } from "@mantine/core";

export default function Page(props: NextPageProps<"id">) {
  const {
    params: { id },
  } = props;

  return (
    <div>
      {id}
      <Card />
      <Input />
    </div>
  );
}
