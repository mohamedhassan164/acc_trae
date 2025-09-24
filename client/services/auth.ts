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
  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.username,
    password: input.password,
  });
  if (error || !data?.session) {
    throw new Error(error?.message || "Login failed (401)");
  }
  const token = data.session.access_token;
  setToken(token);
  const u = await me();
  if (!u) throw new Error("Login failed: no profile");
  return { token, user: u } as AuthLoginResponse;
}

export async function me(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/auth/me?token=${encodeURIComponent(token)}`),
    );
    if (!res.ok) return null;
    let json: any = null;
    try {
      const text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return (json as AuthMeResponse | null)?.user ?? null;
  } catch {
    return null;
  }
}

export async function logout() {
  const token = getToken();
  try {
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.signOut();
  } catch {}
  try {
    if (token) {
      await fetch(
        apiUrl(`/api/auth/logout?token=${encodeURIComponent(token)}`),
        {
          method: "POST",
        },
      );
    }
  } catch {}
  setToken(null);
}
