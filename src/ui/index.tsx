import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { PrimeReactProvider } from "primereact/api";
import AppLayout from "./app.tsx";
import { startServerSentEventsBridge } from "./sse_bridge.ts";

/**
 * After an OIDC login round-trip the server redirects to the originally
 * requested path, additionally carrying it in a `returnTo` query param. If the
 * browser ends up on a path that does not match `returnTo` (e.g. a proxy rewrote
 * it to "/"), recover the intended route here.
 */
function ReturnToRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo");
  if (returnTo && returnTo.startsWith("/")) {
    const decoded = decodeURIComponent(returnTo);
    const decodedPath = decoded.split("?")[0];
    if (decodedPath && decodedPath !== location.pathname) return <Navigate to={decoded} replace />;
  }
  return null;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");
const root = createRoot(rootElement);
startServerSentEventsBridge();
root.render(
    <StrictMode>
      <PrimeReactProvider>
        <BrowserRouter>
          <ReturnToRedirect />
          <AppLayout />
        </BrowserRouter>
      </PrimeReactProvider>
    </StrictMode>,
);
