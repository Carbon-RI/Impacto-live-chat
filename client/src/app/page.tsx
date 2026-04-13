"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { Session } from "@supabase/supabase-js";

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || "";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim() || "";
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:5001";
const ACTIVE_CHAT_EVENT_STORAGE_KEY = "active_chat_event_id";
/** Pixels from bottom to still count as "at bottom" for auto-scroll. */
const SCROLL_BOTTOM_THRESHOLD_PX = 64;

function isScrolledToBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

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
  return new Date(input).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
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
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const [pendingNewBelow, setPendingNewBelow] = useState(0);
  const [imageLightboxUrl, setImageLightboxUrl] = useState<string | null>(null);

  const user = session?.user ?? null;

  const scrollMessageListToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = messageListRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      stickToBottomRef.current = true;
      setPendingNewBelow(0);
    },
    []
  );

  const syncStickToBottomFromScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const atBottom = isScrolledToBottom(el);
    stickToBottomRef.current = atBottom;
    if (atBottom) setPendingNewBelow(0);
  }, []);

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
      setIsChatModalOpen(false);
      setActiveChatEvent(null);
      setMessages([]);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      if (openRafRef.current !== null) {
        cancelAnimationFrame(openRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!imageLightboxUrl) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setImageLightboxUrl(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageLightboxUrl]);

  useEffect(() => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      setEvents([]);
      return;
    }

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
  }, [user?.id]);

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
    setMessages([]);
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
    prevMessageCountRef.current = 0;
    stickToBottomRef.current = true;
    setPendingNewBelow(0);
  }, [activeChatEvent?.id]);

  useEffect(() => {
    if (!activeChatEvent) return;
    if (
      messages.length > 0 &&
      messages.some((m) => m.event_id !== activeChatEvent.id)
    ) {
      return;
    }
    const count = messages.length;
    const prev = prevMessageCountRef.current;
    if (count < prev) {
      prevMessageCountRef.current = count;
      return;
    }
    if (count === prev) return;
    const delta = count - prev;
    prevMessageCountRef.current = count;
    if (prev === 0 && count > 0) {
      requestAnimationFrame(() => scrollMessageListToBottom("smooth"));
      return;
    }
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollMessageListToBottom("smooth"));
    } else {
      setPendingNewBelow((c) => c + delta);
    }
  }, [messages, activeChatEvent, scrollMessageListToBottom]);

  useEffect(() => {
    if (!activeChatEvent) return;
    const content = messageContentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      requestAnimationFrame(() => {
        if (!stickToBottomRef.current) return;
        const sc = messageListRef.current;
        if (!sc) return;
        sc.scrollTo({ top: sc.scrollHeight, behavior: "auto" });
      });
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [activeChatEvent?.id, messages.length]);

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

  useEffect(() => {
    if (!activeChatEvent) return;
    const latest = events.find((event) => event.id === activeChatEvent.id);
    if (!latest || !latest.is_chat_opened) {
      closeChatModal();
    }
  }, [activeChatEvent, events]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      localStorage.removeItem(ACTIVE_CHAT_EVENT_STORAGE_KEY);
      return;
    }
    const savedEventId = localStorage.getItem(ACTIVE_CHAT_EVENT_STORAGE_KEY);
    if (!savedEventId) return;
    const candidate = events.find((event) => event.id === savedEventId);
    if (!candidate || !candidate.is_chat_opened) return;
    const isOrganizer = candidate.organizer_id === user.id;
    const isParticipant = joinedEventIds.has(candidate.id);
    if (isOrganizer || isParticipant) {
      setActiveChatEvent(candidate);
      setIsChatModalOpen(false);
      openRafRef.current = requestAnimationFrame(() => {
        setIsChatModalOpen(true);
        openRafRef.current = null;
      });
    }
  }, [events, joinedEventIds, user, loading]);

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

    if (data?.id) {
      const { error: joinSelfError } = await supabase
        .from("event_participants")
        .upsert(
          {
            event_id: data.id,
            user_id: user.id,
          },
          { onConflict: "event_id,user_id" }
        );
      if (joinSelfError) {
        setError(joinSelfError.message);
      } else {
        setJoinedEventIds((prev) => new Set(prev).add(data.id));
      }
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
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (!shouldOpen && activeChatEvent?.id === event.id) {
      setActiveChatEvent(null);
      localStorage.removeItem(ACTIVE_CHAT_EVENT_STORAGE_KEY);
    }
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
    stickToBottomRef.current = true;
    setPendingNewBelow(0);
    setChatText("");
    setChatMedia(null);
    if (chatFileInputRef.current) chatFileInputRef.current.value = "";
  }

  async function deleteMessage(messageId: string) {
    if (!activeChatEvent || !user) return;
    if (activeChatEvent.organizer_id !== user.id) return;
    const target = messages.find((message) => message.id === messageId);
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("event_id", activeChatEvent.id);
    if (deleteError) {
      setError(deleteError.message);
      if (target) setMessages((prev) => [...prev, target].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      return;
    }

    if (target?.media_url) {
      const accessToken = session?.access_token;
      if (!accessToken) return;
      try {
        await fetch(`${SERVER_URL}/media/delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ mediaUrl: target.media_url }),
        });
      } catch (cloudinaryDeleteError) {
        console.error("Failed to delete Cloudinary media:", cloudinaryDeleteError);
      }
    }
  }

  function openChat(event: EventRow) {
    if (!event.is_chat_opened) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }
    setActiveChatEvent(event);
    setIsChatModalOpen(false);
    openRafRef.current = requestAnimationFrame(() => {
      setIsChatModalOpen(true);
      openRafRef.current = null;
    });
    localStorage.setItem(ACTIVE_CHAT_EVENT_STORAGE_KEY, event.id);
  }

  function closeChatModal() {
    setIsChatModalOpen(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setActiveChatEvent(null);
      closeTimerRef.current = null;
    }, 280);
    localStorage.removeItem(ACTIVE_CHAT_EVENT_STORAGE_KEY);
  }

  if (loading) {
    return <main className="min-h-screen bg-white p-8 text-black">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            {user ? "Events" : "Sign in"}
          </h1>
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

        {user ? (
          <section className="grid gap-4 md:grid-cols-2">
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-gray-600">
                No events yet.
              </div>
            ) : null}
            {events.map((event) => {
              const isOrganizer = user.id === event.organizer_id;
              const isJoined = joinedEventIds.has(event.id);
              const canJoinChat = event.is_chat_opened && (isJoined || isOrganizer);
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
                    {!isJoined ? (
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
                    {canJoinChat ? (
                      <button
                        className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                        type="button"
                        onClick={() => openChat(event)}
                      >
                        JoinChat
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {activeChatEvent ? (
          <section
            className={`fixed bottom-4 right-4 z-50 flex h-[80vh] w-[min(96vw,460px)] flex-col rounded-2xl border bg-white p-4 shadow-2xl transition-transform duration-500 ease-in-out ${
              isChatModalOpen
                ? "translate-y-0"
                : "translate-y-[calc(100%+2rem)] pointer-events-none"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{activeChatEvent.title} chat</h2>
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={closeChatModal}
              >
                Close
              </button>
            </div>

            <div className="relative mb-4 min-h-0 flex-1">
              <div
                ref={messageListRef}
                onScroll={syncStickToBottomFromScroll}
                className="h-full min-h-0 overflow-y-auto rounded border bg-gray-50 p-3"
              >
                <div ref={messageContentRef}>
                {messages.map((message) => {
                  const isOwn = user?.id === message.user_id;
                  const showDelete = user?.id === activeChatEvent.organizer_id;

                  const meta = (
                    <div
                      className={`w-28 shrink-0 text-xs ${
                        isOwn ? "text-right text-gray-500" : "text-left text-gray-500"
                      }`}
                    >
                      <div>{formatTime(message.created_at)}</div>
                      <div
                        className={`font-semibold ${isOwn ? "text-gray-600" : "text-gray-700"}`}
                      >
                        {profiles[message.user_id] ?? message.user_id.slice(0, 8)}
                      </div>
                    </div>
                  );

                  const bubble = (
                    <div
                      className={`max-w-[min(100%,280px)] rounded-lg border p-2 ${
                        isOwn
                          ? "border-blue-600 bg-blue-500 text-white"
                          : "border-gray-300 bg-gray-200 text-gray-900"
                      }`}
                    >
                      {message.content ? (
                        <p className="text-sm break-words">{message.content}</p>
                      ) : null}
                      {message.media_url ? (
                        inferMediaType(message.media_url) === "image" ? (
                          <button
                            type="button"
                            className="mt-2 block w-full cursor-zoom-in rounded p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                            onClick={() => setImageLightboxUrl(message.media_url!)}
                          >
                            <img
                              src={message.media_url}
                              alt=""
                              className="max-h-36 max-w-[200px] rounded object-contain"
                            />
                          </button>
                        ) : (
                          <video
                            src={message.media_url}
                            controls
                            className="mt-2 max-h-36 max-w-[200px] rounded object-contain"
                          />
                        )
                      ) : null}
                    </div>
                  );

                  return (
                    <div
                      key={message.id}
                      className={`relative mb-3 flex w-full pr-14 ${
                        isOwn ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex max-w-[min(100%,380px)] items-start gap-2 ${
                          isOwn ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {isOwn ? (
                          <>
                            {bubble}
                            {meta}
                          </>
                        ) : (
                          <>
                            {meta}
                            {bubble}
                          </>
                        )}
                      </div>
                      {showDelete ? (
                        <button
                          type="button"
                          className="absolute right-0 top-1/2 -translate-y-1/2 rounded border border-red-400 px-2 py-1 text-xs text-red-600"
                          onClick={() => void deleteMessage(message.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                </div>
              </div>
              {pendingNewBelow > 0 ? (
                <button
                  type="button"
                  className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-blue-700"
                  onClick={() => scrollMessageListToBottom("smooth")}
                >
                  <span>New Message↓</span>
                  <span className="flex min-w-[1.25rem] items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-blue-600">
                    {pendingNewBelow}
                  </span>
                </button>
              ) : null}
            </div>

            <form className="flex flex-col gap-2 md:flex-row" onSubmit={sendMessage}>
              <input
                className="flex-1 rounded border px-3 py-2"
                placeholder="Write a message..."
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
              />
              <input
                ref={chatFileInputRef}
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

      {imageLightboxUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImageLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-md hover:bg-gray-100"
            onClick={() => setImageLightboxUrl(null)}
          >
            Close
          </button>
          <img
            src={imageLightboxUrl}
            alt=""
            className="max-h-[min(90vh,900px)] max-w-[min(90vw,1200px)] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}
