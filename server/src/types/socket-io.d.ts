import "socket.io";

/**
 * After `io.use` auth middleware succeeds, `userId` is always set for that socket.
 * Socket.io stores custom state on `socket.data` (recommended over ad-hoc properties).
 */
declare module "socket.io" {
  interface SocketData {
    userId: string;
  }
}
