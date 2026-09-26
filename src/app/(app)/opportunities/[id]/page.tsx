import { OpportunityDetail } from "@/components/modules/opportunities/detail/opportunity-detail";

export const metadata = { title: "Deal" };

export default async function OpportunityDetailPage({
  params,
}: PageProps<"/opportunities/[id]">) {
  const { id } = await params;
  return <OpportunityDetail id={id} />;
}
