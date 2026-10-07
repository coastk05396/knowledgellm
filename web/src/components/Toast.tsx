import { useLanguage } from "../app/language";
import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { Department } from "../app/api";

export interface ToastProps {
  message: string;
  subtitle?: string;
  department?: Department;
  onClose: () => void;
  duration?: number;
}

export function Toast({
  message,
  subtitle,
  department,
  onClose,
  duration = 4000,
}: ToastProps) {
  const { t, language } = useLanguage();
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast ${department ?? ""}`}>
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
          onClick={onClose}
          aria-label={t("Dismiss notification")}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
