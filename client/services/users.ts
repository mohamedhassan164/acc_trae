import type { User, UsersListResponse, UserCreateRequest, UserUpdateRequest } from "@shared/api";
import { getToken } from "./auth";

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch("/api/users", { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to list users");
  const data = (await res.json()) as UsersListResponse;
  return data.users;
}

export async function createUser(input: UserCreateRequest): Promise<User> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to create user");
  return (await res.json()) as User;
}

export async function updateUser(id: string, patch: UserUpdateRequest): Promise<User> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to update user");
  return (await res.json()) as User;
}

export async function deleteUserApi(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to delete user");
}
