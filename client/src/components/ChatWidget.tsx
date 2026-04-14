"use client";

import {
  useEffect,
  useState,
  ChangeEvent,
  useRef,
  useCallback,
} from "react";
import { supabase } from "@/utils/supabase/client";
import { uploadToCloudinary } from "@/utils/cloudinary";

const CONNECTING_PLACEHOLDER = "Connecting...";
const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:5001";

/** Server uses ISO strings; older Redis rows may store legacy display strings. */
function formatMessageTime(timestamp?: string): string {
  if (!timestamp) return "";
  const ms = Date.parse(timestamp);
  if (!Number.isNaN(ms)) {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return timestamp;
}

/** Pixels from bottom to still count as "at bottom" for auto-scroll. */
const SCROLL_BOTTOM_THRESHOLD_PX = 64;

function isScrolledToBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

interface ChatWidgetProps {
  eventId: string;
  /** Supabase Auth user.id (UUID), including anonymous users. */
  userId: string | null;
  /** Kept for auth readiness checks. */
  accessToken: string | null;
  /** True while anonymous sign-in / session restore is in progress. */
  authPending?: boolean;
  /** Set when anonymous auth failed (e.g. provider disabled in Dashboard). */
  authError?: string | null;
}

/** Shape used by the widget; socket payloads may include extra fields. */
interface ChatMessage {
  userId?: string;
  text?: string;
  fileUrl?: string;
  timestamp?: string;
}

interface MessageRow {
  id: string;
  event_id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
}

function mapRowToMessage(row: MessageRow): ChatMessage {
  return {
    userId: row.user_id,
    text: row.content ?? undefined,
    fileUrl: row.media_url ?? undefined,
    timestamp: row.created_at,
  };
}

function inferResourceType(fileUrl?: string): "image" | "video" | null {
  if (!fileUrl) return null;
  if (fileUrl.includes("/image/upload/")) return "image";
  if (fileUrl.includes("/video/upload/")) return "video";
  return null;
}

export default function ChatWidget({
  eventId,
  userId,
  accessToken,
  authPending = false,
  authError = null,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const prevIsOpenRef = useRef(false);
  const [showNewBelow, setShowNewBelow] = useState(false);

  const canChat = Boolean(userId && accessToken);
  const inputPlaceholder = authError
    ? "Sign-in unavailable — check Supabase Anonymous provider"
    : authPending || !userId
      ? CONNECTING_PLACEHOLDER
      : "Message...";

  const syncStickToBottomFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = isScrolledToBottom(el);
    stickToBottomRef.current = atBottom;
    if (atBottom) setShowNewBelow(false);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowNewBelow(false);
  }, []);

  /**
   * When the panel opens (closed → open), jump to latest and sync the growth
   * baseline so the message effect does not treat existing history as "new".
   */
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }
    const justOpened = !prevIsOpenRef.current;
    prevIsOpenRef.current = true;
    if (!justOpened) return;

    prevMessageCountRef.current = messages.length;
    stickToBottomRef.current = true;

    const id = requestAnimationFrame(() => {
      setShowNewBelow(false);
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, messages.length]);

  /** New messages: auto-scroll only if user was already at the bottom. */
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;

    const count = messages.length;
    const prev = prevMessageCountRef.current;
    if (count <= prev) return;

    prevMessageCountRef.current = count;

    const shouldStick = stickToBottomRef.current;
    const rafId = requestAnimationFrame(() => {
      if (shouldStick) {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
        setShowNewBelow(false);
      } else {
        setShowNewBelow(true);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [messages, isOpen]);

  useEffect(() => {
    if (!userId || !accessToken) {
      setMessages([]);
      setIsUploading(false);
      return;
    }

    let active = true;

    async function loadHistory() {
      const { data, error } = await supabase
        .from("messages")
        .select("id,event_id,user_id,content,media_url,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (!active) return;
      if (error) {
        console.error("Failed to load messages:", error.message);
        return;
      }

      const rows = (data ?? []) as MessageRow[];
      setMessages(rows.map(mapRowToMessage));
    }

    void loadHistory();

    const channel = supabase
      .channel(`messages:event:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => [...prev, mapRowToMessage(row)]);
          setIsUploading(false);
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [eventId, userId, accessToken]);

  const handleSendText = () => {
    if (!userId || !accessToken || !inputText.trim()) return;
    if (isSending) return;
    stickToBottomRef.current = true;
    setShowNewBelow(false);
    const text = inputText.trim();
    setInputText("");
    setIsSending(true);
    void fetch(`${SERVER_URL}/chat/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_id: eventId, content: text, media_url: null }),
    }).finally(() => setIsSending(false));
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!userId || !accessToken || !file) return;
    stickToBottomRef.current = true;
    setShowNewBelow(false);
    setIsUploading(true);
    void uploadToCloudinary(file, accessToken)
      .then((secureUrl) =>
        supabase.from("messages").insert({
          event_id: eventId,
          user_id: userId,
          content: null,
          media_url: secureUrl,
        })
      )
      .then(({ error }) => {
        if (error) {
          console.error("Failed to save media message:", error.message);
        }
      })
      .catch((error: unknown) => {
        console.error("Cloudinary upload error:", error);
      })
      .finally(() => setIsUploading(false));
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex min-h-0 flex-col overflow-hidden shadow-2xl transition-shadow duration-300 rounded-t-2xl border border-gray-200 bg-white ${
        isOpen ? "h-chat-height w-chat-width" : "h-12 w-48"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white p-3 flex items-center justify-between font-bold shrink-0"
      >
        <span>Live Update</span>
        <span>{isOpen ? "▼" : "▲"}</span>
      </button>

      {isOpen && (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={syncStickToBottomFromScroll}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 space-y-4 bg-gray-50 text-black"
            >
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.userId === userId ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-2 rounded-xl shadow-sm ${
                      msg.userId === userId
                        ? "bg-blue-600 text-white"
                        : "bg-white border text-black"
                    }`}
                  >
                    {msg.text && <p className="text-sm mb-1">{msg.text}</p>}
                    {msg.fileUrl &&
                      (inferResourceType(msg.fileUrl) === "image" ? (
                        <img src={msg.fileUrl} className="rounded" alt="" />
                      ) : (
                        <video src={msg.fileUrl} controls className="rounded" />
                      ))}
                    <p className="text-[10px] opacity-70 mt-1">
                      {formatMessageTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              {isUploading && (
                <p className="text-xs italic animate-pulse text-blue-500 text-right">
                  Uploading...
                </p>
              )}
            </div>
            {showNewBelow && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => scrollToBottom("smooth")}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-md transition hover:bg-gray-50"
                >
                  <span aria-hidden>↓</span>
                  New messages below
                </button>
              </div>
            )}
          </div>
          <footer className="p-3 border-t bg-white flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <label
                className={`rounded-full p-2 bg-gray-100 ${
                  canChat
                    ? "cursor-pointer hover:bg-gray-200"
                    : "cursor-not-allowed opacity-40"
                }`}
              >
                <input
                  type="file"
                  className="hidden"
                  disabled={!canChat}
                  onChange={handleFileUpload}
                />
                <span className="text-xl" aria-hidden>
                  📷
                </span>
              </label>
              <input
                type="text"
                value={inputText}
                disabled={!canChat}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                placeholder={inputPlaceholder}
                className="flex-1 rounded-full border px-4 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              />
              <button
                type="button"
                disabled={!canChat || isSending || isUploading}
                onClick={handleSendText}
                className="px-2 font-bold text-blue-600 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
