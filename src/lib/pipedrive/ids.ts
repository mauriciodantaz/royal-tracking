/** Aceita id escalar ou objeto da API v1 (`{ id | value }`). */
export function pipedriveId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") return null;
    return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    return pipedriveId(rec.id) ?? pipedriveId(rec.value);
  }
  return null;
}

export function isPipedriveDealEntity(entity: string | null): boolean {
  if (!entity) return true;
  return entity.toLowerCase() === "deal";
}
