import type { SupabaseClient } from "@supabase/supabase-js";

export function createChatRepository(supabase: SupabaseClient) {
  return {
    async createChatMessageAtomic(
      input: { eventId: string; content: string | null; mediaUrl: string | null },
      client: SupabaseClient = supabase
    ) {
      return client.rpc("create_chat_message", {
        target_event_id: input.eventId,
        message_content: input.content,
        message_media_url: input.mediaUrl,
      });
    },

    async fetchEventMessages(eventId: string, limit?: number, client: SupabaseClient = supabase) {
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
