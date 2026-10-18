import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { env, supabaseConfigured, geminiConfigured } from "./server/env.ts";
import { currentIdentityMode } from "./server/principal.ts";
import { createApp } from "./server/app.ts";

// Long-running server for local development and container hosting. On Vercel the same
// app runs as a Function (server/vercel.ts) and the frontend is served as static files.
const app = createApp();
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SafaiSeva server running on http://0.0.0.0:${PORT}`);
    console.log(
      `  gemini: ${geminiConfigured() ? env.geminiModel : "NOT CONFIGURED"} · ` +
        `supabase: ${supabaseConfigured() ? "ok" : "NOT CONFIGURED"} · ` +
        `identity: ${currentIdentityMode()}`
    );
  });
}

startServer();
