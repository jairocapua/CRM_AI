import type { DeliveryOptions } from "@/lib/mock/delivery";
import { invalidate } from "./cache";
import { getTuning } from "./http";

/**
 * How the API layer wires the mock's delivery "server" into the app: failures
 * follow the Demo Data slider (read live), and every status change invalidates
 * conversations so open threads re-render the new status.
 *
 * Internal to `src/lib/api` — deliberately not re-exported from the index, so
 * no component can drive message status.
 */
export const deliveryOptions: DeliveryOptions = {
  failureRate: () => getTuning().failureRate,
  onChange: () => invalidate("conversations"),
};
