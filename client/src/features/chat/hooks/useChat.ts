"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadToCloudinary } from "@/utils/cloudinary";
import { validateMediaFileByMimeType } from "@/utils/fileLimits";
import type { EventRow } from "@/types/events";
import {
  broadcastMessageDelete,
  deleteMedia,
  deleteMessage,
  fetchEvents,
  fetchJoinedEventIds,
  fetchMessages,
  fetchProfiles,
  getSession,
  onAuthStateChange,
  removeRealtimeChannel,
  sendMessage,
  subscribeChatToggle,
  subscribeEvents,
  subscribeJoinedEvents,
  subscribeMessageDelete,
  subscribeMessages,
} from "../api/chatApi";
import type { CameraMode, ChatMessageRow, UseChatState } from "../types/chat";

const ACTIVE_CHAT_EVENT_STORAGE_KEY = "active_chat_event_id";
const SCROLL_BOTTOM_THRESHOLD_PX = 64;
const CHAT_TOGGLE_CHANNEL = "chat-toggle-events";
const CHAT_TOGGLE_EVENT = "chat_toggled";
const MESSAGE_DELETE_CHANNEL = "chat-message-events";
const MESSAGE_DELETE_EVENT = "message_deleted";

function isScrolledToBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

export function useChat() {
  const [session, setSession] = useState<UseChatState["session"]>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [activeChatEvent, setActiveChatEvent] = useState<EventRow | null>(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [chatText, setChatText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  const [pendingNewBelow, setPendingNewBelow] = useState(0);
  const [imageLightboxUrl, setImageLightboxUrl] = useState<string | null>(null);
  const [chatFormError, setChatFormError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCaptureInputRef = useRef<HTMLInputElement>(null);
  const videoCaptureInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  const user = session?.user ?? null;

  const scrollMessageListToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = messageListRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setPendingNewBelow(0);
  }, []);

  const syncStickToBottomFromScroll = useCallback(() => {
    const element = messageListRef.current;
    if (!element) return;
    const atBottom = isScrolledToBottom(element);
    stickToBottomRef.current = atBottom;
    if (atBottom) setPendingNewBelow(0);
  }, []);

  const closeChatModal = useCallback(() => {
    setIsChatModalOpen(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setActiveChatEvent(null);
      closeTimerRef.current = null;
    }, 280);
    localStorage.removeItem(ACTIVE_CHAT_EVENT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const existingSession = await getSession();
      if (!active) return;
      setSession(existingSession);
      setLoading(false);
    }

    void bootstrap();

    const { data } = onAuthStateChange((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setIsChatModalOpen(false);
        setActiveChatEvent(null);
        setMessages([]);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openRafRef.current !== null) cancelAnimationFrame(openRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!imageLightboxUrl) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageLightboxUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageLightboxUrl]);

  useEffect(() => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      queueMicrotask(() => setEvents([]));
      return;
    }

    let active = true;
    const loadEvents = async () => {
      try {
        const rows = await fetchEvents();
        if (!active) return;
        setEvents(rows);
      } catch {
        // Silent by design: event page handles user-visible errors.
      }
    };

    void loadEvents();
    const channel = subscribeEvents(loadEvents);

    return () => {
      active = false;
      void removeRealtimeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      queueMicrotask(() => setJoinedEventIds(new Set()));
      return;
    }

    const loadJoins = async () => {
      try {
        const ids = await fetchJoinedEventIds(currentUserId);
        setJoinedEventIds(ids);
      } catch {
        // Silent by design: event page handles user-visible errors.
      }
    };

    void loadJoins();
    const channel = subscribeJoinedEvents(currentUserId, loadJoins);

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const activeEventId = activeChatEvent?.id;
    if (!activeEventId) {
      queueMicrotask(() => setMessages([]));
      return;
    }

    queueMicrotask(() => setMessages([]));
    let active = true;

    const loadMessages = async () => {
      try {
        const rows = await fetchMessages(activeEventId);
        if (!active) return;
        setMessages(rows);
      } catch {
        // Silent by design: chat form shows send-time errors.
      }
    };

    void loadMessages();

    const channel = subscribeMessages(
      activeEventId,
      (row) =>
        setMessages((prev) => (prev.some((message) => message.id === row.id) ? prev : [...prev, row])),
      (id) => setMessages((prev) => prev.filter((msg) => msg.id !== id))
    );

    return () => {
      active = false;
      void removeRealtimeChannel(channel);
    };
  }, [activeChatEvent?.id]);

  useEffect(() => {
    prevMessageCountRef.current = 0;
    stickToBottomRef.current = true;
    queueMicrotask(() => {
      setPendingNewBelow(0);
      setChatFormError(null);
      setIsSending(false);
    });
  }, [activeChatEvent?.id]);

  useEffect(() => {
    if (!activeChatEvent) return;
    const count = messages.length;
    const prev = prevMessageCountRef.current;
    if (count <= prev) return;

    prevMessageCountRef.current = count;
    const delta = count - prev;

    if (prev === 0 && count > 0) {
      requestAnimationFrame(() => scrollMessageListToBottom("smooth"));
      return;
    }

    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollMessageListToBottom("smooth"));
    } else {
      setPendingNewBelow((current) => current + delta);
    }
  }, [messages, activeChatEvent, scrollMessageListToBottom]);

  useEffect(() => {
    if (!activeChatEvent) return;
    const content = messageContentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      requestAnimationFrame(() => {
        if (!stickToBottomRef.current) return;
        const scrollContainer = messageListRef.current;
        if (!scrollContainer) return;
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "auto" });
      });
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [activeChatEvent, messages.length]);

  useEffect(() => {
    const missingUserIds = Array.from(
      new Set(messages.map((message) => message.user_id).filter((id) => id && typeof profiles[id] === "undefined"))
    );
    if (missingUserIds.length === 0) return;

    const loadProfiles = async () => {
      try {
        const rows = await fetchProfiles(missingUserIds);
        setProfiles((prev) => {
          const next = { ...prev };
          for (const profile of rows) {
            next[profile.id] = profile.display_name ?? profile.id.slice(0, 8);
          }
          return next;
        });
      } catch {
        // Silent by design.
      }
    };

    void loadProfiles();
  }, [messages, profiles]);

  useEffect(() => {
    if (!activeChatEvent) return;
    const latest = events.find((event) => event.id === activeChatEvent.id);
    if (latest && !latest.is_chat_opened) {
      queueMicrotask(() => closeChatModal());
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
      queueMicrotask(() => {
        setActiveChatEvent(candidate);
        setIsChatModalOpen(false);
      });
    }
  }, [events, joinedEventIds, user, loading]);

  useEffect(() => {
    const channel = subscribeChatToggle(CHAT_TOGGLE_CHANNEL, CHAT_TOGGLE_EVENT, (next) => {
      if (!next.eventId || typeof next.isChatOpened !== "boolean") return;
      const isChatOpened = next.isChatOpened;
      setEvents((prev) =>
        prev.map((row) => (row.id === next.eventId ? { ...row, is_chat_opened: isChatOpened } : row))
      );
    });

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const channel = subscribeMessageDelete(MESSAGE_DELETE_CHANNEL, MESSAGE_DELETE_EVENT, (next) => {
      if (!next.eventId || !next.messageId) return;
      if (activeChatEvent?.id !== next.eventId) return;
      setMessages((prev) => prev.filter((message) => message.id !== next.messageId));
    });
    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [activeChatEvent?.id]);

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

    setEvents((prev) => {
      const index = prev.findIndex((row) => row.id === event.id);
      if (index < 0) return [...prev, event];
      const next = [...prev];
      next[index] = { ...next[index], ...event, is_chat_opened: true };
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
      setEvents((prev) => prev.map((row) => (row.id === eventId ? { ...row, is_chat_opened: isChatOpened } : row)));
      if (!isChatOpened && activeChatEvent?.id === eventId) closeChatModal();
    },
    [activeChatEvent?.id, closeChatModal]
  );

  const minimizeChatPanel = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsChatModalOpen(false);
  }, []);

  const handleChatTabClick = useCallback(() => {
    if (!user) return;
    const dockable =
      activeChatEvent ??
      events.find((event) => event.is_chat_opened && (joinedEventIds.has(event.id) || event.organizer_id === user.id)) ??
      null;
    if (!dockable) return;
    openChat(dockable);
  }, [activeChatEvent, events, joinedEventIds, openChat, user]);

  const sendChatMessage = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!user || !activeChatEvent || isSending) return;

      setChatFormError(null);
      const text = chatText.trim();
      if (!text && !selectedFile) return;

      setIsSending(true);
      let mediaUrl: string | null = null;

      if (selectedFile) {
        const sizeError = validateMediaFileByMimeType(selectedFile);
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
          mediaUrl = await uploadToCloudinary(selectedFile, accessToken);
        } catch (uploadError) {
          setChatFormError(uploadError instanceof Error ? uploadError.message : "Upload failed");
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
        const response = await sendMessage({
          accessToken,
          eventId: activeChatEvent.id,
          content: text || null,
          mediaUrl,
        });

        if (!response.ok) {
          const message =
            response.status === 429
              ? "Too many send requests. Please wait a moment and try again."
              : `Failed to send message (${response.status}).`;
          setChatFormError(message);
          setIsSending(false);
          return;
        }

        type SendMessageResponse = { id?: string };
        const body = (await response.json().catch(() => null)) as SendMessageResponse | null;
        if (body?.id) {
          const optimisticMessage: ChatMessageRow = {
            id: body.id,
            event_id: activeChatEvent.id,
            user_id: user.id,
            content: text || null,
            media_url: mediaUrl,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) =>
            prev.some((message) => message.id === optimisticMessage.id)
              ? prev
              : [...prev, optimisticMessage]
          );
        }
      } catch (error) {
        setChatFormError(error instanceof Error ? error.message : "Send failed");
        setIsSending(false);
        return;
      }

      stickToBottomRef.current = true;
      setPendingNewBelow(0);
      setChatText("");
      setSelectedFile(null);
      setShowMediaOptions(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (photoCaptureInputRef.current) photoCaptureInputRef.current.value = "";
      if (videoCaptureInputRef.current) videoCaptureInputRef.current.value = "";
      setIsSending(false);
    },
    [activeChatEvent, chatText, isSending, selectedFile, session, user]
  );

  const handleMediaFileSelect = useCallback((file: File | null, input: HTMLInputElement) => {
    if (file) {
      const error = validateMediaFileByMimeType(file);
      if (error) {
        alert(error);
        input.value = "";
        setSelectedFile(null);
        return;
      }
    }
    setSelectedFile(file);
    setShowMediaOptions(false);
  }, []);

  const removeMessage = useCallback(
    async (messageId: string) => {
      if (!activeChatEvent || !user) return;
      if (activeChatEvent.organizer_id !== user.id) return;

      const target = messages.find((message) => message.id === messageId);
      setMessages((prev) => prev.filter((message) => message.id !== messageId));

      const { error: deleteError } = await deleteMessage(messageId, activeChatEvent.id);
      if (deleteError) {
        if (target) {
          setMessages((prev) => [...prev, target].sort((a, b) => a.created_at.localeCompare(b.created_at)));
        }
        return;
      }

      await broadcastMessageDelete(MESSAGE_DELETE_CHANNEL, MESSAGE_DELETE_EVENT, {
        eventId: activeChatEvent.id,
        messageId,
      });

      if (target?.media_url && session?.access_token) {
        try {
          await deleteMedia(session.access_token, target.media_url);
        } catch {
          // Media deletion failure should not rollback message deletion.
        }
      }
    },
    [activeChatEvent, messages, session, user]
  );

  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
    setShowMediaOptions(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (photoCaptureInputRef.current) photoCaptureInputRef.current.value = "";
    if (videoCaptureInputRef.current) videoCaptureInputRef.current.value = "";
  }, []);

  const chatTabEvent = user
    ? activeChatEvent ??
      events.find((event) => event.is_chat_opened && (joinedEventIds.has(event.id) || event.organizer_id === user.id)) ??
      null
    : null;

  const canUseChatTab =
    Boolean(user && chatTabEvent?.is_chat_opened) &&
    Boolean(chatTabEvent && (joinedEventIds.has(chatTabEvent.id) || chatTabEvent.organizer_id === user?.id));

  const showChatTab = Boolean(user && canUseChatTab && !isChatModalOpen);

  return {
    state: {
      session,
      events,
      joinedEventIds,
      activeChatEvent,
      isChatModalOpen,
      messages,
      profiles,
      chatText,
      selectedFile,
      showMediaOptions,
      pendingNewBelow,
      imageLightboxUrl,
      chatFormError,
      isSending,
      cameraMode,
    },
    refs: {
      messageListRef,
      messageContentRef,
      fileInputRef,
      photoCaptureInputRef,
      videoCaptureInputRef,
    },
    user,
    openChat,
    setEventChatOpened,
    setChatText,
    setShowMediaOptions,
    setCameraMode,
    setImageLightboxUrl,
    setSelectedFile,
    scrollMessageListToBottom,
    syncStickToBottomFromScroll,
    minimizeChatPanel,
    handleChatTabClick,
    sendChatMessage,
    handleMediaFileSelect,
    removeMessage,
    clearSelectedFile,
    showChatTab,
    chatTabEvent,
  };
}
