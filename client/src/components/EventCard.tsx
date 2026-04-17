import Image from "next/image";
import { inferMediaTypeFromUrl } from "@/utils/media";
import type { EventRow } from "@/types/events";

function formatTime(input: string): string {
  return new Date(input).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type EventCardProps = {
  event: EventRow;
  userId: string;
  isJoined: boolean;
  imageSizes: string;
  imagePriority?: boolean;
  imageLoading?: "eager" | "lazy";
  className?: string;
  onJoin: (eventId: string) => void;
  onToggleChat: (event: EventRow, shouldOpen: boolean) => void;
  onOpenChat: (event: EventRow) => void;
};

export function EventCard({
  event,
  userId,
  isJoined,
  imageSizes,
  imagePriority = false,
  imageLoading = "lazy",
  className = "",
  onJoin,
  onToggleChat,
  onOpenChat,
}: EventCardProps) {
  const isOrganizer = userId === event.organizer_id;
  const canJoinChat = event.is_chat_opened && (isJoined || isOrganizer);

  return (
    <article
      className={`flex h-full min-w-0 w-full flex-col rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm ${className}`}
    >
      {event.image_url ? (
        inferMediaTypeFromUrl(event.image_url) === "video" ? (
          <video
            src={event.image_url}
            className="mb-3 h-32 w-full rounded bg-black object-cover lg:h-36"
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="relative mb-3 h-32 w-full shrink-0 overflow-hidden rounded lg:h-36">
            <Image
              src={event.image_url}
              alt={event.title}
              fill
              priority={imagePriority}
              loading={imagePriority ? undefined : imageLoading}
              className="object-cover"
              sizes={imageSizes}
            />
          </div>
        )
      ) : null}
      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-xl font-semibold break-words">{event.title}</h3>
        {isJoined && !isOrganizer ? (
          <span className="shrink-0 rounded-full bg-[#D4E157] px-2.5 py-0.5 text-xs font-semibold text-[#1E293B]">
            Joined
          </span>
        ) : null}
      </div>
      <p className="inline-flex w-fit rounded-full bg-[#D4E157]/40 px-2.5 py-0.5 text-xs font-semibold text-[#1E293B]">
        {event.category}
      </p>
      <p className="mt-2 text-sm">{event.description}</p>
      <p className="mt-2 text-xs text-gray-600">{event.location}</p>
      <p className="text-xs text-gray-600">
        {formatTime(event.start_at)} - {formatTime(event.end_at)}
      </p>

      <div className="mt-auto flex flex-wrap gap-2.5 pt-4">
        {!isJoined && !isOrganizer ? (
          <button
            className="rounded-lg bg-[#2B41B7] px-3.5 py-2 text-sm text-white transition hover:bg-[#2438A3]"
            type="button"
            onClick={() => onJoin(event.id)}
          >
            Join
          </button>
        ) : null}
        {isOrganizer ? (
          <button
            className={`rounded-lg px-3.5 py-2 text-sm transition ${
              event.is_chat_opened
                ? "border border-[#CBD5E1] bg-transparent text-[#334155] hover:bg-[#F1F5F9]"
                : "bg-[#2B41B7] text-white hover:bg-[#2438A3]"
            }`}
            type="button"
            onClick={() => onToggleChat(event, !event.is_chat_opened)}
          >
            {event.is_chat_opened ? "CloseChat" : "OpenChat"}
          </button>
        ) : null}
        {canJoinChat ? (
          <button
            className="rounded-lg bg-[#2B41B7] px-3.5 py-2 text-sm text-white transition hover:bg-[#2438A3]"
            type="button"
            onClick={() => onOpenChat(event)}
          >
            JoinChat
          </button>
        ) : null}
      </div>
    </article>
  );
}
