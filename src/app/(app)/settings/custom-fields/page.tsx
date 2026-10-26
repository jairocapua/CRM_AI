import type { Metadata } from "next";

import { CustomFieldsSettings } from "@/components/modules/settings/custom-fields-settings";

export const metadata: Metadata = { title: "Custom fields" };

export default function CustomFieldsSettingsPage() {
  return <CustomFieldsSettings />;
}
