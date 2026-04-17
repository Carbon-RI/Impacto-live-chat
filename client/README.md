# Client (Next.js)

## Overview
Frontend application built with Next.js (App Router) and Tailwind CSS.

---

## Structure
- `app/`: Routing and layout.
- `components/`: Reusable UI components (EventCards, Modals).
- `features/`: Feature-based modules (Encapsulated logic).
- `utils/`: Shared utilities (Cloudinary, Media helpers).
- `lib/`: Configuration and environment handling.

---

## Feature-based Design: Chat
`features/chat/`
Dependency direction is intentionally one-way: **UI -> Hook -> API**.
- **api/**: External I/O (Supabase queries, realtime subscriptions).
- **hooks/**: Chat state machine and feature orchestration (`useChat`).
- **components/**: Presentation-focused UI (`ChatPanel`).

---

## State Management
- **React Hooks**: Local and feature-specific state.
- **Context API**: Global state exposure via `GlobalChatProvider`.

---

## Notes
The client follows a feature-based structure for scalability and to make network/database boundaries explicit.