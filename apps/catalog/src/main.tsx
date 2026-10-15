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
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => undefined),
  );
}
