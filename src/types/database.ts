// Hand-authored from supabase/migrations/0001_foundation_products_inventory.sql.
// Regenerate against a live project once one exists:
//   supabase gen types typescript --project-id <ref> > src/types/database.ts
//
// `Relationships` arrays are left empty since this is hand-authored rather
// than generated — embedded-resource selects are still cast explicitly at
// each call site rather than relying on inferred join types.

export type MemberRole = 'owner' | 'manager' | 'cashier'
export type MemberStatus = 'active' | 'invited' | 'suspended'
export type StockMovementType =
  | 'initial'
  | 'restock'
  | 'sale'
  | 'sale_reversal'
  | 'adjustment'
  | 'damage'
  | 'transfer_in'
  | 'transfer_out'
export type StockStatus = 'negative' | 'out_of_stock' | 'low' | 'ok'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_path: string | null
          locale: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      businesses: {
        Row: {
          id: string
          name: string
          currency_code: string
          currency_exponent: number
          timezone: string
          country_code: string | null
          logo_path: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['businesses']['Row']> & { name: string; currency_code: string }
        Update: Partial<Database['public']['Tables']['businesses']['Row']>
        Relationships: []
      }
      business_members: {
        Row: {
          id: string
          business_id: string
          user_id: string
          role: MemberRole
          status: MemberStatus
          display_name: string | null
          pin_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['business_members']['Row']> & {
          business_id: string
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['business_members']['Row']>
        Relationships: [
          {
            foreignKeyName: 'business_members_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      locations: {
        Row: {
          id: string
          business_id: string
          name: string
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['locations']['Row']> & { business_id: string; name: string }
        Update: Partial<Database['public']['Tables']['locations']['Row']>
        Relationships: []
      }
      product_categories: {
        Row: {
          id: string
          business_id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['product_categories']['Row']> & {
          business_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['product_categories']['Row']>
        Relationships: []
      }
      products: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          category_id: string | null
          image_path: string | null
          base_unit: string
          purchase_unit: string | null
          purchase_conversion_qty: string | null
          has_variants: boolean
          option_names: string[]
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['products']['Row']> & { business_id: string; name: string }
        Update: Partial<Database['public']['Tables']['products']['Row']>
        Relationships: []
      }
      product_variants: {
        Row: {
          id: string
          business_id: string
          product_id: string
          option_values: string[]
          variant_name: string | null
          sku: string | null
          barcode: string | null
          selling_price: string
          low_stock_threshold: string
          is_active: boolean
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['product_variants']['Row']> & {
          business_id: string
          product_id: string
        }
        Update: Partial<Database['public']['Tables']['product_variants']['Row']>
        Relationships: [
          {
            foreignKeyName: 'product_variants_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      inventory_levels: {
        Row: {
          variant_id: string
          location_id: string
          business_id: string
          qty_on_hand: string
          avg_cost: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['inventory_levels']['Row']> & {
          variant_id: string
          location_id: string
          business_id: string
        }
        Update: Partial<Database['public']['Tables']['inventory_levels']['Row']>
        Relationships: []
      }
      stock_movements: {
        Row: {
          id: string
          business_id: string
          location_id: string
          variant_id: string
          movement_type: StockMovementType
          quantity: string
          unit_cost: string
          qty_after: string
          avg_cost_after: string
          purchase_unit_qty: string | null
          purchase_unit: string | null
          reference_type: string | null
          reference_id: string | null
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['stock_movements']['Row']> & {
          id: string
          variant_id: string
          location_id: string
          movement_type: StockMovementType
          quantity: string
        }
        Update: Partial<Database['public']['Tables']['stock_movements']['Row']>
        Relationships: [
          {
            foreignKeyName: 'stock_movements_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_variant_id_fkey'
            columns: ['variant_id']
            isOneToOne: false
            referencedRelation: 'product_variants'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_variant_stock: {
        Row: {
          variant_id: string
          business_id: string
          product_id: string
          product_name: string
          image_path: string | null
          base_unit: string
          has_variants: boolean
          category_id: string | null
          category_name: string | null
          variant_name: string | null
          option_values: string[]
          sku: string | null
          barcode: string | null
          selling_price: string
          low_stock_threshold: string
          is_active: boolean
          location_id: string | null
          qty_on_hand: string
          avg_cost: string
          stock_value: string
          stock_status: StockStatus
        }
        Relationships: []
      }
    }
    Functions: {
      create_business: {
        Args: {
          p_name: string
          p_currency_code: string
          p_currency_exponent?: number
          p_timezone?: string
          p_country_code?: string | null
          p_location_name?: string
        }
        Returns: Database['public']['Tables']['businesses']['Row']
      }
      create_product: {
        Args: {
          p_business_id: string
          p_name: string
          p_variants: unknown
          p_description?: string | null
          p_category_id?: string | null
          p_image_path?: string | null
          p_base_unit?: string
          p_purchase_unit?: string | null
          p_purchase_conversion_qty?: number | null
          p_option_names?: string[]
          p_location_id?: string | null
        }
        Returns: Database['public']['Tables']['products']['Row']
      }
      record_stock_movement: {
        Args: {
          p_movement_id: string
          p_variant_id: string
          p_location_id: string
          p_movement_type: StockMovementType
          p_quantity: number
          p_unit_cost?: number | null
          p_purchase_unit_qty?: number | null
          p_purchase_unit?: string | null
          p_reference_type?: string | null
          p_reference_id?: string | null
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['stock_movements']['Row']
      }
      recalculate_inventory_level: {
        Args: { p_variant_id: string; p_location_id: string }
        Returns: Database['public']['Tables']['inventory_levels']['Row']
      }
    }
  }
}
