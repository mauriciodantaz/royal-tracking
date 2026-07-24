"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { auditLog } from "@/lib/audit/log";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import { safeActionMessage } from "@/lib/http/public-error";
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
  let user;
  try {
    user = await requirePermission("links:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
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

  try {
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
        user.id,
      ]
    );

    if (!row) return { ok: false, error: "Não foi possível criar o link." };
    await auditLog({
      actorUserId: user.id,
      action: "link.create",
      resourceType: "tracked_link",
      resourceId: row.id,
      meta: { slug: row.slug },
    });
    revalidatePath("/dashboard/links");
    return { ok: true, slug: row.slug };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/tracked_links/i.test(msg) && /does not exist/i.test(msg)) {
      return {
        ok: false,
        error:
          "Tabela tracked_links ainda não existe — reinicie o app para aplicar migrations.",
      };
    }
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: `Slug "${slug}" já existe.` };
    }
    return { ok: false, error: safeActionMessage(err) };
  }
}

export async function toggleTrackedLinkAction(
  formData: FormData
): Promise<LinkActionResult> {
  let user;
  try {
    user = await requirePermission("links:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Link inválido." };

  try {
    await ensureDbReady();
    await query(
      `update tracked_links set active = not active, updated_at = now() where id = $1`,
      [id]
    );
    await auditLog({
      actorUserId: user.id,
      action: "link.toggle",
      resourceType: "tracked_link",
      resourceId: id,
    });
    revalidatePath("/dashboard/links");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
}

export async function deleteTrackedLinkAction(
  formData: FormData
): Promise<LinkActionResult> {
  let user;
  try {
    user = await requirePermission("links:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Link inválido." };

  try {
    await ensureDbReady();
    await query(`delete from tracked_links where id = $1`, [id]);
    await auditLog({
      actorUserId: user.id,
      action: "link.delete",
      resourceType: "tracked_link",
      resourceId: id,
    });
    revalidatePath("/dashboard/links");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
}
