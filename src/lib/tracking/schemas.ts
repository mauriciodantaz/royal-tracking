import { z } from "zod";

export const identifySchema = z.object({
  trck_user_id: z.string().min(1).max(128).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).max(32).optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  fbp: z.string().max(256).optional(),
  fbc: z.string().max(512).optional(),
  ga_client_id: z.string().max(128).optional(),
  ga_session_id: z.string().max(128).optional(),
  gclid: z.string().max(256).optional(),
  ttclid: z.string().max(256).optional(),
  ctwa_clid: z.string().max(512).optional(),
  wbraid: z.string().max(256).optional(),
  gbraid: z.string().max(256).optional(),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  referrer: z.string().max(2000).optional(),
  pixel_id: z.string().max(64).optional(),
});

const clientWebSchema = z
  .object({
    meta: z.boolean().optional(),
    ga4: z.boolean().optional(),
  })
  .optional();

export const eventSchema = z.object({
  trck_user_id: z.string().min(1).max(128),
  event_name: z.string().min(1).max(64),
  event_id: z.string().min(1).max(128).optional(),
  event_source_url: z.string().url().optional(),
  value: z.number().optional(),
  currency: z.string().length(3).optional(),
  content_ids: z.array(z.string()).optional(),
  content_name: z.string().max(200).optional(),
  content_type: z.string().max(64).optional(),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  ga_client_id: z.string().max(128).optional(),
  client_web: clientWebSchema,
});

export type IdentifyInput = z.infer<typeof identifySchema>;
export type EventInput = z.infer<typeof eventSchema>;

export const leadSchema = z.object({
  trck_user_id: z.string().min(1).max(128).optional(),
  form_fingerprint: z.string().min(1).max(128).optional(),
  form_label: z.string().max(200).optional(),
  form_action: z.string().max(2000).optional(),
  page_url: z.string().max(2000).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).max(32).optional(),
  name: z.string().max(200).optional(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  consent: z.boolean().optional(),
  fbp: z.string().max(256).optional(),
  fbc: z.string().max(512).optional(),
  ga_client_id: z.string().max(128).optional(),
  gclid: z.string().max(256).optional(),
  ttclid: z.string().max(256).optional(),
  ctwa_clid: z.string().max(512).optional(),
  wbraid: z.string().max(256).optional(),
  gbraid: z.string().max(256).optional(),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  event_name: z.string().min(1).max(64).optional(),
  event_id: z.string().min(1).max(128).optional(),
  client_web: clientWebSchema,
});

export type LeadInput = z.infer<typeof leadSchema>;
