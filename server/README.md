# Server (Express HTTP API)

## Overview
Handles HTTP API requests for state mutations and validation.

---

## Architecture
The server follows a **Layered Architecture**:

- **Controller**: HTTP layer (request/response handling).
- **Service**: Business logic and validation. Keeps logic independent from transport layers.
- **Repository**: Pure data access layer using Supabase client.

---

## Chat System
- **HTTP API**: Event and message state mutations.
- **Supabase Realtime**: State synchronization across clients (handled by client subscriptions).

---

## Security
- **JWT Propagation**: Inherits the JWT from the client to the Supabase client to enforce RLS.
- **Origin Validation**: Middleware to ensure requests come from authorized origins.

---

## Entry Point
`src/index.ts`