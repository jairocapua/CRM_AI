import type { Metadata } from "next";

import { TagsSettings } from "@/components/modules/settings/tags-settings";

export const metadata: Metadata = { title: "Tags" };

export default function TagsSettingsPage() {
  return <TagsSettings />;
}
