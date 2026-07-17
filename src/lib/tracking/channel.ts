import type { OutboundResult } from "@/lib/integrations/outbound";

export type ChannelClass = "web_server" | "server_only" | "web_only" | "none";

export type ClientWebFlags = {
  meta?: boolean;
  ga4?: boolean;
};

export function classifyChannel(input: {
  webMeta: boolean;
  webGa4: boolean;
  serverMeta: boolean;
  serverGa4: boolean;
}): ChannelClass {
  const webOk = input.webMeta || input.webGa4;
  const serverOk = input.serverMeta || input.serverGa4;
  if (webOk && serverOk) return "web_server";
  if (serverOk) return "server_only";
  if (webOk) return "web_only";
  return "none";
}

export function serverFlagsFromDispatch(results: OutboundResult[]): {
  serverMeta: boolean;
  serverGa4: boolean;
} {
  return {
    serverMeta: results.some((r) => r.provider === "meta_pixel" && r.ok),
    serverGa4: results.some((r) => r.provider === "ga4" && r.ok),
  };
}

export function clientWebFromBody(
  clientWeb: ClientWebFlags | undefined
): { webMeta: boolean; webGa4: boolean } {
  return {
    webMeta: Boolean(clientWeb?.meta),
    webGa4: Boolean(clientWeb?.ga4),
  };
}
