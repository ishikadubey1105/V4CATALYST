import { CaseView } from "@/components/case/CaseView";

export default async function CasePage({ params, searchParams }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <CaseView id={id} tab={one(sp.tab)} focus={one(sp.focus)} />;
}
