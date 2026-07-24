export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "manager";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string | null;
  role: UserRole;
  active: boolean;
  invited_at: string | null;
  password_set_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SettingsRow = {
  id: number;
  webhook_token: string | null;
  currency: string;
  test_event_code: string | null;
  created_at: string;
  updated_at: string;
};

export type MetaAdAccountRow = {
  id: string;
  label: string;
  ad_account_id: string;
  ads_token_cipher: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type VisitorRow = {
  id: string;
  trck_user_id: string;
  ticket_code: string | null;
  email: string | null;
  email_hash: string | null;
  phone_hash: string | null;
  first_name_hash: string | null;
  last_name_hash: string | null;
  city_hash: string | null;
  state_hash: string | null;
  country_hash: string | null;
  external_id_hash: string | null;
  fbp: string | null;
  fbc: string | null;
  ga_client_id: string | null;
  ga_client_id_source: string | null;
  browser_ga_client_id: string | null;
  ga_client_id_created_at: string | null;
  ga_client_id_updated_at: string | null;
  ga_session_id: string | null;
  gclid: string | null;
  ttclid: string | null;
  ctwa_clid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  ip: string | null;
  user_agent: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
  pixel_id: string | null;
  first_lead_at: string | null;
  merged_into_trck_user_id: string | null;
  ft_utm_source: string | null;
  ft_utm_medium: string | null;
  ft_utm_campaign: string | null;
  ft_utm_term: string | null;
  ft_utm_content: string | null;
  ft_referrer: string | null;
  ft_fbp: string | null;
  ft_fbc: string | null;
  ft_gclid: string | null;
  ft_ttclid: string | null;
  ft_ctwa_clid: string | null;
  ft_wbraid: string | null;
  ft_gbraid: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseRow = {
  id: string;
  transaction_id: string;
  trck_user_id: string | null;
  email: string | null;
  email_hash: string | null;
  phone_hash: string | null;
  product_name: string | null;
  product_id: string | null;
  value: number | null;
  currency: string | null;
  status: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbp: string | null;
  fbc: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
  match_status: string | null;
  match_reason: string | null;
  meta_event_id: string | null;
  response_meta: Json | null;
  payload_meta: Json | null;
  response_ga4: Json | null;
  payload_ga4: Json | null;
  ga_client_id: string | null;
  webhook_raw: Json | null;
  sent_meta_at: string | null;
  sent_ga4_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationConnectionRow = {
  id: string;
  provider: string;
  label: string;
  auth_type: string;
  direction: string;
  access_token_cipher: string | null;
  refresh_token_cipher: string | null;
  expires_at: string | null;
  webhook_secret_cipher: string | null;
  account_external_id: string | null;
  config: Json;
  active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type IntegrationEventMappingRow = {
  id: string;
  source_connection_id: string | null;
  source_provider: string | null;
  source_event: string;
  dest_connection_id: string;
  dest_event_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type FormRow = {
  id: string;
  fingerprint: string;
  label: string;
  page_url: string | null;
  field_names: Json;
  field_classification: Json;
  default_event_name: string;
  active: boolean;
  submission_count: number;
  created_at: string;
  updated_at: string;
};

export type FormLeadRow = {
  id: string;
  form_id: string | null;
  trck_user_id: string | null;
  email: string | null;
  phone: string | null;
  email_hash: string | null;
  phone_hash: string | null;
  name: string | null;
  fields: Json;
  page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbp: string | null;
  fbc: string | null;
  gclid: string | null;
  ttclid: string | null;
  ctwa_clid: string | null;
  ga_client_id: string | null;
  source_provider: string;
  source_connection_id: string | null;
  consent: boolean | null;
  raw_payload: Json | null;
  event_id: string | null;
  match_status: string | null;
  match_reason: string | null;
  created_at: string;
  updated_at: string;
};
