import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------------- Button ---------------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-black hover:bg-gold-2",
  secondary: "bg-surface-2 text-ink border border-line hover:bg-line",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
  success: "bg-ok/15 text-ok border border-ok/30 hover:bg-ok/25",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-sm", lg: "h-13 px-5 text-base" };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------- Form fields ---------------- */
const fieldCls =
  "w-full rounded-xl bg-surface-2 border border-line px-3.5 h-11 text-[15px] text-ink placeholder:text-muted/70 outline-none focus:border-gold/70 focus:ring-2 focus:ring-gold/20 transition";

export function Field({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink/90">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input {...rest} className={cx(fieldCls, className)} />
    </Field>
  );
}

export function Select({ label, hint, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select {...rest} className={cx(fieldCls, "pr-8", className)}>
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <textarea {...rest} className={cx(fieldCls, "h-auto min-h-20 py-2.5", className)} />
    </Field>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 py-2 text-left">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-gold" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-5.5" : "left-0.5")} />
      </span>
    </button>
  );
}

/* ---------------- Layout bits ---------------- */
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx("rounded-2xl border border-line bg-surface p-4", onClick && "cursor-pointer hover:border-gold/40 transition", className)}>
      {children}
    </div>
  );
}

const BADGE = {
  gray: "bg-surface-2 text-muted border-line",
  gold: "bg-gold/15 text-gold border-gold/30",
  green: "bg-ok/12 text-ok border-ok/25",
  yellow: "bg-warn/12 text-warn border-warn/25",
  red: "bg-bad/12 text-bad border-bad/25",
  blue: "bg-info/12 text-info border-info/25",
};
export type BadgeColor = keyof typeof BADGE;
export function Badge({ color = "gray", children }: { color?: BadgeColor; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", BADGE[color])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-6 animate-spin text-gold", className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

/* ---------------- Modal (bottom sheet no celular) ---------------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="animate-fade absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cx("animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface sm:rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; type: "success" | "error"; text: string };
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void }>(null!);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((type: Toast["type"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, type, text }]);
    setTimeout(() => setItems((i) => i.filter((t) => t.id !== id)), 4200);
  }, []);
  const api = { success: (t: string) => push("success", t), error: (t: string) => push("error", t) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="animate-sheet pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm shadow-xl">
            {t.type === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
