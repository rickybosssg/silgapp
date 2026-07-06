import React, { useState } from "react";
import { useAdminCourseWindows } from "@/context/AdminCourseWindowsContext";
import CourseWindowCard from "./CourseWindowCard";
import { Layers, X, ChevronRight } from "lucide-react";

export default function CourseWindowStack() {
  const { windows, removeWindow } = useAdminCourseWindows();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  if (windows.length === 0) return null;

  return (
    <>
      {/* Desktop: fixed right panel */}
      {desktopCollapsed ? (
        <button
          onClick={() => setDesktopCollapsed(false)}
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-primary text-white rounded-l-xl py-4 px-2 shadow-lg items-center gap-1"
        >
          <Layers className="w-4 h-4" />
          <span className="text-xs font-bold rotate-180" style={{ writingMode: "vertical-rl" }}>{windows.length}</span>
        </button>
      ) : (
        <div className="hidden lg:block fixed right-0 top-0 bottom-0 z-40 w-96 border-l border-gray-200 bg-slate-50/95 backdrop-blur-sm">
          <div className="sticky top-0 bg-slate-50/95 backdrop-blur-sm border-b border-gray-200 px-3 py-2.5 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-gray-700">Courses actives</span>
              <span className="text-xs font-bold text-white bg-primary px-2 py-0.5 rounded-full">{windows.length}</span>
            </div>
            <button onClick={() => setDesktopCollapsed(true)} className="p-1 rounded hover:bg-gray-200">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: "calc(100vh - 50px)" }}>
            {windows.map(w => (
              <CourseWindowCard
                key={w.courseId}
                courseId={w.courseId}
                formData={w.formData}
                onClose={() => removeWindow(w.courseId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile: floating button + overlay */}
      <div className="lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        >
          <Layers className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white">
            {windows.length}
          </span>
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={() => setMobileOpen(false)}>
            <div
              className="w-full max-w-sm bg-slate-50 h-full overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-slate-50 border-b border-gray-200 px-3 py-2.5 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-gray-700">Courses actives ({windows.length})</span>
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-200">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-3 space-y-3">
                {windows.map(w => (
                  <CourseWindowCard
                    key={w.courseId}
                    courseId={w.courseId}
                    formData={w.formData}
                    onClose={() => removeWindow(w.courseId)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}