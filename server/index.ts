import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { loginHandler, logoutHandler, meHandler } from "./routes/auth";
import { createUserHandler, deleteUserHandler, listUsersHandler, updateUserHandler } from "./routes/users";

export function createServer() {
  const app = express();

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

  // Users (manager-only)
  app.get("/api/users", listUsersHandler);
  app.post("/api/users", createUserHandler);
  app.put("/api/users/:id", updateUserHandler);
  app.delete("/api/users/:id", deleteUserHandler);

  return app;
}
