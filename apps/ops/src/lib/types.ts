export type Role = 'BUYER' | 'OPS_ADMIN' | 'HUB_OPERATOR' | 'COURIER' | 'SELLER';

export interface UserRole {
  role: Role;
  hub_id?: number | null;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role?: Role;
  hub_id?: number | null;
  hub_name?: string | null;
  roles?: Array<Role | UserRole>;
  default_address?: string;
  default_postcode?: string;
  telegram_linked?: boolean;
}

export interface Hub {
  id: number;
  code?: string;
  name: string;
  address?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  active?: boolean;
  zones?: Zone[];
}

export interface Zone {
  id: number;
  hub_id?: number;
  code?: string;
  name: string;
  service_type?: 'PICKUP' | 'DELIVERY';
}

export interface Courier {
  id?: number;
  user_id?: number;
  name?: string;
  email?: string;
  phone?: string;
  available?: boolean;
  max_parcels?: number;
  unreturned_failed_count?: number;
  zones?: Zone[];
  service_types?: string[];
}

export interface Order {
  id: number;
  order_no: string;
  status: string;
  created_at: string;
  recipient_name: string;
  recipient_phone?: string;
  destination_address_snapshot?: string;
  destination_postcode?: string;
  origin_address_snapshot?: string;
  origin_contact_snapshot?: string;
  subtotal?: number | string;
  estimated_weight_grams?: number;
  estimated_length_mm?: number;
  estimated_width_mm?: number;
  estimated_height_mm?: number;
  weight_grams?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  awb?: string | null;
  shipment_status?: string | null;
  shipment?: Shipment | null;
  destination_hub?: { id: number; name: string; zone_name: string; routing_basis: 'POSTCODE_CENTER' | 'ADDRESS_COORDINATE' | 'ASSIGNED' } | null;
  rejection_reason?: string;
  items?: Array<{ product_name_snapshot?: string; product?: { name: string }; quantity: number }>;
}

export interface NetworkCoverage {
  postcode: string;
  purpose: 'ORIGIN' | 'DELIVERY';
  latitude: number | string | null;
  longitude: number | string | null;
  map_radius_meters: number;
}

export interface NetworkZone {
  id: number;
  code: string;
  name: string;
  coverages: NetworkCoverage[];
}

export interface NetworkCourier {
  user_id: number;
  name: string;
  phone?: string | null;
  available: boolean;
  operational_status: 'READY' | 'MENGANTAR' | 'PICKUP' | 'MENUNGGU_TUGAS' | 'GANGGUAN' | 'TIDAK_TERSEDIA';
  active_task_count: number;
  open_issue_count: number;
  zones: Array<{ zone_id: number; service_type: 'PICKUP' | 'DELIVERY' }>;
}

export interface NetworkHub {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  zones: NetworkZone[];
  couriers: NetworkCourier[];
  operators: Array<{ id: number; name: string }>;
  shipment_counts: {
    total: number;
    before_pickup: number;
    inbound: number;
    processing: number;
    out_for_delivery: number;
    delivered: number;
  };
}

export interface NetworkData {
  hubs: NetworkHub[];
  updated_at: string;
}

export interface Shipment {
  id: number;
  order_id?: number;
  awb: string;
  status: string;
  custody_type?: string;
  origin_hub_id?: number;
  origin_hub_name?: string;
  pickup_zone_id?: number;
  delivery_hub_id?: number;
  delivery_zone_id?: number;
  delivery_zone?: Zone;
  order?: Order;
  recipient_name?: string;
  recipient_phone?: string;
  destination_address_snapshot?: string;
  destination_postcode?: string;
  destination_point?: { latitude: number; longitude: number; source: 'ADDRESS' | 'POSTCODE' } | null;
  created_at?: string;
  attempt_count?: number;
  last_attempt?: { attempt_no: number; result: string; failure_reason?: string | null; notes?: string | null; attempted_at?: string } | null;
  ready_since?: string | null;
  waiting_hours?: number;
  age_hours?: number;
}

export interface PickupAssignment {
  id: number;
  status: string;
  scheduled_at?: string;
  picked_up_at?: string | null;
  courier_user_id?: number;
  shipment_id?: number;
  pickup_task_id?: number;
  shipment?: Shipment;
  task?: { id: number; status: string; shipment?: Shipment };
  pickup_task?: { id: number; status: string; shipment?: Shipment };
  awb?: string;
  seller_name?: string;
  seller_address?: string;
  seller_phone?: string;
  hub_name?: string;
  hub_address?: string;
}

export interface PickupTask {
  id: number;
  status: string;
  shipment?: Shipment;
  awb?: string;
  origin_address_snapshot?: string;
  origin_contact_snapshot?: string;
  seller_address?: string;
  seller_phone?: string;
  assignments?: PickupAssignment[];
}

export interface RunShipment {
  id: number;
  shipment_id: number;
  stop_order: number;
  status: string;
  rejection_reason?: string | null;
  delivery_attempt?: DeliveryAttempt | null;
  shipment?: Shipment;
  awb?: string;
  recipient_name?: string;
  recipient_phone?: string;
  destination_address_snapshot?: string;
}

export interface DeliveryRun {
  id: number;
  status: string;
  service_date: string;
  window_start?: string;
  window_end?: string;
  hub_id: number;
  zone_id: number;
  courier_user_id: number;
  courier?: Courier;
  hub?: Hub;
  zone?: Zone;
  shipments?: RunShipment[];
  run_shipments?: RunShipment[];
  parcel_count?: number;
  assigned_at?: string;
  responded_at?: string | null;
}

export interface RoutePreviewStop {
  shipment_id: number;
  awb: string;
  recipient_name: string;
  address: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  point_source: 'ADDRESS' | 'POSTCODE' | 'NONE';
  age_hours: number;
  waiting_hours: number;
  priority: 'NORMAL' | 'WATCH' | 'URGENT';
  attempt_count: number;
  leg_distance_km: number | null;
  stop_order: number;
}

export interface RoutePreview {
  shipment_ids: number[];
  strategy: 'distance_age_priority' | 'age_postcode_fallback';
  distance_km: number | null;
  stops: RoutePreviewStop[];
  hub: { id: number; name: string; latitude: number | null; longitude: number | null };
}

export interface ShipmentIssue {
  id: number;
  status: string;
  decision?: string | null;
  decision_note?: string | null;
  scheduled_redelivery_at?: string | null;
  created_at?: string;
  shipment?: Shipment;
  attempt?: DeliveryAttempt;
  delivery_attempt?: DeliveryAttempt;
  failure_reason?: string;
}

export interface DeliveryAttempt {
  id: number;
  attempt_no: number;
  result: 'DELIVERED' | 'FAILED';
  failure_reason?: string;
  attempted_at: string;
  recipient_name?: string;
  notes?: string;
  photo_available?: boolean;
}

export interface TrackingEvent {
  id?: number;
  event_type: string;
  status_after?: string;
  description?: string;
  location?: string;
  occurred_at: string;
  hub?: Hub;
  hub_name?: string;
  actor_name?: string | null;
  details?: {
    reason?: string;
    failure_reason?: string;
    attempt_no?: number;
    scheduled_at?: string;
  };
}

export interface TrackingPreview {
  awb: string;
  status: string;
  origin?: string | null;
  destination?: string | null;
  latest_update?: string;
}

export interface TrackingAttempt {
  attempt_no: number;
  result: 'DELIVERED' | 'FAILED';
  failure_reason?: string | null;
  recipient_name?: string | null;
  notes?: string | null;
  courier_name?: string | null;
  attempted_at: string;
}

export interface HubShipmentHistory {
  shipment: {
    id: number;
    awb: string;
    status: string;
    custody_type?: string | null;
    created_at?: string;
    delivered_at?: string | null;
    recipient_name?: string | null;
    destination_address?: string | null;
    destination_postcode?: string | null;
    sender_name?: string | null;
    origin_address?: string | null;
  };
  hub_name: string;
  pickup_photo_available: boolean;
  pickup_photo_taken_at?: string | null;
  events: Array<TrackingEvent & { actor_name?: string | null }>;
  attempts: Array<TrackingAttempt & { id: number; notes?: string | null; courier_name?: string | null; run_id: number; photo_available: boolean }>;
  issues: Array<{ id: number; attempt_no: number; status: string; decision?: string | null; decision_note?: string | null; scheduled_redelivery_at?: string | null; created_at: string; decided_at?: string | null; decided_by_name?: string | null }>;
  notifications: Array<{ id: number; logical_recipient: string; template_key: string; status: string; delivery_mode: string; created_at: string; sent_at?: string | null; last_error?: string | null; recipient_name?: string | null }>;
}

export interface Tracking {
  awb: string;
  status: string;
  created_at?: string;
  delivered_at?: string | null;
  latest_update?: string;
  origin?: string | null;
  destination?: string | null;
  parcel?: { weight_grams: number; length_mm: number; width_mm: number; height_mm: number } | null;
  is_customer?: boolean;
  sender_name?: string | null;
  recipient_name?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  issue?: {
    status: string;
    decision?: string | null;
    failure_reason?: string | null;
    attempted_at?: string | null;
    scheduled_redelivery_at?: string | null;
    reschedule_confirmed?: boolean;
  } | null;
  pickup_photo_available?: boolean;
  pickup_photo_taken_at?: string | null;
  proof_available?: boolean;
  delivery_photo_taken_at?: string | null;
  recipient_confirmed?: boolean;
  events?: TrackingEvent[];
  attempts?: TrackingAttempt[];
}
export interface DashboardData {
  pending_orders?: number;
  approved_today?: number;
  awb_issued_total?: number;
  pickup_pending?: number;
  ready_for_last_mile?: number;
  active_runs?: number;
  open_issues?: number;
  delivered_today?: number;
  notifications_failed?: number;
}

export interface DailyReport {
  id?: number;
  report_date: string;
  hub_id?: number;
  hub?: Hub;
  hub_name?: string;
  assigned_count?: number;
  delivered_count?: number;
  failed_count?: number;
  retry_count?: number;
  total_shipments?: number;
  total_attempts?: number;
  shipments_created?: number;
  delivered?: number;
  failed_attempts?: number;
  redelivered?: number;
  returned_requested?: number;
}

export function rolesFor(user: User | null): Role[] {
  if (!user) return [];
  const roles = (user.roles || []).map((item) => typeof item === 'string' ? item : item.role);
  if (user.role) roles.push(user.role);
  return [...new Set(roles)];
}

export function primaryRole(user: User | null): Role | null {
  const roles = rolesFor(user);
  return (['OPS_ADMIN', 'HUB_OPERATOR', 'COURIER', 'BUYER', 'SELLER'] as const).find((role) => roles.includes(role)) || null;
}

export function allowedHubId(user: User | null): number | null {
  if (!user) return null;
  if (user.hub_id) return Number(user.hub_id);
  const hubRole = user.roles?.find((item) => typeof item !== 'string' && item.role === 'HUB_OPERATOR');
  return hubRole && typeof hubRole !== 'string' ? Number(hubRole.hub_id) : null;
}

export function shipmentAwb(value: { awb?: string | null; shipment?: Shipment | null; task?: { shipment?: Shipment }; pickup_task?: { shipment?: Shipment } }) {
  return value.awb || value.shipment?.awb || value.task?.shipment?.awb || value.pickup_task?.shipment?.awb || '—';
}
