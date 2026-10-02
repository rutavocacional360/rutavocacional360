import { useEffect, useRef, useState } from "react";
import {
  adminLogin,
  refreshAdminAccess,
  type AdminReauthentication,
} from "../../lib/admin-session";
import { useSession, clearNotice } from "../../lib/session";
import { Dialog } from "../ui/Dialog";
import { Button, PasswordInput, Notice } from "../ui/primitives";

export function AdminSessionDialog() {
  const session = useSession();
  useEffect(() => {
    if (session.user?.role !== "admin") return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void refreshAdminAccess().catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session.user?.id, session.user?.role]);
  const pending = useRef<AdminReauthentication | null>(null);
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const receive = (event: Event) => {
      event.preventDefault();
      pending.current = (event as CustomEvent<AdminReauthentication>).detail;
      setPassword("");
      setError("");
      setOpen(true);
    };
    window.addEventListener("rv360:admin-reauthenticate", receive);
    return () => {
      window.removeEventListener("rv360:admin-reauthenticate", receive);
      pending.current?.reject(
        Error("Acceso cancelado. Vuelve a intentar guardar."),
      );
      pending.current = null;
    };
  }, []);
  const close = () => {
    if (busy) return;
    pending.current?.reject(
      Error("Confirma tu acceso para guardar. El editor sigue abierto."),
    );
    pending.current = null;
    setOpen(false);
    setPassword("");
  };
  return (
    <Dialog open={open} title="Confirma tu acceso" onClose={close}>
      <p>
        Tu sesión ha vencido. Introduce tu contraseña de administrador para
        continuar sin salir del editor.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const user = await adminLogin(session.user?.email || "", password);
            if (user.id !== session.user?.id)
              throw Error("Utiliza la misma cuenta administrativa.");
            clearNotice();
            pending.current?.resolve();
            pending.current = null;
            setOpen(false);
            setPassword("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Correo del administrador
          <input
            type="email"
            value={session.user?.email || ""}
            readOnly
            autoComplete="username"
          />
        </label>
        <PasswordInput label="Contraseña" value={password} onChange={e=>{setPassword(e.target.value);setError('');}} required maxLength={128} autoComplete="current-password" disabled={busy}/>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Verificando…" : "Continuar"}
        </Button>
      </form>
    </Dialog>
  );
}
