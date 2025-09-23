import type {
  User,
  UsersListResponse,
  UserCreateRequest,
  UserUpdateRequest,
} from "@shared/api";
import { getToken } from "./auth";
import {
  cacheKeyFor,
  enqueue,
  getCached,
  isOnline,
  setCached,
} from "@/lib/offline";
import { apiUrl } from "@/lib/api";

function withToken(url: string) {
  const t = getToken();
  if (!t) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(t)}`;
}

const LIST_URL = "/api/admin/users"; // logical path

export async function listUsers(): Promise<User[]> {
  const key = cacheKeyFor(LIST_URL);
  // If online, fetch fresh and update cache; on failure or offline, fallback to cache
  if (isOnline()) {
    try {
      const res = await fetch(apiUrl(LIST_URL), {
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        const data = (await res.json()) as UsersListResponse;
        await setCached(key, data.users);
        return data.users;
      }
    } catch {
      // ignore and fallback
    }
  }
  const cached = await getCached<User[]>(key);
  if (cached) return cached;
  // If nothing cached and request failed/offline, throw
  throw new Error("Failed to list users (offline and no cache)");
}

export async function createUser(input: UserCreateRequest): Promise<User> {
  const headers = {
    "Content-Type": "application/json",
  } as Record<string, string>;
  const key = cacheKeyFor(LIST_URL);

  if (!isOnline()) {
    // Optimistic local add
    const temp: User = {
      id: `local-${Date.now()}`,
      username: input.username || input.name,
      name: input.name,
      email: input.email,
      role: input.role,
      active: input.active ?? true,
    };
    const current = (await getCached<User[]>(key)) ?? [];
    await setCached(key, [temp, ...current]);
    await enqueue({ url: LIST_URL, method: "POST", headers, body: input });
    return temp;
  }

  const res = await fetch(apiUrl(LIST_URL), {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok)
    throw new Error(
      ((await res.json()) as any).error || "Failed to create user",
    );
  const created = (await res.json()) as User;
  // Update cache
  const current = (await getCached<User[]>(key)) ?? [];
  await setCached(key, [
    created,
    ...current.filter((u) => !String(u.id).startsWith("local-")),
  ]);
  return created;
}

export async function updateUser(
  id: string,
  patch: UserUpdateRequest,
): Promise<User> {
  const headers = {
    "Content-Type": "application/json",
  } as Record<string, string>;
  const key = cacheKeyFor(LIST_URL);

  if (!isOnline()) {
    // Optimistic update in cache
    const current = (await getCached<User[]>(key)) ?? [];
    const updated = current.map((u) =>
      u.id === id ? ({ ...u, ...patch } as User) : u,
    );
    await setCached<User[]>(key, updated);
    await enqueue({
      url: `${LIST_URL}/${id}`,
      method: "PUT",
      headers,
      body: patch,
    });
    const found = updated.find((u) => u.id === id) as User | undefined;
    if (found) return found;
    // If not in cache, synthesize minimal
    return {
      id,
      username: "",
      name: patch.name || "",
      email: patch.email || "",
      role: (patch as any).role,
      active: (patch as any).active,
    } as User;
  }

  const res = await fetch(apiUrl(`${LIST_URL}/${id}`), {
    method: "PUT",
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok)
    throw new Error(
      ((await res.json()) as any).error || "Failed to update user",
    );
  const updated = (await res.json()) as User;
  const current = (await getCached<User[]>(key)) ?? [];
  await setCached<User[]>(
    key,
    current.map((u) => (u.id === id ? updated : u)),
  );
  return updated;
}

export async function deleteUserApi(id: string): Promise<void> {
  const headers = { ...authHeaders() } as Record<string, string>;
  const key = cacheKeyFor(LIST_URL);

  if (!isOnline()) {
    const current = (await getCached<User[]>(key)) ?? [];
    await setCached<User[]>(
      key,
      current.filter((u) => u.id !== id),
    );
    await enqueue({
      url: `${LIST_URL}/${id}`,
      method: "DELETE",
      headers,
      body: null,
    });
    return;
  }

  const res = await fetch(apiUrl(`${LIST_URL}/${id}`), {
    method: "DELETE",
    headers,
  });
  if (!res.ok)
    throw new Error(
      ((await res.json()) as any).error || "Failed to delete user",
    );
  const current = (await getCached<User[]>(key)) ?? [];
  await setCached<User[]>(
    key,
    current.filter((u) => u.id !== id),
  );
}
