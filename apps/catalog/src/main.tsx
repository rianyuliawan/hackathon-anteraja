import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import CatalogRoutes from "./routes/CatalogRoutes";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <CatalogRoutes />
    </BrowserRouter>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && window.isSecureContext) {
  const registerServiceWorker = () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  };
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker, { once: true });
}
