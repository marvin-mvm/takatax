export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_events: {
        Row: {
          account_id: string
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          partner_user_id: string | null
          target_id: string | null
        }
        Insert: {
          account_id: string
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          partner_user_id?: string | null
          target_id?: string | null
        }
        Update: {
          account_id?: string
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          partner_user_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          business_type: string
          cor_document_id: string | null
          created_at: string
          id: string
          income_tax_option: Database["public"]["Enums"]["income_tax_option"]
          line_of_business: string | null
          mixed_income: boolean
          owner_user_id: string
          premium_started_at: string | null
          premium_until: string | null
          rdo_code: string | null
          registered_address: string | null
          registered_name: string | null
          registration_date: string | null
          tin: string | null
          trade_name: string | null
          trial_used: boolean
          updated_at: string
          vat_registered: boolean
          withholding_agent: boolean
        }
        Insert: {
          business_type?: string
          cor_document_id?: string | null
          created_at?: string
          id?: string
          income_tax_option?: Database["public"]["Enums"]["income_tax_option"]
          line_of_business?: string | null
          mixed_income?: boolean
          owner_user_id: string
          premium_started_at?: string | null
          premium_until?: string | null
          rdo_code?: string | null
          registered_address?: string | null
          registered_name?: string | null
          registration_date?: string | null
          tin?: string | null
          trade_name?: string | null
          trial_used?: boolean
          updated_at?: string
          vat_registered?: boolean
          withholding_agent?: boolean
        }
        Update: {
          business_type?: string
          cor_document_id?: string | null
          created_at?: string
          id?: string
          income_tax_option?: Database["public"]["Enums"]["income_tax_option"]
          line_of_business?: string | null
          mixed_income?: boolean
          owner_user_id?: string
          premium_started_at?: string | null
          premium_until?: string | null
          rdo_code?: string | null
          registered_address?: string | null
          registered_name?: string | null
          registration_date?: string | null
          tin?: string | null
          trade_name?: string | null
          trial_used?: boolean
          updated_at?: string
          vat_registered?: boolean
          withholding_agent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "accounts_cor_document_fk"
            columns: ["cor_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_spend: {
        Row: {
          account_id: string | null
          completion_tokens: number
          cost_usd: number
          created_at: string
          document_id: string | null
          function_name: string
          id: string
          model: string
          prompt_tokens: number
          step: string | null
        }
        Insert: {
          account_id?: string | null
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          document_id?: string | null
          function_name: string
          id?: string
          model: string
          prompt_tokens?: number
          step?: string | null
        }
        Update: {
          account_id?: string | null
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          document_id?: string | null
          function_name?: string
          id?: string
          model?: string
          prompt_tokens?: number
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_spend_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_spend_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      community_answers: {
        Row: {
          body: string
          created_at: string
          helpful: boolean
          id: string
          partner_user_id: string
          post_id: string
        }
        Insert: {
          body: string
          created_at?: string
          helpful?: boolean
          id?: string
          partner_user_id?: string
          post_id: string
        }
        Update: {
          body?: string
          created_at?: string
          helpful?: boolean
          id?: string
          partner_user_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_answers_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_answers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_answers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          title: string
          topic: string
          visibility: Database["public"]["Enums"]["post_visibility"]
        }
        Insert: {
          author_user_id?: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          title: string
          topic?: string
          visibility?: Database["public"]["Enums"]["post_visibility"]
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          title?: string
          topic?: string
          visibility?: Database["public"]["Enums"]["post_visibility"]
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          partner_read_at: string
          partner_user_id: string
          taxpayer_read_at: string
          taxpayer_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          partner_read_at?: string
          partner_user_id: string
          taxpayer_read_at?: string
          taxpayer_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          partner_read_at?: string
          partner_user_id?: string
          taxpayer_read_at?: string
          taxpayer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string
          bytes: number
          created_at: string
          extracted: Json | null
          file_name: string
          flags: string[]
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          page_count: number
          reader_path: string[]
          run_id: string | null
          status: Database["public"]["Enums"]["document_status"]
          storage_key: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          account_id: string
          bytes: number
          created_at?: string
          extracted?: Json | null
          file_name: string
          flags?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          page_count?: number
          reader_path?: string[]
          run_id?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_key?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string
          bytes?: number
          created_at?: string
          extracted?: Json | null
          file_name?: string
          flags?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string
          page_count?: number
          reader_path?: string[]
          run_id?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_key?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_records: {
        Row: {
          account_id: string
          amount_centavos: number
          category: string | null
          counterparty: string
          counterparty_tin: string | null
          created_at: string
          description: string
          document_id: string | null
          id: string
          kind: Database["public"]["Enums"]["record_kind"]
          record_date: string
          tax_withheld_centavos: number
          updated_at: string
          user_corrected: boolean
          vat_centavos: number
        }
        Insert: {
          account_id: string
          amount_centavos?: number
          category?: string | null
          counterparty?: string
          counterparty_tin?: string | null
          created_at?: string
          description?: string
          document_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["record_kind"]
          record_date: string
          tax_withheld_centavos?: number
          updated_at?: string
          user_corrected?: boolean
          vat_centavos?: number
        }
        Update: {
          account_id?: string
          amount_centavos?: number
          category?: string | null
          counterparty?: string
          counterparty_tin?: string | null
          created_at?: string
          description?: string
          document_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["record_kind"]
          record_date?: string
          tax_withheld_centavos?: number
          updated_at?: string
          user_corrected?: boolean
          vat_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "ledger_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_user_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_user_id?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_access: {
        Row: {
          account_id: string
          ended_at: string | null
          granted_at: string | null
          id: string
          invited_at: string
          partner_user_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          account_id?: string
          ended_at?: string | null
          granted_at?: string | null
          id?: string
          invited_at?: string
          partner_user_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          ended_at?: string | null
          granted_at?: string | null
          id?: string
          invited_at?: string
          partner_user_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_access_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      partner_profiles: {
        Row: {
          bio: string
          bir_accreditation_no: string | null
          city: string
          created_at: string
          display_name: string
          kind: Database["public"]["Enums"]["account_role"]
          prc_license_no: string | null
          rating_avg: number
          rating_count: number
          specialties: string[]
          user_id: string
          verified_at: string | null
          years_in_practice: number
        }
        Insert: {
          bio?: string
          bir_accreditation_no?: string | null
          city?: string
          created_at?: string
          display_name?: string
          kind: Database["public"]["Enums"]["account_role"]
          prc_license_no?: string | null
          rating_avg?: number
          rating_count?: number
          specialties?: string[]
          user_id: string
          verified_at?: string | null
          years_in_practice?: number
        }
        Update: {
          bio?: string
          bir_accreditation_no?: string | null
          city?: string
          created_at?: string
          display_name?: string
          kind?: Database["public"]["Enums"]["account_role"]
          prc_license_no?: string | null
          rating_avg?: number
          rating_count?: number
          specialties?: string[]
          user_id?: string
          verified_at?: string | null
          years_in_practice?: number
        }
        Relationships: []
      }
      partner_reviews: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          partner_user_id: string
          rating: number
        }
        Insert: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          partner_user_id: string
          rating: number
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          partner_user_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_reviews_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string
          amount_centavos: number
          created_at: string
          id: string
          paid_at: string | null
          payer_user_id: string
          provider: string
          provider_checkout_id: string | null
          provider_payment_id: string | null
          purpose: string
          run_id: string | null
          status: string
        }
        Insert: {
          account_id: string
          amount_centavos: number
          created_at?: string
          id?: string
          paid_at?: string | null
          payer_user_id: string
          provider: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          purpose: string
          run_id?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          amount_centavos?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          payer_user_id?: string
          provider?: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          purpose?: string
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          role: Database["public"]["Enums"]["account_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          role?: Database["public"]["Enums"]["account_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          role?: Database["public"]["Enums"]["account_role"]
          user_id?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          document_count: number
          id: string
          kind: string
          page_count: number
          pages_read: number
          paid_at: string | null
          price_centavos: number
          status: string
          trigger_run_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          document_count: number
          id?: string
          kind: string
          page_count?: number
          pages_read?: number
          paid_at?: string | null
          price_centavos?: number
          status?: string
          trigger_run_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          document_count?: number
          id?: string
          kind?: string
          page_count?: number
          pages_read?: number
          paid_at?: string | null
          price_centavos?: number
          status?: string
          trigger_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      community_answers_public: {
        Row: {
          body: string | null
          created_at: string | null
          helpful: boolean | null
          id: string | null
          partner_kind: Database["public"]["Enums"]["account_role"] | null
          partner_name: string | null
          partner_rating: number | null
          partner_user_id: string | null
          post_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_answers_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_answers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_answers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts_public: {
        Row: {
          body: string | null
          created_at: string | null
          id: string | null
          title: string | null
          topic: string | null
          visibility: Database["public"]["Enums"]["post_visibility"] | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          title?: string | null
          topic?: string | null
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          title?: string | null
          topic?: string | null
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Relationships: []
      }
      conversation_list: {
        Row: {
          created_at: string | null
          id: string | null
          last_body: string | null
          last_message_at: string | null
          last_sender_user_id: string | null
          partner_kind: Database["public"]["Enums"]["account_role"] | null
          partner_name: string | null
          partner_read_at: string | null
          partner_user_id: string | null
          taxpayer_name: string | null
          taxpayer_read_at: string | null
          taxpayer_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      acting_partner: {
        Args: { account: string; who: string }
        Returns: string
      }
      ai_spend_today: { Args: never; Returns: number }
      cancel_partner_invite: { Args: { partner: string }; Returns: undefined }
      confirm_cor: {
        Args: { details: Json; document: string }
        Returns: undefined
      }
      delete_my_post: { Args: { post: string }; Returns: undefined }
      ensure_my_account: { Args: never; Returns: string }
      has_account_access: { Args: { target: string }; Returns: boolean }
      invite_partner: { Args: { partner: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_member: { Args: { target: string }; Returns: boolean }
      is_my_post: { Args: { post: string }; Returns: boolean }
      leave_client: { Args: { account: string }; Returns: undefined }
      log_access_event: {
        Args: { account: string; activity: string; target?: string }
        Returns: undefined
      }
      mark_answer_helpful: {
        Args: { answer: string; helped: boolean }
        Returns: undefined
      }
      mark_conversation_read: { Args: { target: string }; Returns: undefined }
      my_account_id: { Args: never; Returns: string }
      my_invitations: {
        Args: never
        Returns: {
          account_id: string
          business_name: string
          invited_at: string
          taxpayer_name: string
          taxpayer_user_id: string
        }[]
      }
      my_plan: {
        Args: never
        Returns: {
          account_id: string
          premium_started_at: string
          premium_until: string
          trial_used: boolean
        }[]
      }
      redact_personal_info: { Args: { input: string }; Returns: string }
      respond_to_invite: {
        Args: { accept: boolean; account: string }
        Returns: undefined
      }
      revoke_partner_access: { Args: { partner: string }; Returns: undefined }
      start_conversation: { Args: { other: string }; Returns: string }
      verify_partner: {
        Args: { approve: boolean; partner: string }
        Returns: undefined
      }
      works_with: { Args: { other: string }; Returns: boolean }
      write_access_event: {
        Args: {
          account: string
          activity: string
          actor: string
          details: Json
          partner: string
          target: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_role: "taxpayer" | "bookkeeper" | "cpa" | "tax_lawyer"
      document_kind:
        | "sales_invoice"
        | "expense_receipt"
        | "form_2307"
        | "cor"
        | "unknown"
      document_status:
        | "waiting_for_storage"
        | "waiting_for_reader"
        | "reading"
        | "accepted"
        | "needs_review"
        | "rejected"
      income_tax_option:
        | "eight_percent"
        | "graduated_osd"
        | "graduated_itemized"
      post_visibility: "public" | "members"
      record_kind: "sale" | "expense" | "withholding"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_role: ["taxpayer", "bookkeeper", "cpa", "tax_lawyer"],
      document_kind: [
        "sales_invoice",
        "expense_receipt",
        "form_2307",
        "cor",
        "unknown",
      ],
      document_status: [
        "waiting_for_storage",
        "waiting_for_reader",
        "reading",
        "accepted",
        "needs_review",
        "rejected",
      ],
      income_tax_option: [
        "eight_percent",
        "graduated_osd",
        "graduated_itemized",
      ],
      post_visibility: ["public", "members"],
      record_kind: ["sale", "expense", "withholding"],
    },
  },
} as const
