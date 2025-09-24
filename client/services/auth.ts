import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  User,
} from "@shared/api";
import { apiUrl } from "@/lib/api";

const AUTH_KEY = "auth_token";

export function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_KEY, token);
  else localStorage.removeItem(AUTH_KEY);
}

export async function login(
  input: AuthLoginRequest,
): Promise<AuthLoginResponse> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  let json: any = null;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = (json && json.error) ? json.error : `Login failed (${res.status})`;
    throw new Error(msg);
  }
  if (!json) throw new Error("Unexpected response");
  const data = json as AuthLoginResponse;
  setToken(data.token);
  return data;
}

export async function me(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/auth/me?token=${encodeURIComponent(token)}`),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AuthMeResponse;
    return data.user;
  } catch {
    return null;
  }
}

export async function logout() {
  const token = getToken();
  try {
    await fetch(apiUrl(`/api/auth/logout?token=${encodeURIComponent(token)}`), {
      method: "POST",
    });
  } catch {
    // ignore network errors on logout
  }
  setToken(null);
}
