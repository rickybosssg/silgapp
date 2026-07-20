import React from 'react';
import { cn } from '@/lib/utils';

export default function SubTabNav({ tabs, activeTab, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-4">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-primary text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                isActive ? "bg-white/20" : "bg-red-100 text-red-600"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}