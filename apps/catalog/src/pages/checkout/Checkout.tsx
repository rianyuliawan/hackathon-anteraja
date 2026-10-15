import { useState } from "react";
import type { Buyer, CartItem } from "../../types/catalog";
import Icon from "../../components/Icon";
import ProductPhoto from "../../components/ProductPhoto";
const ProductArt = ProductPhoto;
import { money } from "../../utils/format";

export function Checkout({
  user,
  items,
  submit,
  back,
  busy,
  error,
  recipientChanged,
}: {
  user: Buyer;
  items: CartItem[];
  submit: (recipient: {
    name: string;
    phone: string;
    address: string;
    postcode: string;
  }) => void;
  back: () => void;
  busy: boolean;
  error: string;
  recipientChanged: () => void;
}) {
  const [recipient, setRecipient] = useState({
    name: user.name || "",
    phone: user.phone || "",
    address: user.default_address || "",
    postcode: user.default_postcode || "",
  });
  const total = items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );
  if (!items.length)
    return (
      <main className="page-shell">
        <div className="state-box">
          <Icon name="bag" size={36} />
          <h3>Keranjang masih kosong</h3>
          <p>Pilih baju sebelum membuat pesanan.</p>
          <button className="button button-primary" onClick={back}>
            Lihat koleksi
          </button>
        </div>
      </main>
    );
  function change(field: keyof typeof recipient, value: string) {
    setRecipient((current) => ({ ...current, [field]: value }));
    recipientChanged();
  }
  return (
    <main className="page-shell checkout-page">
      <button className="back-link" onClick={back}>
        <Icon name="back" size={17} /> Kembali ke koleksi
      </button>
      <div className="page-heading">
        <span className="eyebrow dark">LANGKAH TERAKHIR</span>
        <h1>Konfirmasi pesanan</h1>
        <p>Periksa kembali produk dan alamat sebelum membuat pesanan.</p>
      </div>
      <div className="checkout-layout">
        <form
          id="checkout-form"
          className="surface-card checkout-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit(recipient);
          }}
        >
          <div className="card-title">
            <span className="title-icon">
              <Icon name="pin" size={22} />
            </span>
            <div>
              <h2>Alamat pengiriman</h2>
              <p>
                Data ini diisi dari profil Anda dan dapat disesuaikan untuk
                pesanan ini.
              </p>
            </div>
          </div>
          <div className="field-grid">
            <label>
              Nama penerima
              <input
                required
                value={recipient.name}
                onChange={(event) => change("name", event.target.value)}
              />
            </label>
            <label>
              Nomor telepon
              <input
                required
                type="tel"
                value={recipient.phone}
                onChange={(event) => change("phone", event.target.value)}
              />
            </label>
            <label className="wide">
              Alamat lengkap
              <textarea
                required
                rows={4}
                value={recipient.address}
                onChange={(event) => change("address", event.target.value)}
              />
            </label>
            <label>
              Kode pos
              <input
                required
                inputMode="numeric"
                minLength={5}
                maxLength={5}
                pattern="[0-9]{5}"
                title="Masukkan 5 digit kode pos"
                value={recipient.postcode}
                onChange={(event) => change("postcode", event.target.value)}
              />
            </label>
          </div>
          <div className="note-box">
            <Icon name="phone" size={18} />
            <p>
              Pastikan nama, nomor telepon, dan alamat sudah benar sebelum
              membuat pesanan.
            </p>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
        <aside className="surface-card order-summary">
          <h2>Ringkasan pesanan</h2>
          <div className="summary-items">
            {items.map(({ product, quantity }) => (
              <div className="summary-item" key={product.id}>
                <div className="summary-art">
                  <ProductArt product={product} />
                </div>
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {quantity} × {money(product.price)}
                  </small>
                </div>
                <b>{money(Number(product.price) * quantity)}</b>
              </div>
            ))}
          </div>
          <div className="summary-total">
            <span>Subtotal</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="summary-note">
            <Icon name="shield" size={20} />
            <p>
              Pesanan akan tersimpan di riwayat setelah Anda menekan tombol di
              bawah.
            </p>
          </div>
          <button
            form="checkout-form"
            className="button button-primary full-width"
            type="submit"
            disabled={busy}
          >
            {busy ? "Mengirim pesanan..." : "Buat pesanan"}{" "}
            <Icon name="arrow" size={18} />
          </button>
        </aside>
      </div>
    </main>
  );
}
