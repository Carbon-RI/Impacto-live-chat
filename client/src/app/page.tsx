"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import ChatWidget from "@/components/ChatWidget";

/**
 * Anonymous Auth: enable Authentication → Providers → Anonymous in the Supabase
 * Dashboard; otherwise signInAnonymously() will fail.
 */
interface EventRow {
  id: string;
  title: string;
  description: string | null;
}

export default function EventDetailPage() {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  /** Supabase Auth user.id (UUID); stable for anonymous users while the session persists in this browser. */
  const [userId, setUserId] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureAnonymousUser() {
      setAuthPending(true);
      setAuthError(null);

      const {
        data: { session: existing },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (existing?.user?.id) {
        setUserId(existing.user.id);
        setAuthPending(false);
        return;
      }

      const { data, error } = await supabase.auth.signInAnonymously();

      if (cancelled) return;

      if (error) {
        console.error("Anonymous sign-in failed:", error.message);
        setUserId(null);
        setAuthError(error.message);
        setAuthPending(false);
        return;
      }

      const id = data.user?.id ?? null;
      setUserId(id);
      setAuthPending(false);
    }

    void ensureAnonymousUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (session?.user) {
        setUserId(session.user.id);
        setAuthError(null);
        setAuthPending(false);
        return;
      }

      /* null session on INITIAL_SESSION is ignored here — ensureAnonymousUser still runs signInAnonymously(). */
      if (event === "SIGNED_OUT") {
        setUserId(null);
        setAuthPending(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function fetchEvent() {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .limit(1)
        .single();

      if (error) {
        console.error("Supabase error:", error.message);
        setEvent(null);
      } else {
        setEvent(data as EventRow);
      }
      setLoading(false);
    }
    fetchEvent();
  }, []);

  if (loading)
    return <div className="p-8 text-black">Connecting to Supabase...</div>;
  if (!event)
    return <div className="p-8 text-red-500">Event not found in Database.</div>;

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      {authError && (
        <div
          className="mx-auto mb-4 max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          Anonymous sign-in failed: {authError}. Enable{" "}
          <strong>Authentication → Providers → Anonymous</strong> in the
          Supabase Dashboard.
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">{event.title}</h1>
        <div className="bg-gray-100 h-64 rounded-xl flex items-center justify-center mb-6">
          <p className="text-gray-500">Event Image / {event.id}</p>
        </div>
        <p className="text-lg text-gray-700 leading-relaxed">
          description: {event.description}
        </p>
      </div>

      <ChatWidget
        eventId={event.id}
        userId={userId}
        authPending={authPending}
        authError={authError}
      />
    </main>
  );
}
