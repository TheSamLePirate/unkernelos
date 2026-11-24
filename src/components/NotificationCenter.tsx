import { Bell, CheckCheck, ExternalLink, Trash2 } from "lucide-react";
import React from "react";
import { useWm, wmStore } from "../wm/wm-store.ts";

export const NotificationCenter: React.FC = () => {
  const wm = useWm();
  if (!wm.notificationCenterOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[78]"
        onClick={() => wmStore.setNotificationCenter(false)}
      />
      <aside
        style={{ top: "calc(42px + env(safe-area-inset-top))" }}
        className="fixed left-2 right-2 sm:left-auto sm:right-3 z-[82] sm:w-88 max-h-[72dvh] rounded-3xl glass-surface-focused flex flex-col overflow-hidden animate-window-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Bell className="w-3.5 h-3.5 text-violet-400" />
            Notification Center
            <span className="text-[10px] font-mono text-zinc-400">
              ({wm.notificationHistory.length})
            </span>
          </div>
          {wm.notificationHistory.length > 0 && (
            <button
              type="button"
              onClick={() => wmStore.clearNotifications()}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-300 transition"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {wm.notificationHistory.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center text-zinc-500">
              <CheckCheck className="w-6 h-6 opacity-50" />
              <p className="text-xs">All caught up. No notifications yet.</p>
            </div>
          ) : (
            wm.notificationHistory.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-2xl border bg-white/[0.03] space-y-1 ${
                  n.level === "error"
                    ? "border-rose-400/35"
                    : n.level === "success"
                    ? "border-emerald-400/30"
                    : n.level === "warn"
                    ? "border-amber-400/30"
                    : "border-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white truncate">{n.title}</span>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 break-words leading-relaxed">{n.message}</p>
                {n.action && (
                  <button
                    type="button"
                    onClick={() => {
                      if (n.action?.copyText) {
                        navigator.clipboard.writeText(n.action.copyText).catch(() => {});
                      }
                      window.open(n.action!.url, "_blank", "noopener,noreferrer");
                    }}
                    className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-violet-600/80 hover:bg-violet-500 text-white transition"
                  >
                    {n.action.label}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
};
