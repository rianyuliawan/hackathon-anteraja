import type { CartItem } from "../../types/catalog";
import { money } from "../../utils/format";
import Icon from "../Icon";
import ProductPhoto from "../ProductPhoto";
const ProductArt = ProductPhoto;

export function CartDrawer({
  open,
  close,
  items,
  update,
  checkout,
}: {
  open: boolean;
  close: () => void;
  items: CartItem[];
  update: (id: number, delta: number) => void;
  checkout: () => void;
}) {
  const total = items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );
  return (
    <>
      {open && (
        <div className="drawer-backdrop" onClick={close} aria-hidden="true" />
      )}
      <aside
        className={`cart-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Keranjang belanja"
        aria-hidden={!open}
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow dark">PESANAN ANDA</span>
            <h2>
              Keranjang{" "}
              <span>
                ({items.reduce((sum, item) => sum + item.quantity, 0)})
              </span>
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Tutup keranjang"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="cart-items">
          {items.length === 0 ? (
            <div className="empty-cart">
              <Icon name="bag" size={43} />
              <h3>Keranjang masih kosong</h3>
              <p>Pilih baju yang Anda suka dari koleksi kami.</p>
              <button className="text-button" onClick={close}>
                Lihat koleksi <Icon name="arrow" size={17} />
              </button>
            </div>
          ) : (
            items.map(({ product, quantity }) => (
              <div className="cart-item" key={product.id}>
                <div className="cart-item-art">
                  <ProductArt product={product} />
                </div>
                <div className="cart-item-detail">
                  <h3>{product.name}</h3>
                  <small>{product.sku}</small>
                  <strong>{money(product.price)}</strong>
                  <div className="quantity-stepper">
                    <button
                      onClick={() => update(product.id, -1)}
                      aria-label={`Kurangi ${product.name}`}
                    >
                      <Icon name="minus" size={16} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      onClick={() => update(product.id, 1)}
                      disabled={quantity >= 20}
                      aria-label={`Tambah ${product.name}`}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="drawer-bottom">
          <div className="subtotal-line">
            <span>Subtotal</span>
            <strong>{money(total)}</strong>
          </div>
          <p>Periksa kembali pilihan Anda sebelum membuat pesanan.</p>
          <button
            className="button button-primary full-width"
            onClick={checkout}
            disabled={!items.length}
          >
            Lanjutkan pesanan <Icon name="arrow" size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}
