import { NextPageProps } from "@repo/ui/utils";

export default function Page(props: NextPageProps<"id">) {
  const {
    params: { id },
  } = props;

  return <div>{id}</div>;
}
