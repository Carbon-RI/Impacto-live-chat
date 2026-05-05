import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

/**
 * Chat persistence. Message **DELETE** is not implemented here: the client calls
 * Supabase `.from("messages").delete()` with the user session; authorization
 * matches RLS policy `delete_messages_as_event_organizer` (migration 005) —
 * delete succeeds only when `events.organizer_id` for the message’s `event_id`
 * equals `auth.uid()`.
 */
export function createChatRepository(supabase: SupabaseClient<Database>) {
  return {
    async createChatMessageAtomic(
      input: { eventId: string; content: string | null; mediaUrl: string | null },
      client: SupabaseClient<Database> = supabase
    ) {
      return client.rpc("create_chat_message", {
        target_event_id: input.eventId,
        message_content: input.content,
        message_media_url: input.mediaUrl,
      });
    },

    async fetchEventMessages(eventId: string, limit?: number, client: SupabaseClient<Database> = supabase) {
      const query = client
        .from("messages")
        .select("id,event_id,user_id,content,media_url,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (typeof limit === "number") query.limit(limit);
      return query;
    },
  };
}
