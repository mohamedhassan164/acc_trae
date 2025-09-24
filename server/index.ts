import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { loginHandler, logoutHandler, meHandler } from "./routes/auth";
import { createUserHandler, deleteUserHandler, listUsersHandler, updateUserHandler } from "./routes/users";
import { adminCreateUser, adminDeleteUser, adminListUsers, adminUpdateUser } from "./routes/admin-users";

export function createServer() {
  const app = express();
//edit 
// server/src/index.ts

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const { data: { user }, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !user) {
    return res.status(401).json({ error: error?.message || "Invalid credentials" });
  }

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return res.status(400).json({ error: "Login failed: no profile" });
  }

  res.json({ user, profile });
});

  //end edit
  //edit2
  let { data: profile } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", user.id)
  .single();

if (!profile) {
  const { data: newProfile, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: user.id, username: user.email })
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  profile = newProfile;
}

res.json({ user, profile });

  //end edit2
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Auth
  app.post("/api/auth/login", loginHandler);
  app.get("/api/auth/me", meHandler);
  app.post("/api/auth/logout", logoutHandler);

  // Users (legacy in-memory)
  app.get("/api/users", listUsersHandler);
  app.post("/api/users", createUserHandler);
  app.put("/api/users/:id", updateUserHandler);
  app.delete("/api/users/:id", deleteUserHandler);

  // Users (Supabase admin)
  app.get("/api/admin/users", adminListUsers);
  app.post("/api/admin/users", adminCreateUser);
  app.put("/api/admin/users/:id", adminUpdateUser);
  app.delete("/api/admin/users/:id", adminDeleteUser);

  return app;
}
