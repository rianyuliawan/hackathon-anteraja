import type { Role } from '../lib/types';

export const menu: Record<Role, Array<{ hash: string; label: string; icon: string; group?: string }>> = {
  OPS_ADMIN: [
    { hash: 'admin-overview', label: 'Ringkasan', icon: 'grid', group: 'OPERASIONAL' },
    { hash: 'admin-orders', label: 'Pesanan & AWB', icon: 'file' },
  ],
  HUB_OPERATOR: [
    { hash: 'hub-overview', label: 'Ringkasan hub', icon: 'grid', group: 'HUB' },
    { hash: 'hub-pickups', label: 'Tugaskan pickup', icon: 'package' },
    { hash: 'hub-inbound', label: 'Paket tiba di hub', icon: 'package' },
    { hash: 'hub-dispatch', label: 'Atur pengantaran', icon: 'truck' },
    { hash: 'hub-returns', label: 'Paket gagal kembali', icon: 'refresh' },
    { hash: 'hub-issues', label: 'Jadwalkan ulang', icon: 'alert' },
    { hash: 'hub-reports', label: 'Laporan harian', icon: 'file' },
    { hash: 'tracking', label: 'Lacak AWB', icon: 'search', group: 'LAINNYA' },
    { hash: 'account', label: 'Akun', icon: 'shield' },
  ],
  COURIER: [
    { hash: 'courier-overview', label: 'Tugas saya', icon: 'grid', group: 'LAPANGAN' },
    { hash: 'courier-pickups', label: 'Pickup toko', icon: 'package' },
    { hash: 'courier-deliveries', label: 'Antar paket', icon: 'truck' },
    { hash: 'tracking', label: 'Lacak AWB', icon: 'search', group: 'LAINNYA' },
    { hash: 'account', label: 'Akun', icon: 'shield' },
  ],
  BUYER: [
    { hash: 'tracking', label: 'Lacak resi', icon: 'search', group: 'PENGIRIMAN' },
    { hash: 'account', label: 'Akun & notifikasi', icon: 'shield' },
  ],
  SELLER: [
    { hash: 'tracking', label: 'Lacak AWB', icon: 'search' },
    { hash: 'account', label: 'Akun', icon: 'shield' },
  ],
};

export const home: Record<Role, string> = {
  OPS_ADMIN: 'admin-overview', HUB_OPERATOR: 'hub-overview', COURIER: 'courier-overview', BUYER: 'tracking', SELLER: 'tracking',
};

