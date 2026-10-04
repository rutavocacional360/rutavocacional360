"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readApiResponse } from "../../lib/api-response";
import { adminFetch } from "../../lib/admin-session";
import { getSession } from "../../lib/session";
import { Button, Notice } from "../../components/ui/primitives";
export async function trainingApi(path = "", body?: any, method = "POST") {
  const send = getSession().user?.role === "admin" ? adminFetch : fetch;
  try { return await readApiResponse(
    await send("/api/training" + path, {
      method: body === undefined ? "GET" : method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    }),
  ); } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("La carga tardó demasiado. Revisa tu conexión y vuelve a intentarlo.");
    if (error instanceof TypeError) throw new Error("No pudimos conectar con los cursos. Revisa tu conexión y vuelve a intentarlo.");
    throw error;
  }
}
export function useTraining() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const mutationRunning = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await trainingApi();
      if (id !== requestId.current) return;
      setData(next);
      setError("");
    } catch (e) {
      if (id !== requestId.current) return;
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("storage", focus);
    window.addEventListener("rv360:publication", focus);
    const timer = setInterval(focus, 30000);
    return () => {
      requestId.current++;
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", focus);
      window.removeEventListener("rv360:publication", focus);
      clearInterval(timer);
    };
  }, [refresh]);
  const run = async (fn: () => Promise<any>) => {
    if (mutationRunning.current) return;
    mutationRunning.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      await refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      mutationRunning.current = false;
      setBusy(false);
    }
  };
  return { data, error, busy, refresh, run };
}
export function TrainingError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return error ? (
    <div className="training-error" role="alert"><Notice tone="danger">
      <div className="training-error-content"><span>{error}</span>
      <Button variant="ghost" onClick={retry}>
        Reintentar
      </Button>
      </div>
    </Notice></div>
  ) : null;
}
export function ChoiceList({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <fieldset className="training-choices">
      <legend>{label}</legend>
      {value.length>0&&<p className="small">Seleccionadas: {items.filter(item=>value.includes(item.id)).map(item=>item.name).join(', ')}</p>}
      <input
        aria-label={"Buscar " + label.toLowerCase()}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre"
      />
      <div>
        {[...items].sort((a,b)=>Number(value.includes(b.id))-Number(value.includes(a.id)))
          .filter((i) =>
            i.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
          )
          .map((i) => (
            <label key={i.id}>
              <input
                type="checkbox"
                checked={value.includes(i.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, i.id]
                      : value.filter((x) => x !== i.id),
                  )
                }
              />
              {i.name}
            </label>
          ))}
      </div>
      <small>{value.length} seleccionados</small>
    </fieldset>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <nav className="training-tabs" aria-label="Secciones de cursos">
      {items.map((i) => (
        <button
          key={i}
          aria-current={i === value ? "page" : undefined}
          onClick={() => onChange(i)}
        >
          {i}
        </button>
      ))}
    </nav>
  );
}
export const decimal = (n: number | null | undefined) =>
  n == null
    ? "Pendiente"
    : n.toLocaleString("es-EC", { maximumFractionDigits: 2 });
