import { HandoffPackage } from "./HandoffPackage";

export default async function HandoffPage({ params }: PageProps<"/handoffs/[id]">) {
  const { id } = await params;
  return <HandoffPackage id={id} />;
}
