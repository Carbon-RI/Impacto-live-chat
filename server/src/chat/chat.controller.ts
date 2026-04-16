import rateLimit from "express-rate-limit";
import type { Express, Request } from "express";
import type { createChatService } from "./chat.service";
import { validateOrigin } from "../middleware/security";

type ChatService = ReturnType<typeof createChatService>;

function getBearerToken(req: Request): string {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}

function toStatusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message === "unauthorized") return 401;
  if (message === "forbidden") return 403;
  if (message === "invalid_payload" || message === "invalid_media_url" || message === "text_too_long") return 400;
  if (message === "cloudinary_misconfigured") return 500;
  return 400;
}

export function registerChatHttpRoutes(app: Express, chatService: ChatService) {
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: "too_many_requests",
        message: "Too many requests. Please wait a minute and try again.",
        retryAfterSeconds: 60,
      }),
  });

  app.post("/chat/cloudinary/sign-upload", validateOrigin, apiLimiter, async (req, res) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });

    try {
      const result = await chatService.createUploadSignature(token, process.env);
      return res.json(result);
    } catch (error) {
      return res.status(toStatusCode(error)).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/chat/messages", validateOrigin, apiLimiter, async (req, res) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const body = req.body as Partial<{ event_id: unknown; content: unknown; media_url: unknown }>;
    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    const content = typeof body.content === "string" ? body.content : null;
    const mediaUrl = typeof body.media_url === "string" ? body.media_url : null;

    try {
      const result = await chatService.createMessage({ token, eventId, content, mediaUrl });
      return res.json({ id: result.id });
    } catch (error) {
      return res.status(toStatusCode(error)).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/chat/media/delete", validateOrigin, async (req, res) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const mediaUrl = typeof req.body?.mediaUrl === "string" ? req.body.mediaUrl : "";
    try {
      const result = await chatService.deleteMedia(token, mediaUrl);
      return res.json(result);
    } catch (error) {
      return res.status(toStatusCode(error)).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });
}
