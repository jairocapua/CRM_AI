"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CalendarPlusIcon,
  SearchIcon,
  TargetIcon,
  UserIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";

import { useGuardedNavigate } from "@/components/providers/unsaved-changes";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, fullName } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/nav";
import { matchesQuery, usePaletteSearch } from "./command-palette-search";

interface PaletteAction {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

/** Quick actions. Each opens an existing create surface through a URL param
 *  its page reads once and removes (`useOpenFromSearchParam`). */
const ACTIONS: PaletteAction[] = [
  {
    title: "New contact",
    description: "Add a person to your contacts",
    icon: UserPlusIcon,
    href: "/contacts?new=1",
  },
  {
    title: "Book appointment",
    description: "Pick a calendar, a contact and an open time",
    icon: CalendarPlusIcon,
    href: "/calendars?book=1",
  },
];

const noSubscription = () => () => {};

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere. The server (and hydration)
 *  render ⌘K; the client corrects it right after, with no mismatch. */
function useShortcutLabel(): string {
  const isApple = useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    () => true,
  );
  return isApple ? "⌘K" : "Ctrl K";
}

/** An open modal (dialog, sheet, alert dialog) that Ctrl+K must not cover. */
const OTHER_MODAL =
  '[role="dialog"][data-open], [role="alertdialog"][data-open]';

/**
 * The command palette, with the header's Search buttons that open it (the
 * wide one from `sm` up, an icon on phones).
 *
 * Ctrl+K or ⌘K toggles it from anywhere in the app, a text field included
 * (the browser's own shortcut is prevented). It lists the modules (`NAV_ITEMS`)
 * and two quick actions, filtered by a case-insensitive substring of their
 * title or description, and, for a non-empty query, up to five contacts and
 * five deals that `api.contacts.list` / `api.opportunities.list` find. cmdk's
 * own filter is off (`shouldFilter={false}`), so it never re-filters or
 * reorders what the API returned.
 *
 * A pick closes the palette and goes through `useGuardedNavigate`, so a page
 * with unsaved edits asks before it is left; focus then goes back to what
 * had it before the palette opened if the viewer keeps editing. Escape
 * closes the palette and returns focus there too. Opening it again starts
 * with an empty query.
 *
 * A failed search shows an inline message; the modules and actions stay
 * listed. Ctrl+K does nothing while another dialog or sheet is open, so a
 * pick cannot drop what is typed there.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // What had focus when the palette opened (the Search button, a field).
  const openerRef = useRef<HTMLElement | null>(null);
  // False after a pick: the next page, an opened sheet or the unsaved-edits
  // question takes focus, and the closing palette must not take it back.
  const restoreFocusRef = useRef(true);
  const navigate = useGuardedNavigate();
  const shortcut = useShortcutLabel();
  const search = usePaletteSearch(query);

  const openPalette = useCallback(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    restoreFocusRef.current = true;
    setQuery("");
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return;
      event.preventDefault();
      // Holding the keys would toggle it open and shut on every repeat.
      if (event.repeat) return;
      if (open) setOpen(false);
      // Not over another open dialog or sheet: a pick from there would
      // drop what is typed in it without asking.
      else if (!document.querySelector(OTHER_MODAL)) openPalette();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, openPalette]);

  const go = (href: string) => {
    restoreFocusRef.current = false;
    setOpen(false);
    navigate(href, { returnFocus: openerRef.current });
  };

  const navItems = NAV_ITEMS.filter((item) => matchesQuery(item, query));
  const actions = ACTIONS.filter((action) => matchesQuery(action, query));
  const contacts = search.results?.contacts ?? [];
  const deals = search.results?.deals ?? [];
  const nothing =
    navItems.length === 0 &&
    actions.length === 0 &&
    search.results !== null &&
    contacts.length === 0 &&
    deals.length === 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground hidden w-56 justify-start gap-2 font-normal sm:flex"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={openPalette}
      >
        <SearchIcon className="size-4" />
        Search
        <Kbd className="ml-auto">{shortcut}</Kbd>
      </Button>
      {/* Phones: no room for the wide button, so an icon opens the same
          palette. */}
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={openPalette}
      >
        <SearchIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[15%] translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
          showCloseButton={false}
          finalFocus={() => {
            if (!restoreFocusRef.current) return false;
            const opener = openerRef.current;
            return opener?.isConnected ? opener : true;
          }}
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Go to a module, find a contact or deal, or start a quick action.
          </DialogDescription>
          <Command shouldFilter={false} loop label="Command palette">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search modules, contacts and deals…"
            />
            <CommandList className="max-h-[min(24rem,60vh)]">
              {navItems.length > 0 ? (
                <CommandGroup heading="Navigation">
                  {navItems.map((item) => (
                    <PaletteItem
                      key={item.url}
                      value={`nav:${item.url}`}
                      icon={item.icon}
                      title={item.title}
                      detail={item.description}
                      onSelect={() => go(item.url)}
                    />
                  ))}
                </CommandGroup>
              ) : null}
              {actions.length > 0 ? (
                <CommandGroup heading="Actions">
                  {actions.map((action) => (
                    <PaletteItem
                      key={action.href}
                      value={`action:${action.href}`}
                      icon={action.icon}
                      title={action.title}
                      detail={action.description}
                      onSelect={() => go(action.href)}
                    />
                  ))}
                </CommandGroup>
              ) : null}
              {contacts.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Contacts">
                    {contacts.map((contact) => (
                      <PaletteItem
                        key={contact.id}
                        value={`contact:${contact.id}`}
                        icon={UserIcon}
                        title={fullName(contact)}
                        detail={contact.email ?? contact.companyName}
                        onSelect={() => go(`/contacts/${contact.id}`)}
                      />
                    ))}
                  </CommandGroup>
                </>
              ) : null}
              {deals.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Deals">
                    {deals.map((deal) => (
                      <PaletteItem
                        key={deal.id}
                        value={`deal:${deal.id}`}
                        icon={TargetIcon}
                        title={deal.name}
                        detail={formatMoney(deal.value, deal.currency)}
                        onSelect={() => go(`/opportunities/${deal.id}`)}
                      />
                    ))}
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
          {search.pending || search.error || nothing ? (
            <div
              role="status"
              className="text-muted-foreground flex items-center justify-center gap-2 border-t px-3 py-3 text-sm"
            >
              {search.pending ? (
                <>
                  <Spinner />
                  Searching contacts and deals…
                </>
              ) : search.error ? (
                <span className="text-destructive">
                  Could not search contacts and deals. {search.error}
                </span>
              ) : (
                "No results"
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaletteItem({
  value,
  icon: Icon,
  title,
  detail,
  onSelect,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  detail?: string | null;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect}>
      <Icon className="text-muted-foreground" />
      {/* The title keeps its width (up to 70%); the detail truncates first. */}
      <span className="max-w-[70%] shrink-0 truncate font-medium">{title}</span>
      {detail ? (
        // A shortcut slot, so the item's built-in check icon steps aside.
        <CommandShortcut className="min-w-0 truncate pl-2 text-right tracking-normal">
          {detail}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  );
}
