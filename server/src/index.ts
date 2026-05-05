import path from "path";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createChatRepository } from "./chat/chat.repository";
import type { Database } from "./types/database.types";
import { createChatService } from "./chat/chat.service";
import { registerChatHttpRoutes } from "./chat/chat.controller";
import { validateOrigin } from "./middleware/security";
import { toUtcIsoString } from "./utils/date";

const envPath = path.join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

const app = express();
app.use(express.json());

const SOCKET_CORS_ORIGINS =
  (process.env.SOCKET_CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({ origin: SOCKET_CORS_ORIGINS }));

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey =
  (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
const createAuthedClient = (token: string): SupabaseClient<Database> =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const chatRepository = createChatRepository(supabase);
const chatService = createChatService({ repository: chatRepository, createAuthedClient });
registerChatHttpRoutes(app, chatService);

app.get("/health", (_req, res) => {
  res.json({ ok: true, socketJwtAuth: true });
});

app.post("/events", validateOrigin, async (req, res) => {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return res.status(401).json({ error: "unauthorized" });

  const body = req.body as Partial<{ title: unknown; category: unknown; description: unknown; location: unknown; start_at: unknown; end_at: unknown; image_url: unknown }>;

  const title = typeof body.title === "string" ? body.title : "";
  const category = typeof body.category === "string" ? body.category : "";
  const description = typeof body.description === "string" ? body.description : "";
  const location = typeof body.location === "string" ? body.location : "";
  const start_at = typeof body.start_at === "string" ? body.start_at : "";
  const end_at = typeof body.end_at === "string" ? body.end_at : "";
  const image_url = typeof body.image_url === "string" ? body.image_url : null;

  if (!title || !category || !description || !location || !start_at || !end_at) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  let startAtUtc: string;
  let endAtUtc: string;
  try {
    startAtUtc = toUtcIsoString(start_at);
    endAtUtc = toUtcIsoString(end_at);
  } catch {
    return res.status(400).json({ error: "invalid_datetime" });
  }

  const authed = createAuthedClient(token);

  const { data: createdEventId, error } = await authed.rpc("create_event_with_organizer_participation", {
    p_title: title,
    p_category: category,
    p_description: description,
    p_location: location,
    p_start_at: startAtUtc,
    p_end_at: endAtUtc,
    ...(image_url != null ? { p_image_url: image_url } : {}),
  });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ id: createdEventId ?? null });
});

const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 5001;
server.listen(PORT, () => {
  console.log(`HTTP API server: http://localhost:${PORT}`);
  console.log(`  GET /health`);
  console.log(`  CORS origins: ${SOCKET_CORS_ORIGINS.join(", ")}`);
});
