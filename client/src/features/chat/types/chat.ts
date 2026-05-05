import type { EventRow } from "@/types/events";
import type { Tables } from "@/types/database.types";
import type { Session } from "@supabase/supabase-js";

export type ChatMessageRow = Tables<"messages">;
export type ChatProfileRow = Tables<"profiles">;

export type CameraMode = "image" | "video" | null;

export type ChatOpenContextValue = {
  openChat: (event: EventRow) => void;
  setEventChatOpened: (eventId: string, isChatOpened: boolean) => void;
  joinedEventIds: Set<string>;
  joinEvent: (eventId: string) => Promise<string | null>;
  leaveEvent: (eventId: string) => Promise<string | null>;
};

export interface UseChatState {
  session: Session | null;
  events: EventRow[];
  joinedEventIds: Set<string>;
  activeChatEvent: EventRow | null;
  isChatModalOpen: boolean;
  messages: ChatMessageRow[];
  profiles: Record<string, string>;
  chatText: string;
  selectedFile: File | null;
  showMediaOptions: boolean;
  pendingNewBelow: number;
  imageLightboxUrl: string | null;
  chatFormError: string | null;
  isSending: boolean;
  cameraMode: CameraMode;
}
