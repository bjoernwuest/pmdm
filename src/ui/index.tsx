import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { PrimeReactProvider } from "primereact/api";
import AppLayout from "./app.tsx";
import { startServerSentEventsBridge } from "./server_sent_events.ts";

/**
 * After an OIDC login round-trip the server redirects to the originally
 * requested path, additionally carrying it in a `target` query param. If the
 * browser ends up on a path that does not match `target` (e.g. a proxy rewrote
 * it to "/"), recover the intended route here.
 */
function TargetRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const target = params.get("target");
  if (target && target.startsWith("/")) {
    const decoded = decodeURIComponent(target);
    const decodedPath = decoded.split("?")[0];
    if (decodedPath && decodedPath !== location.pathname) return <Navigate to={decoded} replace />;
  }
  return null;
}

const root = createRoot(document.getElementById("root")!);
startServerSentEventsBridge();
root.render(
    <StrictMode>
      <PrimeReactProvider>
        <BrowserRouter>
          <TargetRedirect />
          <AppLayout />
        </BrowserRouter>
      </PrimeReactProvider>
    </StrictMode>,
);
