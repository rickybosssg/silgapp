import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAdminCourseWindows } from "@/context/AdminCourseWindowsContext";
import CourseWindowCard from "./CourseWindowCard";
import { Layers, X, ChevronRight } from "lucide-react";

export default function CourseWindowStack() {
  const { windows, removeWindow } = useAdminCourseWindows();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const buttonRef = useRef(null);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  const [mobilePosition, setMobilePosition] = useState(null);

  const clampPosition = useCallback((position) => {
    const buttonSize = 56;
    const margin = 12;
    const headerInset = 72;
    const bottomInset = 80;
    return {
      x: Math.min(Math.max(position.x, margin), Math.max(margin, window.innerWidth - buttonSize - margin)),
      y: Math.min(Math.max(position.y, headerInset), Math.max(headerInset, window.innerHeight - buttonSize - bottomInset)),
    };
  }, []);

  useEffect(() => {
    const defaultPosition = { x: 16, y: window.innerHeight - 56 - 88 };
    try {
      const saved = sessionStorage.getItem("silgapp_admin_course_button_position");
      setMobilePosition(clampPosition(saved ? JSON.parse(saved) : defaultPosition));
    } catch {
      setMobilePosition(clampPosition(defaultPosition));
    }

    const handleResize = () => setMobilePosition(current => current ? clampPosition(current) : current);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition]);

  const handlePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    didDragRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: mobilePosition,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !drag.origin) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 5) didDragRef.current = true;
    if (didDragRef.current) {
      const nextPosition = clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy });
      drag.lastPosition = nextPosition;
      setMobilePosition(nextPosition);
    }
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const positionToSave = drag.lastPosition || mobilePosition;
    if (positionToSave) {
      sessionStorage.setItem("silgapp_admin_course_button_position", JSON.stringify(positionToSave));
    }
  };

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
          ref={buttonRef}
          type="button"
          aria-label={`Ouvrir les informations des courses actives (${windows.length})`}
          title="Courses actives"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          onClick={() => { if (!didDragRef.current) setMobileOpen(true); }}
          className="fixed z-[55] w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform cursor-grab active:cursor-grabbing select-none"
          style={mobilePosition ? { left: mobilePosition.x, top: mobilePosition.y, touchAction: "none" } : { left: 16, bottom: 88, touchAction: "none" }}
        >
          <Layers className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white">
            {windows.length}
          </span>
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-[70] bg-black/50 flex justify-end" onClick={() => setMobileOpen(false)}>
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
