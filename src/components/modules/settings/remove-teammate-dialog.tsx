"use client";

import { useId, useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";

import type { ID } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
  type TeamMember,
} from "@/lib/api";
import { fullName } from "@/lib/format";
import { LoadError } from "@/components/common/load-error";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  followsSentence,
  movesAnything,
  removalSummary,
  removedDescription,
} from "./team-copy";

/**
 * Asks before removing `member`, and says what happens to what they hold.
 *
 * It reads `api.users.removalPreview()` as it opens: the counts of what
 * moves, and the API's own refusal sentence when removal is not allowed
 * (an automation names them, say). Refused: the sentence and a Close
 * button, nothing to confirm. Otherwise it names the non-zero counts
 * ("2 contacts and 1 deal move to Jordan Reyes."), says follows are
 * dropped, offers "Move their records to" (the other teammates, you first
 * and by default), and a destructive "Remove <first name>". Cancel comes
 * first and takes focus as it opens.
 *
 * Confirming keeps the dialog open with the button pending ("Removing…").
 * The button stays focusable meanwhile (`focusableWhenDisabled`), so a
 * failure, told in a toast with the API's sentence, leaves the dialog open
 * and focus where it was. Success toasts (saying who has the records now,
 * only when any moved: `removedDescription`), calls `onRemoved` (the caller
 * hides the row and closes the dialog) and keeps the button pending
 * (`done`) through the close. The preview read failing shows a `LoadError`
 * whose Retry invalidates "users".
 */
export function RemoveTeammateDialog({
  open,
  onOpenChange,
  member,
  you,
  teammates,
  onRemoved,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember;
  /** The current user: the default home for the records. */
  you: TeamMember;
  /** Everyone who could take the records over (not `member`). */
  teammates: readonly TeamMember[];
  onRemoved: (member: TeamMember) => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [removing, setRemoving] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-removal: the result is still to come.
        if (!next && removing) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
        <RemoveTeammateBody
          key={member.id}
          member={member}
          you={you}
          teammates={teammates}
          cancelRef={cancelRef}
          onPendingChange={setRemoving}
          onRemoved={onRemoved}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveTeammateBody({
  member,
  you,
  teammates,
  cancelRef,
  onPendingChange,
  onRemoved,
}: {
  member: TeamMember;
  you: TeamMember;
  teammates: readonly TeamMember[];
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onPendingChange: (pending: boolean) => void;
  onRemoved: (member: TeamMember) => void;
}) {
  const targetId = useId();
  const name = fullName(member);
  const preview = useResource(
    "users",
    () => api.users.removalPreview(member.id),
    `removal:${member.id}`,
  );
  const [target, setTarget] = useState<ID>(you.id);
  const [remove, removing] = useAction(api.users.remove);
  const [done, setDone] = useState(false);
  const pending = removing || done;

  const others = [you, ...teammates.filter((t) => t.id !== you.id)];
  const targetMember = others.find((t) => t.id === target) ?? you;

  async function confirm() {
    if (pending) return;
    onPendingChange(true);
    try {
      // The default (you) goes as `undefined`, never "".
      await remove(member.id, {
        reassignTo: targetMember.id === you.id ? undefined : targetMember.id,
      });
      setDone(true);
      onPendingChange(false);
      toast.success(`${name} removed from the team`, {
        description: preview.data
          ? removedDescription(preview.data.counts, fullName(targetMember))
          : undefined,
      });
      onRemoved(member);
    } catch (error) {
      onPendingChange(false);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not remove ${member.firstName}.`,
      );
    }
  }

  const loadError = loadErrorOf(preview);
  const data = preview.data;
  const refusal = data?.refusal;
  const canConfirm = data !== undefined && refusal === undefined;
  const somethingMoves = data !== undefined && movesAnything(data.counts);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {refusal ? `${name} can't be removed yet` : `Remove ${name}?`}
        </AlertDialogTitle>
        <AlertDialogDescription
          render={<div />}
          className="flex flex-col gap-2"
        >
          {preview.isLoading && data === undefined ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">Checking what {name} holds…</span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ) : loadError ? (
            <span>Removing {name} needs a look at what they hold first.</span>
          ) : refusal ? (
            <span>{refusal}</span>
          ) : data ? (
            <>
              <span>{removalSummary(data.counts, fullName(targetMember))}</span>
              <span>
                {followsSentence(data.counts.follows, member.firstName)}
              </span>
            </>
          ) : null}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {loadError ? (
        <LoadError
          title={`Could not check what ${member.firstName} holds`}
          message={loadError.message}
          onRetry={() => invalidate("users")}
          retrying={preview.isRefreshing}
        />
      ) : null}

      {canConfirm && somethingMoves ? (
        <Field>
          <FieldLabel htmlFor={targetId}>Move their records to</FieldLabel>
          <Select
            value={targetMember.id}
            readOnly={pending}
            onValueChange={(next) => {
              if (next) setTarget(next as ID);
            }}
          >
            <SelectTrigger id={targetId} className="w-full">
              <SelectValue>
                {(id: string) => {
                  const t = others.find((o) => o.id === id);
                  return t ? teammateLabel(t) : "";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {others.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {teammateLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel ref={cancelRef} disabled={pending}>
          {refusal || loadError ? "Close" : "Cancel"}
        </AlertDialogCancel>
        {canConfirm ? (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            focusableWhenDisabled
            className="data-disabled:opacity-50"
            onClick={() => void confirm()}
          >
            {pending ? <Spinner aria-hidden data-icon="inline-start" /> : null}
            {pending ? "Removing…" : `Remove ${member.firstName}`}
          </Button>
        ) : null}
      </AlertDialogFooter>
    </>
  );
}

/** "Jordan Reyes (you)" or "Priya Nair". */
function teammateLabel(member: TeamMember): string {
  return member.isYou ? `${fullName(member)} (you)` : fullName(member);
}
