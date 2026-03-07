import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
}

interface ToastOptions {
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, type?: "success" | "error" | "info", options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success", options?: ToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
    const duration = options?.action ? 6000 : 3000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  function handleAction(toast: Toast) {
    toast.action?.onClick();
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — bottom center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium pointer-events-auto flex items-center gap-3
              animate-[slideUp_0.3s_ease-out] transition-opacity
              ${toast.type === "error"
                ? "bg-red-600 text-white"
                : toast.type === "info"
                  ? "bg-[#514636] text-white"
                  : "bg-[#3a3128] text-white"
              }`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => handleAction(toast)}
                className="text-white/90 hover:text-white font-semibold underline underline-offset-2 shrink-0"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
