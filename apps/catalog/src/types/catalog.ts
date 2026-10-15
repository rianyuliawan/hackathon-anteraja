export interface Buyer {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  default_address?: string | null;
  default_postcode?: string | null;
  roles?: Array<string | { role: string }>;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  price: number | string;
  weight_grams?: number;
  description?: string | null;
  image_url?: string | null;
  active?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  product_id?: number;
  product_name_snapshot?: string;
  product_name?: string;
  quantity: number;
  price_snapshot?: number | string;
  price?: number | string;
}

export interface Order {
  id: number;
  order_no: string;
  status: string;
  awb?: string | null;
  shipment_status?: string | null;
  subtotal?: number | string;
  shipping_fee?: number | string;
  created_at?: string;
  rejection_reason?: string | null;
  recipient_name?: string;
  recipient_phone?: string;
  destination_address_snapshot?: string;
  destination_postcode?: string;
  items?: OrderItem[];
  shipment?: { awb?: string | null; status?: string };
}
