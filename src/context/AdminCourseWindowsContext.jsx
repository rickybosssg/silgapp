import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const AdminCourseWindowsContext = createContext(null);
const STORAGE_KEY = "silgapp_admin_course_windows";

export function AdminCourseWindowsProvider({ children }) {
  const [windows, setWindows] = useState([]);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setWindows(parsed);
        }
      }
    } catch (_) {}
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(windows));
    } catch (_) {}
  }, [windows]);

  const addWindow = useCallback((course, formData) => {
    const entry = { courseId: course.id, formData, addedAt: Date.now() };
    setWindows(prev => {
      if (prev.some(w => w.courseId === course.id)) return prev;
      return [...prev, entry];
    });
  }, []);

  const removeWindow = useCallback((courseId) => {
    setWindows(prev => prev.filter(w => w.courseId !== courseId));
  }, []);

  return (
    <AdminCourseWindowsContext.Provider value={{ windows, addWindow, removeWindow }}>
      {children}
    </AdminCourseWindowsContext.Provider>
  );
}

export function useAdminCourseWindows() {
  const ctx = useContext(AdminCourseWindowsContext);
  if (!ctx) throw new Error("useAdminCourseWindows must be used within AdminCourseWindowsProvider");
  return ctx;
}