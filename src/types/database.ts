// Hand-authored from supabase/migrations/0001_foundation_products_inventory.sql.
// Regenerate against a live project once one exists:
//   supabase gen types typescript --project-id <ref> > src/types/database.ts
//
// `Relationships` arrays are left empty since this is hand-authored rather
// than generated — embedded-resource selects are still cast explicitly at
// each call site rather than relying on inferred join types.

export type MemberRole = 'owner' | 'manager' | 'inventory_staff' | 'cashier'
export type SessionStatus = 'active' | 'locked' | 'ended'
export type ActivitySeverity = 'info' | 'notice' | 'exception'
export type AuthorizedAction =
  | 'discount'
  | 'refund'
  | 'petty_cash'
  | 'inventory_adjustment'
  | 'safe_drop'
  | 'void'
export type HeldBasketStatus = 'held' | 'resumed' | 'discarded'
export type MemberStatus = 'active' | 'invited' | 'suspended'
/** Which half of the product a business is running (0018). */
export type OperatorMode = 'single_owner' | 'multi_operator'
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
export type FinancialAccount =
  | 'cash'
  | 'bank'
  | 'safe'
  | 'petty_cash'
  | 'supplier_payable'
  | 'revenue'
  | 'cogs'
  | 'expense'
export type FinancialDirection = 'debit' | 'credit'
export type FinancialEventType =
  | 'sale_revenue'
  | 'sale_cogs'
  | 'cash_in'
  | 'bank_in'
  | 'expense'
  | 'supplier_payable_add'
  | 'supplier_payment'
  | 'safe_drop_out'
  | 'safe_drop_in'
  | 'petty_cash_out'
  | 'petty_cash_fund'
  | 'float_open'
  | 'drawer_variance'
  | 'adjustment'
export type ShiftStatus = 'open' | 'closed'
export type CashSource = 'cash' | 'bank' | 'petty_cash'
export type CalculatorKind = 'standard' | 'margin' | 'markup' | 'discount' | 'unit' | 'profit'
export type InsightType = 'positive' | 'attention'
export type InsightCategory = 'sales' | 'expenses' | 'margin' | 'stock' | 'cash'

export interface Database {
  public: {
    Tables: {
      canonical_products: {
        Row: {
          id: string
          name: string
          brand: string | null
          category: string | null
          /** Primary barcode (EAN/UPC) — the spine of catalog identity. */
          gtin: string | null
          base_unit: string
          image_url: string | null
          is_active: boolean
          created_by_business: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['canonical_products']['Row']> & { name: string }
        Update: Partial<Database['public']['Tables']['canonical_products']['Row']>
        Relationships: []
      }
      supplier_profiles: {
        Row: {
          id: string
          business_id: string
          display_name: string
          logo_url: string | null
          description: string | null
          location_text: string | null
          delivery_areas: string[] | null
          min_order_note: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          contact_email: string | null
          verification: SupplierVerification
          /** Earned standing. Publishing alone makes a supplier discoverable. */
          trust_tier: TrustTier
          /** Listed when is_public AND verification is not 'rejected' (0027). */
          is_public: boolean
          completed_orders: number
          fulfillment_rate: string | null
          avg_response_minutes: number | null
          repeat_customers: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['supplier_profiles']['Row']> & {
          business_id: string
          display_name: string
        }
        Update: Partial<Database['public']['Tables']['supplier_profiles']['Row']>
        Relationships: []
      }
      supplier_listings: {
        Row: {
          id: string
          supplier_profile_id: string
          business_id: string
          canonical_product_id: string
          supplier_product_name: string | null
          purchase_unit: string
          conversion_to_base: string
          min_order_qty: string
          availability: ListingStatus
          currency_code: string
          /** Detail-page fields (0028). */
          description: string | null
          lead_time_days: number | null
          pack_description: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['supplier_listings']['Row']> & {
          supplier_profile_id: string
          business_id: string
          canonical_product_id: string
          currency_code: string
        }
        Update: Partial<Database['public']['Tables']['supplier_listings']['Row']>
        Relationships: []
      }
      listing_price_tiers: {
        Row: {
          id: string
          listing_id: string
          business_id: string
          min_qty: string
          max_qty: string | null
          unit_price: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['listing_price_tiers']['Row']> & {
          listing_id: string
          business_id: string
          min_qty: string
          unit_price: string
        }
        Update: Partial<Database['public']['Tables']['listing_price_tiers']['Row']>
        Relationships: []
      }
      /**
       * A supplier's own photos of a listing (0028), distinct from the one
       * shared `canonical_products.image_url`. Paths into the PUBLIC
       * `network-images` bucket — build the URL with getPublicUrl, never a
       * signed URL: the reader is by definition not a member of the owning
       * business.
       */
      supplier_listing_images: {
        Row: {
          id: string
          listing_id: string
          business_id: string
          storage_path: string
          sort_order: number
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['supplier_listing_images']['Row']> & {
          listing_id: string
          business_id: string
          storage_path: string
        }
        Update: Partial<Database['public']['Tables']['supplier_listing_images']['Row']>
        Relationships: []
      }
      /**
       * A conversation between a buyer business and a public supplier (0028).
       * Both display names are SNAPSHOTS taken by `start_network_thread` — a
       * supplier cannot read the buyer's `businesses` row, and must not be
       * able to. Never join this to a private table.
       */
      network_threads: {
        Row: {
          id: string
          buyer_business_id: string
          buyer_display_name: string
          supplier_profile_id: string
          supplier_business_id: string
          supplier_display_name: string
          listing_id: string | null
          listing_label: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_sender_business_id: string | null
          buyer_last_read_at: string | null
          supplier_last_read_at: string | null
          created_at: string
        }
        /** Read-only from the client — every write goes through an RPC. */
        Insert: never
        Update: never
        Relationships: []
      }
      network_messages: {
        Row: {
          id: string
          thread_id: string
          sender_business_id: string
          sender_user_id: string | null
          sender_name: string | null
          body: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      supplier_connections: {
        Row: {
          id: string
          requester_business_id: string
          supplier_profile_id: string
          status: ConnectStatus
          /** The private Phase 5 supplier minted when the request is accepted. */
          private_supplier_id: string | null
          requested_at: string
          responded_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['supplier_connections']['Row']> & {
          requester_business_id: string
          supplier_profile_id: string
        }
        Update: Partial<Database['public']['Tables']['supplier_connections']['Row']>
        Relationships: []
      }
      product_barcodes: {
        Row: {
          id: string
          business_id: string
          variant_id: string
          code: string
          kind: BarcodeKind
          /** Base units one scan of this code represents. >1 for cartons. */
          units_per_scan: string
          is_primary: boolean
          /** Resolver → canonical identity (0024). */
          canonical_product_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['product_barcodes']['Row']> & {
          business_id: string
          variant_id: string
          code: string
        }
        Update: Partial<Database['public']['Tables']['product_barcodes']['Row']>
        Relationships: []
      }
      inventory_count_sessions: {
        Row: {
          id: string
          business_id: string
          location_id: string
          mode: CountMode
          status: CountStatus
          is_blind: boolean
          filter: JsonB
          opened_by: string | null
          opened_at: string
          approved_by: string | null
          approved_at: string | null
          note: string | null
        }
        Insert: Partial<Database['public']['Tables']['inventory_count_sessions']['Row']> & {
          id: string
          business_id: string
          location_id: string
        }
        Update: Partial<Database['public']['Tables']['inventory_count_sessions']['Row']>
        Relationships: []
      }
      inventory_count_items: {
        Row: {
          id: string
          session_id: string
          business_id: string
          variant_id: string
          location_id: string
          /** Frozen at session open — never re-read from live inventory. */
          expected_qty: string
          counted_qty: string | null
          avg_cost_snapshot: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['inventory_count_items']['Row']> & {
          session_id: string
          business_id: string
          variant_id: string
          location_id: string
          expected_qty: string
        }
        Update: Partial<Database['public']['Tables']['inventory_count_items']['Row']>
        Relationships: []
      }
      print_jobs: {
        Row: {
          id: string
          business_id: string
          terminal_id: string | null
          job_type: PrintJobType
          status: PrintJobStatus
          payload: JsonB
          copies: number
          requested_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['print_jobs']['Row']> & {
          business_id: string
          job_type: PrintJobType
        }
        Update: Partial<Database['public']['Tables']['print_jobs']['Row']>
        Relationships: []
      }
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
          /**
           * 'single_owner' — the owner just uses the software: no PIN, no
           * operator selection, no terminal restriction, no shift enforcement.
           * 'multi_operator' — activated when the first employee is added; the
           * whole Phase 8 control layer becomes live (0018).
           */
          operator_mode: OperatorMode
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
          /** Null for PIN-only operators, who have no Supabase account (0014). */
          user_id: string | null
          role: MemberRole
          status: MemberStatus
          display_name: string | null
          pin_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['business_members']['Row']> & {
          business_id: string
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
          /** Links "what I stock" to "what suppliers sell" (0024). */
          canonical_product_id: string | null
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
      bank_accounts: {
        Row: {
          id: string
          business_id: string
          name: string
          is_default: boolean
          is_active: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['bank_accounts']['Row']> & { business_id: string }
        Update: Partial<Database['public']['Tables']['bank_accounts']['Row']>
        Relationships: []
      }
      expense_categories: {
        Row: {
          id: string
          business_id: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['expense_categories']['Row']> & {
          business_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['expense_categories']['Row']>
        Relationships: []
      }
      cash_shifts: {
        Row: {
          id: string
          business_id: string
          location_id: string
          opened_by: string | null
          opened_at: string
          opening_float: string
          closed_by: string | null
          closed_at: string | null
          counted_cash: string | null
          expected_cash: string | null
          variance: string | null
          status: ShiftStatus
          note: string | null
          created_at: string
          /** Added by 0012 — the registered device the shift was opened on. */
          terminal_id: string | null
        }
        Insert: Partial<Database['public']['Tables']['cash_shifts']['Row']> & {
          id: string
          business_id: string
          location_id: string
        }
        Update: Partial<Database['public']['Tables']['cash_shifts']['Row']>
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          business_id: string
          location_id: string | null
          category_id: string | null
          amount: string
          currency_code: string
          paid_from: CashSource
          bank_account_id: string | null
          description: string | null
          receipt_path: string | null
          shift_id: string | null
          spent_at: string
          recorded_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['expenses']['Row']> & {
          id: string
          business_id: string
        }
        Update: never
        Relationships: []
      }
      financial_events: {
        Row: {
          id: string
          business_id: string
          event_type: FinancialEventType
          account: FinancialAccount
          direction: FinancialDirection
          amount: string
          currency_code: string
          bank_account_id: string | null
          shift_id: string | null
          category_id: string | null
          reference_type: string | null
          reference_id: string | null
          occurred_at: string
          created_by: string | null
          note: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      business_dictionary: {
        Row: {
          id: string
          term: string
          slug: string
          short_def: string
          full_def: string
          example: string | null
          related: string[]
          category: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      calculator_history: {
        Row: {
          id: string
          user_id: string
          kind: CalculatorKind
          expression: string | null
          result: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['calculator_history']['Row']> & { user_id: string }
        Update: Partial<Database['public']['Tables']['calculator_history']['Row']>
        Relationships: []
      }
      terminals: {
        Row: {
          id: string
          business_id: string
          location_id: string
          device_name: string
          device_type: string
          is_active: boolean
          last_active_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['terminals']['Row']> & {
          business_id: string
          location_id: string
          device_name: string
        }
        Update: Partial<Database['public']['Tables']['terminals']['Row']>
        Relationships: []
      }
      employee_sessions: {
        Row: {
          id: string
          business_id: string
          member_id: string
          terminal_id: string
          token: string
          status: SessionStatus
          opened_at: string
          last_seen_at: string
          ended_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      permission_limits: {
        Row: {
          id: string
          business_id: string
          role: MemberRole
          action: AuthorizedAction
          max_amount: string | null
          max_percent: string | null
          max_quantity: string | null
          allowed: boolean
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['permission_limits']['Row']> & {
          business_id: string
          role: MemberRole
          action: AuthorizedAction
        }
        Update: Partial<Database['public']['Tables']['permission_limits']['Row']>
        Relationships: []
      }
      activity_events: {
        Row: {
          id: string
          business_id: string
          occurred_at: string
          action_type: string
          severity: ActivitySeverity
          initiated_by: string | null
          authorized_by: string | null
          terminal_id: string | null
          shift_id: string | null
          reference_type: string | null
          reference_id: string | null
          detail: Record<string, unknown>
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      held_baskets: {
        Row: {
          id: string
          business_id: string
          terminal_id: string | null
          shift_id: string | null
          member_id: string | null
          label: string | null
          basket: unknown
          item_count: number
          total: string
          status: HeldBasketStatus
          created_at: string
          updated_at: string
          resumed_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['held_baskets']['Row']> & { business_id: string }
        Update: Partial<Database['public']['Tables']['held_baskets']['Row']>
        Relationships: []
      }
    }
    Views: {
      v_marketplace_listings: {
        Row: {
          listing_id: string
          canonical_product_id: string
          product_name: string
          brand: string | null
          category: string | null
          image_url: string | null
          supplier_profile_id: string
          supplier_name: string
          location_text: string | null
          verification: SupplierVerification
          trust_tier: TrustTier
          fulfillment_rate: string | null
          completed_orders: number
          repeat_customers: number
          avg_response_minutes: number | null
          supplier_since: string
          purchase_unit: string
          min_order_qty: string
          availability: ListingStatus
          currency_code: string
          /** Cheapest tier. Null when the listing has no price tiers yet. */
          from_price: string | null
        }
        Relationships: []
      }
      /**
       * One listing in full (0028). Unlike v_marketplace_listings this has no
       * visibility WHERE clause — RLS on supplier_listings does the gating, so
       * the owning business can also open its own hidden listing to preview it.
       */
      v_listing_detail: {
        Row: {
          listing_id: string
          supplier_business_id: string
          supplier_profile_id: string
          canonical_product_id: string
          title: string
          canonical_name: string
          brand: string | null
          category: string | null
          base_unit: string
          canonical_image_url: string | null
          description: string | null
          pack_description: string | null
          lead_time_days: number | null
          purchase_unit: string
          conversion_to_base: string
          min_order_qty: string
          availability: ListingStatus
          currency_code: string
          created_at: string
          updated_at: string
          supplier_name: string
          location_text: string | null
          supplier_logo_url: string | null
          verification: SupplierVerification
          trust_tier: TrustTier
          completed_orders: number
          fulfillment_rate: string | null
          repeat_customers: number
          avg_response_minutes: number | null
          min_order_note: string | null
          contact_phone: string | null
          contact_email: string | null
          supplier_since: string
          from_price: string | null
        }
        Relationships: []
      }
      /** Threads resolved from the caller's side (0028). */
      v_network_threads: {
        Row: {
          id: string
          buyer_business_id: string
          supplier_business_id: string
          supplier_profile_id: string
          listing_id: string | null
          listing_label: string | null
          last_message_at: string | null
          last_message_preview: string | null
          created_at: string
          i_am_buyer: boolean
          counterparty_name: string
          unread_count: number
        }
        Relationships: []
      }
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
      v_cashbook: {
        Row: {
          id: string
          business_id: string
          occurred_at: string
          event_type: FinancialEventType
          account: FinancialAccount
          signed_amount: string
          amount: string
          currency_code: string
          reference_type: string | null
          reference_id: string | null
          shift_id: string | null
          note: string | null
        }
        Relationships: []
      }
      v_activity_feed: {
        Row: {
          id: string
          business_id: string
          occurred_at: string
          action_type: string
          severity: ActivitySeverity
          initiated_by: string | null
          initiated_by_name: string | null
          initiated_by_role: MemberRole | null
          authorized_by: string | null
          authorized_by_name: string | null
          terminal_id: string | null
          terminal_name: string | null
          shift_id: string | null
          reference_type: string | null
          reference_id: string | null
          detail: Record<string, unknown>
        }
        Relationships: []
      }
      v_live_shifts: {
        Row: {
          id: string
          business_id: string
          location_id: string
          terminal_id: string | null
          terminal_name: string | null
          opened_by: string | null
          opened_by_name: string | null
          opened_by_role: MemberRole | null
          opened_at: string
          opening_float: string
          drawer_cash: string
          exception_count: string
        }
        Relationships: []
      }
      v_operators: {
        Row: {
          member_id: string
          business_id: string
          display_name: string | null
          role: MemberRole
          status: MemberStatus
          /** False for PIN-only operators, who have no Supabase account. */
          is_account_user: boolean
          created_at: string
          /** Whether a PIN exists — the hash itself is never selectable. */
          has_pin: boolean
          locked_until: string | null
        }
        Relationships: []
      }
      v_shift_discrepancies: {
        Row: {
          id: string
          business_id: string
          terminal_id: string | null
          terminal_name: string | null
          opened_by: string | null
          opened_by_name: string | null
          opened_at: string
          closed_at: string | null
          opening_float: string
          counted_cash: string | null
          expected_cash: string | null
          variance: string | null
          note: string | null
          void_count: string
          override_count: string
          exception_count: string
        }
        Relationships: []
      }
    }
    Functions: {
      publish_supplier_profile: {
        Args: {
          p_business_id: string
          p_display_name: string
          p_description?: string | null
          p_location_text?: string | null
        }
        Returns: Database['public']['Tables']['supplier_profiles']['Row']
      }
      request_supplier_connection: {
        Args: { p_business_id: string; p_supplier_profile_id: string }
        Returns: Database['public']['Tables']['supplier_connections']['Row']
      }
      accept_supplier_connection: {
        Args: { p_connection_id: string }
        Returns: Database['public']['Tables']['supplier_connections']['Row']
      }
      decline_supplier_connection: {
        Args: { p_connection_id: string }
        Returns: Database['public']['Tables']['supplier_connections']['Row']
      }
      revoke_supplier_connection: {
        Args: { p_connection_id: string }
        Returns: Database['public']['Tables']['supplier_connections']['Row']
      }
      start_network_thread: {
        Args: {
          p_business_id: string
          p_supplier_profile_id: string
          p_body: string
          p_listing_id?: string | null
        }
        Returns: Database['public']['Tables']['network_threads']['Row']
      }
      send_network_message: {
        Args: { p_thread_id: string; p_body: string }
        Returns: Database['public']['Tables']['network_messages']['Row']
      }
      mark_network_thread_read: {
        Args: { p_thread_id: string }
        Returns: void
      }
      resolve_barcode: {
        Args: { p_business_id: string; p_code: string }
        Returns: ResolvedBarcode
      }
      open_count_session: {
        Args: {
          p_session_id: string
          p_business_id: string
          p_location_id: string
          p_mode?: CountMode
          p_is_blind?: boolean
          p_variant_ids?: string[] | null
        }
        Returns: Database['public']['Tables']['inventory_count_sessions']['Row']
      }
      record_count: {
        Args: { p_session_id: string; p_variant_id: string; p_counted_qty: number }
        Returns: void
      }
      approve_count_session: {
        Args: {
          p_session_id: string
          p_approver_member_id: string
          p_approver_pin: string
          p_actor_token?: string | null
        }
        Returns: CountApprovalResult
      }
      cancel_count_session: {
        Args: { p_session_id: string }
        Returns: Database['public']['Tables']['inventory_count_sessions']['Row']
      }
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
          p_shift_id?: string | null
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
      account_balance: {
        Args: { p_business_id: string; p_account: FinancialAccount }
        Returns: string
      }
      financial_position: {
        Args: { p_business_id: string }
        Returns: {
          cash: string
          bank: string
          safe: string
          petty_cash: string
          supplier_payable: string
          available_cash: string
          currency_code: string
        }
      }
      record_expense: {
        Args: {
          p_expense_id: string
          p_business_id: string
          p_amount: number
          p_paid_from?: CashSource
          p_category_id?: string | null
          p_description?: string | null
          p_location_id?: string | null
          p_shift_id?: string | null
          p_receipt_path?: string | null
          p_spent_at?: string
        }
        Returns: Database['public']['Tables']['expenses']['Row']
      }
      open_shift: {
        Args: {
          p_shift_id: string
          p_business_id: string
          p_location_id: string
          p_opening_float?: number
        }
        Returns: Database['public']['Tables']['cash_shifts']['Row']
      }
      close_shift: {
        Args: { p_shift_id: string; p_counted_cash: number; p_note?: string | null }
        Returns: Database['public']['Tables']['cash_shifts']['Row']
      }
      transfer_cash: {
        Args: {
          p_event_id: string
          p_business_id: string
          p_from: CashSource | 'safe'
          p_to: CashSource | 'safe'
          p_amount: number
          p_shift_id?: string | null
          p_note?: string | null
        }
        Returns: void
      }
      business_insights: {
        Args: { p_business_id: string }
        Returns: { type: InsightType; category: InsightCategory; text: string }[]
      }
      set_employee_pin: {
        Args: { p_business_id: string; p_member_id: string; p_pin: string }
        Returns: void
      }
      operator_has_pin: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      reset_operator_pin: {
        Args: { p_business_id: string; p_member_id: string; p_new_pin: string }
        Returns: void
      }
      enable_operator_mode: {
        Args: { p_business_id: string }
        Returns: Database['public']['Tables']['businesses']['Row']
      }
      disable_operator_mode: {
        Args: { p_business_id: string }
        Returns: Database['public']['Tables']['businesses']['Row']
      }
      create_operator: {
        Args: {
          p_business_id: string
          p_display_name: string
          p_role: MemberRole
          p_pin?: string | null
        }
        Returns: Database['public']['Tables']['business_members']['Row']
      }
      update_operator: {
        Args: {
          p_business_id: string
          p_member_id: string
          p_display_name?: string | null
          p_role?: MemberRole | null
          p_status?: MemberStatus | null
        }
        Returns: Database['public']['Tables']['business_members']['Row']
      }
      unlock_session: {
        Args: { p_token: string; p_pin: string }
        Returns: PinUnlockResult
      }
      pin_unlock: {
        Args: {
          p_business_id: string
          p_member_id: string
          p_terminal_id: string
          p_pin: string
        }
        /** Returns a RESULT — a wrong PIN no longer raises (0026). */
        Returns: PinUnlockResult
      }
      pin_resume_session: {
        Args: { p_token: string; p_pin: string }
        Returns: SessionContext
      }
      session_context: {
        Args: { p_token: string }
        Returns: SessionContext | null
      }
      session_actor: {
        Args: { p_token: string }
        Returns: string | null
      }
      pin_lock_session: {
        Args: { p_token: string }
        Returns: void
      }
      end_session: {
        Args: { p_token: string }
        Returns: void
      }
      authorize: {
        Args: {
          p_business_id: string
          p_action: AuthorizedAction
          p_actor_token: string
          p_amount?: number | null
          p_percent?: number | null
          p_quantity?: number | null
          p_terminal_id?: string | null
          p_shift_id?: string | null
          p_approver_member_id?: string | null
          p_approver_pin?: string | null
        }
        Returns: AuthorizationGrant
      }
      seed_permission_limits: {
        Args: { p_business_id: string }
        Returns: void
      }
      seed_inventory_staff_limits: {
        Args: { p_business_id: string }
        Returns: void
      }
      record_activity: {
        Args: {
          p_business_id: string
          p_action_type: string
          p_initiated_by?: string | null
          p_authorized_by?: string | null
          p_terminal_id?: string | null
          p_shift_id?: string | null
          p_reference_type?: string | null
          p_reference_id?: string | null
          p_severity?: ActivitySeverity
          p_detail?: unknown
        }
        Returns: string
      }
      record_activity_as_actor: {
        Args: {
          p_business_id: string
          p_action_type: string
          p_actor_token: string | null
          p_authorized_by?: string | null
          p_terminal_id?: string | null
          p_shift_id?: string | null
          p_reference_type?: string | null
          p_reference_id?: string | null
          p_severity?: ActivitySeverity
          p_detail?: unknown
        }
        Returns: string
      }
    }
  }
}

/** Resolved server-side from a session token — never assembled on the client. */
export interface SessionContext {
  member_id: string
  business_id: string
  terminal_id: string
  terminal_name: string | null
  role: MemberRole
  display_name: string | null
  status: SessionStatus
  opened_at: string
  last_seen_at: string
}

export interface AuthorizationGrant {
  granted: boolean
  requires_authorization?: boolean
  initiated_by: string
  authorized_by?: string
  reason?: string
}

type JsonB = Record<string, unknown>

// ---------------------------------------------------------------------------
// Phase 10 — scan & print (0022 / 0023)
// ---------------------------------------------------------------------------
export type BarcodeKind =
  | 'manufacturer'
  | 'internal'
  | 'carton'
  | 'warehouse'
  | 'promotional'
  | 'other'

export type CountMode =
  | 'cycle'
  | 'blind'
  | 'aisle'
  | 'category'
  | 'supplier'
  | 'zone'
  | 'full'
  | 'recount'

export type CountStatus = 'open' | 'counting' | 'pending_approval' | 'approved' | 'cancelled'

export type PrintJobType =
  | 'receipt'
  | 'product_label'
  | 'shelf_label'
  | 'warehouse_label'
  | 'variance_report'
  | 'count_report'
  | 'po_document'
  | 'other'

export type PrintJobStatus = 'queued' | 'printing' | 'done' | 'failed' | 'cancelled'

/**
 * Optional `medium` hint inside a print job payload. The payload stays
 * device-neutral — this only tells the renderer which paper it is aiming at,
 * and an adapter is free to ignore it.
 */
export type PrintMediumHint =
  | 'receipt-80mm'
  | 'receipt-58mm'
  | 'label-50x25'
  | 'label-40x30'
  | 'a4'

/**
 * What resolve_barcode returns. Money and quantities cross the wire as strings
 * so nothing is rounded on the way in.
 */
export type ResolvedBarcode =
  | { found: false; code: string }
  | {
      found: true
      code: string
      variant_id: string
      product_id: string
      product_name: string
      variant_name: string | null
      sku: string | null
      selling_price: string
      /** Base units this one scan represents — >1 for a carton code. */
      units_per_scan: string
      kind: BarcodeKind
    }

/**
 * approve_count_session returns a RESULT, not an exception, when the PIN is
 * wrong. A raise would roll back the denial audit record written alongside it
 * (0023) — so failure has to commit.
 */
export interface CountApprovalResult {
  approved: boolean
  already_approved?: boolean
  reason?: 'bad_pin' | 'locked_out' | 'not_authorized' | 'cancelled'
  adjustments?: number
  shrinkage_value?: string
}

// ---------------------------------------------------------------------------
// Phase 11 — business network (0024 / 0025)
//
// These are the PUBLIC plane. Anything typed here is readable across
// businesses by design. Private cost, margin, purchase history and inventory
// live in the private tables above and never gain a public read path.
// ---------------------------------------------------------------------------
export type SupplierVerification = 'unverified' | 'pending' | 'verified' | 'rejected'
export type ListingStatus = 'active' | 'out_of_stock' | 'hidden'
export type ConnectStatus = 'requested' | 'accepted' | 'declined' | 'revoked'

/**
 * Progressive trust (0027). Verification gates RISK, not ACCESS: a supplier is
 * discoverable from the moment they publish, and the tier decides limits,
 * ranking and badges rather than whether they exist.
 */
export type TrustTier = 'provisional' | 'verified' | 'trusted' | 'preferred'

/**
 * pin_unlock / unlock_session return a result rather than raising on a bad PIN.
 *
 * 0026 had to change the contract to fix the lockout: the old version
 * incremented failed_count and then raised, and the raise rolled the increment
 * back — so the counter never moved and the 5-attempt lockout never fired,
 * despite the UI promising it. A write cannot survive a raise in the same
 * transaction, so failure has to RETURN.
 */
export type PinFailureReason =
  | 'incorrect'
  | 'locked'
  | 'no_pin'
  | 'no_session'
  | 'device_not_authenticated'

export type PinUnlockResult =
  | { ok: true; token: string; member_id: string; role: MemberRole }
  | {
      ok: false
      reason: PinFailureReason
      /** Present on 'incorrect' — how many tries are left before a lockout. */
      attempts_remaining?: number
      locked_until?: string
    }
