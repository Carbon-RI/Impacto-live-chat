import path from "path";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const envPath = path.join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

const app = express();

const SOCKET_CORS_ORIGINS = (
  process.env.SOCKET_CORS_ORIGIN ||
  "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: SOCKET_CORS_ORIGINS,
  })
);

const supabaseUrl =
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim() || null;
const supabaseAnonKey =
  (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim() || null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Socket auth disabled: set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env",
    "(or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    "Clients will see connect_error: server_misconfigured until this is fixed."
  );
}

const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    socketJwtAuth: Boolean(supabase),
  });
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: SOCKET_CORS_ORIGINS, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8,
});

const MAX_MESSAGE_TEXT = 8000;

interface ClientSendPayload {
  eventId?: unknown;
  text?: unknown;
  file?: unknown;
  /** Ignored: sender id comes only from JWT-verified `socket.data.userId`. */
  userId?: unknown;
}

interface ChatMessagePayload {
  userId: string;
  eventId: string;
  timestamp: string;
  text?: string;
  fileUrl?: string;
  resourceType?: string;
}

interface MessageRow {
  id: string;
  event_id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
}

/**
 * Trust chain: verify Supabase JWT before the connection is established.
 * Store `user.id` on `socket.data.userId` (Socket.io’s supported place for per-socket state).
 */
io.use(async (socket, next) => {
  if (!supabase) {
    return next(new Error("server_misconfigured"));
  }
  const token = socket.handshake.auth.token;
  if (!token || typeof token !== "string") {
    return next(new Error("unauthorized"));
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user?.id) {
    return next(new Error("unauthorized"));
  }
  socket.data.userId = user.id;
  next();
});

io.on("connection", (socket) => {
  const verifiedUserId = socket.data.userId;

  socket.on("join_room", async (data: unknown) => {
    const raw = data as { eventId?: unknown } | null;
    const eventId =
      raw && typeof raw.eventId === "string" ? raw.eventId.trim() : "";
    if (!eventId) return;

    socket.join(eventId);
    console.log(
      `User ${verifiedUserId} (${socket.id}) joined room: ${eventId}`
    );

    try {
      if (!supabase) return;
      const { data: rows, error } = await supabase
        .from("messages")
        .select("id,event_id,user_id,content,media_url,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Supabase fetch error:", error.message);
        return;
      }

      const history = ((rows ?? []) as MessageRow[]).reverse().map((row) => ({
        userId: row.user_id,
        eventId: row.event_id,
        text: row.content ?? undefined,
        fileUrl: row.media_url ?? undefined,
        timestamp: row.created_at,
      }));
      socket.emit("receive_history", history);
    } catch (err) {
      console.error("Messages fetch error:", err);
    }
  });

  socket.on("send_message", async (raw: unknown) => {
    const data = raw as ClientSendPayload;

    const eventId =
      typeof data.eventId === "string" ? data.eventId.trim() : "";
    if (!eventId) return;

    const rawText = typeof data.text === "string" ? data.text : "";
    const text = rawText.trim().slice(0, MAX_MESSAGE_TEXT);
    const file =
      typeof data.file === "string" && data.file.startsWith("data:")
        ? data.file
        : undefined;

    if (!text && !file) return;

    const responseData: ChatMessagePayload = {
      userId: verifiedUserId,
      eventId,
      timestamp: new Date().toISOString(),
    };
    if (text) responseData.text = text;

    if (file) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(file, {
          resource_type: "auto",
          folder: "impact_livechat",
        });
        responseData.fileUrl = uploadResponse.secure_url;
        responseData.resourceType = uploadResponse.resource_type;
      } catch (error) {
        console.error("Cloudinary Error", error);
        if (!text) {
          socket.emit("send_failed", { reason: "upload_failed" });
          return;
        }
      }
    }

    io.to(eventId).emit("receive_message", responseData);

    try {
      if (!supabase) return;
      const { error } = await supabase.from("messages").insert({
        event_id: eventId,
        user_id: verifiedUserId,
        content: responseData.text ?? null,
        media_url: responseData.fileUrl ?? null,
      });
      if (error) {
        console.error("Supabase insert error:", error.message);
      }
    } catch (err) {
      console.error("Messages save error:", err);
    }
  });

  socket.on("disconnect", () => console.log("User disconnected"));
});

const PORT = Number(process.env.PORT) || 5001;
server.listen(PORT, () => {
  console.log(`HTTP + Socket.io: http://localhost:${PORT}`);
  console.log(
    `  GET /health — socketJwtAuth: ${supabase ? "yes" : "NO (check server/.env)"}`
  );
  console.log(`  CORS origins: ${SOCKET_CORS_ORIGINS.join(", ")}`);
});
