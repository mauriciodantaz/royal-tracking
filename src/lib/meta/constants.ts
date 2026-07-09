/**
 * Única constante de versão da Graph / Marketing API (Meta).
 * Atualizar aqui quando a Meta lançar nova versão estável.
 * Docs: https://developers.facebook.com/docs/marketing-api/overview/versioning/
 */
export const META_GRAPH_API_VERSION = "v25.0" as const;

export const META_GRAPH_BASE_URL =
  `https://graph.facebook.com/${META_GRAPH_API_VERSION}` as const;
