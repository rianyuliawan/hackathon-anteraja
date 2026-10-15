import type { Product } from "../../types/catalog";
import { money } from "../../utils/format";
import Icon from "../Icon";
import ProductPhoto from "../ProductPhoto";

export default function ProductCard({
  product,
  index,
  addToCart,
}: {
  product: Product;
  index: number;
  addToCart: (product: Product) => void;
}) {
  return (
    <article className="group min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#f2e9e4] sm:aspect-[5/6]">
        <ProductPhoto product={product} />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-[#392137]">
          {index === 0 ? "Favorit" : "Fashionaja"}
        </span>
        <button
          className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-white text-[#392137] shadow-lg transition hover:bg-[#392137] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#392137]"
          type="button"
          onClick={() => addToCart(product)}
          aria-label={`Tambah ${product.name} ke keranjang`}
        >
          <Icon name="plus" size={21} />
        </button>
      </div>
      <div className="pt-3">
        <span className="text-[10px] font-bold uppercase tracking-[.13em] text-[#a16d67]">
          Everyday wear
        </span>
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-[#302434] sm:text-base">
          {product.name}
        </h3>
        <strong className="mt-1 block text-sm font-extrabold text-[#392137]">
          {money(product.price)}
        </strong>
      </div>
    </article>
  );
}
