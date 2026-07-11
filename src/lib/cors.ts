import { NextResponse } from "next/server";

/** Public tracking APIs are called from client sites (cross-origin). */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function jsonCors(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): NextResponse {
  const response = NextResponse.json(body, {
    status: init?.status,
    headers: init?.headers,
  });
  return withCors(response);
}
