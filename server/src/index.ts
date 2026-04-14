import path from "path";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { createChatRepository } from "./chat/chat.repository";
import { createChatService } from "./chat/chat.service";
import { registerChatHttpRoutes } from "./chat/chat.controller";
import { registerChatSocket } from "./chat/chat.socket";

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

const supabase = createClient(supabaseUrl, supabaseAnonKey);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const chatRepository = createChatRepository(supabase);
const chatService = createChatService({ supabase, repository: chatRepository });
registerChatHttpRoutes(app, chatService);

app.get("/health", (_req, res) => {
  res.json({ ok: true, socketJwtAuth: true });
});

app.post("/events", async (req, res) => {
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

  const authed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await authed
    .from("events")
    .insert({
      organizer_id: user.id,
      title,
      category,
      description,
      location,
      start_at,
      end_at,
      image_url,
      is_chat_opened: false,
    })
    .select("id")
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ id: data?.id ?? null });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: SOCKET_CORS_ORIGINS, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8,
});

registerChatSocket(io, chatService);

const PORT = Number(process.env.PORT) || 5001;
server.listen(PORT, () => {
  console.log(`HTTP + Socket.io: http://localhost:${PORT}`);
  console.log(`  GET /health — socketJwtAuth: yes`);
  console.log(`  CORS origins: ${SOCKET_CORS_ORIGINS.join(", ")}`);
});
