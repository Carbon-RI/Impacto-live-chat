"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:5001";

export default function ChatPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => setIsConnected(true));
    newSocket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    const reader = new FileReader();
    reader.readAsDataURL(file); // transform file to base64 string
    reader.onload = () => {
      socket.emit("send_message", {
        file: reader.result,
        timestamp: new Date().toLocaleTimeString(),
      });
    };
  };

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <h1 className="text-xl font-bold">Impacto Live Chat</h1>
      </div>

      {/* sending form */}
      <div className="mb-8 p-4 border rounded-lg bg-gray-50">
        <p className="mb-2 font-medium">Upload Image or Video:</p>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={handleFileUpload}
        />
      </div>

      {/* message list */}
      <div className="space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className="p-4 border rounded shadow-sm">
            <p className="text-xs text-gray-500 mb-2">{msg.timestamp}</p>
            {msg.resourceType === "image" ? (
              <img
                src={msg.fileUrl}
                alt="uploaded"
                className="max-w-full h-auto rounded"
              />
            ) : (
              <video
                src={msg.fileUrl}
                controls
                className="max-w-full rounded"
              />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
