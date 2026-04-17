# Server (Express + Socket.IO)

## Overview
Handles HTTP API requests and real-time communication via Socket.IO.

---

## Architecture
The server follows a **Layered Architecture**:

- **Controller**: HTTP layer (request/response handling).
- **Service**: Business logic and validation. Keeps logic independent from transport layers.
- **Repository**: Pure data access layer using Supabase client.

---

## Chat System
- **REST API**: Event and message management.
- **Socket.IO**: Real-time message broadcasting to connected clients.

---

## Security
- **JWT Propagation**: Inherits the JWT from the client to the Supabase client to enforce RLS.
- **Origin Validation**: Middleware to ensure requests come from authorized origins.

---

## Entry Point
`src/index.ts`