import type { Metadata } from "next";

import { PipelinesSettings } from "@/components/modules/settings/pipelines-settings";

export const metadata: Metadata = { title: "Pipelines" };

export default function PipelinesSettingsPage() {
  return <PipelinesSettings />;
}
