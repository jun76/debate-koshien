import { useEffect, useRef } from "react";

/**
 * アプリ調（ペーパークラフト）の確認モーダル。ブラウザ標準の confirm() の代替。
 * Escape / 背景クリックでキャンセル、表示時に確認ボタンへフォーカスする。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** 破壊的操作なら true（確認ボタンが赤になる） */
  danger?: boolean;
  /** 実行中はボタンを無効化する */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal-card paper pop-in" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        <div className="modal-actions">
          <button type="button" className="paper-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`paper-btn ${danger ? "danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
