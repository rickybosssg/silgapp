import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES = {
  P0: { bg: "bg-red-600", border: "border-red-700", label: "Critique" },
  P1: { bg: "bg-orange-500", border: "border-orange-600", label: "Important" },
};

const TOAST_POSITION_STYLE = {
  position: "fixed",
  top: "max(env(safe-area-inset-top), 12px)",
  left: "12px",
  right: "12px",
  width: "auto",
  maxWidth: "calc(100vw - 24px)",
  zIndex: 70,
  boxSizing: "border-box",
};

export default function VenusAdminToast({ toast, onDismiss }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -80 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={TOAST_POSITION_STYLE}
        >
          <div className={cn(
            "flex items-start gap-3 rounded-xl shadow-2xl border-2 p-3 text-white",
            PRIORITY_STYLES[toast.priority]?.bg || "bg-orange-500",
            PRIORITY_STYLES[toast.priority]?.border || "border-orange-600"
          )}>
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-black uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded flex-shrink-0">
                  {PRIORITY_STYLES[toast.priority]?.label || "Important"}
                </span>
                {toast.count > 1 && (
                  <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded flex-shrink-0">×{toast.count}</span>
                )}
              </div>
              <p className="text-sm font-semibold leading-snug break-words whitespace-normal">{toast.message}</p>
            </div>
            <button
              onClick={onDismiss}
              className="flex-shrink-0 w-6 h-6 rounded-lg hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}