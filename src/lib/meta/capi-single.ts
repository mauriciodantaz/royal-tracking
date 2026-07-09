import "server-only";

import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { decryptSecret } from "@/lib/crypto/secrets";
import { buildCapiPayload, type MetaEventInput } from "@/lib/meta/capi";

export async function sendCapiToPixel(opts: {
  pixelId: string;
  tokenCipher: string;
  input: MetaEventInput;
}) {
  const token = await decryptSecret(opts.tokenCipher);
  const payload = buildCapiPayload(opts.input);
  const url = `${META_GRAPH_BASE_URL}/${opts.pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const response = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload, response };
}
