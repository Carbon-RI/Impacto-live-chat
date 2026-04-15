"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase/client";

let demoEntrySingleton: Promise<void> | null = null;

function ensureDemoEntry(): Promise<void> {
  if (!demoEntrySingleton) {
    demoEntrySingleton = executeDemoEntry().finally(() => {
      demoEntrySingleton = null;
    });
  }
  return demoEntrySingleton;
}

function randomGuestSuffix(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function formatDemoError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) {
      return m;
    }
  }
  if (typeof err === "string") {
    return err;
  }
  return "Something went wrong.";
}

async function executeDemoEntry(): Promise<void> {
  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  if (existingSession?.user) {
    return;
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) {
    throw signInError;
  }

  const userId = signInData.session?.user?.id;
  if (!userId) {
    throw new Error("Demo sign-in did not return a user id.");
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (!existingProfile) {
    const guestName = `Guest-${randomGuestSuffix()}`;
    // Match `ensureProfile` on the top page (`id` + `display_name` only). A `role` column is not used elsewhere in this app.
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      display_name: guestName,
    });
    if (insertError) {
      throw insertError;
    }
  }
}

export default function DemoPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) {
      return;
    }
    ranRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        await ensureDemoEntry();
        if (!cancelled) {
          router.replace("/");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(formatDemoError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- `useRouter()` is stable; `router` in deps can skip a needed Strict Mode re-entry while `ranRef` stays true

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8FAFC] p-8 text-black">
      {errorMessage ? (
        <p className="max-w-md text-center text-red-700">{errorMessage}</p>
      ) : (
        <>
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#2B41B7]"
            aria-hidden
          />
          <p className="text-sm font-medium text-[#334155]">Entering demo mode...</p>
        </>
      )}
    </main>
  );
}
