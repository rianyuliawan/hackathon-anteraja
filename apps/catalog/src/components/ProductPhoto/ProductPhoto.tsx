import type { Product } from "../../types/catalog";

const photos: Record<string, string> = {
  "BAJU-001": "/images/tee.webp",
  "BAJU-002": "/images/shirt.webp",
  "BAJU-003": "/images/hoodie.webp",
  "BAJU-004": "/images/jacket.webp",
};

export default function ProductPhoto({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  const fallback = /kemeja/i.test(product.name)
    ? photos["BAJU-002"]
    : /hoodie/i.test(product.name)
      ? photos["BAJU-003"]
      : /jaket/i.test(product.name)
        ? photos["BAJU-004"]
        : photos["BAJU-001"];
  return (
    <img
      className={`h-full w-full object-cover ${large ? "min-h-64" : ""}`}
      src={product.image_url || photos[product.sku] || fallback}
      alt={product.name}
      loading="lazy"
      decoding="async"
    />
  );
}
