/**
 * Realtime transport layout (client)
 *
 * - **REST (`RealtimeChannel.httpSend`)** — publishing *broadcast* events where low latency is not
 *   required and we want deterministic delivery without `send()`’s implicit WebSocket → REST fallback.
 *   Used for: chat open/close UI sync, message-delete notifications to other tabs/clients.
 *
 * - **WebSocket (implicit via `subscribe()`)** — all *subscriptions*: `postgres_changes` (messages,
 *   events, participants) and *receiving* broadcast events. This is the normal Realtime connection.
 *
 * - **Chat message body** — writes go through `sendMessage()` (HTTP to app server). New rows reach
 *   clients via `postgres_changes` on `messages`, not via `channel.send()`.
 *
 * - **`channel.send()` (WebSocket)** — reserved for future latency-critical client-originated signals
 *   (e.g. typing, presence). If added, call only from `subscribe((status) => { ... })` after
 *   `status === "SUBSCRIBED"`, per Supabase Realtime docs; do not rely on REST fallback.
 */
import { supabase } from "@/utils/supabase/client";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import type { EventRow } from "@/types/events";
import type { ChatMessageRow, ChatProfileRow } from "../types/chat";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:5001";

export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, nextSession) => callback(nextSession));
}

export async function fetchEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id,organizer_id,title,category,description,location,start_at,end_at,image_url,is_chat_opened")
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as EventRow[];
}

/** WebSocket: `postgres_changes` listener for the events list. */
export function subscribeEvents(onRefresh: () => void): RealtimeChannel {
  return supabase
    .channel("global-events-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => void onRefresh())
    .subscribe();
}

export async function fetchJoinedEventIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("event_participants")
    .select("event_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.event_id as string));
}

/** WebSocket: `postgres_changes` listener for this user’s event_participants rows. */
export function subscribeJoinedEvents(userId: string, onRefresh: () => void): RealtimeChannel {
  return supabase
    .channel(`global-participants-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_participants",
        filter: `user_id=eq.${userId}`,
      },
      () => void onRefresh()
    )
    .subscribe();
}

export async function fetchMessages(eventId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id,event_id,user_id,content,media_url,created_at,is_system")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

/** WebSocket: `postgres_changes` on `messages` (chat body sync; writes come from HTTP API + DB). */
export function subscribeMessages(
  eventId: string,
  onInsert: (row: ChatMessageRow) => void,
  onDelete: (id: string) => void
): RealtimeChannel {
  return supabase
    .channel(`global-messages-${eventId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `event_id=eq.${eventId}` },
      (payload) => onInsert(payload.new as ChatMessageRow)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages", filter: `event_id=eq.${eventId}` },
      (payload) => {
        const deleted = payload.old as { id?: string };
        if (deleted.id) onDelete(deleted.id);
      }
    )
    .subscribe();
}

export async function fetchProfiles(userIds: string[]): Promise<ChatProfileRow[]> {
  const { data, error } = await supabase.from("profiles").select("id,display_name").in("id", userIds);
  if (error) throw error;
  return (data ?? []) as ChatProfileRow[];
}

/** WebSocket: broadcast *receiver* for chat open/close; *publisher* uses `publishRealtimeBroadcastRest`. */
export function subscribeChatToggle(
  channelName: string,
  eventName: string,
  onToggle: (payload: { eventId?: string; isChatOpened?: boolean }) => void
): RealtimeChannel {
  return supabase
    .channel(channelName)
    .on("broadcast", { event: eventName }, (payload) => onToggle(payload.payload as { eventId?: string; isChatOpened?: boolean }))
    .subscribe();
}

/** WebSocket: broadcast *receiver* for organizer-driven delete fan-out; *publisher* uses `httpSend`. */
export function subscribeMessageDelete(
  channelName: string,
  eventName: string,
  onDelete: (payload: { eventId?: string; messageId?: string }) => void
): RealtimeChannel {
  return supabase
    .channel(channelName)
    .on("broadcast", { event: eventName }, (payload) =>
      onDelete(payload.payload as { eventId?: string; messageId?: string })
    )
    .subscribe();
}

/**
 * Publishes a broadcast using the Realtime **REST** API (`httpSend`).
 * No WebSocket `send()` — avoids implicit REST fallback warnings.
 */
export async function publishRealtimeBroadcastRest(
  channelName: string,
  eventName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const channel = supabase.channel(channelName);
  try {
    const result = await channel.httpSend(eventName, payload);
    if (!result.success) {
      throw new Error(result.error || `Realtime broadcast failed (HTTP ${result.status})`);
    }
  } finally {
    await removeRealtimeChannel(channel);
  }
}

/** REST broadcast: notify other clients that a message was removed (UI sync). */
export async function broadcastMessageDelete(
  channelName: string,
  eventName: string,
  payload: { eventId: string; messageId: string }
): Promise<void> {
  await publishRealtimeBroadcastRest(channelName, eventName, payload);
}

/** HTTP (app server): create message row; clients observe inserts via `subscribeMessages`. */
export async function sendMessage(params: {
  accessToken: string;
  eventId: string;
  content: string | null;
  mediaUrl: string | null;
}): Promise<Response> {
  return fetch(`${SERVER_URL}/chat/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_id: params.eventId,
      content: params.content,
      media_url: params.mediaUrl,
    }),
  });
}

export async function deleteMessage(messageId: string, eventId: string) {
  return supabase.from("messages").delete().eq("id", messageId).eq("event_id", eventId);
}

export async function deleteMedia(accessToken: string, mediaUrl: string): Promise<void> {
  await fetch(`${SERVER_URL}/chat/media/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ mediaUrl }),
  });
}

export async function removeRealtimeChannel(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}
