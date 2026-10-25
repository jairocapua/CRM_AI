import { SettingsNav } from "@/components/modules/settings/settings-nav";

/**
 * The settings area: the section nav (a column at `lg`, a scrolling row
 * above the page on smaller screens) beside the section's page. The layout
 * owns the padding, so a section page is just its column of content.
 */
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:flex-row lg:items-start lg:gap-8">
      <SettingsNav />
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}
