"use client";

import { GlobalChatProvider } from "@/features/chat/components/GlobalChatProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <GlobalChatProvider>{children}</GlobalChatProvider>;
}
