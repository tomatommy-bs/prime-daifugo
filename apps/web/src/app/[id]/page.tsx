import { Card, NextPageProps } from "@repo/ui";
import { Input } from "@mantine/core";

export default function Page(props: NextPageProps<"id">) {
  const {
    params: { id },
  } = props;

  return (
    <div>
      <p className="p-4">{id}</p>
      <Card />
      <Input />
    </div>
  );
}
