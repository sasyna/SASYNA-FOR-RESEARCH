import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import router from "./routes/index.js";
import { authMiddleware } from "./middlewares/auth.js";
import { supabase } from "./lib/supabase.js";

const app: Express = express();

app.use(cors());

// ── CRITICAL: capture raw body for the Paystack webhook BEFORE json middleware ──
// Paystack HMAC-SHA512 is computed against the exact raw bytes of the request body.
// If we let express.json() parse it first, JSON.stringify(req.body) will differ
// in whitespace/key ordering and the signature check will always fail.
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "2mb" })
);

// All other routes get the normal JSON body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", authMiddleware as express.RequestHandler);
app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const frontendDir = path.join(process.cwd(), "artifacts/sasyna/dist/public");
  app.use(express.static(frontendDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

async function ensureBucket(name: string, mimeTypes: string[]) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === name);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(name, {
      public: false,
      fileSizeLimit: 52428800, // 50 MB
      allowedMimeTypes: mimeTypes,
    });
    if (error) {
      console.error(`Storage bucket '${name}' creation error:`, error.message);
    } else {
      console.log(`Storage bucket '${name}' created successfully.`);
    }
  } else {
    console.log(`Storage bucket '${name}' already exists.`);
  }
}

async function initStorage() {
  try {
    const docTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/x-zip-compressed",
    ];
    await ensureBucket("proposals", docTypes);
    await ensureBucket("completed-work", docTypes);
    await ensureBucket("revisions", docTypes);
  } catch (err) {
    console.error("Failed to initialize storage:", err);
  }
}

async function initDbMigrations() {
  const cols: [string, string, string][] = [
    ["level_pricing",  "complete_research_project_price",    "numeric DEFAULT 0"],
    ["orders",         "uploaded_file_url",                  "text"],
    ["orders",         "uploaded_file_name",                 "text"],
    ["revisions",      "corrected_file_storage_path",        "text"],
  ];
  for (const [table, col, type] of cols) {
    try {
      await supabase.rpc("exec_sql", {
        sql: `ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS ${col} ${type};`,
      });
    } catch {
      // exec_sql RPC may not exist — columns must be added via Supabase SQL editor
    }
  }
}

initStorage();
initDbMigrations();

export default app;
