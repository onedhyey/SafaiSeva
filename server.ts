import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { env, supabaseConfigured, geminiConfigured } from "./server/env.ts";
import { mountApiRoutes } from "./server/routes.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Evidence photos/short videos arrive as base64 in the JSON body.
// TODO(B2): move to signed direct-to-storage uploads and drop this limit.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    model: env.geminiModel,
    geminiConfigured: geminiConfigured(),
    supabaseConfigured: supabaseConfigured(),
    authEnabled: env.authEnabled,
  });
});

// ---------------------------------------------------------------------------------------
// SafaiSeva API — all verification / credit logic is server-authoritative (audit C2).
// ---------------------------------------------------------------------------------------
mountApiRoutes(app);

// ---------------------------------------------------------------------------------------
// Vite middleware (dev) / static serving (prod)
// ---------------------------------------------------------------------------------------
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
        `auth: ${env.authEnabled ? "enabled" : "open demo"}`
    );
  });
}

startServer();
