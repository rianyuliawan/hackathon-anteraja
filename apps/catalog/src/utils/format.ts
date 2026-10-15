export const money = (value: number | string | undefined) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
export const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Terjadi kesalahan. Coba lagi.";
export const itemName = (item: {
  product_name_snapshot?: string;
  product_name?: string;
}) => item.product_name_snapshot || item.product_name || "Produk";

export function statusLabel(status: string) {
  const names: Record<string, string> = {
    PENDING_APPROVAL: "Menunggu konfirmasi",
    APPROVED: "Pesanan diproses",
    REJECTED: "Tidak dapat diproses",
    CANCELLED: "Dibatalkan",
    READY_FOR_PICKUP: "Pesanan diproses",
    PICKUP_ASSIGNED: "Pesanan diproses",
    PICKED_UP: "Pesanan diproses",
    AT_HUB: "Pesanan diproses",
    READY_FOR_LAST_MILE: "Pesanan dikirim",
    DELIVERY_ASSIGNED: "Pesanan dikirim",
    OUT_FOR_DELIVERY: "Pesanan dikirim",
    DELIVERY_FAILED: "Pesanan tertunda",
    WAITING_REDELIVERY: "Pesanan tertunda",
    DELIVERED: "Pesanan selesai",
  };
  return names[status] || "Pesanan diproses";
}
