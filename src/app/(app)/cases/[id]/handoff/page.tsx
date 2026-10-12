import { HandoffWizard } from "./HandoffWizard";

export default async function HandoffPage({ params }: PageProps<"/cases/[id]/handoff">) {
  const { id } = await params;
  return <HandoffWizard caseId={id} />;
}
