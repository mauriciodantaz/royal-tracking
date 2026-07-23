"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import {
  normalizePhoneDigits,
  slugifyLabel,
  type TrackedLinkRow,
} from "@/lib/tracking/tracked-links";

export type LinkActionResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string };

export async function createTrackedLinkAction(
  formData: FormData
): Promise<LinkActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "unauthorized" };
  }

  const label = String(formData.get("label") ?? "").trim();
  const phone = normalizePhoneDigits(String(formData.get("phone") ?? ""));
  const message = String(formData.get("message") ?? "").trim();
  let slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!slug) slug = slugifyLabel(label || message || "whatsapp");

  if (!phone) {
    return { ok: false, error: "Telefone inválido (use DDI + DDD + número)." };
  }
  if (slug.length < 2) {
    return { ok: false, error: "Slug muito curto." };
  }

  await ensureDbReady();
  const existing = await queryOne<{ id: string }>(
    `select id from tracked_links where slug = $1 limit 1`,
    [slug]
  );
  if (existing) {
    return { ok: false, error: `Slug "${slug}" já existe.` };
  }

  const row = await queryOne<TrackedLinkRow>(
    `insert into tracked_links (
       slug, label, phone_digits, message_template,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       created_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      slug,
      label || null,
      phone,
      message,
      String(formData.get("utm_source") ?? "").trim() || null,
      String(formData.get("utm_medium") ?? "").trim() || null,
      String(formData.get("utm_campaign") ?? "").trim() || null,
      String(formData.get("utm_term") ?? "").trim() || null,
      String(formData.get("utm_content") ?? "").trim() || null,
      session.user.id,
    ]
  );

  if (!row) return { ok: false, error: "db_error" };
  revalidatePath("/dashboard/links");
  return { ok: true, slug: row.slug };
}

export async function toggleTrackedLinkAction(
  formData: FormData
): Promise<LinkActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "unauthorized" };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  await ensureDbReady();
  await query(
    `update tracked_links set active = not active, updated_at = now() where id = $1`,
    [id]
  );
  revalidatePath("/dashboard/links");
  return { ok: true };
}

export async function deleteTrackedLinkAction(
  formData: FormData
): Promise<LinkActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "unauthorized" };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  await ensureDbReady();
  await query(`delete from tracked_links where id = $1`, [id]);
  revalidatePath("/dashboard/links");
  return { ok: true };
}
