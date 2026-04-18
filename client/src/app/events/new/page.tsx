"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { datetimeLocalInputToUtcIso } from "@/utils/date";
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
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const coverVideoInputRef = useRef<HTMLInputElement>(null);

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

    let startAtUtc: string;
    let endAtUtc: string;
    try {
      startAtUtc = datetimeLocalInputToUtcIso(eventForm.startAt);
      endAtUtc = datetimeLocalInputToUtcIso(eventForm.endAt);
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "Invalid start or end time.");
      setSubmitting(false);
      return;
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
        start_at: startAtUtc,
        end_at: endAtUtc,
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
    return <main className="min-h-screen bg-[#F8FAFC] p-8 text-black">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-8 text-black">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Create event</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:bg-gray-50"
            >
              Back to events
            </Link>
            <button
              type="button"
              className="rounded-lg bg-[#2B41B7] px-3 py-2 text-sm text-white transition hover:bg-[#2438A3]"
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

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-7 shadow-sm">
          <form className="space-y-6" onSubmit={(e) => void handleCreateEvent(e)}>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Title</label>
              <input
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                placeholder="e.g. Product Meetup"
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Category</label>
              <input
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                placeholder="e.g. Networking"
                value={eventForm.category}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, category: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Overview</label>
              <input
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                placeholder="Brief description"
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, description: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Location</label>
              <input
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                placeholder="e.g. Tokyo"
                value={eventForm.location}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, location: e.target.value }))
                }
                required
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Start time</label>
                <input
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                  type="datetime-local"
                  value={eventForm.startAt}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, startAt: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">End time</label>
                <input
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 outline-none transition focus:border-[#2B41B7]"
                  type="datetime-local"
                  value={eventForm.endAt}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, endAt: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Cover image</label>
                <input
                  ref={coverImageInputRef}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2B41B7]"
                  type="file"
                  accept="image/*"
                  capture="environment"
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
                    if (coverVideoInputRef.current) coverVideoInputRef.current.value = "";
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Cover video</label>
                <input
                  ref={coverVideoInputRef}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2B41B7]"
                  type="file"
                  accept="video/*"
                  capture="environment"
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
                    if (coverImageInputRef.current) coverImageInputRef.current.value = "";
                  }}
                />
              </div>
              <p className="text-xs text-gray-500">
                Attach one cover: choosing an image or video replaces the other.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                className="rounded-lg bg-[#2B41B7] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2438A3] disabled:opacity-60"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
