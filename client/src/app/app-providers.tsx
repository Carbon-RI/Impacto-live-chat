"use client";

import { GlobalChatProvider } from "@/components/GlobalChatProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <GlobalChatProvider>{children}</GlobalChatProvider>;
}
