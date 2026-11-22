import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function emitToast(type: 'success' | 'error' | 'info', message: string) {
  window.dispatchEvent(new CustomEvent('sovereign-toast', { detail: { type, message } }));
}

export function ToastBanner({
  toasts,
  onDismiss,
}: {
  toasts: ToastNotice[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => {
        const icon =
          t.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : t.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
          );
        const borderTone =
          t.type === 'success'
            ? 'border-emerald-500/30'
            : t.type === 'error'
            ? 'border-rose-500/40'
            : 'border-indigo-500/30';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto sn-elevated border ${borderTone} rounded-xl px-3.5 py-2.5 shadow-lg flex items-start gap-2.5 text-xs`}
          >
            <div className="mt-0.5">{icon}</div>
            <p className="flex-1 sn-text leading-relaxed break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="sn-muted hover:sn-text p-0.5 rounded shrink-0"
              aria-label="关闭通知"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
