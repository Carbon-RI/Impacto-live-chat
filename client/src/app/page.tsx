"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatWidget from "@/components/ChatWidget";

export default function EventDetailPage() {
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Temporary user ID for demo purposes.
  const userId = "user_ryo_001";

  useEffect(() => {
    async function fetchEvent() {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .limit(1)
        .single();

      if (error) {
        console.error("Supabase error:", error.message);
      } else {
        setEvent(data);
      }
      setLoading(false);
    }
    fetchEvent();
  }, []);

  if (loading)
    return <div className="p-8 text-black">Connecting to Supabase...</div>;
  if (!event)
    return <div className="p-8 text-red-500">Event not found in Database.</div>;

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">{event.title}</h1>
        <div className="bg-gray-100 h-64 rounded-xl flex items-center justify-center mb-6">
          <p className="text-gray-500">Event Image / {event.id}</p>
        </div>
        <p className="text-lg text-gray-700 leading-relaxed">
          description: {event.description}
        </p>
      </div>

      <ChatWidget eventId={event.id} userId={userId} isParticipant={true} />
    </main>
  );
}
