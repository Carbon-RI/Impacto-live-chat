"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { uploadToCloudinary } from "@/utils/cloudinary";
import { validateMediaFileSize } from "@/utils/fileLimits";
import type { Session } from "@supabase/supabase-js";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:5001";

export default function NewEventPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventForm, setEventForm] = useState({
    title: "",
    category: "",
    description: "",
    location: "",
    startAt: "",
    endAt: "",
  });
  const [eventPhoto, setEventPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (loading || user) return;
    router.replace("/");
  }, [loading, user, router]);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSubmitting(true);
    let photoUrl: string | null = null;
    const accessToken = session?.access_token;
    if (!accessToken) {
      alert("Session is invalid. Please sign in again.");
      setSubmitting(false);
      return;
    }
    if (eventPhoto) {
      const sizeError = validateMediaFileSize(eventPhoto);
      if (sizeError) {
        alert(sizeError);
        setSubmitting(false);
        return;
      }
      try {
        photoUrl = await uploadToCloudinary(eventPhoto, accessToken);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
        setSubmitting(false);
        return;
      }
    }
    const createRes = await fetch(`${SERVER_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: eventForm.title,
        category: eventForm.category,
        description: eventForm.description,
        location: eventForm.location,
        start_at: eventForm.startAt,
        end_at: eventForm.endAt,
        image_url: photoUrl,
      }),
    });

    if (!createRes.ok) {
      const msg =
        createRes.status === 429
          ? "Too many create requests. Please wait a moment and try again."
          : `Failed to create event (${createRes.status}).`;
      setError(msg);
      setSubmitting(false);
      return;
    }

    const created = (await createRes.json()) as { id?: string | null };
    const eventId = typeof created.id === "string" ? created.id : null;
    if (!eventId) {
      setError("Failed to create event.");
      setSubmitting(false);
      return;
    }

    const { error: joinSelfError } = await supabase
      .from("event_participants")
      .upsert({ event_id: eventId, user_id: user.id }, { onConflict: "event_id,user_id" });
    if (joinSelfError) {
      setError(joinSelfError.message);
      setSubmitting(false);
      return;
    }

    router.push("/");
  }

  if (loading || !user) {
    return <main className="min-h-screen bg-white p-8 text-black">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Create event</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
            >
              Back to events
            </Link>
            <button
              type="button"
              className="rounded bg-gray-900 px-4 py-2 text-white"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-xl border p-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void handleCreateEvent(e)}>
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
              accept="image/*,video/*"
              onChange={(e) => {
                const input = e.target;
                const file = input.files?.[0] ?? null;
                if (file) {
                  const err = validateMediaFileSize(file);
                  if (err) {
                    alert(err);
                    input.value = "";
                    setEventPhoto(null);
                    return;
                  }
                }
                setEventPhoto(file);
              }}
            />
            <button
              className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
