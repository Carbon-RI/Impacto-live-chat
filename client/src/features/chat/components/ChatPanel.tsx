"use client";

import CameraCaptureModal from "@/components/CameraCaptureModal";
import Image from "next/image";
import { formatChatMessageDateLine, formatChatMessageTimeOnly, formatDateTime } from "@/utils/date";
import { validateMediaFileByMimeType } from "@/utils/fileLimits";
import { inferMediaTypeFromUrl } from "@/utils/media";

export function ChatPanel({ chat }: { chat: ReturnType<typeof import("../hooks/useChat").useChat> }) {
  const {
    state,
    refs,
    user,
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
  } = chat;
  const { messageListRef, messageContentRef, fileInputRef, photoCaptureInputRef, videoCaptureInputRef } = refs;

  const {
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
  } = state;

  return (
    <>
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
            <button type="button" className="px-2 py-1 text-sm text-white/90" onClick={minimizeChatPanel}>
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
                  const isSystem = Boolean(message.is_system);
                  const isOwn = Boolean(user?.id === message.user_id && !isSystem);
                  const showDelete = user?.id === activeChatEvent.organizer_id;
                  const displayName = isSystem
                    ? "System"
                    : (profiles[message.user_id] ?? message.user_id.slice(0, 8));

                  const bubbleBody = (contentTextClassName: string, mediaAlignClass: string) => (
                    <>
                      {message.content ? (
                        <p className={contentTextClassName}>{message.content}</p>
                      ) : null}
                      {message.media_url ? (
                        inferMediaTypeFromUrl(message.media_url) === "image" ? (
                          <button
                            type="button"
                            className={`mt-2 block w-full cursor-zoom-in rounded p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${mediaAlignClass}`}
                            onClick={() => setImageLightboxUrl(message.media_url!)}
                          >
                            <div className="relative h-36 w-[200px]">
                              <Image
                                src={message.media_url}
                                alt=""
                                fill
                                className="rounded object-contain"
                                sizes="200px"
                              />
                            </div>
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
                    </>
                  );

                  const deleteButton = showDelete ? (
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/15 text-white opacity-0 shadow-sm transition-all duration-150 group-hover:opacity-100 hover:bg-red-500/90 hover:shadow-md focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
                      onClick={() => void removeMessage(message.id)}
                      aria-label="Delete message"
                      title="Delete message"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4"
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

                  if (isSystem) {
                    return (
                      <div key={message.id} className="group mb-3 flex w-full justify-center px-1">
                        <div className="flex w-full max-w-[min(100%,380px)] flex-col gap-1.5">
                          <div className="flex w-full items-center justify-start gap-2 text-left text-xs text-white/70">
                            <span>{formatDateTime(message.created_at)}</span>
                            <span className="font-semibold text-white/85">System</span>
                            {deleteButton ? <span className="ml-auto shrink-0">{deleteButton}</span> : null}
                          </div>
                          <div className="w-full rounded-lg border border-emerald-400/35 bg-emerald-950/50 px-3 py-2 text-left text-white">
                            {bubbleBody("text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-left", "text-left")}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const metaLines = (
                    <div
                      className={`max-w-[10rem] text-xs leading-snug text-white/55 ${
                        isOwn ? "text-right" : "text-left"
                      }`}
                    >
                      <div className="block">{formatChatMessageDateLine(message.created_at)}</div>
                      <div className="block break-words">
                        {formatChatMessageTimeOnly(message.created_at)} {displayName}
                      </div>
                    </div>
                  );

                  const bubbleTextClass = isOwn
                    ? "text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-right"
                    : "text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-left";
                  const bubbleMediaAlign = isOwn ? "text-right" : "text-left";

                  const bubble = (
                    <div
                      className={`min-w-0 max-w-[min(100%,280px)] rounded-lg p-2 text-white [overflow-wrap:anywhere] break-words ${
                        isOwn ? "bg-white/12 text-right" : "bg-black/35 text-left"
                      }`}
                    >
                      {bubbleBody(bubbleTextClass, bubbleMediaAlign)}
                    </div>
                  );

                  return (
                    <div
                      key={message.id}
                      className={`group mb-3 flex w-full min-w-0 ${
                        isOwn ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex max-w-[min(100%,380px)] min-w-0 items-start gap-3 ${
                          isOwn ? "flex-row" : "flex-row-reverse"
                        }`}
                      >
                        <div className="flex shrink-0 items-center gap-2.5">
                          {metaLines}
                          {deleteButton}
                        </div>
                        <div
                          className={`flex min-w-0 flex-1 items-start ${
                            isOwn ? "justify-end" : "justify-start"
                          }`}
                        >
                          {bubble}
                        </div>
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

          {chatFormError ? <div className="mb-2 rounded px-3 py-2 text-sm text-red-300">{chatFormError}</div> : null}
          <form className="flex w-full min-w-0 shrink-0 flex-col gap-2" onSubmit={(event) => void sendChatMessage(event)}>
            <input
              className="w-full min-w-0 rounded bg-white/10 px-3 py-2 text-white placeholder:text-white/60"
              placeholder="Write a message..."
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
            />
            <div className="flex w-full min-w-0 items-stretch gap-2">
              <div className="relative flex min-h-[42px] min-w-0 flex-1 items-center overflow-visible rounded bg-white/10 px-3 py-2">
                <button
                  type="button"
                  className="flex min-h-[26px] min-w-0 flex-1 items-center text-left text-sm font-medium text-white/95"
                  onClick={() => setShowMediaOptions((prev) => !prev)}
                >
                  <span className="min-w-0 truncate">{selectedFile ? `Attached: ${selectedFile.name}` : "Add media"}</span>
                </button>
                {selectedFile ? (
                  <button type="button" className="ml-2 shrink-0 rounded border border-white/30 px-2 py-1 text-xs" onClick={clearSelectedFile}>
                    Cancel
                  </button>
                ) : null}
                <input ref={fileInputRef} type="file" className="sr-only" accept="image/*,video/*" onChange={(event) => handleMediaFileSelect(event.target.files?.[0] ?? null, event.target)} />
                <input ref={photoCaptureInputRef} type="file" className="sr-only" accept="image/*" capture="environment" onChange={(event) => handleMediaFileSelect(event.target.files?.[0] ?? null, event.target)} />
                <input ref={videoCaptureInputRef} type="file" className="sr-only" accept="video/*" capture="environment" onChange={(event) => handleMediaFileSelect(event.target.files?.[0] ?? null, event.target)} />
                {showMediaOptions ? (
                  <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 flex w-full min-w-[220px] flex-col gap-1 rounded-lg border border-white/25 bg-black/90 p-2 shadow-xl">
                    <button type="button" className="rounded px-2 py-1.5 text-left text-xs text-white hover:bg-white/15" onClick={() => { setShowMediaOptions(false); setCameraMode("image"); }}>
                      Take photo
                    </button>
                    <button type="button" className="rounded px-2 py-1.5 text-left text-xs text-white hover:bg-white/15" onClick={() => { setShowMediaOptions(false); setCameraMode("video"); }}>
                      Record video
                    </button>
                    <button type="button" className="rounded px-2 py-1.5 text-left text-xs text-white hover:bg-white/15" onClick={() => fileInputRef.current?.click()}>
                      Choose from library
                    </button>
                  </div>
                ) : null}
              </div>
              <button className="shrink-0 self-center rounded-lg bg-[#2B41B7] px-4 py-2 text-white disabled:opacity-60" type="submit" disabled={isSending}>
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showChatTab && chatTabEvent ? (
        <button
          type="button"
          className="fixed bottom-0 right-4 z-40 flex max-w-[min(92vw,280px)] items-center gap-2 rounded-t-xl border border-b-0 border-[#2438A3] bg-[#2B41B7] px-4 py-2 text-left text-sm font-semibold text-white shadow-lg"
          onClick={handleChatTabClick}
          aria-label="Open chat"
        >
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-100">Chat</span>
          <span className="min-w-0 flex-1 truncate">{chatTabEvent.title}</span>
          <span className="shrink-0 text-[10px] opacity-85" aria-hidden>▲</span>
        </button>
      ) : null}

      {imageLightboxUrl ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setImageLightboxUrl(null)}>
          <button type="button" className="absolute right-4 top-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-md" onClick={() => setImageLightboxUrl(null)}>
            Close
          </button>
          <div
            className="relative h-[min(90vh,900px)] w-[min(90vw,1200px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={imageLightboxUrl}
              alt=""
              fill
              className="object-contain"
              sizes="(max-width: 1200px) 90vw, 1200px"
            />
          </div>
        </div>
      ) : null}

      {cameraMode ? (
        <CameraCaptureModal
          mode={cameraMode}
          onClose={() => setCameraMode(null)}
          onCaptured={(file) => {
            const error = validateMediaFileByMimeType(file);
            if (error) {
              alert(error);
              return;
            }
            setSelectedFile(file);
          }}
        />
      ) : null}
    </>
  );
}
