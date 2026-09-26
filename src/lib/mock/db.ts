import { createStore } from "zustand/vanilla";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

import { EMPTY_DB, SEED_VERSION, type DbState } from "./db-state";
import { quotaSafeStorage } from "./storage";

/**
 * zustand's persist writes on every setState. A kanban drag fires setState on
 * every pointer move, and serialising a ~2MB store sixty times a second janks
 * the board, so writes are coalesced onto a trailing edge. Reads stay
 * synchronous, and a pending write is flushed on pagehide so a refresh mid-
 * debounce cannot lose the last change.
 */
function debounceWrites(base: StateStorage, waitMs: number): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      base.setItem(pending.key, pending.value);
      pending = null;
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (key) =>
      pending?.key === key ? pending.value : base.getItem(key),
    setItem: (key, value) => {
      pending = { key, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, waitMs);
    },
    removeItem: (key) => {
      if (pending?.key === key) pending = null;
      base.removeItem(key);
    },
  };
}

export const db = createStore<DbState>()(
  persist(() => EMPTY_DB, {
    name: "nimbus-crm-db",
    version: SEED_VERSION,
    storage: createJSONStorage(() => debounceWrites(quotaSafeStorage, 250)),
    /**
     * Rehydration is driven manually by DbGate. Without this, persist reads
     * localStorage during module evaluation: the server renders an empty store
     * while the client renders a seeded one, and React throws a hydration
     * mismatch (and may silently discard the client tree).
     */
    skipHydration: true,
    /** Fixtures are demo data — reseed rather than migrate. */
    migrate: () => EMPTY_DB,
  }),
);

export function resetDb() {
  db.setState(EMPTY_DB, true);
}
