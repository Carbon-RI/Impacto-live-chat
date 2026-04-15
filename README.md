# Hybrid Authorization Chat System (Express + Supabase RLS)

A chat infrastructure combining Node.js (Express) and Supabase. Authorization logic is offloaded to the database layer via **Row Level Security (RLS)** to ensure physical data protection.

## Architecture

### Dual-Layer Authorization
- **App Layer (Express)**: Responsible for request validation and user identification from JWT.
- **DB Layer (Supabase RLS)**: Evaluates the propagated JWT to perform final access control on a per-row basis.

### JWT Propagation
Inherits the JWT received by the Express server into the Supabase client. This allows the database to enforce user-specific access control using `auth.uid()`.

---

## Security Design (RLS Policies)

The following policies are applied to the `messages` table.

### SELECT (Read Access)
Access is granted only if the `event_id` is linked to the current `auth.uid()` in the `event_participants` table.
- **Objective**: Structurally block unauthorized access to chat histories of events the user has not joined.

### INSERT (Write Access)
Permitted only if the `user_id` matches `auth.uid()` and the user is registered as a participant for the target event.
- **Objective**: Prevent identity spoofing and unauthorized writes to foreign events.

---

## Implementation Details

### Atomic Event Creation
Automatically registers the creator into `event_participants` upon event creation (`/events`). This maintains consistency between the authorization model and the user experience.

### Error Handling
- **401 Unauthorized**: Authentication failure (invalid or missing token).
- **403 Forbidden**: Authorization failure (no permission for the event or rejected by RLS).
- **400 Bad Request**: Malformed request or missing payload.

---

## Tech Stack
- Backend: Node.js / Express / TypeScript
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth (JWT)
- Realtime: Socket.io (RLS-backed queries)
- Media: Cloudinary (Signed Uploads)

---

## Development Policy
Avoid bypassing restrictions with `service_role`. Always use token-scoped clients (`createAuthedClient`) to maintain the database as a secure boundary.