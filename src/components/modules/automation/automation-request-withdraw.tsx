"use client";

import { useState } from "react";
import { Undo2Icon } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { ApiError, useAction, type AutomationRequestRow } from "@/lib/api";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Withdraw on the asker's own request while it is still "requested". The
 * caller shows it only where the row's `canWithdraw` says so: the rule
 * lives in the API, which refuses anyone else (403) or a request already
 * answered (409).
 *
 * Asks first (`ConfirmDialog`, Cancel focused). Confirming closes the
 * dialog and the button turns pending ("Withdrawing"). It stays focusable
 * while pending (`focusableWhenDisabled`): the dialog hands focus back to
 * it as it closes, and a natively disabled button would drop that focus to
 * `<body>`. A refusal or a failed call says why in a toast, leaves the
 * request as it was, and keeps focus on the button. On success
 * `onWithdrawn` moves focus somewhere that stays, and the button stays
 * pending (`done`) until the refetch the invalidate started re-renders the
 * row without it: in between, the row's `canWithdraw` is stale, and a
 * re-enabled button would offer a second withdraw the API can only refuse.
 */
export function WithdrawRequestButton({
  request,
  onWithdrawn,
}: {
  request: Pick<AutomationRequestRow, "id" | "title">;
  onWithdrawn: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [withdraw, withdrawing] = useAction(api.automationRequests.withdraw);
  const pending = withdrawing || done;

  async function confirm() {
    try {
      await withdraw(request.id);
      setDone(true);
      toast.success("Request withdrawn", { description: request.title });
      onWithdrawn();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not withdraw the request.",
      );
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        focusableWhenDisabled
        className="data-disabled:opacity-50"
        aria-label={`${pending ? "Withdrawing" : "Withdraw"} ${request.title}`}
        onClick={() => setConfirming(true)}
      >
        {pending ? (
          <Spinner aria-hidden data-icon="inline-start" />
        ) : (
          <Undo2Icon data-icon="inline-start" aria-hidden />
        )}
        {pending ? "Withdrawing…" : "Withdraw"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Withdraw this request?"
        description={
          <>
            &ldquo;{request.title}&rdquo; stays in the list as Withdrawn, but
            your developer won&apos;t build it. You can&apos;t undo this; ask
            again with a new request if you change your mind.
          </>
        }
        confirmLabel="Withdraw"
        confirmVariant="destructive"
        onConfirm={() => void confirm()}
      />
    </>
  );
}
