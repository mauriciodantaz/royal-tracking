import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  getIntegrationDocsSlug,
  getModule,
} from "@/lib/integrations/registry";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loadIntegrationDocsMarkdown(
  provider: string
): Promise<{ title: string; slug: string; markdown: string } | null> {
  const mod = getModule(provider);
  const slug = getIntegrationDocsSlug(provider);
  if (!mod || !slug || !SLUG_RE.test(slug)) return null;

  const filePath = join(process.cwd(), "docs", "integrations", `${slug}.md`);
  try {
    const markdown = await readFile(filePath, "utf8");
    return { title: mod.name, slug, markdown };
  } catch {
    return null;
  }
}
