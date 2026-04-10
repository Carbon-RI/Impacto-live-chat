'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5001';

export default function ChatPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // 1. Initialize Socket.IO client
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    // 2. Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Impacto Live Chat</h1>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <p>{isConnected ? 'Connected' : 'Disconnected'}</p>
      </div>

      {/* later */}
    </main>
  );
}