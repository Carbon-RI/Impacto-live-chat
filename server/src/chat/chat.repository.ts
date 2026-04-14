import type { SupabaseClient } from "@supabase/supabase-js";

export function createChatRepository(supabase: SupabaseClient) {
  return {
    async insertMessage(input: { eventId: string; userId: string; content: string | null; mediaUrl: string | null }) {
      return supabase
        .from("messages")
        .insert({
          event_id: input.eventId,
          user_id: input.userId,
          content: input.content,
          media_url: input.mediaUrl,
        })
        .select("id")
        .maybeSingle();
    },

    async fetchEventMessages(eventId: string, limit?: number) {
      const query = supabase
        .from("messages")
        .select("id,event_id,user_id,content,media_url,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (typeof limit === "number") query.limit(limit);
      return query;
    },
  };
}
