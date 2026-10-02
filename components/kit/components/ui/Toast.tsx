import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { CheckCircle, CircleAlert, X } from "lucide-react";
import { fieldMessage } from './field-message';
type ToastTone = 'success' | 'danger';
const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<ToastTone>('success');
  const invalidBatch = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, nextTone: ToastTone = 'success') => {
    setMessage(text);
    setTone(nextTone);
    if (timer.current) clearTimeout(timer.current);
    timer.current = nextTone === 'danger' ? null : setTimeout(() => setMessage(""), 5000);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider value={show}>
      <div style={{display:'contents'}} onInputCapture={() => { if (tone === 'danger') setMessage(''); }} onInvalidCapture={event => {
        event.preventDefault();
        if (invalidBatch.current) return;
        invalidBatch.current = true;
        const field = event.target as HTMLInputElement;
        const label = field.labels?.[0]?.textContent?.trim() || 'Revisa el formulario';
        show(`${label}: ${fieldMessage(field)}`, 'danger');
        queueMicrotask(() => { invalidBatch.current = false; if (field.isConnected) field.focus(); });
      }}>{children}</div>
      <div className="toast-host" role="status" aria-live="polite">
        {message && (
          <div className={`toast toast--${tone}`}>
            {tone === 'danger' ? <CircleAlert size={20} aria-hidden="true"/> : <CheckCircle size={20} aria-hidden="true"/>}
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="Cerrar notificación"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
