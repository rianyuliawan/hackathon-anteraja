import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ApiError, api } from "../services/catalog.service";
import type { Buyer, CartItem, Order, Product } from "../types/catalog";
import Brand from "../components/Brand";
import { Header } from "../components/SiteHeader";
import usePwaInstall from "../hooks/usePwaInstall";
import { MobileNav } from "../components/MobileNav";
import { CartDrawer } from "../components/CartDrawer";
import { OrderDialog } from "../components/OrderDialog";
import { Footer } from "../components/SiteFooter";
import { Toast } from "../components/Toast";
import type { ToastMessage } from "../components/Toast";
import AuthPage from "../pages/auth";
import { Shop } from "../pages/home";
import { Checkout } from "../pages/checkout";
import { Orders } from "../pages/orders";
import { Profile } from "../pages/profile";
import { errorText } from "../utils/format";

function readCart(): Record<string, number> {
  try {
    const value = JSON.parse(
      localStorage.getItem("fashionaja_cart") || "{}",
    ) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([id, quantity]) =>
            /^\d+$/.test(id) &&
            Number.isInteger(quantity) &&
            Number(quantity) > 0,
        )
        .map(([id, quantity]) => [id, Math.min(20, Number(quantity))]),
    );
  } catch {
    return {};
  }
}

function CatalogShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<Buyer | null>(null);
  const [booting, setBooting] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [cart, setCart] = useState<Record<string, number>>(readCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutKey, setCheckoutKey] = useState(
    () =>
      sessionStorage.getItem("fashionaja_checkout_key") || crypto.randomUUID(),
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  function notify(
    title: string,
    detail?: string,
    variant: ToastMessage["variant"] = "success",
  ) {
    setToast({ id: performance.now(), title, detail, variant });
  }
  const pwa = usePwaInstall();

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401))
          notify(
            "Koneksi belum tersedia",
            "Jalankan Laravel, lalu coba lagi.",
            "error",
          );
      })
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    localStorage.setItem("fashionaja_cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    sessionStorage.setItem("fashionaja_checkout_key", checkoutKey);
  }, [checkoutKey]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4600);
    return () => clearTimeout(timer);
  }, [toast]);
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError("");
    try {
      setProducts(await api.products());
    } catch (error) {
      setProductsError(errorText(error));
    } finally {
      setProductsLoading(false);
    }
  }, []);
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      setOrders(await api.orders());
    } catch (error) {
      setOrdersError(errorText(error));
    } finally {
      setOrdersLoading(false);
    }
  }, []);
  useEffect(() => {
    if (user) void loadProducts();
  }, [user, loadProducts]);
  useEffect(() => {
    if (user && location.pathname === "/pesanan") void loadOrders();
  }, [user, location.pathname, loadOrders]);

  const items = useMemo<CartItem[]>(
    () =>
      products
        .filter((product) => cart[String(product.id)] > 0)
        .map((product) => ({ product, quantity: cart[String(product.id)] })),
    [products, cart],
  );
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  function updateCart(id: number, delta: number) {
    setCart((current) => {
      const next = { ...current };
      const quantity = Math.min(
        20,
        Math.max(0, Number(next[String(id)] || 0) + delta),
      );
      if (quantity) next[String(id)] = quantity;
      else delete next[String(id)];
      return next;
    });
    setCheckoutKey(crypto.randomUUID());
  }
  function addToCart(product: Product) {
    updateCart(product.id, 1);
    notify("Ditambahkan ke keranjang", product.name);
  }
  async function logout() {
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        notify("Gagal keluar", errorText(error), "error");
        return;
      }
    }
    setUser(null);
    setCart({});
    setCheckoutKey(crypto.randomUUID());
    setCartOpen(false);
    navigate("/masuk", { replace: true });
    notify("Berhasil keluar", "Sampai jumpa lagi di Fashionaja.");
  }
  async function openOrder(order: Order) {
    setActiveOrder(order);
    try {
      setActiveOrder(await api.order(order.id));
    } catch {
      /* Retain the list data. */
    }
  }
  async function submitCheckout(recipient: {
    name: string;
    phone: string;
    address: string;
    postcode: string;
  }) {
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      await api.checkout({
        checkout_key: checkoutKey,
        items: items.map(({ product, quantity }) => ({
          product_id: product.id,
          quantity,
        })),
        recipient,
      });
      setCart({});
      setCheckoutKey(crypto.randomUUID());
      notify("Pesanan berhasil dibuat", "Lihat detailnya di riwayat pesanan.");
      navigate("/pesanan");
    } catch (error) {
      setCheckoutError(errorText(error));
    } finally {
      setCheckoutBusy(false);
    }
  }
  const notice = <Toast message={toast} dismiss={() => setToast(null)} />;

  if (booting)
    return (
      <div className="grid min-h-screen place-content-center gap-5 bg-[#fffaf7] text-center">
        <Brand />
        <span className="mx-auto size-7 animate-spin rounded-full border-[3px] border-[#ead9db] border-t-[#392137]" />
        <p className="text-sm text-[#82737d]">Menyiapkan Fashionaja…</p>
      </div>
    );
  if (!user)
    return (
      <>
        <Routes>
          <Route
            path="/masuk"
            element={
              <AuthPage
                mode="login"
                pwa={pwa}
                onAuth={(buyer) => {
                  setUser(buyer);
                  navigate("/", { replace: true });
                  notify(
                    "Berhasil masuk",
                    "Selamat datang kembali di Fashionaja.",
                  );
                }}
              />
            }
          />
          <Route
            path="/daftar"
            element={
              <AuthPage
                mode="register"
                pwa={pwa}
                onAuth={(buyer) => {
                  setUser(buyer);
                  navigate("/", { replace: true });
                  notify(
                    "Akun berhasil dibuat",
                    "Selamat datang di Fashionaja.",
                  );
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/masuk" replace />} />
        </Routes>
        {notice}
      </>
    );
  const isBuyer =
    !user.roles ||
    user.roles.some(
      (role) => (typeof role === "string" ? role : role.role) === "BUYER",
    );
  if (!isBuyer)
    return (
      <div className="grid min-h-screen place-content-center gap-5 px-6 text-center">
        <div className="mx-auto">
          <Brand />
        </div>
        <h1 className="text-2xl font-extrabold">
          Akun ini belum dapat digunakan
        </h1>
        <p className="max-w-md text-sm text-[#746674]">
          Masuk dengan akun pembeli untuk melihat koleksi Fashionaja.
        </p>
        <button className="text-button mx-auto" onClick={logout}>
          Keluar akun
        </button>
        {notice}
      </div>
    );

  return (
    <div className="min-h-screen bg-[#fffaf7] pb-18 md:pb-0">
      <Header
        count={count}
        openCart={() => setCartOpen(true)}
        user={user}
        logout={logout}
      />
      <Routes>
        <Route
          path="/"
          element={
            <Shop
              products={products}
              loading={productsLoading}
              error={productsError}
              retry={loadProducts}
              addToCart={addToCart}
            />
          }
        />
        <Route
          path="/pesanan"
          element={
            <Orders
              orders={orders}
              loading={ordersLoading}
              error={ordersError}
              reload={loadOrders}
              select={openOrder}
            />
          }
        />
        <Route
          path="/checkout"
          element={
            <Checkout
              key={user.id}
              user={user}
              items={items}
              submit={submitCheckout}
              back={() => navigate("/")}
              busy={checkoutBusy}
              error={checkoutError}
              recipientChanged={() => setCheckoutKey(crypto.randomUUID())}
            />
          }
        />
        <Route
          path="/akun"
          element={<Profile user={user} onUser={setUser} logout={logout} pwa={pwa} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
      <MobileNav count={count} openCart={() => setCartOpen(true)} />
      <CartDrawer
        open={cartOpen}
        close={() => setCartOpen(false)}
        items={items}
        update={updateCart}
        checkout={() => {
          setCartOpen(false);
          setCheckoutError("");
          navigate("/checkout");
        }}
      />
      <OrderDialog
        key={activeOrder?.id || 0}
        order={activeOrder}
        close={() => setActiveOrder(null)}
        notify={notify}
      />
      {notice}
    </div>
  );
}

export default CatalogShell;
