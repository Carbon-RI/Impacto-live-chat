"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useChatOpen } from "@/components/GlobalChatProvider";
import { supabase } from "@/utils/supabase/client";
import type { EventRow } from "@/types/events";
import { inferMediaTypeFromUrl } from "@/utils/media";
import type { Session } from "@supabase/supabase-js";

type AuthMode = "sign-in" | "sign-up";
const CHAT_TOGGLE_CHANNEL = "chat-toggle-events";
const CHAT_TOGGLE_EVENT = "chat_toggled";

function formatTime(input: string): string {
  return new Date(input).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TopPage() {
  const { openChat, setEventChatOpened } = useChatOpen();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
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
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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
    const channel = supabase
      .channel(CHAT_TOGGLE_CHANNEL)
      .on("broadcast", { event: CHAT_TOGGLE_EVENT }, (payload) => {
        const next = payload.payload as { eventId?: string; isChatOpened?: boolean };
        if (!next.eventId || typeof next.isChatOpened !== "boolean") return;
        const opened = next.isChatOpened;
        setEvents((prev) =>
          prev.map((row) => (row.id === next.eventId ? { ...row, is_chat_opened: opened } : row))
        );
      })
      .subscribe();
    return () => {
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
    // Reflect immediately in the current UI while server update propagates.
    setEvents((prev) =>
      prev.map((row) =>
        row.id === event.id ? { ...row, is_chat_opened: shouldOpen } : row
      )
    );
    setEventChatOpened(event.id, shouldOpen);
    const { error: updateError } = await supabase
      .from("events")
      .update({ is_chat_opened: shouldOpen })
      .eq("id", event.id);
    if (updateError) {
      setError(updateError.message);
      setEvents((prev) =>
        prev.map((row) =>
          row.id === event.id ? { ...row, is_chat_opened: event.is_chat_opened } : row
        )
      );
      setEventChatOpened(event.id, event.is_chat_opened);
      return;
    }
    const broadcastChannel = supabase.channel(CHAT_TOGGLE_CHANNEL);
    await broadcastChannel.subscribe();
    await broadcastChannel.send({
      type: "broadcast",
      event: CHAT_TOGGLE_EVENT,
      payload: { eventId: event.id, isChatOpened: shouldOpen },
    });
    void supabase.removeChannel(broadcastChannel);
  }

  if (loading) {
    return <main className="min-h-screen bg-white p-8 text-black">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">
            {user ? "Events" : "Sign in"}
          </h1>
          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/events/new"
                className="rounded bg-emerald-600 px-4 py-2 text-white"
              >
                CreateEvent
              </Link>
              <button
                type="button"
                className="rounded bg-gray-900 px-4 py-2 text-white"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
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
        ) : null}

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
                    inferMediaTypeFromUrl(event.image_url) === "video" ? (
                      <video
                        src={event.image_url}
                        className="mb-3 h-40 w-full rounded object-cover bg-black"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={event.image_url}
                        alt={event.title}
                        className="mb-3 h-40 w-full rounded object-cover"
                      />
                    )
                  ) : null}
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold">{event.title}</h3>
                    {isJoined && !isOrganizer ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        Joined
                      </span>
                    ) : null}
                  </div>
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
      </div>
    </main>
  );
}
