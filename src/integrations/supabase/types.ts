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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log_entries: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      duty_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          duty_date: string
          duty_type: string
          id: string
          notes: string | null
          team_member_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          duty_date: string
          duty_type?: string
          id?: string
          notes?: string | null
          team_member_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          duty_date?: string
          duty_type?: string
          id?: string
          notes?: string | null
          team_member_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duty_entries_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          country: string
          created_at: string | null
          date: string
          id: string
          label: string
        }
        Insert: {
          country?: string
          created_at?: string | null
          date: string
          id?: string
          label: string
        }
        Update: {
          country?: string
          created_at?: string | null
          date?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string | null
          error_count: number | null
          id: string
          imported_by: string | null
          inserted_count: number | null
          metadata: Json | null
          skipped_count: number | null
          source_filename: string | null
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          id?: string
          imported_by?: string | null
          inserted_count?: number | null
          metadata?: Json | null
          skipped_count?: number | null
          source_filename?: string | null
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          id?: string
          imported_by?: string | null
          inserted_count?: number | null
          metadata?: Json | null
          skipped_count?: number | null
          source_filename?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string | null
          full_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string | null
          full_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string | null
          full_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          active: boolean
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_approve_user: { Args: { target_user_id: string }; Returns: boolean }
      admin_set_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: never; Returns: boolean }
      purge_audit_log: { Args: { keep_days: number }; Returns: number }
      seed_morocco_holidays: { Args: { year: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
