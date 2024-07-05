import { NextPageProps } from "@repo/ui/utils";
import { Card } from "@repo/ui/components";

export default function Page(props: NextPageProps<"id">) {
  const {
    params: { id },
  } = props;

  return (
    <div>
      {id}
      <Card />
    </div>
  );
}
