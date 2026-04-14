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
    .select("id,event_id,user_id,content,media_url,created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

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

export async function broadcastMessageDelete(
  channelName: string,
  eventName: string,
  payload: { eventId: string; messageId: string }
): Promise<void> {
  const channel = supabase.channel(channelName);
  await channel.subscribe();
  await channel.send({
    type: "broadcast",
    event: eventName,
    payload,
  });
  await removeRealtimeChannel(channel);
}

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
