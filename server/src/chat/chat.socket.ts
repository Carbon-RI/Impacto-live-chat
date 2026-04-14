import { v2 as cloudinary } from "cloudinary";
import type { Server } from "socket.io";
import type { createChatService } from "./chat.service";

const MAX_MESSAGE_TEXT = 8000;

type ChatService = ReturnType<typeof createChatService>;

interface ClientSendPayload {
  eventId?: unknown;
  text?: unknown;
  file?: unknown;
}

interface ChatMessagePayload {
  userId: string;
  eventId: string;
  timestamp: string;
  text?: string;
  fileUrl?: string;
  resourceType?: string;
}

export function registerChatSocket(io: Server, chatService: ChatService) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token || typeof token !== "string") return next(new Error("unauthorized"));

    try {
      socket.data.userId = await chatService.getUserIdFromToken(token);
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const verifiedUserId = socket.data.userId as string;

    socket.on("join_room", async (data: unknown) => {
      const raw = data as { eventId?: unknown } | null;
      const eventId = raw && typeof raw.eventId === "string" ? raw.eventId.trim() : "";
      if (!eventId) return;

      socket.join(eventId);
      try {
        const history = await chatService.getMessageHistory(eventId);
        socket.emit("receive_history", history);
      } catch (error) {
        console.error("Messages fetch error:", error);
      }
    });

    socket.on("send_message", async (raw: unknown) => {
      const data = raw as ClientSendPayload;
      const eventId = typeof data.eventId === "string" ? data.eventId.trim() : "";
      if (!eventId) return;

      const rawText = typeof data.text === "string" ? data.text : "";
      const text = rawText.trim().slice(0, MAX_MESSAGE_TEXT);
      const file = typeof data.file === "string" && data.file.startsWith("data:") ? data.file : undefined;
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
        await chatService.createMessage({
          token: socket.handshake.auth.token as string,
          eventId,
          content: responseData.text ?? null,
          mediaUrl: responseData.fileUrl ?? null,
        });
      } catch (error) {
        console.error("Messages save error:", error);
      }
    });
  });
}
