import type { Product } from "../../types/catalog";
import Icon from "../../components/Icon";
import ProductCard from "../../components/ProductCard";
import { BenefitsCarousel } from "../../components/BenefitsCarousel";

export function Shop({
  products,
  loading,
  error,
  addToCart,
  retry,
}: {
  products: Product[];
  loading: boolean;
  error: string;
  addToCart: (product: Product) => void;
  retry: () => void;
}) {
  return (
    <main>
      <section className="mx-auto w-[min(100%,76rem)] overflow-hidden bg-[#392137] text-white md:mt-6 md:grid md:min-h-[34rem] md:grid-cols-2 md:rounded-[2rem]">
        <div className="relative h-[15.5rem] overflow-hidden sm:h-[21rem] md:order-2 md:h-auto">
          <img
            className="h-full w-full object-cover object-[50%_27%] md:object-center"
            src="/images/register.webp"
            alt="Model mengenakan pilihan Fashionaja"
          />
        </div>
        <div className="px-5 pb-8 pt-7 sm:px-9 md:flex md:flex-col md:justify-center md:px-12 md:py-14">
          <span className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#ffb9a8]">
            Fashionaja · Jakarta
          </span>
          <h1 className="mt-3 max-w-xl text-[32px] font-extrabold leading-[1.13] tracking-[-.06em] sm:text-5xl md:text-[clamp(2.5rem,4vw,4.3rem)]">
            Gaya sederhana untuk setiap hari.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80 md:text-base">
            Pakaian nyaman yang mudah dipadukan. Temukan pilihan yang terasa
            paling Anda.
          </p>
          <a
            className="mt-6 inline-flex min-h-12 w-fit items-center justify-center gap-3 rounded-xl bg-[#fffaf7] px-5 text-sm font-extrabold text-[#392137] transition hover:bg-[#ffe9df]"
            href="#koleksi"
          >
            Lihat koleksi <Icon name="arrow" size={18} />
          </a>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check" size={15} /> Pilih dengan mudah
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check" size={15} /> Belanja dengan nyaman
            </span>
          </div>
        </div>
      </section>
      <BenefitsCarousel />
      <section
        id="koleksi"
        className="mx-auto w-[min(100%-2rem,76rem)] scroll-mt-24 pb-14 pt-7 md:pb-24 md:pt-14"
      >
        <div className="mb-6 flex items-end justify-between gap-3 md:mb-8">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#b66675]">
              Pilihan untuk Anda
            </span>
            <h2 className="mt-2 text-[26px] font-extrabold tracking-[-.05em] text-[#392137] sm:text-4xl">
              Koleksi Fashionaja
            </h2>
          </div>
          <span className="pb-1 text-[11px] font-semibold text-[#8b7e87]">
            {products.length} produk
          </span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="animate-pulse">
                <div className="aspect-[4/5] rounded-2xl bg-[#f0e4e4]" />
                <div className="mt-3 h-4 w-2/3 rounded bg-[#f0e4e4]" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="state-box">
            <Icon name="refresh" size={30} />
            <h3>Produk belum dapat dimuat</h3>
            <p>{error}</p>
            <button className="button button-primary" onClick={retry}>
              Coba lagi
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="state-box">
            <Icon name="bag" size={30} />
            <h3>Belum ada produk</h3>
            <p>Koleksi akan tampil saat produk tersedia.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 md:grid-cols-4">
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                addToCart={addToCart}
              />
            ))}
          </div>
        )}
      </section>
      <section className="mx-auto mb-14 w-[min(100%-2rem,76rem)] rounded-[1.5rem] bg-[#f8e8e5] px-6 py-8 md:mb-20 md:px-12 md:py-12">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#b16472]">
            Gaya untuk setiap hari
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[#392137] md:text-3xl">
            Temukan gaya yang terasa seperti Anda.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6e5e6b]">
            Pilih koleksi favorit, masukkan ke keranjang, lalu selesaikan
            pesanan dengan mudah.
          </p>
        </div>
      </section>
    </main>
  );
}
