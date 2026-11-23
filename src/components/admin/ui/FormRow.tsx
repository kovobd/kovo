import * as React from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type FieldState = "idle" | "error" | "success" | "loading";

interface FormRowProps {
  label?: string;
  hint?: string;
  error?: string;
  success?: string;
  /** Validation/state visual. If `error` is provided, state defaults to "error". */
  state?: FieldState;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  /** Render label + hint on the left and the control on the right (single row). */
  inline?: boolean;
  children: React.ReactNode;
}

const FormRow = ({
  label, hint, error, success, state, required, htmlFor, className, inline, children,
}: FormRowProps) => {
  const resolvedState: FieldState =
    state ?? (error ? "error" : success ? "success" : "idle");

  const Status = () => {
    if (resolvedState === "loading")
      return <Loader2 className="a-spin" size={14} aria-hidden style={{ position: "static" }} />;
    if (resolvedState === "error")
      return <AlertCircle size={14} aria-hidden />;
    if (resolvedState === "success")
      return <CheckCircle2 size={14} aria-hidden />;
    return null;
  };

  const helperText = error || success || hint;
  const helperColor =
    resolvedState === "error" ? "hsl(var(--a-danger))" :
    resolvedState === "success" ? "hsl(var(--a-success))" :
    "hsl(var(--a-soft))";

  const fieldWrap = (
    <div className="a-field-wrap" data-state={resolvedState}>
      {children}
      {resolvedState !== "idle" && (
        <span className="a-field-icon"><Status /></span>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className={cn("flex items-center justify-between gap-4 py-2.5", className)}>
        <div className="min-w-0">
          {label && (
            <label htmlFor={htmlFor} className="block text-[13px] font-medium"
              style={{ color: "hsl(var(--a-ink))", letterSpacing: "-0.005em" }}>
              {label}
              {required && <span style={{ color: "hsl(var(--a-danger))" }} className="ml-0.5">*</span>}
            </label>
          )}
          {helperText && (
            <p
              className="text-[11.5px] mt-0.5 leading-relaxed flex items-center gap-1"
              style={{ color: helperColor }}
              aria-live={resolvedState === "error" ? "polite" : undefined}
            >
              {(resolvedState === "error" || resolvedState === "success") && (
                <span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: "currentColor" }} />
              )}
              {helperText}
            </p>
          )}
        </div>
        <div className="shrink-0">{fieldWrap}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[12.5px] font-medium"
          style={{ color: "hsl(var(--a-ink))", letterSpacing: "-0.005em" }}>
          {label}
          {required && <span style={{ color: "hsl(var(--a-danger))" }} className="ml-0.5">*</span>}
        </label>
      )}
      {fieldWrap}
      {helperText && (
        <p
          className="text-[11.5px] leading-relaxed flex items-center gap-1"
          style={{ color: helperColor }}
          aria-live={resolvedState === "error" ? "polite" : undefined}
        >
          {(resolvedState === "error" || resolvedState === "success") && (
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: "currentColor" }} />
          )}
          {helperText}
        </p>
      )}
    </div>
  );
};

export default FormRow;
