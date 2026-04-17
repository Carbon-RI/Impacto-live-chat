"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { publishRealtimeBroadcastRest } from "@/features/chat/api/chatApi";
import { useChatOpen } from "@/features/chat/components/GlobalChatProvider";
import { isDemoUiEnabled } from "@/lib/config/demo-client";
import { supabase } from "@/utils/supabase/client";
import type { EventRow } from "@/types/events";
import type { Session } from "@supabase/supabase-js";

type AuthMode = "sign-in" | "sign-up";
const CHAT_TOGGLE_CHANNEL = "chat-toggle-events";
const CHAT_TOGGLE_EVENT = "chat_toggled";

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

  const { activeEvents, upcomingEvents } = useMemo(() => {
    const active: EventRow[] = [];
    const upcoming: EventRow[] = [];
    for (const e of events) {
      if (e.is_chat_opened) active.push(e);
      else upcoming.push(e);
    }
    return { activeEvents: active, upcomingEvents: upcoming };
  }, [events]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();
        if (!active) return;
        setSession(existingSession);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
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
    if (!currentUserId) return;

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
    if (!currentUserId) return;
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

    if (shouldOpen) {
      const { error: rpcError } = await supabase.rpc('open_event_chat', {
        target_event_id: event.id,
      });
      if (rpcError) {
        setError(rpcError.message);
        setEvents((prev) =>
          prev.map((row) =>
            row.id === event.id ? { ...row, is_chat_opened: event.is_chat_opened } : row
          )
        );
        setEventChatOpened(event.id, event.is_chat_opened);
        return;
      }
    } else {
      const { error: updateError } = await supabase
        .from("events")
        .update({ is_chat_opened: false })
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
    }

    try {
      await publishRealtimeBroadcastRest(CHAT_TOGGLE_CHANNEL, CHAT_TOGGLE_EVENT, {
        eventId: event.id,
        isChatOpened: shouldOpen,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync chat state to other clients.");
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#F8FAFC] p-8 text-black">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] p-8 text-black">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">
            {user ? "Events" : "Impacto"}
          </h1>
          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/events/new"
                className="rounded-lg bg-[#2B41B7] px-4 py-2 text-white transition hover:bg-[#2438A3]"
              >
                CreateEvent
              </Link>
              <button
                type="button"
                className="rounded-lg bg-[#2B41B7] px-4 py-2 text-white transition hover:bg-[#2438A3]"
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
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-xl font-semibold">
              {authMode === "sign-in" ? "Sign in" : "Sign up"}
            </h2>
            <form className="grid gap-4" onSubmit={handleAuthSubmit}>
              {authMode === "sign-up" ? (
                <input
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              ) : null}
              <input
                className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
              <input
                className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
                required
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-lg bg-[#2B41B7] px-4 py-2 text-white transition hover:bg-[#2438A3]"
                  type="submit"
                >
                  {authMode === "sign-in" ? "Login" : "Register"}
                </button>
                <button
                  type="button"
                  className="text-sm text-[#2B41B7] underline"
                  onClick={() =>
                    setAuthMode((prev) => (prev === "sign-in" ? "sign-up" : "sign-in"))
                  }
                >
                  {authMode === "sign-in"
                    ? "Create a new account"
                    : "Back to sign in"}
                </button>
                {isDemoUiEnabled() ? (
                  <Link
                    href="/demo"
                    prefetch={false}
                    className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#334155] transition hover:bg-[#F1F5F9]"
                  >
                    Demo
                  </Link>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        {user ? (
          <div className="flex flex-col gap-10">
            {activeEvents.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
                  Active Events
                </h2>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 lg:gap-4">
                  {activeEvents.map((event, index) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      userId={user.id}
                      isJoined={joinedEventIds.has(event.id)}
                      imageSizes="(max-width: 1023px) 50vw, 20vw"
                      imagePriority={index === 0}
                      imageLoading={index > 0 && index < 3 ? "eager" : "lazy"}
                      onJoin={(eventId) => void joinEvent(eventId)}
                      onToggleChat={(ev, shouldOpen) => void toggleChat(ev, shouldOpen)}
                      onOpenChat={(ev) => openChat(ev)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
                Upcoming Events
              </h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 lg:gap-4">
                {events.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-[#E2E8F0] bg-white p-5 text-sm text-gray-600">
                    No events yet.
                  </div>
                ) : upcomingEvents.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-[#E2E8F0] bg-white p-5 text-sm text-gray-600">
                    No upcoming events. All listed events are active.
                  </div>
                ) : (
                  upcomingEvents.map((event, index) => {
                    const isPrimaryLcp = activeEvents.length === 0 && index === 0;
                    return (
                      <EventCard
                        key={event.id}
                        event={event}
                        userId={user.id}
                        isJoined={joinedEventIds.has(event.id)}
                        imageSizes="(max-width: 1023px) 50vw, 20vw"
                        imagePriority={isPrimaryLcp}
                        imageLoading={
                          !isPrimaryLcp && activeEvents.length === 0 && index > 0 && index < 4
                            ? "eager"
                            : "lazy"
                        }
                        onJoin={(eventId) => void joinEvent(eventId)}
                        onToggleChat={(ev, shouldOpen) => void toggleChat(ev, shouldOpen)}
                        onOpenChat={(ev) => openChat(ev)}
                      />
                    );
                  })
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
