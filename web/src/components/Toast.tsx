import { useLanguage } from "../app/language";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { Department } from "../app/api";

export interface ToastProps {
  message: string;
  subtitle?: string;
  department?: Department;
  onClose: () => void;
  duration?: number;
}

export function Toast(props: ToastProps) {
  return (
    <ToastNotification
      key={JSON.stringify([props.message, props.subtitle, props.department])}
      {...props}
    />
  );
}

function ToastNotification({
  message,
  subtitle,
  department,
  onClose,
  duration = 4000,
}: ToastProps) {
  const { t, language } = useLanguage();
  const [closing, setClosing] = useState(false);
  const closeCallback = useRef(onClose);
  useEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const exitDuration = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
      ? 80
      : 140;
    const timer = setTimeout(
      () => {
        if (closing) closeCallback.current();
        else setClosing(true);
      },
      closing ? exitDuration : duration,
    );
    return () => clearTimeout(timer);
  }, [closing, duration]);

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast ${department ?? ""}${closing ? " closing" : ""}`}>
        <span className="toast-icon">
          <CheckCircle2 size={18} />
        </span>
        <div className="toast-content">
          <span className="toast-title">
            {language === "zh-TW" && message.endsWith(" signed in successfully")
              ? `${message.replace(" signed in successfully", "")} 已成功登入`
              : t(message)}
          </span>
          {subtitle && <span className="toast-subtitle">{t(subtitle)}</span>}
        </div>
        <button
          className="toast-close"
          onClick={() => setClosing(true)}
          aria-label={t("Dismiss notification")}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
