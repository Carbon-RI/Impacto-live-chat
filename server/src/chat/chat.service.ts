import { v2 as cloudinary } from "cloudinary";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createChatRepository } from "./chat.repository";

const MAX_MESSAGE_TEXT = 8000;

type ChatRepository = ReturnType<typeof createChatRepository>;

function extractCloudinaryPublicId(mediaUrl: string): string | null {
  try {
    const url = new URL(mediaUrl);
    const uploadMarker = "/upload/";
    const markerIndex = url.pathname.indexOf(uploadMarker);
    if (markerIndex < 0) return null;

    let publicPart = url.pathname.slice(markerIndex + uploadMarker.length);
    publicPart = publicPart.replace(/^v\d+\//, "");

    const dotIndex = publicPart.lastIndexOf(".");
    if (dotIndex > 0) publicPart = publicPart.slice(0, dotIndex);
    return publicPart || null;
  } catch {
    return null;
  }
}

export function createChatService(params: { supabase: SupabaseClient; repository: ChatRepository }) {
  const { supabase, repository } = params;

  return {
    async getUserIdFromToken(token: string): Promise<string> {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);
      if (error || !user?.id) {
        throw new Error("unauthorized");
      }
      return user.id;
    },

    async createMessage(input: { token: string; eventId: string; content: string | null; mediaUrl: string | null }) {
      const userId = await this.getUserIdFromToken(input.token);
      if (!input.eventId) throw new Error("invalid_payload");
      if (!input.content && !input.mediaUrl) throw new Error("invalid_payload");
      if (input.content && input.content.length > MAX_MESSAGE_TEXT) throw new Error("text_too_long");

      const { data, error } = await repository.insertMessage({
        eventId: input.eventId,
        userId,
        content: input.content,
        mediaUrl: input.mediaUrl,
      });

      if (error) throw new Error(error.message);
      return { id: data?.id ?? null, userId };
    },

    async getMessageHistory(eventId: string) {
      const { data, error } = await repository.fetchEventMessages(eventId, 50);
      if (error) throw new Error(error.message);

      return (data ?? [])
        .reverse()
        .map((row) => ({
          userId: row.user_id,
          eventId: row.event_id,
          text: row.content ?? undefined,
          fileUrl: row.media_url ?? undefined,
          timestamp: row.created_at,
        }));
    },

    async createUploadSignature(token: string, env: NodeJS.ProcessEnv) {
      await this.getUserIdFromToken(token);

      const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
      const apiKey = env.CLOUDINARY_API_KEY?.trim();
      const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
      const uploadPreset = env.CLOUDINARY_UPLOAD_PRESET?.trim();

      if (!cloudName || !apiKey || !apiSecret || !uploadPreset) {
        throw new Error("cloudinary_misconfigured");
      }

      const timestamp = Math.round(Date.now() / 1000);
      const paramsToSign: Record<string, string | number> = {
        timestamp,
        upload_preset: uploadPreset,
      };

      const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

      return { cloudName, apiKey, timestamp, signature, uploadPreset };
    },

    async deleteMedia(token: string, mediaUrl: string) {
      await this.getUserIdFromToken(token);
      const publicId = extractCloudinaryPublicId(mediaUrl);
      if (!publicId) throw new Error("invalid_media_url");

      const imageResult = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      if (imageResult.result === "not found") {
        const videoResult = await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
        return { ok: true, result: videoResult.result };
      }
      return { ok: true, result: imageResult.result };
    },
  };
}
