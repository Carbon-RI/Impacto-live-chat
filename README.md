# Impacto LiveChat

## Overview
A real-time event-based chat system with strict database-level security enforced by Supabase RLS.
Users can create events, join them, and communicate in real time.

---

## Architecture
- **Client**: Next.js (UI + state management)
- **Server**: Express (HTTP API layer)
- **Database**: Supabase (persistent storage + authorization via RLS)
- **Realtime Sync**: Supabase Realtime (`postgres_changes` + `broadcast`)

This application uses HTTP for all state mutations and Supabase Realtime for synchronization. See `realtime/README.md` for details.

## 📺 Technical Walkthrough

### 🔗 Project Links
- **Live Demo**: [https://impacto-live-chat.vercel.app/](https://impacto-live-chat.vercel.app/)  
  *(Please note: Initial loading may take a few seconds due to cold start)*
- **Demo Video**: [Watch on YouTube](https://youtu.be/EyJlOt7oV5o?si)

<br />

<p align="center">
  <a href="https://youtu.be/EyJlOt7oV5o?si">
    <img src="https://img.youtube.com/vi/4RV3xgyXoK4/0.jpg" alt="Impacto LiveChat Demo Video" width="85%">
  </a>
</p>

<br />

This demo showcases how the application integrates real-time communication with strict database-level security.

### 🔑 Key Highlights (Jump to YouTube)
- [**0:00** - Login & Event Browsing](https://youtu.be/EyJlOt7oV5o?si&t=0s)
- [**0:20** - Real-time Chat Initialization (Supabase Realtime)](https://youtu.be/EyJlOt7oV5o?si&t=20s)
- [**0:40** - Persistent Chat Display during Event Creation](https://youtu.be/EyJlOt7oV5o?si&t=40s)
- [**1:00** - Media Sharing & In-line Preview](https://youtu.be/EyJlOt7oV5o?si&t=60s)
- [**1:35** - Administrative Authority: Organizer Features (RLS Evidence)](https://youtu.be/EyJlOt7oV5o?si&t=95s)

---

## Development Policy

### Security Boundary
The database is treated as a secure boundary. RLS is never bypassed using the `service_role` key.

### Token-scoped Clients
All database operations use token-scoped clients to ensure `auth.uid()` is always enforced by PostgreSQL policies.

---

## Key Design Decisions

### 1. Hybrid Authorization (RLS-based Security)
Authorization logic is offloaded to the database layer via **Row Level Security (RLS)**.
- **App Layer**: Validates requests and identifies users from JWT.
- **DB Layer**: Enforces final access control using `auth.uid()`.

The database is treated as the ultimate security boundary. Even if the application layer is compromised, RLS ensures data protection.

### 2. Layered Backend Architecture
The server follows a strict separation of concerns to ensure maintainability:
- **Controller**: Request/Response handling.
- **Service**: Business logic and validation.
- **Repository**: Pure data access via Supabase.

### 3. Feature-based Frontend Structure
The client uses a feature-based architecture (`features/chat/`). Each feature encapsulates:
- UI components
- Hooks (state management)
- API logic

---

## Database Management & Structure
The database is managed to ensure both reproducibility and design clarity:
- **`db/schema.sql`**: Current full database schema (single source of truth).
- **`supabase/migrations/`**: Reconstructed schema evolution focused on key design decisions.
- **`supabase/seed.sql`**: Initial data for local development.

---

## Notes
- The database was initially created using Supabase Studio (Editor).
- Migration files are reconstructed to reflect key architectural decisions rather than full history.

---

## Setup
```bash
# Install dependencies
npm install

# Start Supabase local environment
supabase start

# Reset and seed database
supabase db reset

# Run server
cd server && npm run dev

# Run client
cd client && npm run dev