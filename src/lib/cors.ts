import { NextResponse } from "next/server";

import {
  isRequestOriginAllowed,
  resolveCorsAllowOrigin,
} from "@/lib/tracking/allowed-origins";

const BASE_CORS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export function corsHeaders(request?: Request): Record<string, string> {
  const allowOrigin = resolveCorsAllowOrigin(request);
  const headers: Record<string, string> = { ...BASE_CORS };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowOrigin !== "*") {
      headers.Vary = "Origin";
    }
  }
  return headers;
}

export function corsPreflight(request?: Request): NextResponse {
  if (request && !isRequestOriginAllowed(request)) {
    return new NextResponse(null, {
      status: 403,
      headers: corsHeaders(request),
    });
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function withCors(
  response: NextResponse,
  request?: Request
): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}

export function jsonCors(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
  request?: Request
): NextResponse {
  const response = NextResponse.json(body, {
    status: init?.status,
    headers: init?.headers,
  });
  return withCors(response, request);
}

/** 403 when ALLOWED_EVENT_DOMAINS is set and Origin/Referer is outside the apex list. */
export function guardPublicTrackingOrigin(
  request: Request
): NextResponse | null {
  if (isRequestOriginAllowed(request)) return null;
  return jsonCors({ error: "origin_not_allowed" }, { status: 403 }, request);
}
