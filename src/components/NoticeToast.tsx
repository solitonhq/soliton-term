import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const NoticeToast: React.FC = () => {
  const { notice, dismissNotice } = useAppStore();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissNotice, 8000);
    return () => clearTimeout(timer);
  }, [notice, dismissNotice]);

  if (!notice) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-[60] max-w-sm flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-red-500/30 bg-app-panel shadow-2xl text-xs text-app-text"
    >
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium mb-0.5">Could not save changes</div>
        <div className="text-app-muted break-words select-text">{notice.message}</div>
      </div>
      <button
        type="button"
        onClick={dismissNotice}
        className="p-0.5 rounded text-app-muted hover:text-app-text"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
