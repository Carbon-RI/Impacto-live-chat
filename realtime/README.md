## Realtime Architecture Notes

All real-time synchronization is handled via Supabase Realtime.
HTTP endpoints are used for all state mutations.
Socket.IO was removed because all real-time requirements are currently satisfied by Supabase Realtime, and maintaining multiple realtime transports increases system complexity without clear benefit.

### Current transport responsibilities

- Write operations: HTTP API (`/events`, `/chat/messages`, `/chat/media/delete`, etc.)
- State synchronization: Supabase Realtime (`postgres_changes` and `broadcast`)
- `postgres_changes`: DB-driven updates based on persisted row mutations
- `broadcast`: non-persistent event propagation for transient cross-client UI sync

### Why this split

- HTTP provides explicit request/response semantics for validation, auth, and error handling.
- Supabase Realtime provides low-latency fan-out for UI updates across clients.

### Future extension points

If lower-latency client-originated signals become necessary, evaluate a dedicated realtime signaling path for:

- Typing indicator
- Presence state
- Read receipt

When introducing a new realtime transport, keep write-path ownership on HTTP unless there is a strict latency requirement and the operational model is documented.
