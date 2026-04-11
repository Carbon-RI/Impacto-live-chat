"use client";

import {
  useEffect,
  useState,
  ChangeEvent,
  useRef,
  useCallback,
} from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:5001";

/** Pixels from bottom to still count as "at bottom" for auto-scroll. */
const SCROLL_BOTTOM_THRESHOLD_PX = 64;

function isScrolledToBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

interface ChatWidgetProps {
  eventId: string;
  userId: string;
  isParticipant: boolean;
}

/** Shape used by the widget; socket payloads may include extra fields. */
interface ChatMessage {
  userId?: string;
  text?: string;
  fileUrl?: string;
  resourceType?: string;
  timestamp?: string;
}

export default function ChatWidget({
  eventId,
  userId,
  isParticipant,
}: ChatWidgetProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const prevIsOpenRef = useRef(false);
  const [showNewBelow, setShowNewBelow] = useState(false);

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
    if (!isParticipant) return;
    const newSocket = io(SOCKET_URL);
    queueMicrotask(() => setSocket(newSocket));
    newSocket.emit("join_room", { eventId, userId });

    newSocket.on("receive_history", (history: unknown[]) => {
      const parsedHistory: ChatMessage[] = history.map((item) => {
        const raw = typeof item === "string" ? JSON.parse(item) : item;
        return raw as ChatMessage;
      });
      setMessages(parsedHistory);
    });

    newSocket.on("receive_message", (data: ChatMessage) => {
      setMessages((prev) => [...prev, data]);
      setIsUploading(false);
    });
    return () => {
      newSocket.close();
    };
  }, [eventId, userId, isParticipant]);

  if (!isParticipant) return null;

  const handleSendText = () => {
    if (!inputText.trim() || !socket) return;
    stickToBottomRef.current = true;
    setShowNewBelow(false);
    socket.emit("send_message", {
      text: inputText,
      eventId,
      userId,
      senderId: socket.id,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    setInputText("");
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;
    stickToBottomRef.current = true;
    setShowNewBelow(false);
    setIsUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      socket.emit("send_message", {
        file: reader.result,
        eventId,
        userId,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    };
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
                      (msg.resourceType === "image" ? (
                        <img src={msg.fileUrl} className="rounded" alt="" />
                      ) : (
                        <video src={msg.fileUrl} controls className="rounded" />
                      ))}
                    <p className="text-[10px] opacity-70 mt-1">
                      {msg.timestamp}
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
                  新しいメッセージがあります
                </button>
              </div>
            )}
          </div>
          <footer className="p-3 border-t bg-white flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <span className="text-xl">📷</span>
              </label>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                placeholder="Message..."
                className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-black"
              />
              <button
                onClick={handleSendText}
                className="text-blue-600 font-bold px-2"
              >
                Send
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
