"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:5001";

interface ChatWidgetProps {
  eventId: string;
  userId: string;
  isParticipant: boolean;
}

export default function ChatWidget({
  eventId,
  userId,
  isParticipant,
}: ChatWidgetProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");

  useEffect(() => {
    if (!isParticipant) return;
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);
    newSocket.emit("join_room", { eventId, userId });

    newSocket.on("receive_history", (history: any[]) => {
      const parsedHistory = history.map((item) =>
        typeof item === "string" ? JSON.parse(item) : item
      );
      setMessages(parsedHistory);
    });

    newSocket.on("receive_message", (data) => {
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
      className={`fixed bottom-4 right-4 z-50 flex flex-col ${
        isOpen ? "h-500px w-350px" : "h-12 w-48"
      } transition-all duration-300 shadow-2xl rounded-t-2xl overflow-hidden border border-gray-200 bg-white`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white p-3 flex items-center justify-between font-bold"
      >
        <span>Live Update</span>
        <span>{isOpen ? "▼" : "▲"}</span>
      </button>

      {isOpen && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 text-black">
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
                  <p className="text-[10px] opacity-70 mt-1">{msg.timestamp}</p>
                </div>
              </div>
            ))}
            {isUploading && (
              <p className="text-xs italic animate-pulse text-blue-500 text-right">
                Uploading...
              </p>
            )}
          </div>
          <footer className="p-3 border-t bg-white flex flex-col gap-2">
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
