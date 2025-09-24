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
  try {
    const { supabase } = await import("@/lib/supabase");
    
    // Authenticate user with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.username,
      password: input.password,
    });
    
    // Handle authentication errors with specific messages
    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        throw new Error("Invalid username or password. Please try again.");
      } else if (error.message.includes("Email not confirmed")) {
        throw new Error("Please verify your email address before logging in.");
      } else {
        throw new Error(error.message || "Login failed. Please try again.");
      }
    }
    
    if (!data?.session) {
      throw new Error("Authentication failed. Please try again later.");
    }
    
    // Store authentication token
    const token = data.session.access_token;
    setToken(token);
    
    // Check if user profile exists, if not create it
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', data.user.id)
      .single();
    
    let profile = profileData;
      
    if (profileError && profileError.code === 'PGRST116') {
      // Create a basic profile if it doesn't exist (PGRST116 = not found)
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: data.user.id,
          email: data.user.email || '',
          name: data.user.email?.split('@')[0] || 'User'
        })
        .select()
        .single();
      
      if (insertError) {
        console.error("Profile creation error:", insertError);
        throw new Error("Could not create user profile. Please contact support.");
      } else {
        profile = newProfile;
      }
    }
    
    // Store user session in localStorage for persistence
    localStorage.setItem('supabase_user', JSON.stringify({
      id: data.user.id,
      email: data.user.email,
      name: profile?.name || data.user.email?.split('@')[0] || 'User'
    }));
    
    // Retrieve user data
    const u = await me();
    if (!u) {
      throw new Error("Could not retrieve user profile. Please try logging in again.");
    }
    
    return { token, user: u } as AuthLoginResponse;
  } catch (error: any) {
    // Clean up on error
    setToken(null);
    throw error;
  }
}

export async function me(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  
  try {
    const { supabase } = await import("@/lib/supabase");
    
    // Get current session from Supabase
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      // Session expired or invalid, clear token
      setToken(null);
      return null;
    }
    
    // Get user data from Supabase
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return null;
    
    // Get user profile from database
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userData.user.id)
      .single();
    
    // Return user data
    return {
      id: userData.user.id,
      username: userData.user.email || '',
      name: profileData?.name || userData.user.email?.split('@')[0] || 'User',
      email: userData.user.email || '',
      role: 'user',
    };
  } catch (error) {
    console.error('Error in me() function:', error);
    return null;
  }
}

export async function logout() {
  try {
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.signOut();
    localStorage.removeItem('supabase_user');
    setToken(null);
    console.log('Successfully logged out');
  } catch (error) {
    console.error('Error during logout:', error);
  }
}
