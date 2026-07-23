import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {ConfigEntrySelectType} from "@/types/ConfigType.ts";

const SETUP_HEADER = "x-setup-app";

type SectionPayload = {
  sectionTitle: string;
  entries: ConfigEntrySelectType[];
};

type DemandResponse =
  | { done: true; sections: SectionPayload[] }
  | { done: false; sections: SectionPayload[]; current: SectionPayload | null; remaining: number };

type SetupResponse =
  | { done: true; sections: SectionPayload[] }
  | { done: false; sections: SectionPayload[]; current: SectionPayload | null; remaining: number }
  | { ok: false; errors: Record<string, string> };

type EntryValueMap = Record<string, unknown>;

const isJsonType = (type: string | null) => {
  return ["object", "string[]", "number[]"].includes(type ?? "");
};

const FieldInput = ({
  entry,
  value,
  onChange,
  error,
}: {
  entry: ConfigEntrySelectType;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) => {
  const id = `${entry.domain}.${entry.key}`;
  const description = entry.description ?? entry.key;

  if (entry.type === "boolean") {
    const checked = Boolean(value);
    return (
      <div className="field">
        <label htmlFor={id}>{description}</label>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  if (entry.type === "number") {
    const numericValue = typeof value === "number" || typeof value === "string" ? value : "";
    return (
      <div className="field">
        <label htmlFor={id}>{description}</label>
        <input
          id={id}
          type="number"
          value={numericValue}
          onChange={(e) => onChange(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  if (isJsonType(entry.type)) {
    return (
      <div className="field">
        <label htmlFor={id}>{description}</label>
        <textarea
          id={id}
          rows={4}
          value={typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"JSON or comma-separated list"}
        />
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  const textValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return (
    <div className="field">
      <label htmlFor={id}>{description}</label>
      <input
        id={id}
        type="text"
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div className="error">{error}</div>}
    </div>
  );
};

const App = () => {
  const [setupKey, setSetupKey] = useState("");
  const [status, setStatus] = useState<
    "key" | "loading" | "section" | "waiting" | "error"
  >("key");
  const [section, setSection] = useState<SectionPayload | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>("");
  const [values, setValues] = useState<EntryValueMap>({});

  // Ensure the global stylesheet is loaded (served from /static/public/styles.css)
  useEffect(() => {
    const id = "setup-styles";
    if (typeof document === "undefined") return;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/static/public/styles.css";
      link.id = id;
      document.head.appendChild(link);
    }
  }, []);

  const updateFromPayload = useCallback((payload: DemandResponse | SetupResponse) => {
    if ("done" in payload && payload.done) {
      setStatus("waiting");
      setSection(null);
      // sections are available if needed for future UX steps
      return;
    }

    if ("current" in payload) {
      setSection(payload.current ?? null);
      // sections are available if needed for future UX steps
      setStatus("section");
      setErrors({});
      setValues({});
    }
  }, []);

  const fetchDemand = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    setErrors({});

    const res = await fetch("/setup/demand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupKey }),
    });

    if (res.status === 401) {
      setStatus("key");
      setMessage("Invalid setup key. Please try again.");
      return;
    }

    const payload = (await res.json()) as DemandResponse;
    updateFromPayload(payload);
  }, [setupKey, updateFromPayload]);

  const submitSection = useCallback(async () => {
    if (!section) return;
    setStatus("loading");
    setMessage("");

    const res = await fetch("/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setupKey,
        sectionTitle: section.sectionTitle,
        values,
      }),
    });

    if (res.status === 401) {
      setStatus("key");
      setMessage("Setup key expired. Please re-enter.");
      return;
    }

    if (res.status === 400) {
      const payload = (await res.json()) as SetupResponse;
      if ("ok" in payload && payload.ok === false) {
        setErrors(payload.errors || {});
        setStatus("section");
        return;
      }
    }

    const payload = (await res.json()) as SetupResponse;
    updateFromPayload(payload);
  }, [section, setupKey, updateFromPayload, values]);

  useEffect(() => {
    if (status !== "waiting") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/", { cache: "no-store" });
        const header = res.headers.get(SETUP_HEADER);
        if (res.ok && header !== "1") {
          window.location.href = "/";
        }
      } catch {
        // ignore while server is starting
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [status]);

  const sectionFields = useMemo(() => {
    if (!section) return null;

    return section.entries.map((entry) => (
      <FieldInput
        key={`${entry.domain}.${entry.key}`}
        entry={entry}
        value={values[entry.key]}
        error={errors[entry.key]}
        onChange={(value) => setValues((prev) => ({ ...prev, [entry.key]: value }))}
      />
    ));
  }, [errors, section, values]);

  return (
    <div className="setup-container">
      <h1>Setup Wizard</h1>
      <p>Complete application configuration.</p>

      {status === "key" && (
        <div className="card">
          <label htmlFor="setup-key">Setup key</label>
          <input
            id="setup-key"
            type="text"
            value={setupKey}
            onChange={(e) => setSetupKey(e.target.value)}
          />
          {message && <div className="error">{message}</div>}
          <button onClick={fetchDemand} disabled={!setupKey}>
            Start setup
          </button>
        </div>
      )}

      {status === "loading" && <p>Loading…</p>}

      {status === "section" && section && (
        <div className="card">
          <h2>{section.sectionTitle}</h2>
          {sectionFields}
          <button onClick={submitSection}>Save &amp; Next</button>
        </div>
      )}

      {status === "waiting" && (
        <div className="card">
          <h2>Setup complete</h2>
          <p>Waiting for server startup…</p>
          <p>This page will redirect automatically.</p>
        </div>
      )}
    </div>
  );
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

