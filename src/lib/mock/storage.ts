import type { StateStorage } from "zustand/middleware";

const memory = new Map<string, string>();
let warned = false;

function warnOnce() {
  if (warned || typeof window === "undefined") return;
  warned = true;
  // Imported lazily so the storage layer stays free of UI dependencies.
  void import("sonner").then(({ toast }) =>
    toast.warning("Demo data is too large to save", {
      description: "Changes will reset when you refresh this page.",
    }),
  );
}

/**
 * localStorage is ~5MB per origin and the seeded workspace lands near 2MB, so a
 * QuotaExceededError is plausible once a user adds data. Degrading to an
 * in-memory map keeps the app usable instead of throwing during a write.
 */
export const quotaSafeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
      warnOnce();
    }
  },
  removeItem: (key) => {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* already gone */
    }
  },
};
