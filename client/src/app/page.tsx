"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { Session } from "@supabase/supabase-js";

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || "";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim() || "";

type AuthMode = "sign-in" | "sign-up";

interface EventRow {
  id: string;
  organizer_id: string;
  title: string;
  category: string;
  description: string;
  location: string;
  start_at: string;
  end_at: string;
  image_url: string | null;
  is_chat_opened: boolean;
}

interface MessageRow {
  id: string;
  event_id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
}

function formatTime(input: string): string {
  return new Date(input).toLocaleString();
}

function inferMediaType(url: string | null): "image" | "video" | null {
  if (!url) return null;
  if (url.includes("/image/upload/")) return "image";
  if (url.includes("/video/upload/")) return "video";
  return null;
}

async function uploadToCloudinary(file: File): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      "Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"
    );
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: "POST", body: formData }
  );
  if (!response.ok) throw new Error(`Cloudinary upload failed: ${response.status}`);
  const payload = (await response.json()) as { secure_url?: string };
  if (!payload.secure_url) throw new Error("Cloudinary response missing secure_url");
  return payload.secure_url;
}

export default function TopPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [activeChatEvent, setActiveChatEvent] = useState<EventRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [eventForm, setEventForm] = useState({
    title: "",
    category: "",
    description: "",
    location: "",
    startAt: "",
    endAt: "",
  });
  const [eventPhoto, setEventPhoto] = useState<File | null>(null);
  const [chatText, setChatText] = useState("");
  const [chatMedia, setChatMedia] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user ?? null;

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();
      if (!active) return;
      setSession(existingSession);
      setLoading(false);
    }
    void bootstrap();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setActiveChatEvent(null);
      setMessages([]);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadEvents() {
      const { data, error: fetchError } = await supabase
        .from("events")
        .select(
          "id,organizer_id,title,category,description,location,start_at,end_at,image_url,is_chat_opened"
        )
        .order("start_at", { ascending: true });
      if (!active) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setEvents((data ?? []) as EventRow[]);
    }
    void loadEvents();

    const channel = supabase
      .channel("events-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => void loadEvents()
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      setJoinedEventIds(new Set());
      return;
    }
    async function loadJoins() {
      const { data, error: fetchError } = await supabase
        .from("event_participants")
        .select("event_id")
        .eq("user_id", currentUserId);
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setJoinedEventIds(new Set((data ?? []).map((row) => row.event_id as string)));
    }
    void loadJoins();
  }, [user?.id]);

  useEffect(() => {
    const activeEventId = activeChatEvent?.id;
    if (!activeEventId) {
      setMessages([]);
      return;
    }
    let active = true;
    async function loadMessages() {
      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("id,event_id,user_id,content,media_url,created_at")
        .eq("event_id", activeEventId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setMessages((data ?? []) as MessageRow[]);
    }
    void loadMessages();

    const channel = supabase
      .channel(`messages-${activeEventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `event_id=eq.${activeEventId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as MessageRow]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `event_id=eq.${activeEventId}`,
        },
        (payload) => {
          const deleted = payload.old as { id?: string };
          if (!deleted.id) return;
          setMessages((prev) => prev.filter((msg) => msg.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [activeChatEvent?.id]);

  useEffect(() => {
    const missingUserIds = Array.from(
      new Set(
        messages
          .map((msg) => msg.user_id)
          .filter((id) => id && typeof profiles[id] === "undefined")
      )
    );
    if (missingUserIds.length === 0) return;

    async function loadProfiles() {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", missingUserIds);
      if (fetchError) return;
      const incoming = (data ?? []) as ProfileRow[];
      setProfiles((prev) => {
        const next = { ...prev };
        for (const profile of incoming) {
          next[profile.id] = profile.display_name ?? profile.id.slice(0, 8);
        }
        return next;
      });
    }
    void loadProfiles();
  }, [messages, profiles]);

  async function ensureProfile(userId: string, name: string) {
    if (!name.trim()) return;
    await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: name.trim() }, { onConflict: "id" });
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (authMode === "sign-up") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: authForm.email,
        password: authForm.password,
        options: { data: { name: authForm.name.trim() } },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.user?.id) await ensureProfile(data.user.id, authForm.name);
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: authForm.email,
      password: authForm.password,
    });
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const displayName =
      (data.user?.user_metadata?.name as string | undefined) ??
      authForm.name ??
      "";
    if (data.user?.id) await ensureProfile(data.user.id, displayName);
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    let photoUrl: string | null = null;
    if (eventPhoto) {
      try {
        photoUrl = await uploadToCloudinary(eventPhoto);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
        return;
      }
    }
    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        organizer_id: user.id,
        title: eventForm.title,
        category: eventForm.category,
        description: eventForm.description,
        location: eventForm.location,
        start_at: eventForm.startAt,
        end_at: eventForm.endAt,
        image_url: photoUrl,
        is_chat_opened: false,
      })
      .select(
        "id,organizer_id,title,category,description,location,start_at,end_at,image_url,is_chat_opened"
      )
      .maybeSingle();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (data) {
      setEvents((prev) => {
        const next = [data as EventRow, ...prev];
        const seen = new Set<string>();
        return next.filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
      });
    }
    setEventForm({
      title: "",
      category: "",
      description: "",
      location: "",
      startAt: "",
      endAt: "",
    });
    setEventPhoto(null);
  }

  async function joinEvent(eventId: string) {
    if (!user) return;
    const { error: joinError } = await supabase
      .from("event_participants")
      .upsert({ event_id: eventId, user_id: user.id }, { onConflict: "event_id,user_id" });
    if (joinError) {
      setError(joinError.message);
      return;
    }
    setJoinedEventIds((prev) => new Set(prev).add(eventId));
  }

  async function toggleChat(event: EventRow, shouldOpen: boolean) {
    const { error: updateError } = await supabase
      .from("events")
      .update({ is_chat_opened: shouldOpen })
      .eq("id", event.id);
    if (updateError) setError(updateError.message);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeChatEvent) return;
    const text = chatText.trim();
    if (!text && !chatMedia) return;
    let mediaUrl: string | null = null;
    if (chatMedia) {
      try {
        mediaUrl = await uploadToCloudinary(chatMedia);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
        return;
      }
    }
    const { error: insertError } = await supabase.from("messages").insert({
      event_id: activeChatEvent.id,
      user_id: user.id,
      content: text || null,
      media_url: mediaUrl,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setChatText("");
    setChatMedia(null);
  }

  async function deleteMessage(messageId: string) {
    if (!activeChatEvent || !user) return;
    if (activeChatEvent.organizer_id !== user.id) return;
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("event_id", activeChatEvent.id);
    if (deleteError) setError(deleteError.message);
  }

  if (loading) {
    return <main className="min-h-screen bg-white p-8 text-black">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Events</h1>
          {user ? (
            <button
              type="button"
              className="rounded bg-gray-900 px-4 py-2 text-white"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          ) : null}
        </header>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        {!user ? (
          <section className="rounded-xl border p-4">
            <h2 className="mb-3 text-xl font-semibold">
              {authMode === "sign-in" ? "Sign in" : "Sign up"}
            </h2>
            <form className="grid gap-3" onSubmit={handleAuthSubmit}>
              {authMode === "sign-up" ? (
                <input
                  className="rounded border px-3 py-2"
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              ) : null}
              <input
                className="rounded border px-3 py-2"
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2"
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
                required
              />
              <div className="flex items-center gap-3">
                <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">
                  {authMode === "sign-in" ? "Login" : "Register"}
                </button>
                <button
                  type="button"
                  className="text-sm text-blue-700 underline"
                  onClick={() =>
                    setAuthMode((prev) => (prev === "sign-in" ? "sign-up" : "sign-in"))
                  }
                >
                  {authMode === "sign-in"
                    ? "Create a new account"
                    : "Back to sign in"}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className="rounded-xl border p-4">
            <h2 className="mb-3 text-xl font-semibold">Create event</h2>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateEvent}>
              <input
                className="rounded border px-3 py-2"
                placeholder="Title"
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2"
                placeholder="Category"
                value={eventForm.category}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, category: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2 md:col-span-2"
                placeholder="Overview"
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, description: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2"
                placeholder="Location"
                value={eventForm.location}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, location: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2"
                type="datetime-local"
                value={eventForm.startAt}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, startAt: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2"
                type="datetime-local"
                value={eventForm.endAt}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, endAt: e.target.value }))
                }
                required
              />
              <input
                className="rounded border px-3 py-2"
                type="file"
                accept="image/*"
                onChange={(e) => setEventPhoto(e.target.files?.[0] ?? null)}
              />
              <button className="rounded bg-emerald-600 px-4 py-2 text-white" type="submit">
                Create
              </button>
            </form>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-gray-600">
              No events yet.
            </div>
          ) : null}
          {events.map((event) => {
            const isOrganizer = user?.id === event.organizer_id;
            const isJoined = joinedEventIds.has(event.id);
            return (
              <article key={event.id} className="rounded-xl border bg-white p-4 shadow-sm">
                {event.image_url ? (
                  <img
                    src={event.image_url}
                    alt={event.title}
                    className="mb-3 h-40 w-full rounded object-cover"
                  />
                ) : null}
                <h3 className="text-xl font-semibold">{event.title}</h3>
                <p className="text-sm text-gray-600">{event.category}</p>
                <p className="mt-2 text-sm">{event.description}</p>
                <p className="mt-2 text-xs text-gray-600">{event.location}</p>
                <p className="text-xs text-gray-600">
                  {formatTime(event.start_at)} - {formatTime(event.end_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {user && !isJoined ? (
                    <button
                      className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white"
                      type="button"
                      onClick={() => void joinEvent(event.id)}
                    >
                      Join
                    </button>
                  ) : null}
                  {isOrganizer ? (
                    <button
                      className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white"
                      type="button"
                      onClick={() => void toggleChat(event, !event.is_chat_opened)}
                    >
                      {event.is_chat_opened ? "CloseChat" : "OpenChat"}
                    </button>
                  ) : null}
                  {user && isJoined && event.is_chat_opened ? (
                    <button
                      className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                      type="button"
                      onClick={() => setActiveChatEvent(event)}
                    >
                      JoinChat
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        {activeChatEvent ? (
          <section className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{activeChatEvent.title} chat</h2>
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={() => setActiveChatEvent(null)}
              >
                Back
              </button>
            </div>

            <div className="mb-4 h-[420px] overflow-y-auto rounded border bg-gray-50 p-3">
              {messages.map((message) => (
                <div key={message.id} className="mb-3 flex items-start gap-2">
                  <div className="w-32 shrink-0 text-xs text-gray-500">
                    <div>{formatTime(message.created_at)}</div>
                    <div className="font-semibold text-gray-700">
                      {profiles[message.user_id] ?? message.user_id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="flex-1 rounded border bg-white p-2">
                    {message.content ? <p className="text-sm">{message.content}</p> : null}
                    {message.media_url ? (
                      inferMediaType(message.media_url) === "image" ? (
                        <img
                          src={message.media_url}
                          alt=""
                          className="mt-2 max-h-72 rounded object-contain"
                        />
                      ) : (
                        <video
                          src={message.media_url}
                          controls
                          className="mt-2 max-h-72 rounded"
                        />
                      )
                    ) : null}
                  </div>
                  {user?.id === activeChatEvent.organizer_id ? (
                    <button
                      type="button"
                      className="rounded border border-red-400 px-2 py-1 text-xs text-red-600"
                      onClick={() => void deleteMessage(message.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <form className="flex flex-col gap-2 md:flex-row" onSubmit={sendMessage}>
              <input
                className="flex-1 rounded border px-3 py-2"
                placeholder="Write a message..."
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
              />
              <input
                className="rounded border px-3 py-2"
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setChatMedia(e.target.files?.[0] ?? null)}
              />
              <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">
                Send
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
