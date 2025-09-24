import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  User,
} from "@shared/api";
import { apiUrl } from "@/lib/api";
//edit
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ⚠️ only safe on server
);
//edit
// client/src/services/auth.ts
export async function login({ username, password }: { username: string; password: string }) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: username, password }),
  });

  if (!res.ok) {
    throw new Error((await res.json()).error || "Login failed");
  }

  return res.json(); // { user, profile }
}

//edit
export async function login(username: string, password: string) {
  // authenticate with email = username
  const { data, error } = await supabase.auth.signInWithPassword({
    email: username,
    password,
  });

  if (error) throw new Error(error.message);

  const user = data.user;

  // fetch or create profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // create profile if missing
    const { data: newProfile } = await supabase
      .from("profiles")
      .insert({ id: user.id })
      .single();
    return { user, profile: newProfile };
  }

  return { user, profile };
}

//edit
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
