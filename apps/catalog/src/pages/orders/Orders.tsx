import { Link } from "react-router-dom";
import type { Order } from "../../types/catalog";
import Icon from "../../components/Icon";
import { date, itemName, statusLabel } from "../../utils/format";

export function Orders({
  orders,
  loading,
  error,
  reload,
  select,
}: {
  orders: Order[];
  loading: boolean;
  error: string;
  reload: () => void;
  select: (order: Order) => void;
}) {
  return (
    <main className="page-shell orders-page">
      <div className="page-heading page-heading-row">
        <div>
          <span className="eyebrow dark">SETIAP LANGKAH TERCATAT</span>
          <h1>Pesanan saya</h1>
          <p>Lihat semua pesanan dan nomor resi Anda di satu tempat.</p>
        </div>
        <button
          className="button button-outline"
          onClick={reload}
          disabled={loading}
        >
          <Icon name="refresh" size={17} /> Perbarui
        </button>
      </div>
      {loading ? (
        <div className="state-box">
          <span className="spinner" />
          <p>Memuat pesanan...</p>
        </div>
      ) : error ? (
        <div className="state-box">
          <Icon name="refresh" size={28} />
          <h3>Riwayat belum dapat dimuat</h3>
          <p>{error}</p>
          <button className="button button-primary" onClick={reload}>
            Coba lagi
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="state-box">
          <Icon name="bag" size={36} />
          <h3>Belum ada pesanan</h3>
          <p>Pesanan yang Anda buat akan muncul di sini.</p>
          <Link className="button button-primary" to="/">
            Lihat koleksi <Icon name="arrow" size={18} />
          </Link>
        </div>
      ) : (
        <div className="order-list">
          {orders.map((order) => {
            const awb = order.awb || order.shipment?.awb;
            const state =
              order.shipment_status || order.shipment?.status || order.status;
            return (
              <article className="order-card" key={order.id}>
                <div className="order-card-top">
                  <div>
                    <span className="order-label">
                      PESANAN {order.order_no}
                    </span>
                    <h2>
                      {order.items?.map(itemName).join(", ") ||
                        "Pesanan pakaian"}
                    </h2>
                    <small>{date(order.created_at)}</small>
                  </div>
                  <span
                    className={`status-pill ${order.status === "REJECTED" ? "status-red" : awb ? "status-green" : "status-amber"}`}
                  >
                    {statusLabel(state)}
                  </span>
                </div>
                <div className="order-card-bottom">
                  <div className="order-awb">
                    <small>NOMOR RESI</small>
                    {awb ? <strong>{awb}</strong> : <span>Belum tersedia</span>}
                  </div>
                  <div className="order-actions">
                    <button
                      className="text-button"
                      onClick={() => select(order)}
                    >
                      Detail pesanan <Icon name="chevron" size={16} />
                    </button>
                  </div>
                </div>
                {order.status === "REJECTED" && order.rejection_reason && (
                  <p className="rejection-reason">
                    Alasan: {order.rejection_reason}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
