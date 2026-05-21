import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const urgenceConfig = {
  normale: { label: "Normale", className: "bg-slate-100 text-slate-600" },
  urgente: { label: "Urgente", className: "bg-amber-100 text-amber-700" },
  tres_urgente: { label: "Très urgente", className: "bg-red-100 text-red-700" },
};

export default function UrgenceBadge({ urgence }) {
  const config = urgenceConfig[urgence] || urgenceConfig.normale;
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}