"use client";

import { useMemo, useRef, useState } from "react";
import {
  BanIcon,
  BracesIcon,
  FileTextIcon,
  SendHorizontalIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { Contact, Conversation, MessageTemplate, Snippet } from "@/types";
import * as api from "@/lib/api";
import { useResource, type ComposableChannel } from "@/lib/api";
import { CHANNEL_LABELS, ChannelIcon } from "@/components/common/channel-icon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/lib/format";

export interface ComposerSend {
  channel: ComposableChannel;
  body: string;
  subject?: string;
}

/** A shortcut typed just before the caret, e.g. "…see /pricing|". */
const SHORTCUT_BEFORE_CARET = /(^|\s)(\/[\w-]+)$/;

function smsSegments(length: number): number {
  if (length === 0) return 0;
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

function replySubject(subject: string | undefined): string {
  if (!subject) return "";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

/**
 * The reply box. Channel choice follows `channelOptions()` — the same rule
 * `send()` enforces — so an option is disabled here for exactly the reason
 * the API would reject it. Templates and snippets are merged through
 * `api.templates.render()` at insert time, so what the rep sees is what the
 * contact gets; hand-typed merge fields are filled at send time, and one that
 * has no value blocks the send.
 */
export function Composer({
  conversation,
  contact,
  onSend,
}: {
  conversation: Conversation;
  contact: Contact;
  onSend: (input: ComposerSend) => void;
}) {
  const options = api.conversations.channelOptions(
    contact,
    conversation.channels,
  );
  const fallback = api.conversations.defaultChannel(contact, conversation);

  const [picked, setPicked] = useState<ComposableChannel | undefined>();
  const channel =
    picked && options.some((o) => o.channel === picked && o.available)
      ? picked
      : fallback;

  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(() =>
    replySubject(conversation.subject),
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const templates = useResource("templates", () =>
    api.templates.listTemplates(),
  );
  const snippets = useResource("templates", () => api.templates.listSnippets());

  const tokens = useMemo(
    () => api.templates.findMergeTokens(`${subject}\n${body}`),
    [subject, body],
  );
  // Tokens a render has already reported as having no value — learned when a
  // template or snippet is inserted, or when a send is attempted. The warning
  // is derived from what is still in the draft, so fixing the token (and only
  // that) clears it.
  const [unfillable, setUnfillable] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const blocked = tokens.filter((t) => unfillable.has(t));
  const [isMerging, setIsMerging] = useState(false);

  // Caret position while nothing is selected; null during a selection.
  const [caret, setCaret] = useState<number | null>(null);
  const shortcutMatch =
    caret === null
      ? undefined
      : SHORTCUT_BEFORE_CARET.exec(body.slice(0, caret))?.[2];
  const shortcutSnippet = shortcutMatch
    ? (snippets.data ?? []).find((s) => s.shortcut === shortcutMatch)
    : undefined;

  if (!channel) {
    const reason =
      options.find((o) => o.reason)?.reason ?? "No channel can reach them";
    return (
      <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <BanIcon className="size-4 shrink-0" />
        You can&apos;t message {fullName(contact)}: {reason}.
      </div>
    );
  }

  const canSend = body.trim().length > 0 && !isMerging && blocked.length === 0;

  function learnUnfillable(found: readonly string[]) {
    if (found.length === 0) return;
    setUnfillable((prev) => new Set([...prev, ...found]));
  }

  /**
   * Merge fields typed by hand are filled here, at send time, the way a real
   * backend merges them. Anything with no value blocks the send rather than
   * going out as a literal `{{token}}`.
   */
  async function submit() {
    if (!channel || !canSend) return;
    let text = body.trim();
    let subjectText = channel === "email" ? subject.trim() : "";
    if (tokens.length > 0) {
      setIsMerging(true);
      try {
        const [merged, mergedSubject] = await Promise.all([
          renderFor(text),
          renderFor(subjectText),
        ]);
        const missing = [
          ...new Set([...merged.unresolved, ...mergedSubject.unresolved]),
        ];
        if (missing.length > 0) {
          learnUnfillable(missing);
          return;
        }
        text = merged.text;
        subjectText = mergedSubject.text;
      } catch {
        toast.error("Could not fill in the merge fields.");
        return;
      } finally {
        setIsMerging(false);
      }
    }
    onSend({ channel, body: text, subject: subjectText || undefined });
    setBody("");
    setCaret(0);
    textareaRef.current?.focus();
  }

  async function renderFor(text: string) {
    return api.templates.render(text, { contactId: contact.id });
  }

  /** Inserts at the caret (or replaces `replaceTail` chars before it). */
  function insertText(text: string, replaceTail = 0) {
    const el = textareaRef.current;
    const start = el ? el.selectionStart - replaceTail : body.length;
    const end = el ? el.selectionEnd : body.length;
    const next = body.slice(0, Math.max(0, start)) + text + body.slice(end);
    setBody(next);
    const nextCaret = Math.max(0, start) + text.length;
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function applyTemplate(template: MessageTemplate) {
    setTemplatesOpen(false);
    try {
      const rendered = await renderFor(template.body);
      insertText(rendered.text);
      learnUnfillable(rendered.unresolved);
      if (channel === "email" && template.subject) {
        const renderedSubject = await renderFor(template.subject);
        setSubject(renderedSubject.text);
        learnUnfillable(renderedSubject.unresolved);
      }
    } catch {
      toast.error("Could not load that template.");
    }
  }

  async function applySnippet(snippet: Snippet, replaceTail = 0) {
    setSnippetsOpen(false);
    try {
      const rendered = await renderFor(snippet.body);
      insertText(rendered.text, replaceTail);
      learnUnfillable(rendered.unresolved);
    } catch {
      toast.error("Could not load that snippet.");
    }
  }

  const templateChannel =
    channel === "sms" || channel === "email" ? channel : undefined;
  const visibleTemplates = (templates.data ?? []).filter(
    (t) => !templateChannel || t.channel === templateChannel,
  );

  return (
    <div className="flex flex-col gap-2 border-t bg-background px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={channel}
          onValueChange={(value) => setPicked(value as ComposableChannel)}
        >
          <SelectTrigger size="sm" className="w-36" aria-label="Channel">
            <SelectValue>
              {(value: ComposableChannel) => (
                <span className="flex items-center gap-2">
                  <ChannelIcon channel={value} className="size-4" />
                  {CHANNEL_LABELS[value]}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="top" align="start">
            {options.map((option) => (
              <SelectItem
                key={option.channel}
                value={option.channel}
                disabled={!option.available}
              >
                <ChannelIcon channel={option.channel} className="size-4" />
                <span className="flex flex-col">
                  <span>{CHANNEL_LABELS[option.channel]}</span>
                  {option.reason ? (
                    <span className="text-xs text-muted-foreground">
                      {option.reason}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {channel === "email" ? (
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            className="h-7 min-w-40 flex-1"
          />
        ) : null}
      </div>

      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          const el = event.currentTarget;
          setCaret(
            el.selectionStart === el.selectionEnd ? el.selectionStart : null,
          );
        }}
        onSelect={(event) => {
          const el = event.currentTarget;
          setCaret(
            el.selectionStart === el.selectionEnd ? el.selectionStart : null,
          );
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Tab" && shortcutSnippet && shortcutMatch) {
            event.preventDefault();
            void applySnippet(shortcutSnippet, shortcutMatch.length);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={`Message ${contact.firstName} via ${CHANNEL_LABELS[channel]}…`}
        aria-label="Message"
        className="max-h-48 min-h-20 resize-none"
      />

      {shortcutSnippet ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ZapIcon className="size-3.5" />
          Press <Kbd>Tab</Kbd> to insert &ldquo;{shortcutSnippet.name}&rdquo;
        </p>
      ) : null}
      {blocked.length > 0 ? (
        <p
          className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          role="alert"
        >
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          Replace {blocked.map((t) => `{{${t}}}`).join(", ")} before sending —
          there is no value for {blocked.length === 1 ? "it" : "them"}.
        </p>
      ) : tokens.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BracesIcon className="size-3.5 shrink-0" />
          Merge fields are filled in when you send.
        </p>
      ) : null}

      <div className="flex items-center gap-1">
        <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <PopoverTrigger
            render={<Button variant="ghost" size="sm" />}
            aria-label="Insert template"
          >
            <FileTextIcon />
            Templates
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start" side="top">
            <Command>
              <CommandInput placeholder="Search templates" />
              <CommandList>
                <CommandEmpty>No templates.</CommandEmpty>
                <CommandGroup>
                  {visibleTemplates.map((template) => (
                    <CommandItem
                      key={template.id}
                      value={`${template.name} ${template.category ?? ""}`}
                      onSelect={() => void applyTemplate(template)}
                    >
                      <ChannelIcon
                        channel={template.channel}
                        className="text-muted-foreground"
                      />
                      <span className="truncate">{template.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Popover open={snippetsOpen} onOpenChange={setSnippetsOpen}>
          <PopoverTrigger
            render={<Button variant="ghost" size="sm" />}
            aria-label="Insert snippet"
          >
            <ZapIcon />
            Snippets
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start" side="top">
            <Command>
              <CommandInput placeholder="Search snippets" />
              <CommandList>
                <CommandEmpty>No snippets.</CommandEmpty>
                <CommandGroup>
                  {(snippets.data ?? []).map((snippet) => (
                    <CommandItem
                      key={snippet.id}
                      value={`${snippet.shortcut} ${snippet.name}`}
                      onSelect={() => void applySnippet(snippet)}
                    >
                      <span className="truncate">{snippet.name}</span>
                      <CommandShortcut>{snippet.shortcut}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-3">
          {channel === "sms" && body.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {body.length} chars · {smsSegments(body.length)} segment
              {smsSegments(body.length) === 1 ? "" : "s"}
            </span>
          ) : null}
          <Button size="sm" onClick={() => void submit()} disabled={!canSend}>
            <SendHorizontalIcon />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
