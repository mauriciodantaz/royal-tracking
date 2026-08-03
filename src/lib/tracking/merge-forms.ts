import "server-only";

import { getPool } from "@/lib/db/pool";
import {
  fingerprintForm,
  formMergeIdentity,
  normalizeFormLabel,
} from "@/lib/tracking/form-fingerprint";

type FormRow = {
  id: string;
  fingerprint: string;
  label: string;
  page_url: string | null;
  field_names: unknown;
  submission_count: number;
};

function fieldNamesOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
}

/**
 * Idempotent cleanup:
 * 1) Merge forms that share normalized label + field_names
 * 2) Delete leads without email/phone and orphan junk forms
 */
export async function mergeAndCleanupForms(): Promise<{
  mergedGroups: number;
  deletedForms: number;
  deletedLeads: number;
}> {
  const pool = getPool();
  const client = await pool.connect();
  let mergedGroups = 0;
  let deletedForms = 0;
  let deletedLeads = 0;

  try {
    await client.query("BEGIN");

    const { rows } = await client.query<FormRow>(
      `select id, fingerprint, label, page_url, field_names, submission_count
       from forms
       order by submission_count desc, updated_at desc`
    );

    const groups = new Map<string, FormRow[]>();
    for (const row of rows) {
      const key = formMergeIdentity({
        label: row.label,
        fieldNames: fieldNamesOf(row.field_names),
      });
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    for (const [, group] of groups) {
      if (group.length < 2) {
        const only = group[0];
        if (!only) continue;
        const names = fieldNamesOf(only.field_names);
        const nextFp = fingerprintForm({
          label: only.label,
          fieldNames: names,
          pageUrl: only.page_url,
        });
        const nextLabel = normalizeFormLabel(only.label) || only.label;
        if (nextFp !== only.fingerprint || nextLabel !== only.label) {
          try {
            await client.query(
              `update forms
               set fingerprint = $1, label = $2, updated_at = now()
               where id = $3`,
              [nextFp, nextLabel, only.id]
            );
          } catch {
            // Unique conflict: another row already owns the new fingerprint.
          }
        }
        continue;
      }

      const keeper = group[0]!;
      const orphans = group.slice(1);
      const names = fieldNamesOf(keeper.field_names);
      const nextFp = fingerprintForm({
        label: keeper.label,
        fieldNames: names,
        pageUrl: keeper.page_url,
      });
      const nextLabel = normalizeFormLabel(keeper.label) || keeper.label;
      const totalSubs = group.reduce(
        (sum, r) => sum + (Number(r.submission_count) || 0),
        0
      );

      for (const orphan of orphans) {
        await client.query(
          `update form_leads set form_id = $1 where form_id = $2`,
          [keeper.id, orphan.id]
        );
        await client.query(`delete from forms where id = $1`, [orphan.id]);
        deletedForms += 1;
      }

      try {
        await client.query(
          `update forms
           set fingerprint = $1,
               label = $2,
               submission_count = $3,
               updated_at = now()
           where id = $4`,
          [nextFp, nextLabel, totalSubs, keeper.id]
        );
      } catch {
        await client.query(
          `update forms
           set label = $1,
               submission_count = $2,
               updated_at = now()
           where id = $3`,
          [nextLabel, totalSubs, keeper.id]
        );
      }
      mergedGroups += 1;
    }

    const leads = await client.query<{ count: string }>(
      `with doomed as (
         delete from form_leads
         where email_hash is null and phone_hash is null
         returning 1
       )
       select count(*)::text as count from doomed`
    );
    deletedLeads = Number(leads.rows[0]?.count ?? 0);

    const forms = await client.query<{ count: string }>(
      `with doomed as (
         delete from forms f
         where not exists (
           select 1 from form_leads fl
           where fl.form_id = f.id
             and (fl.email_hash is not null or fl.phone_hash is not null)
         )
         returning 1
       )
       select count(*)::text as count from doomed`
    );
    deletedForms += Number(forms.rows[0]?.count ?? 0);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { mergedGroups, deletedForms, deletedLeads };
}
