import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A read that failed, with a Retry button.
 *
 * Render this only when a read failed and there is nothing to draw: while
 * data is on screen, a failed refetch keeps it there (`useResource` holds the
 * last good result for the same query), so the error is not shown over it.
 * Pass the resource's `isRefreshing` as `retrying`. While a retry is in
 * flight the alert stays, its button busy; it never turns into a skeleton.
 *
 * The button stays focusable while busy (`focusableWhenDisabled`): a natively
 * disabled button would drop focus to `<body>`. The spinner is hidden from
 * assistive tech because `Spinner` carries `aria-label="Loading"`, which
 * would otherwise rename the button "Loading Retry"; the busy state is
 * announced by `aria-disabled` on the button and `aria-busy` on the alert.
 */
export function LoadError({
  title,
  message,
  onRetry,
  retrying = false,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Alert
      variant="destructive"
      aria-busy={retrying || undefined}
      // The Retry button, icon and all, is wider than the 4.5rem (pr-18) the
      // alert keeps clear for its action: a long message would wrap under it.
      className="has-data-[slot=alert-action]:pr-22"
    >
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
          focusableWhenDisabled
          className="data-disabled:opacity-50"
        >
          {retrying ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <RotateCwIcon data-icon="inline-start" />
          )}
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}
