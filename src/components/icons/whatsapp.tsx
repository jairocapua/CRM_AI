import { cn } from "@/lib/utils";

/**
 * Brand marks are drawn here rather than imported: lucide ships no brand
 * icons, and the channel list needs WhatsApp alongside its lucide siblings.
 *
 * Brand colours are literals, not theme tokens — a logo that shifts hue
 * between light and dark mode stops being the logo.
 */
const WHATSAPP_GREEN = "#25d366";
const WHATSAPP_GREEN_DARK = "#009e2f";

/** The bare glyph: outlined speech bubble with a handset. Inherits colour. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4", className)}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/**
 * The "chat head": the glyph knocked out of a filled green disc, as WhatsApp
 * ships it. Self-contained — no wrapper needed to get the circle.
 */
export function WhatsAppChatHead({
  className,
  title = "WhatsApp",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" role="img" className={cn("size-8", className)}>
      <title>{title}</title>
      <defs>
        <linearGradient id="nimbus-wa-disc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={WHATSAPP_GREEN} />
          <stop offset="100%" stopColor={WHATSAPP_GREEN_DARK} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="12" fill="url(#nimbus-wa-disc)" />
      <path
        fill="#fff"
        d="M16.31 13.6c-.22-.11-1.3-.64-1.5-.71-.2-.08-.35-.11-.5.11-.14.22-.56.71-.69.86-.13.14-.25.16-.47.05-.22-.11-.93-.34-1.77-1.09-.65-.58-1.09-1.3-1.22-1.52-.13-.22-.02-.34.1-.45.1-.1.22-.25.33-.38.11-.13.15-.22.22-.37.07-.14.04-.27-.02-.38-.05-.11-.49-1.19-.68-1.63-.18-.43-.36-.37-.49-.38h-.42c-.15 0-.39.05-.59.27-.2.22-.77.75-.77 1.83s.79 2.12.9 2.27c.11.15 1.55 2.37 3.76 3.32.52.23.93.36 1.25.46.53.17 1.01.15 1.38.09.42-.06 1.3-.53 1.48-1.05.18-.51.18-.95.13-1.04-.06-.09-.2-.15-.42-.26M12.05 19.4h-.01a7.3 7.3 0 0 1-3.72-1.02l-.27-.16-2.77.73.74-2.7-.17-.28a7.3 7.3 0 0 1-1.12-3.89 7.32 7.32 0 0 1 12.49-5.17 7.27 7.27 0 0 1 2.14 5.17 7.32 7.32 0 0 1-7.31 7.32m6.23-13.54A8.75 8.75 0 0 0 12.05 3.3a8.78 8.78 0 0 0-7.62 13.15L3.3 20.7l4.35-1.14a8.78 8.78 0 0 0 4.2 1.07h.01a8.79 8.79 0 0 0 6.42-14.77"
      />
    </svg>
  );
}
