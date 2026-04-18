"use client";

import { createContext, useContext } from "react";
import type { ChatOpenContextValue } from "../types/chat";
import { useChat } from "../hooks/useChat";
import { ChatPanel } from "./ChatPanel";

const ChatOpenContext = createContext<ChatOpenContextValue | null>(null);

export function useChatOpen(): ChatOpenContextValue {
  const context = useContext(ChatOpenContext);
  if (!context) {
    throw new Error("useChatOpen must be used within GlobalChatProvider");
  }
  return context;
}

export function GlobalChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat();

  return (
    <ChatOpenContext.Provider
      value={{
        openChat: chat.openChat,
        setEventChatOpened: chat.setEventChatOpened,
        joinedEventIds: chat.joinedEventIds,
        joinEvent: chat.joinEvent,
        leaveEvent: chat.leaveEvent,
      }}
    >
      {children}
      <ChatPanel chat={chat} />
    </ChatOpenContext.Provider>
  );
}
