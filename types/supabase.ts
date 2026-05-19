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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      blog_authors: {
        Row: {
          avatar_url: string | null
          credentials: string | null
          description: string | null
          id: number
          instagram_url: string | null
          linkedin_url: string | null
          name: string
          role: string | null
          slug: string
          source_payload: Json
          synced_at: string
        }
        Insert: {
          avatar_url?: string | null
          credentials?: string | null
          description?: string | null
          id: number
          instagram_url?: string | null
          linkedin_url?: string | null
          name: string
          role?: string | null
          slug: string
          source_payload: Json
          synced_at?: string
        }
        Update: {
          avatar_url?: string | null
          credentials?: string | null
          description?: string | null
          id?: number
          instagram_url?: string | null
          linkedin_url?: string | null
          name?: string
          role?: string | null
          slug?: string
          source_payload?: Json
          synced_at?: string
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          count: number
          description: string | null
          id: number
          name: string
          parent_id: number | null
          slug: string
          source_payload: Json
          synced_at: string
        }
        Insert: {
          count?: number
          description?: string | null
          id: number
          name: string
          parent_id?: number | null
          slug: string
          source_payload: Json
          synced_at?: string
        }
        Update: {
          count?: number
          description?: string | null
          id?: number
          name?: string
          parent_id?: number | null
          slug?: string
          source_payload?: Json
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: number | null
          category_ids: number[]
          content: string | null
          excerpt: string | null
          featured_image: Json | null
          id: number
          modified_at: string
          og_image_url: string | null
          published_at: string
          reading_time_min: number
          related_product_ids: number[]
          seo_description: string | null
          seo_title: string | null
          slug: string
          source_payload: Json
          synced_at: string
          tag_ids: number[]
          title: string
          video_url: string | null
        }
        Insert: {
          author_id?: number | null
          category_ids?: number[]
          content?: string | null
          excerpt?: string | null
          featured_image?: Json | null
          id: number
          modified_at: string
          og_image_url?: string | null
          published_at: string
          reading_time_min?: number
          related_product_ids?: number[]
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          source_payload: Json
          synced_at?: string
          tag_ids?: number[]
          title: string
          video_url?: string | null
        }
        Update: {
          author_id?: number | null
          category_ids?: number[]
          content?: string | null
          excerpt?: string | null
          featured_image?: Json | null
          id?: number
          modified_at?: string
          og_image_url?: string | null
          published_at?: string
          reading_time_min?: number
          related_product_ids?: number[]
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          source_payload?: Json
          synced_at?: string
          tag_ids?: number[]
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "blog_authors"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          count: number
          description: string | null
          id: number
          name: string
          slug: string
          source_payload: Json
          synced_at: string
        }
        Insert: {
          count?: number
          description?: string | null
          id: number
          name: string
          slug: string
          source_payload: Json
          synced_at?: string
        }
        Update: {
          count?: number
          description?: string | null
          id?: number
          name?: string
          slug?: string
          source_payload?: Json
          synced_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          description: string | null
          founded: string | null
          hero_image_url: string | null
          id: number
          image: Json | null
          name: string
          region: string | null
          slug: string
          source_payload: Json
          stats: Json | null
          synced_at: string
          video_url: string | null
        }
        Insert: {
          description?: string | null
          founded?: string | null
          hero_image_url?: string | null
          id: number
          image?: Json | null
          name: string
          region?: string | null
          slug: string
          source_payload: Json
          stats?: Json | null
          synced_at?: string
          video_url?: string | null
        }
        Update: {
          description?: string | null
          founded?: string | null
          hero_image_url?: string | null
          id?: number
          image?: Json | null
          name?: string
          region?: string | null
          slug?: string
          source_payload?: Json
          stats?: Json | null
          synced_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          default_upsell_product_id: number | null
          description: string | null
          display_order: number | null
          id: number
          image: Json | null
          name: string
          parent_id: number | null
          section_tag_slugs: string[]
          seo_description: string | null
          seo_title: string | null
          slug: string
          source_payload: Json
          synced_at: string
        }
        Insert: {
          default_upsell_product_id?: number | null
          description?: string | null
          display_order?: number | null
          id: number
          image?: Json | null
          name: string
          parent_id?: number | null
          section_tag_slugs?: string[]
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          source_payload: Json
          synced_at?: string
        }
        Update: {
          default_upsell_product_id?: number | null
          description?: string | null
          display_order?: number | null
          id?: number
          image?: Json | null
          name?: string
          parent_id?: number | null
          section_tag_slugs?: string[]
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          source_payload?: Json
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_default_upsell_product_id_fkey"
            columns: ["default_upsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rules: {
        Row: {
          apply_to: Json
          count_mode: string
          enabled: boolean
          end_date: string | null
          id: number
          name: string
          source_payload: Json
          start_date: string | null
          synced_at: string
          tiers: Json
          type: string
        }
        Insert: {
          apply_to?: Json
          count_mode?: string
          enabled?: boolean
          end_date?: string | null
          id: number
          name: string
          source_payload: Json
          start_date?: string | null
          synced_at?: string
          tiers?: Json
          type: string
        }
        Update: {
          apply_to?: Json
          count_mode?: string
          enabled?: boolean
          end_date?: string | null
          id?: number
          name?: string
          source_payload?: Json
          start_date?: string | null
          synced_at?: string
          tiers?: Json
          type?: string
        }
        Relationships: []
      }
      product_tags: {
        Row: {
          description: string | null
          id: number
          name: string
          slug: string
          synced_at: string
        }
        Insert: {
          description?: string | null
          id: number
          name: string
          slug: string
          synced_at?: string
        }
        Update: {
          description?: string | null
          id?: number
          name?: string
          slug?: string
          synced_at?: string
        }
        Relationships: []
      }
      product_variations: {
        Row: {
          attributes: Json
          id: number
          image: Json | null
          parent_id: number
          price: number | null
          regular_price: number | null
          sale_price: number | null
          sku: string | null
          source_payload: Json
          stock_quantity: number | null
          stock_status: string | null
          synced_at: string
          weight_g: number | null
        }
        Insert: {
          attributes?: Json
          id: number
          image?: Json | null
          parent_id: number
          price?: number | null
          regular_price?: number | null
          sale_price?: number | null
          sku?: string | null
          source_payload: Json
          stock_quantity?: number | null
          stock_status?: string | null
          synced_at?: string
          weight_g?: number | null
        }
        Update: {
          attributes?: Json
          id?: number
          image?: Json | null
          parent_id?: number
          price?: number | null
          regular_price?: number | null
          sale_price?: number | null
          sku?: string | null
          source_payload?: Json
          stock_quantity?: number | null
          stock_status?: string | null
          synced_at?: string
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          average_rating: number | null
          brand_id: number | null
          brand_slug: string | null
          categories: number[]
          created_at: string
          description: string | null
          id: number
          images: Json
          name: string
          price: number | null
          rating_count: number | null
          regular_price: number | null
          sale_price: number | null
          seo_description: string | null
          seo_title: string | null
          short_description: string | null
          sku: string | null
          slug: string
          source_payload: Json
          status: string
          stock_quantity: number | null
          stock_status: string | null
          synced_at: string
          tag_slugs: string[]
          type: string
          updated_at: string
          upsell_product_id: number | null
          weight_g: number | null
        }
        Insert: {
          attributes?: Json
          average_rating?: number | null
          brand_id?: number | null
          brand_slug?: string | null
          categories?: number[]
          created_at?: string
          description?: string | null
          id: number
          images?: Json
          name: string
          price?: number | null
          rating_count?: number | null
          regular_price?: number | null
          sale_price?: number | null
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string | null
          slug: string
          source_payload: Json
          status: string
          stock_quantity?: number | null
          stock_status?: string | null
          synced_at?: string
          tag_slugs?: string[]
          type: string
          updated_at?: string
          upsell_product_id?: number | null
          weight_g?: number | null
        }
        Update: {
          attributes?: Json
          average_rating?: number | null
          brand_id?: number | null
          brand_slug?: string | null
          categories?: number[]
          created_at?: string
          description?: string | null
          id?: number
          images?: Json
          name?: string
          price?: number | null
          rating_count?: number | null
          regular_price?: number | null
          sale_price?: number | null
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string
          source_payload?: Json
          status?: string
          stock_quantity?: number | null
          stock_status?: string | null
          synced_at?: string
          tag_slugs?: string[]
          type?: string
          updated_at?: string
          upsell_product_id?: number | null
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_upsell_product_id_fkey"
            columns: ["upsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      site_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      wp_menus: {
        Row: {
          items: Json
          menu_id: number
          name: string | null
          synced_at: string
        }
        Insert: {
          items?: Json
          menu_id: number
          name?: string | null
          synced_at?: string
        }
        Update: {
          items?: Json
          menu_id?: number
          name?: string | null
          synced_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
