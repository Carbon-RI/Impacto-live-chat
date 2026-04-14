# Chat Feature

## Responsibility
I implemented the end-to-end live chat feature, including chat UI, message lifecycle, media upload integration, and real-time synchronization with Supabase and Socket/HTTP endpoints.

## Architecture
- `components/`: presentation-focused chat UI (`GlobalChatProvider`, `ChatPanel`)
- `hooks/`: chat state machine and feature orchestration (`useChat`)
- `api/`: external I/O (Supabase queries, realtime subscriptions, HTTP requests)
- `types/`: chat-specific domain types and contract shapes

Dependency direction is intentionally one-way: **UI -> hook -> API**.

## Key Design Decisions
- Kept `GlobalChatProvider` thin so reviewers can quickly see where context exposure ends.
- Moved all data access and realtime plumbing into `chatApi.ts` to make network/database boundaries explicit.
- Concentrated feature behavior in `useChat` to avoid stateful logic leaking into UI components.
- Avoided heavy abstraction/DI and used practical modules only where it clarifies ownership.
