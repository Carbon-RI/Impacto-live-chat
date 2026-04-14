import type { EventRow } from "@/types/events";
import type { Session } from "@supabase/supabase-js";

export interface ChatMessageRow {
  id: string;
  event_id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
}

export interface ChatProfileRow {
  id: string;
  display_name: string | null;
}

export type CameraMode = "image" | "video" | null;

export type ChatOpenContextValue = {
  openChat: (event: EventRow) => void;
  setEventChatOpened: (eventId: string, isChatOpened: boolean) => void;
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
