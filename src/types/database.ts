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
export type SaleStatus = 'completed' | 'voided'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'
export type PoStatus = 'draft' | 'ordered' | 'partially_received' | 'completed' | 'cancelled'
export type PoItemStatus = 'pending' | 'partial' | 'complete'
export type ReceiptDiscrepancy = 'none' | 'damaged' | 'wrong' | 'expired' | 'missing' | 'other'

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
      sales: {
        Row: {
          id: string
          business_id: string
          location_id: string
          sale_number: string
          status: SaleStatus
          subtotal: string
          discount_total: string
          tax_total: string
          grand_total: string
          cost_total: string
          currency_code: string
          sold_by: string | null
          note: string | null
          voided_at: string | null
          voided_by: string | null
          void_reason: string | null
          completed_at: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['sales']['Row']> & {
          id: string
          business_id: string
          location_id: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'sales_sold_by_fkey'
            columns: ['sold_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          business_id: string
          variant_id: string | null
          product_name: string
          variant_name: string | null
          sku: string | null
          quantity: string
          unit_price: string
          unit_cost: string
          line_total: string
          line_cost: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['sale_items']['Row']> & {
          sale_id: string
          business_id: string
          product_name: string
          quantity: string
          unit_price: string
          unit_cost: string
          line_total: string
          line_cost: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'sale_items_sale_id_fkey'
            columns: ['sale_id']
            isOneToOne: false
            referencedRelation: 'sales'
            referencedColumns: ['id']
          },
        ]
      }
      sale_payments: {
        Row: {
          id: string
          sale_id: string
          business_id: string
          method: string
          amount: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['sale_payments']['Row']> & {
          sale_id: string
          business_id: string
          method: string
          amount: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'sale_payments_sale_id_fkey'
            columns: ['sale_id']
            isOneToOne: false
            referencedRelation: 'sales'
            referencedColumns: ['id']
          },
        ]
      }
      suppliers: {
        Row: {
          id: string
          business_id: string
          name: string
          phone: string | null
          email: string | null
          address: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['suppliers']['Row']> & {
          business_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['suppliers']['Row']>
        Relationships: []
      }
      product_suppliers: {
        Row: {
          id: string
          business_id: string
          variant_id: string
          supplier_id: string
          supplier_sku: string | null
          purchase_unit: string
          conversion_to_base: string
          last_purchase_cost: string | null
          is_preferred: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['product_suppliers']['Row']> & {
          business_id: string
          variant_id: string
          supplier_id: string
        }
        Update: Partial<Database['public']['Tables']['product_suppliers']['Row']>
        Relationships: [
          {
            foreignKeyName: 'product_suppliers_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'suppliers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'product_suppliers_variant_id_fkey'
            columns: ['variant_id']
            isOneToOne: false
            referencedRelation: 'product_variants'
            referencedColumns: ['id']
          },
        ]
      }
      purchase_orders: {
        Row: {
          id: string
          business_id: string
          supplier_id: string
          location_id: string
          po_number: string
          status: PoStatus
          expected_total: string
          currency_code: string
          note: string | null
          ordered_at: string | null
          cancelled_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['purchase_orders']['Row']> & {
          id: string
          business_id: string
          supplier_id: string
          location_id: string
          po_number: string
          currency_code: string
        }
        Update: Partial<Database['public']['Tables']['purchase_orders']['Row']>
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          id: string
          po_id: string
          business_id: string
          variant_id: string
          product_name: string
          purchase_unit: string
          conversion_to_base: string
          qty_ordered_purchase: string
          expected_unit_cost: string
          qty_received_base: string
          status: PoItemStatus
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['purchase_order_items']['Row']> & {
          po_id: string
          business_id: string
          variant_id: string
          product_name: string
          purchase_unit: string
          conversion_to_base: string
          qty_ordered_purchase: string
        }
        Update: Partial<Database['public']['Tables']['purchase_order_items']['Row']>
        Relationships: []
      }
      goods_receipts: {
        Row: {
          id: string
          po_id: string
          business_id: string
          location_id: string
          received_by: string | null
          received_at: string
          note: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['goods_receipts']['Row']> & {
          id: string
          po_id: string
          business_id: string
          location_id: string
        }
        Update: Partial<Database['public']['Tables']['goods_receipts']['Row']>
        Relationships: []
      }
      goods_receipt_items: {
        Row: {
          id: string
          receipt_id: string
          po_item_id: string
          business_id: string
          variant_id: string
          qty_received_purchase: string
          qty_good_base: string
          qty_damaged_base: string
          qty_discrepancy_base: string
          discrepancy_reason: ReceiptDiscrepancy
          unit_cost_purchase: string
          unit_cost_base: string
          note: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['goods_receipt_items']['Row']> & {
          receipt_id: string
          po_item_id: string
          business_id: string
          variant_id: string
        }
        Update: Partial<Database['public']['Tables']['goods_receipt_items']['Row']>
        Relationships: []
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
      v_sale_summary: {
        Row: {
          id: string
          business_id: string
          location_id: string
          sale_number: string
          status: SaleStatus
          subtotal: string
          grand_total: string
          cost_total: string
          gross_profit: string
          currency_code: string
          sold_by: string | null
          sold_by_name: string | null
          completed_at: string
          voided_at: string | null
          item_count: string
          unit_count: string
        }
        Relationships: []
      }
      v_inventory_value: {
        Row: {
          business_id: string
          variant_count: string
          total_units: string
          total_cost_value: string
          negative_variant_count: string
        }
        Relationships: []
      }
      v_inventory_value_by_category: {
        Row: {
          business_id: string
          category_id: string | null
          category_name: string | null
          variant_count: string
          total_units: string
          total_cost_value: string
        }
        Relationships: []
      }
      v_purchase_order_summary: {
        Row: {
          id: string
          business_id: string
          supplier_id: string
          supplier_name: string
          po_number: string
          status: PoStatus
          expected_total: string
          currency_code: string
          ordered_at: string | null
          created_at: string
          item_count: string
          received_value: string
        }
        Relationships: []
      }
      v_purchase_history: {
        Row: {
          business_id: string
          variant_id: string
          product_name: string
          po_id: string
          po_number: string
          supplier_id: string
          supplier_name: string
          received_at: string
          qty_good_base: string
          unit_cost_base: string
          unit_cost_purchase: string
          purchase_unit: string
          line_value: string
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
      complete_sale: {
        Args: {
          p_sale_id: string
          p_business_id: string
          p_location_id: string
          p_items: unknown
          p_payments?: unknown
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['sales']['Row']
      }
      void_sale: {
        Args: { p_sale_id: string; p_reason?: string | null }
        Returns: Database['public']['Tables']['sales']['Row']
      }
      dashboard_summary: {
        Args: { p_business_id: string }
        Returns: JsonB
      }
      sales_report: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: JsonB
      }
      sales_timeseries: {
        Args: { p_business_id: string; p_from: string; p_to: string; p_bucket?: string }
        Returns: { bucket_start: string; revenue: string; cost: string; transactions: number }[]
      }
      product_performance: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: {
          product_id: string
          product_name: string
          units_sold: string
          revenue: string
          cost: string | null
          gross_profit: string | null
          last_sold_at: string | null
        }[]
      }
      business_day_start: {
        Args: { p_business_id: string; p_days_offset?: number }
        Returns: string
      }
      business_week_start: {
        Args: { p_business_id: string }
        Returns: string
      }
      business_month_start: {
        Args: { p_business_id: string }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_po_id: string
          p_business_id: string
          p_supplier_id: string
          p_items: unknown
          p_location_id?: string | null
          p_status?: string
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['purchase_orders']['Row']
      }
      receive_goods: {
        Args: {
          p_receipt_id: string
          p_po_id: string
          p_items: unknown
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['goods_receipts']['Row']
      }
      restock_suggestions: {
        Args: { p_business_id: string }
        Returns: {
          supplier_id: string | null
          supplier_name: string | null
          variant_id: string
          product_name: string
          variant_name: string | null
          qty_on_hand: string
          low_stock_threshold: string
          suggested_qty_base: string
          purchase_unit: string
          conversion_to_base: string
          suggested_qty_purchase: string
          last_purchase_cost: string | null
        }[]
      }
    }
  }
}

type JsonB = Record<string, unknown>
