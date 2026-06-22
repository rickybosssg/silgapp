import { Loader2 } from "lucide-react";

export default function PullToRefreshIndicator({ pulling, refreshing }) {
  if (!pulling && !refreshing) return null;
  return (
    <div className="fixed top-14 left-0 right-0 flex justify-center z-50 pointer-events-none">
      <div className="bg-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-xs font-medium text-primary border border-primary/20">
        <Loader2 className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "Actualisation..." : "Relâchez pour actualiser"}
      </div>
    </div>
  );
}
