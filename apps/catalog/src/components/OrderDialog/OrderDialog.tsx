import { useState } from "react";
import type { Order } from "../../types/catalog";
import { money, date, itemName, statusLabel } from "../../utils/format";
import Icon from "../Icon";

export function OrderDialog({
  order,
  close,
  notify,
}: {
  order: Order | null;
  close: () => void;
  notify: (
    title: string,
    detail?: string,
    variant?: "success" | "error",
  ) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  if (!order) return null;

  const awb = order.awb || order.shipment?.awb;
  const status =
    order.shipment_status || order.shipment?.status || order.status;

  async function copyAwb() {
    if (!awb) return;
    try {
      await navigator.clipboard.writeText(awb);
      setCopyState("copied");
      notify(
        "Nomor resi disalin",
        "Anda bisa menempelkannya di tempat yang dibutuhkan.",
      );
    } catch {
      setCopyState("error");
      notify(
        "Gagal menyalin resi",
        "Coba salin nomor resi secara manual.",
        "error",
      );
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={close} aria-hidden="true" />
      <div
        className="order-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Detail pesanan ${order.order_no}`}
      >
        <div className="dialog-top">
          <div>
            <span className="eyebrow dark">DETAIL PESANAN</span>
            <h2>{order.order_no}</h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Tutup detail"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-content">
          <div className="detail-status">
            <span className="status-dot" />
            <div>
              <strong>{statusLabel(status)}</strong>
              <small>Dibuat {date(order.created_at)}</small>
            </div>
          </div>
          <div className="detail-block">
            <h3>Produk</h3>
            {order.items?.length ? (
              order.items.map((item, index) => (
                <div className="detail-item" key={item.product_id || index}>
                  <span>
                    {item.quantity} × {itemName(item)}
                  </span>
                  <strong>{money(item.price_snapshot || item.price)}</strong>
                </div>
              ))
            ) : (
              <p>Detail produk belum tersedia.</p>
            )}
          </div>
          <div className="detail-block">
            <h3>Alamat pesanan</h3>
            <p>
              {order.recipient_name}
              <br />
              {order.recipient_phone}
              <br />
              {order.destination_address_snapshot}
              <br />
              {order.destination_postcode}
            </p>
          </div>
          <div className="detail-block">
            <h3>Nomor resi</h3>
            {awb ? (
              <>
                <strong className="awb-number">{awb}</strong>
                <button
                  className="button button-outline full-width"
                  onClick={copyAwb}
                  type="button"
                >
                  <Icon
                    name={copyState === "copied" ? "check" : "copy"}
                    size={16}
                  />
                  {copyState === "copied"
                    ? "Nomor resi tersalin"
                    : "Salin nomor resi"}
                </button>
                {copyState === "error" && (
                  <p className="form-error mt-2" role="alert">
                    Tidak dapat menyalin otomatis. Salin nomor resi di atas
                    secara manual.
                  </p>
                )}
              </>
            ) : (
              <p>Nomor resi belum tersedia.</p>
            )}
          </div>
          {order.rejection_reason && (
            <div className="note-box error">
              <p>Alasan penolakan: {order.rejection_reason}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
