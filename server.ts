import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { env, supabaseConfigured, geminiConfigured } from "./server/env.ts";
import { mountApiRoutes } from "./server/routes.ts";
import { currentIdentityMode } from "./server/principal.ts";
import { securityHeaders, requestLog } from "./server/http.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
// Behind a load balancer / platform proxy set TRUST_PROXY to its hop count (usually 1) so
// req.ip and req.secure reflect the client. Off by default: trusting a header nobody
// strips lets any caller spoof its IP.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(securityHeaders);
app.use("/api", requestLog);

// Evidence photos/videos are uploaded straight to Storage via a signed URL (audit B2);
// the JSON body now only carries object keys + small derived video keyframes, so a tight
// limit is both safe and a DoS backstop on the unauthenticated surface.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

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
    identityMode: currentIdentityMode(),
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
        `identity: ${currentIdentityMode()}`
    );
  });
}

startServer();
