"use client";

import { useId, useMemo, useRef, useState } from "react";
import { UserMinusIcon } from "lucide-react";
import { toast } from "sonner";

import type { ID, UserRole } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  apiNow,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
  type TeamMember,
  type TeamMemberStatus,
} from "@/lib/api";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { USER_ROLES } from "@/lib/validation/team";
import { LoadError } from "@/components/common/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RemoveTeammateDialog } from "./remove-teammate-dialog";
import {
  lastSeenLabel,
  lastSeenLine,
  memberStatusLabel,
  ROLE_LABELS,
} from "./team-copy";

const STATUS_DOTS: Record<TeamMemberStatus, string> = {
  active: TAG_DOT_CLASSES.green,
  // Hollow: invited, not signed in yet.
  pending: "border border-amber-500 bg-transparent",
};

/**
 * The team page body: everyone on the team (`api.users.team()`, the page's
 * one read) in a table with their role, status and when they were last
 * seen, by the demo clock.
 *
 * - Each teammate's role is a Select that saves as it changes; your own
 *   reads as text, since the API refuses to change it.
 * - Remove (never on your own row) opens `RemoveTeammateDialog`, which
 *   previews what moves and to whom. A removed teammate's row goes at once
 *   (`removedIds`), before the refetch, so its Remove cannot be pressed again
 *   on stale data; focus moves to the table's heading.
 * - The read failing shows one `LoadError`; Retry invalidates "users".
 */
export function TeamSettings() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const team = useResource("users", () => api.users.team(), "team");
  const [removedIds, setRemovedIds] = useState<ReadonlySet<ID>>(
    () => new Set(),
  );
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [focusHeading, setFocusHeading] = useState(false);

  const members = useMemo(
    () => (team.data ?? []).filter((m) => !removedIds.has(m.id)),
    [team.data, removedIds],
  );

  const heading = (
    <h2
      ref={headingRef}
      id={headingId}
      tabIndex={-1}
      className="text-sm font-medium outline-none"
    >
      Team members
    </h2>
  );

  if (team.isLoading && team.data === undefined) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        <TeamTableSkeleton />
      </section>
    );
  }
  const loadError = loadErrorOf(team);
  if (loadError) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        <LoadError
          title="Could not load the team"
          message={loadError.message}
          onRetry={() => invalidate("users")}
          retrying={team.isRefreshing}
        />
      </section>
    );
  }

  const now = apiNow();
  const you = members.find((m) => m.isYou);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {heading}
      <div className="rounded-lg border">
        <Table aria-labelledby={headingId}>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-3">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Last seen</TableHead>
              <TableHead className="pr-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const name = fullName(member);
              const lastSeen = lastSeenLabel(member.lastSeenAt, now);
              return (
                <TableRow key={member.id} data-user-id={member.id}>
                  <TableCell className="pl-3 whitespace-normal">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {name}
                        {member.isYou ? (
                          <Badge variant="secondary">You</Badge>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                        <BreakableEmail email={member.email} />
                      </span>
                      {/* Status and last seen have their own columns from md. */}
                      <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs md:hidden">
                        <StatusBadge status={member.status} />
                        <span>{lastSeenLine(member.lastSeenAt, now)}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.isYou ? (
                      <span>{ROLE_LABELS[member.role]}</span>
                    ) : (
                      <RoleSelect member={member} />
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge status={member.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {lastSeen}
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    {member.isYou ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${name}`}
                        onClick={() => {
                          setFocusHeading(false);
                          setRemoving(member);
                          setDialogOpen(true);
                        }}
                      >
                        <UserMinusIcon data-icon="inline-start" aria-hidden />
                        <span className="hidden sm:inline">Remove</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {removing && you ? (
        <RemoveTeammateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          member={removing}
          you={you}
          teammates={members.filter((m) => m.id !== removing.id)}
          onRemoved={(removed) => {
            setRemovedIds((ids) => new Set(ids).add(removed.id));
            setFocusHeading(true);
            setDialogOpen(false);
          }}
          finalFocus={focusHeading ? headingRef : undefined}
        />
      ) : null}
    </section>
  );
}

/**
 * An email address that may wrap after its "@" on a narrow screen, rather
 * than mid-word.
 */
function BreakableEmail({ email }: { email: string }) {
  const at = email.indexOf("@");
  if (at < 0) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

/** "Active" or "Pending", as a badge with a dot. */
function StatusBadge({ status }: { status: TeamMemberStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(status === "pending" && "text-muted-foreground")}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_DOTS[status])}
      />
      {memberStatusLabel(status)}
    </Badge>
  );
}

/**
 * A teammate's role, saved as soon as it changes (`users.update(id, {
 * role })`). It shows the picked role while the save runs and is read-only
 * meanwhile, so saves never overlap. A refused or failed save says why in a
 * toast and the Select goes back to the stored role. After a save it shows
 * the picked role until the refetch brings the stored one.
 */
function RoleSelect({ member }: { member: TeamMember }) {
  const name = fullName(member);
  const [save, saving] = useAction(api.users.update);
  // The role picked, and the stored role it was picked over: once the
  // stored role changes (the refetch), the stored one shows again.
  const [picked, setPicked] = useState<{
    role: UserRole;
    over: UserRole;
  } | null>(null);
  const value =
    picked && picked.over === member.role ? picked.role : member.role;

  async function change(next: UserRole) {
    if (saving || next === value) return;
    setPicked({ role: next, over: member.role });
    try {
      await save(member.id, { role: next });
      toast.success("Role changed", {
        description: `${name} is now ${ROLE_LABELS[next]}.`,
      });
    } catch (error) {
      setPicked(null);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not change ${name}'s role.`,
      );
    }
  }

  return (
    <Select
      value={value}
      readOnly={saving}
      onValueChange={(next) => {
        if (next) void change(next as UserRole);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Role for ${name}`}
        className="min-w-32"
      >
        <SelectValue>
          {(role: string) => ROLE_LABELS[role as UserRole]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {USER_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The table's shape while the first read is in flight. */
function TeamTableSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="hidden h-5 w-16 md:block" />
        </div>
      ))}
    </div>
  );
}
