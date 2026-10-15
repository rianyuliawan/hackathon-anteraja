import { useEffect, useRef, useState, type CSSProperties } from "react";
import Icon from "../Icon";

const benefits = [
  {
    icon: "shield" as const,
    title: "Proses pesanan jelas",
    detail: "Alamat bisa dikonfirmasi",
  },
  {
    icon: "bag" as const,
    title: "Pilihan favorit",
    detail: "Koleksi untuk setiap hari",
  },
  {
    icon: "check" as const,
    title: "Pesan dengan mudah",
    detail: "Selesaikan pesanan dalam beberapa langkah",
  },
];

export function BenefitsCarousel() {
  const [active, setActive] = useState(0);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;

    const syncTimer = () => {
      window.clearInterval(timer);
      if (mobile.matches && !reducedMotion.matches) {
        timer = window.setInterval(() => {
          if (!document.hidden)
            setActive((current) => (current + 1) % benefits.length);
        }, 4200);
      }
    };

    syncTimer();
    mobile.addEventListener("change", syncTimer);
    reducedMotion.addEventListener("change", syncTimer);
    return () => {
      window.clearInterval(timer);
      mobile.removeEventListener("change", syncTimer);
      reducedMotion.removeEventListener("change", syncTimer);
    };
  }, []);

  function onTouchEnd(endX: number) {
    if (touchStart.current === null) return;
    const distance = endX - touchStart.current;
    if (Math.abs(distance) > 45) {
      setActive(
        (current) =>
          (current + (distance < 0 ? 1 : benefits.length - 1)) %
          benefits.length,
      );
    }
    touchStart.current = null;
  }

  return (
    <section
      className="mx-auto w-[min(100%-2rem,76rem)] py-5 md:py-8"
      aria-label="Keunggulan Fashionaja"
    >
      <div className="overflow-hidden md:overflow-visible">
        <div
          className="benefits-track flex motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out md:grid md:grid-cols-3 md:gap-4"
          style={{ "--slide-offset": `-${active * 100}%` } as CSSProperties}
          onTouchStart={(event) => {
            touchStart.current = event.touches[0].clientX;
          }}
          onTouchEnd={(event) => onTouchEnd(event.changedTouches[0].clientX)}
        >
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="flex min-w-0 flex-[0_0_100%] items-center gap-3 rounded-2xl bg-white px-5 py-4 ring-1 ring-inset ring-[#f0e7e7] md:flex-auto"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f9e9e7] text-[#b45e68]">
                <Icon name={benefit.icon} size={21} />
              </span>
              <span>
                <strong className="block text-sm text-[#392137]">
                  {benefit.title}
                </strong>
                <small className="text-[11px] text-[#847783]">
                  {benefit.detail}
                </small>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="mt-3 flex items-center justify-center gap-2 md:hidden"
        aria-label="Pilih keunggulan"
      >
        {benefits.map((benefit, index) => (
          <button
            key={benefit.title}
            type="button"
            onClick={() => setActive(index)}
            className={`h-1.5 rounded-full transition-all ${index === active ? "w-6 bg-[#a84d66]" : "w-1.5 bg-[#dfcdd4]"}`}
            aria-label={`Tampilkan ${benefit.title}`}
            aria-current={index === active ? "true" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
