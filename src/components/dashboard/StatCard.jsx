import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatCard({ title, value, icon: Icon, trend, trendLabel, className, iconBg, onClick }) {
  return (
    <Card
      className={cn("p-5 relative overflow-hidden", onClick && "cursor-pointer hover:shadow-md hover:border-primary/40 transition-all active:scale-95", className)}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {trendLabel && (
            <p className={cn(
              "text-xs font-medium",
              trend > 0 ? "text-accent" : trend < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {trendLabel}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg || "bg-primary/10")}>
            <Icon className={cn("w-5 h-5", iconBg ? "text-white" : "text-primary")} />
          </div>
        )}
      </div>
    </Card>
  );
}
