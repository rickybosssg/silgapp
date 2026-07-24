import React from "react";
import { Flame, Zap, Circle } from "lucide-react";

const PRIORITY_CONFIG = {
  urgente: {
    label: "URGENTE",
    icon: Zap,
    classes: "bg-red-600 text-white border-red-700 animate-pulse",
  },
  haute: {
    label: "Haute",
    icon: Flame,
    classes: "bg-orange-500 text-white border-orange-600",
  },
  normal: {
    label: "Normal",
    icon: Circle,
    classes: "bg-gray-100 text-gray-500 border-gray-200",
  },
};

export default function PriorityBadge({ priority = "normal", size = "sm", onClick }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  const Icon = config.icon;
  const sizeClasses = size === "xs"
    ? "text-[9px] px-1.5 py-0.5 gap-0.5"
    : "text-[10px] px-2 py-0.5 gap-1";

  const Component = onClick ? "button" : "span";

  return (
    <Component
      onClick={onClick}
      className={`inline-flex items-center rounded-full border font-bold ${config.classes} ${sizeClasses} ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
    >
      <Icon className={size === "xs" ? "w-2 h-2" : "w-2.5 h-2.5"} />
      {config.label}
    </Component>
  );
}