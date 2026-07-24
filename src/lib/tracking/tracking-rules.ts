/**
 * GTM-lite condition evaluator for snippet page/event rules.
 */

export type RuleField =
  | "url"
  | "hostname"
  | "path"
  | "query"
  | "hash"
  | "title"
  | "referrer";

export type RuleOp =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "not_equals"
  | "not_contains"
  | "exists";

export type RuleCondition = {
  field: RuleField;
  op: RuleOp;
  value?: string;
};

export type RuleAction =
  | "exclude_pageview"
  | "exclude_lead"
  | "force_event"
  | "map_event_name";

export type TrackingRule = {
  id: string;
  name?: string;
  enabled?: boolean;
  /** AND (default) or OR across conditions */
  match: "and" | "or";
  conditions: RuleCondition[];
  action: RuleAction;
  /** For force_event / map_event_name */
  event_name?: string;
};

export type RuleContext = {
  url: string;
  hostname: string;
  path: string;
  query: string;
  hash: string;
  title: string;
  referrer: string;
};

const MAX_REGEX_LEN = 200;

export const BUILTIN_EXCLUSIONS: TrackingRule[] = [
  {
    id: "builtin-wp-admin",
    name: "Exclude wp-admin",
    enabled: true,
    match: "or",
    conditions: [
      { field: "path", op: "contains", value: "/wp-admin" },
      { field: "path", op: "contains", value: "/logout" },
      { field: "path", op: "contains", value: "/preview" },
      { field: "query", op: "contains", value: "preview=true" },
    ],
    action: "exclude_pageview",
  },
  {
    id: "builtin-wp-admin-lead",
    name: "Exclude leads on admin/preview",
    enabled: true,
    match: "or",
    conditions: [
      { field: "path", op: "contains", value: "/wp-admin" },
      { field: "path", op: "contains", value: "/logout" },
      { field: "query", op: "contains", value: "preview=true" },
    ],
    action: "exclude_lead",
  },
];

function fieldValue(ctx: RuleContext, field: RuleField): string {
  switch (field) {
    case "url":
      return ctx.url;
    case "hostname":
      return ctx.hostname;
    case "path":
      return ctx.path;
    case "query":
      return ctx.query;
    case "hash":
      return ctx.hash;
    case "title":
      return ctx.title;
    case "referrer":
      return ctx.referrer;
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

function safeRegex(pattern: string): RegExp | null {
  if (!pattern || pattern.length > MAX_REGEX_LEN) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function evalCondition(
  cond: RuleCondition,
  ctx: RuleContext
): boolean {
  const actual = fieldValue(ctx, cond.field);
  const expected = cond.value ?? "";
  switch (cond.op) {
    case "equals":
      return actual.toLowerCase() === expected.toLowerCase();
    case "not_equals":
      return actual.toLowerCase() !== expected.toLowerCase();
    case "contains":
      return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains":
      return !actual.toLowerCase().includes(expected.toLowerCase());
    case "starts_with":
      return actual.toLowerCase().startsWith(expected.toLowerCase());
    case "ends_with":
      return actual.toLowerCase().endsWith(expected.toLowerCase());
    case "exists":
      return actual.length > 0;
    case "regex": {
      const re = safeRegex(expected);
      if (!re) return false;
      return re.test(actual);
    }
    default: {
      const _exhaustive: never = cond.op;
      return _exhaustive;
    }
  }
}

export function ruleMatches(rule: TrackingRule, ctx: RuleContext): boolean {
  if (rule.enabled === false) return false;
  const conditions = rule.conditions || [];
  if (!conditions.length) return false;
  if (rule.match === "or") {
    return conditions.some((c) => evalCondition(c, ctx));
  }
  return conditions.every((c) => evalCondition(c, ctx));
}

export function contextFromUrl(
  href: string,
  extras?: { title?: string; referrer?: string }
): RuleContext {
  let hostname = "";
  let path = "";
  let query = "";
  let hash = "";
  try {
    const u = new URL(href);
    hostname = u.hostname;
    path = u.pathname;
    query = u.search.startsWith("?") ? u.search.slice(1) : u.search;
    hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
  } catch {
    path = href;
  }
  return {
    url: href,
    hostname,
    path,
    query,
    hash,
    title: extras?.title ?? "",
    referrer: extras?.referrer ?? "",
  };
}

export type RuleEvalResult = {
  excludePageview: boolean;
  excludeLead: boolean;
  forceEvents: string[];
  /** original event → mapped name */
  eventMap: Record<string, string>;
  matchedRuleIds: string[];
};

export function evaluateRules(
  rules: TrackingRule[],
  ctx: RuleContext
): RuleEvalResult {
  const all = [...BUILTIN_EXCLUSIONS, ...rules];
  const result: RuleEvalResult = {
    excludePageview: false,
    excludeLead: false,
    forceEvents: [],
    eventMap: {},
    matchedRuleIds: [],
  };

  for (const rule of all) {
    if (!ruleMatches(rule, ctx)) continue;
    result.matchedRuleIds.push(rule.id);
    switch (rule.action) {
      case "exclude_pageview":
        result.excludePageview = true;
        break;
      case "exclude_lead":
        result.excludeLead = true;
        break;
      case "force_event":
        if (rule.event_name) result.forceEvents.push(rule.event_name);
        break;
      case "map_event_name":
        if (rule.event_name) {
          // Map any event when condition matches — use "*" as source
          result.eventMap["*"] = rule.event_name;
        }
        break;
      default: {
        const _exhaustive: never = rule.action;
        void _exhaustive;
      }
    }
  }
  return result;
}
