import React, { useEffect, useRef, useState } from "react";
import { useAdminCourseWindows } from "@/context/AdminCourseWindowsContext";
import CourseWindowCard from "./CourseWindowCard";
import { Layers, X, ChevronRight } from "lucide-react";

const MOBILE_BUTTON_SIZE = 56;
const MOBILE_BUTTON_MARGIN = 12;
const MOBILE_BUTTON_BOTTOM_SAFE = 24;
const MOBILE_BUTTON_DEFAULT_RIGHT = 16;
const MOBILE_BUTTON_DEFAULT_BOTTOM = 80;
const MOBILE_BUTTON_DRAG_THRESHOLD = 8;
const MOBILE_BUTTON_STORAGE_KEY = "silgapp_course_window_stack_button_position";

function clampMobileButtonPosition(position) {
  if (typeof window === "undefined") return position;

  const maxX = Math.max(MOBILE_BUTTON_MARGIN, window.innerWidth - MOBILE_BUTTON_SIZE - MOBILE_BUTTON_MARGIN);
  const maxY = Math.max(MOBILE_BUTTON_MARGIN, window.innerHeight - MOBILE_BUTTON_SIZE - MOBILE_BUTTON_BOTTOM_SAFE);

  return {
    x: Math.min(Math.max(position.x, MOBILE_BUTTON_MARGIN), maxX),
    y: Math.min(Math.max(position.y, MOBILE_BUTTON_MARGIN), maxY),
  };
}

function getDefaultMobileButtonPosition() {
  if (typeof window === "undefined") {
    return { x: MOBILE_BUTTON_MARGIN, y: MOBILE_BUTTON_MARGIN };
  }

  return clampMobileButtonPosition({
    x: window.innerWidth - MOBILE_BUTTON_SIZE - MOBILE_BUTTON_DEFAULT_RIGHT,
    y: window.innerHeight - MOBILE_BUTTON_SIZE - MOBILE_BUTTON_DEFAULT_BOTTOM,
  });
}

function getInitialMobileButtonPosition() {
  if (typeof window === "undefined") return getDefaultMobileButtonPosition();

  try {
    const saved = window.localStorage.getItem(MOBILE_BUTTON_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
        return clampMobileButtonPosition(parsed);
      }
    }
  } catch {}

  return getDefaultMobileButtonPosition();
}

export default function CourseWindowStack() {
  const { windows, removeWindow } = useAdminCourseWindows();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileButtonPosition, setMobileButtonPosition] = useState(getInitialMobileButtonPosition);
  const mobileDragRef = useRef(null);
  const mobileButtonPositionRef = useRef(mobileButtonPosition);
  const suppressMobileClickRef = useRef(false);

  useEffect(() => {
    mobileButtonPositionRef.current = mobileButtonPosition;
  }, [mobileButtonPosition]);

  useEffect(() => {
    const handleResize = () => {
      setMobileButtonPosition((current) => {
        const next = clampMobileButtonPosition(current);
        try {
          window.localStorage.setItem(MOBILE_BUTTON_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const handleMobilePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressMobileClickRef.current = false;
    mobileDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: mobileButtonPositionRef.current,
      didDrag: false,
    };
  };

  const handleMobilePointerMove = (event) => {
    const drag = mobileDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance < MOBILE_BUTTON_DRAG_THRESHOLD && !drag.didDrag) return;

    event.preventDefault();
    drag.didDrag = true;
    suppressMobileClickRef.current = true;
    setMobileButtonPosition(clampMobileButtonPosition({
      x: drag.origin.x + deltaX,
      y: drag.origin.y + deltaY,
    }));
  };

  const handleMobilePointerUp = (event) => {
    const drag = mobileDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    mobileDragRef.current = null;

    if (drag.didDrag) {
      const next = clampMobileButtonPosition(mobileButtonPositionRef.current);
      setMobileButtonPosition(next);
      try {
        window.localStorage.setItem(MOBILE_BUTTON_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      window.setTimeout(() => {
        suppressMobileClickRef.current = false;
      }, 0);
    }
  };

  const handleMobileButtonClick = (event) => {
    if (suppressMobileClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setMobileOpen(true);
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
          onPointerDown={handleMobilePointerDown}
          onPointerMove={handleMobilePointerMove}
          onPointerUp={handleMobilePointerUp}
          onPointerCancel={handleMobilePointerUp}
          onClick={handleMobileButtonClick}
          className="fixed z-40 w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform cursor-grab active:cursor-grabbing"
          style={{
            left: `${mobileButtonPosition.x}px`,
            top: `${mobileButtonPosition.y}px`,
            touchAction: "none",
          }}
          aria-label="Ouvrir les courses actives"
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
