"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/utils/supabase/client";
import { uploadToCloudinary } from "@/utils/cloudinary";
import { validateMediaFileSize } from "@/utils/fileLimits";
import { inferMediaTypeFromUrl } from "@/utils/media";
import type { EventRow } from "@/types/events";
import type { Session } from "@supabase/supabase-js";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:5001";
const ACTIVE_CHAT_EVENT_STORAGE_KEY = "active_chat_event_id";
const SCROLL_BOTTOM_THRESHOLD_PX = 64;
const CHAT_TOGGLE_CHANNEL = "chat-toggle-events";
const CHAT_TOGGLE_EVENT = "chat_toggled";

function isScrolledToBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
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

type ChatOpenContextValue = {
  openChat: (event: EventRow) => void;
  setEventChatOpened: (eventId: string, isChatOpened: boolean) => void;
};

const ChatOpenContext = createContext<ChatOpenContextValue | null>(null);

export function useChatOpen(): ChatOpenContextValue {
  const ctx = useContext(ChatOpenContext);
  if (!ctx) {
    throw new Error("useChatOpen must be used within GlobalChatProvider");
  }
  return ctx;
}

export function GlobalChatProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [activeChatEvent, setActiveChatEvent] = useState<EventRow | null>(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [chatText, setChatText] = useState("");
  const [chatMedia, setChatMedia] = useState<File | null>(null);
  const [pendingNewBelow, setPendingNewBelow] = useState(0);
  const [imageLightboxUrl, setImageLightboxUrl] = useState<string | null>(null);
  const [chatFormError, setChatFormError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

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

  const closeChatModal = useCallback(() => {
    setIsChatModalOpen(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setActiveChatEvent(null);
      closeTimerRef.current = null;
    }, 280);
    localStorage.removeItem(ACTIVE_CHAT_EVENT_STORAGE_KEY);
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
      // Keep chat open across token refresh; only reset on sign-out.
      if (!nextSession) {
        setIsChatModalOpen(false);
        setActiveChatEvent(null);
        setMessages([]);
      }
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
      if (fetchError) return;
      setEvents((data ?? []) as EventRow[]);
    }
    void loadEvents();

    const channel = supabase
      .channel("global-events-feed")
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
      if (fetchError) return;
      setJoinedEventIds(new Set((data ?? []).map((row) => row.event_id as string)));
    }
    void loadJoins();

    const channel = supabase
      .channel(`global-participants-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_participants",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => void loadJoins()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
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
      if (fetchError) return;
      setMessages((data ?? []) as MessageRow[]);
    }
    void loadMessages();

    const channel = supabase
      .channel(`global-messages-${activeEventId}`)
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
    setChatFormError(null);
    setIsSending(false);
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
    // Do not auto-close while events are still syncing; only close when we
    // explicitly know the event exists and chat was closed.
    if (latest && !latest.is_chat_opened) {
      closeChatModal();
    }
  }, [activeChatEvent, events, closeChatModal]);

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
    }
  }, [events, joinedEventIds, user, loading]);

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

  function minimizeChatPanel() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsChatModalOpen(false);
  }

  const openChat = useCallback((event: EventRow) => {
    if (!event.is_chat_opened) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }
    // Keep provider-side event cache in sync with the source event so
    // stale rows do not immediately trigger auto-close after opening.
    setEvents((prev) => {
      const idx = prev.findIndex((row) => row.id === event.id);
      if (idx < 0) return [...prev, event];
      const next = [...prev];
      next[idx] = { ...next[idx], ...event, is_chat_opened: true };
      return next;
    });
    setActiveChatEvent(event);
    setIsChatModalOpen(false);
    openRafRef.current = requestAnimationFrame(() => {
      setIsChatModalOpen(true);
      openRafRef.current = null;
    });
    localStorage.setItem(ACTIVE_CHAT_EVENT_STORAGE_KEY, event.id);
  }, []);

  const setEventChatOpened = useCallback(
    (eventId: string, isChatOpened: boolean) => {
      setEvents((prev) =>
        prev.map((row) =>
          row.id === eventId ? { ...row, is_chat_opened: isChatOpened } : row
        )
      );
      if (!isChatOpened && activeChatEvent?.id === eventId) {
        closeChatModal();
      }
    },
    [activeChatEvent?.id, closeChatModal]
  );

  function handleChatTabClick() {
    if (!user) return;
    const dockable =
      activeChatEvent ??
      events.find(
        (e) =>
          e.is_chat_opened &&
          (joinedEventIds.has(e.id) || e.organizer_id === user.id)
      ) ??
      null;
    if (!dockable) return;
    openChat(dockable);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeChatEvent) return;
    if (isSending) return;
    setChatFormError(null);
    const text = chatText.trim();
    if (!text && !chatMedia) return;
    setIsSending(true);
    let mediaUrl: string | null = null;
    if (chatMedia) {
      const sizeError = validateMediaFileSize(chatMedia);
      if (sizeError) {
        alert(sizeError);
        setIsSending(false);
        return;
      }
      const accessToken = session?.access_token;
      if (!accessToken) {
        setChatFormError("Not signed in.");
        setIsSending(false);
        return;
      }
      try {
        mediaUrl = await uploadToCloudinary(chatMedia, accessToken);
      } catch (uploadErr) {
        setChatFormError(
          uploadErr instanceof Error ? uploadErr.message : "Upload failed"
        );
        setIsSending(false);
        return;
      }
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      setChatFormError("Not signed in.");
      setIsSending(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/chat/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: activeChatEvent.id,
          content: text || null,
          media_url: mediaUrl,
        }),
      });
      if (!res.ok) {
        const msg =
          res.status === 429
            ? "Too many send requests. Please wait a moment and try again."
            : `Failed to send message (${res.status}).`;
        setChatFormError(msg);
        setIsSending(false);
        return;
      }
    } catch (err) {
      setChatFormError(err instanceof Error ? err.message : "Send failed");
      setIsSending(false);
      return;
    }
    stickToBottomRef.current = true;
    setPendingNewBelow(0);
    setChatText("");
    setChatMedia(null);
    if (chatFileInputRef.current) chatFileInputRef.current.value = "";
    setIsSending(false);
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
      if (target) {
        setMessages((prev) =>
          [...prev, target].sort((a, b) => a.created_at.localeCompare(b.created_at))
        );
      }
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

  const chatTabEvent = user
    ? (() => {
        if (activeChatEvent) {
          return events.find((e) => e.id === activeChatEvent.id) ?? activeChatEvent;
        }
        return (
          events.find(
            (e) =>
              e.is_chat_opened &&
              (joinedEventIds.has(e.id) || e.organizer_id === user.id)
          ) ?? null
        );
      })()
    : null;

  const canUseChatTab = (() => {
    if (!user || !chatTabEvent) return false;
    if (!chatTabEvent.is_chat_opened) return false;
    return (
      joinedEventIds.has(chatTabEvent.id) || chatTabEvent.organizer_id === user.id
    );
  })();

  const showChatTab = Boolean(user && canUseChatTab && !isChatModalOpen);

  return (
    <ChatOpenContext.Provider value={{ openChat, setEventChatOpened }}>
      {children}

      {activeChatEvent ? (
        <section
          className={`fixed bottom-4 right-4 z-50 flex h-[80vh] w-[min(96vw,460px)] flex-col rounded-2xl border border-white/20 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-sm transition-transform duration-500 ease-in-out ${
            isChatModalOpen
              ? "translate-y-0"
              : "translate-y-[calc(100%+2rem)] pointer-events-none"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{activeChatEvent.title} chat</h2>
            <button
              type="button"
              className="px-2 py-1 text-sm text-white/90"
              onClick={minimizeChatPanel}
            >
              Close
            </button>
          </div>

          <div className="relative mb-4 min-h-0 flex-1">
            <div
              ref={messageListRef}
              onScroll={syncStickToBottomFromScroll}
              className="h-full min-h-0 overflow-y-auto rounded p-3"
            >
              <div ref={messageContentRef}>
                {messages.map((message) => {
                  const isOwn = user?.id === message.user_id;
                  const showDelete = user?.id === activeChatEvent.organizer_id;

                  const meta = (
                    <div
                      className={`w-28 shrink-0 text-xs ${
                        isOwn ? "text-right text-white/70" : "text-left text-white/70"
                      }`}
                    >
                      <div>{formatTime(message.created_at)}</div>
                      <div className="font-semibold text-white/85">
                        {profiles[message.user_id] ?? message.user_id.slice(0, 8)}
                      </div>
                    </div>
                  );

                  const bubble = (
                    <div
                      className={`max-w-[min(100%,280px)] rounded-lg p-2 text-white ${
                        isOwn ? "bg-white/12" : "bg-black/35"
                      }`}
                    >
                      {message.content ? (
                        <p className="text-sm break-words">{message.content}</p>
                      ) : null}
                      {message.media_url ? (
                        inferMediaTypeFromUrl(message.media_url) === "image" ? (
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
                        ) : inferMediaTypeFromUrl(message.media_url) === "video" ? (
                          <video
                            src={message.media_url}
                            controls
                            playsInline
                            className="mt-2 max-h-36 max-w-[200px] rounded object-contain"
                          />
                        ) : (
                          <a
                            href={message.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 block text-sm underline text-white"
                          >
                            Open attachment
                          </a>
                        )
                      ) : null}
                    </div>
                  );

                  const deleteButton = showDelete ? (
                    <button
                      type="button"
                      className="rounded-full bg-white/10 p-1.5 text-white opacity-0 transition-all duration-150 group-hover:opacity-100 hover:scale-105 hover:bg-red-500/85 focus:opacity-100"
                      onClick={() => void deleteMessage(message.id)}
                      aria-label="Delete message"
                      title="Delete message"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  ) : null;

                  return (
                    <div
                      key={message.id}
                      className={`group mb-3 flex w-full ${
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
                            <div className="flex items-start gap-1.5">
                              {deleteButton}
                              {bubble}
                            </div>
                            {meta}
                          </>
                        ) : (
                          <>
                            {meta}
                            <div className="flex items-start gap-1.5">
                              {bubble}
                              {deleteButton}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {pendingNewBelow > 0 ? (
              <button
                type="button"
                className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-[#2B41B7] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-[#2438A3]"
                onClick={() => scrollMessageListToBottom("smooth")}
              >
                <span>New Message↓</span>
                <span className="flex min-w-[1.25rem] items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-blue-600">
                  {pendingNewBelow}
                </span>
              </button>
            ) : null}
          </div>

          {chatFormError ? (
            <div className="mb-2 rounded px-3 py-2 text-sm text-red-300">
              {chatFormError}
            </div>
          ) : null}
          <form
            className="flex w-full min-w-0 shrink-0 flex-col gap-2"
            onSubmit={(e) => void sendMessage(e)}
          >
            <input
              className="w-full min-w-0 rounded bg-white/10 px-3 py-2 text-white placeholder:text-white/60"
              placeholder="Write a message..."
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
            />
            <div className="flex w-full min-w-0 items-stretch gap-2">
              <div className="flex min-h-[42px] min-w-0 flex-1 items-center overflow-hidden rounded bg-white/10 px-2 py-1">
                <input
                  ref={chatFileInputRef}
                  className="w-full min-w-0 cursor-pointer text-sm text-white file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-white/20 file:px-2 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-white/30"
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
                        setChatMedia(null);
                        return;
                      }
                    }
                    setChatMedia(file);
                  }}
                />
              </div>
              <button
                className="shrink-0 self-center rounded-lg bg-[#2B41B7] px-4 py-2 text-white transition hover:bg-[#2438A3] disabled:opacity-60"
                type="submit"
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showChatTab && chatTabEvent ? (
        <button
          type="button"
          className="fixed bottom-0 right-4 z-40 flex max-w-[min(92vw,280px)] items-center gap-2 rounded-t-xl border border-b-0 border-[#2438A3] bg-[#2B41B7] px-4 py-2 text-left text-sm font-semibold text-white shadow-lg transition hover:bg-[#2438A3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B41B7] focus-visible:ring-offset-2"
          onClick={() => handleChatTabClick()}
          aria-label="Open chat"
        >
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-100">
            Chat
          </span>
          <span className="min-w-0 flex-1 truncate">{chatTabEvent.title}</span>
          <span className="shrink-0 text-[10px] opacity-85" aria-hidden>
            ▲
          </span>
        </button>
      ) : null}

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
    </ChatOpenContext.Provider>
  );
}
