'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const toneStyles = {
  default: {
    icon: Info,
    iconWrap: 'bg-gray-100 text-gray-700',
    confirm: 'bg-gray-950 hover:bg-gray-800',
  },
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-red-50 text-red-600',
    confirm: 'bg-red-600 hover:bg-red-700',
  },
  success: {
    icon: CheckCircle2,
    iconWrap: 'bg-green-50 text-green-700',
    confirm: 'bg-gray-950 hover:bg-gray-800',
  },
};

/**
 * Minimal app modal for confirms, alerts, and messages.
 * - confirm: Cancel + Confirm
 * - alert / info: single dismiss button
 */
export function AppModal({
  open,
  title,
  description,
  mode = 'confirm',
  tone = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  dismissLabel = 'OK',
  loading = false,
  onConfirm,
  onClose,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const styles = toneStyles[tone] || toneStyles.default;
  const Icon = styles.icon;
  const isConfirm = mode === 'confirm';

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const timer = window.setTimeout(() => {
      (isConfirm ? cancelRef.current : confirmRef.current)?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) onClose?.();
      if (event.key !== 'Tab') return;
      const focusable = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusable.length < 2) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open, loading, onClose, isConfirm]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !loading) onClose?.();
    }}>
      <DialogContent
        className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-0 shadow-xl"
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.iconWrap}`}>
              <Icon className="h-5 w-5" />
            </div>
            <DialogHeader className="flex-1 space-y-1 text-left">
              <div className="flex items-start justify-between gap-3">
                <DialogTitle className="text-lg font-semibold text-gray-950">{title}</DialogTitle>
                <button
                  type="button"
                  disabled={loading}
                  onClick={onClose}
                  className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {description ? (
                <DialogDescription className="pt-1 text-sm leading-6 text-gray-600">
                  {description}
                </DialogDescription>
              ) : null}
            </DialogHeader>
          </div>

          <DialogFooter className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
            {isConfirm ? (
              <button
                ref={cancelRef}
                type="button"
                disabled={loading}
                onClick={onClose}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelLabel}
              </button>
            ) : null}
            <button
              ref={confirmRef}
              type="button"
              disabled={loading}
              onClick={() => {
                if (isConfirm) onConfirm?.();
                else onClose?.();
              }}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${styles.confirm}`}
            >
              {loading ? 'Working...' : (isConfirm ? confirmLabel : dismissLabel)}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <AppModal
      open={open}
      title={title}
      description={description}
      mode="confirm"
      tone={destructive ? 'danger' : 'default'}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      loading={loading}
      onConfirm={onConfirm}
      onClose={onCancel}
    />
  );
}

export function AlertDialog({
  open,
  title,
  description,
  tone = 'default',
  dismissLabel = 'OK',
  onClose,
}) {
  return (
    <AppModal
      open={open}
      title={title}
      description={description}
      mode="alert"
      tone={tone}
      dismissLabel={dismissLabel}
      onClose={onClose}
    />
  );
}
