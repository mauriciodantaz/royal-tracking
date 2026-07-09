export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          id: number;
          webhook_token: string | null;
          currency: string;
          test_event_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          webhook_token?: string | null;
          currency?: string;
          test_event_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          webhook_token?: string | null;
          currency?: string;
          test_event_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ga4_accounts: {
        Row: {
          id: string;
          label: string;
          measurement_id: string;
          api_secret_cipher: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          measurement_id: string;
          api_secret_cipher?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ga4_accounts"]["Insert"]>;
      };
      meta_pixels: {
        Row: {
          id: string;
          label: string;
          pixel_id: string;
          capi_token_cipher: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          pixel_id: string;
          capi_token_cipher?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meta_pixels"]["Insert"]>;
      };
      meta_ad_accounts: {
        Row: {
          id: string;
          label: string;
          ad_account_id: string;
          ads_token_cipher: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          ad_account_id: string;
          ads_token_cipher?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["meta_ad_accounts"]["Insert"]
        >;
      };
      visitors: {
        Row: {
          id: string;
          trck_user_id: string;
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
          ga_session_id: string | null;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trck_user_id: string;
          email?: string | null;
          email_hash?: string | null;
          phone_hash?: string | null;
          first_name_hash?: string | null;
          last_name_hash?: string | null;
          city_hash?: string | null;
          state_hash?: string | null;
          country_hash?: string | null;
          external_id_hash?: string | null;
          fbp?: string | null;
          fbc?: string | null;
          ga_client_id?: string | null;
          ga_session_id?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          referrer?: string | null;
          ip?: string | null;
          user_agent?: string | null;
          geo_country?: string | null;
          geo_region?: string | null;
          geo_city?: string | null;
          pixel_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["visitors"]["Insert"]>;
      };
      events_log: {
        Row: {
          id: string;
          trck_user_id: string | null;
          event_name: string;
          event_id: string;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_term: string | null;
          utm_content: string | null;
          payload_meta: Json | null;
          response_meta: Json | null;
          payload_ga4: Json | null;
          response_ga4: Json | null;
          ip: string | null;
          geo_country: string | null;
          geo_region: string | null;
          geo_city: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trck_user_id?: string | null;
          event_name: string;
          event_id: string;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          payload_meta?: Json | null;
          response_meta?: Json | null;
          payload_ga4?: Json | null;
          response_ga4?: Json | null;
          ip?: string | null;
          geo_country?: string | null;
          geo_region?: string | null;
          geo_city?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events_log"]["Insert"]>;
      };
      purchases: {
        Row: {
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
        Insert: {
          id?: string;
          transaction_id: string;
          trck_user_id?: string | null;
          email?: string | null;
          email_hash?: string | null;
          phone_hash?: string | null;
          product_name?: string | null;
          product_id?: string | null;
          value?: number | null;
          currency?: string | null;
          status?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          fbp?: string | null;
          fbc?: string | null;
          geo_country?: string | null;
          geo_region?: string | null;
          geo_city?: string | null;
          match_status?: string | null;
          match_reason?: string | null;
          meta_event_id?: string | null;
          response_meta?: Json | null;
          payload_meta?: Json | null;
          response_ga4?: Json | null;
          payload_ga4?: Json | null;
          ga_client_id?: string | null;
          webhook_raw?: Json | null;
          sent_meta_at?: string | null;
          sent_ga4_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchases"]["Insert"]>;
      };
    };
    Functions: {
      encrypt_secret: {
        Args: { plain: string; secret_key: string };
        Returns: string;
      };
      decrypt_secret: {
        Args: { cipher: string; secret_key: string };
        Returns: string;
      };
      purge_old_event_payloads: {
        Args: { batch_size?: number };
        Returns: number;
      };
    };
  };
};
