import type { ID, User } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate } from "./http";

export async function list(): Promise<User[]> {
  return simulate(
    () =>
      Object.values(db.getState().users).sort((a, b) =>
        a.firstName.localeCompare(b.firstName),
      ),
    { canFail: false },
  );
}

export async function me(): Promise<User> {
  return simulate(
    () => {
      const { users, currentUserId } = db.getState();
      return users[currentUserId] ?? notFound("User", currentUserId);
    },
    { canFail: false },
  );
}

export async function get(id: ID): Promise<User> {
  return simulate(() => db.getState().users[id] ?? notFound("User", id), {
    canFail: false,
  });
}

export async function invite(
  input: Pick<User, "firstName" | "lastName" | "email" | "role"> &
    Partial<Pick<User, "jobTitle">>,
): Promise<User> {
  const user = await simulate(
    () => {
      const at = nowIso();
      const record: User = {
        id: newId("usr"),
        timezone: "America/Los_Angeles",
        isActive: true,
        createdAt: at,
        updatedAt: at,
        ...input,
      };
      db.setState((s) => ({ users: { ...s.users, [record.id]: record } }));
      return record;
    },
    { ms: 420 },
  );
  invalidate("users");
  return user;
}

export async function update(id: ID, patch: Partial<User>): Promise<User> {
  const user = await simulate(() => {
    const prev = db.getState().users[id] ?? notFound("User", id);
    const next: User = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ users: { ...s.users, [id]: next } }));
    return next;
  });
  invalidate("users");
  return user;
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const users = { ...s.users };
      delete users[id];
      return { users };
    });
  });
  invalidate("users");
}
