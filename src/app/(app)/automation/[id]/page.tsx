import { AutomationDetail } from "@/components/modules/automation/automation-detail";
import { AUTOMATIONS } from "@/lib/automations";

export const metadata = { title: "Automation" };

/**
 * Every automation's page is prerendered: the full set is code, known at
 * build time. Reading the registry here (not through `api.workflows`) is on
 * purpose: this runs once, at build, where the mock's simulated latency and
 * store mean nothing, and it guarantees `next build` evaluates the registry,
 * so a malformed definition fails the build (design §3). An id outside this
 * list still renders on demand (`dynamicParams` stays true) and the page
 * shows "Automation not found", as an unknown contact does.
 */
export function generateStaticParams() {
  return Object.values(AUTOMATIONS).map(({ id }) => ({ id }));
}

export default async function AutomationDetailPage({
  params,
}: PageProps<"/automation/[id]">) {
  const { id } = await params;
  return <AutomationDetail id={id} />;
}
