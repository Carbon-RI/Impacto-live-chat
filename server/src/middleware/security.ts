import type { NextFunction, Request, Response } from "express";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://impacto-livechat.example.com",
];

function parseAllowedOrigins(): Set<string> {
  const envOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]);
}

const allowedOrigins = parseAllowedOrigins();

export function validateOrigin(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return next();
  }

  const origin = req.header("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: "forbidden_origin" });
  }

  return next();
}
