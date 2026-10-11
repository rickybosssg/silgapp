import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChatWindow from "@/components/chat/ChatWindow";
import useChatViewport from "@/hooks/useChatViewport";

// Full-screen entry point, using the same per-course conversation as tracking.
export default function CourseChatPanel({ courseId, myType, myId, myName, onBack }) {
  const viewport = useChatViewport();
  const [courseInfo, setCourseInfo] = useState(null);
  useEffect(() => {
    let active = true;
    setCourseInfo(null);
    if (courseId) base44.entities.CourseExterne.get(courseId)
      .then(course => { if (active) setCourseInfo(course); }).catch(() => {});
    return () => { active = false; };
  }, [courseId]);
  const label = courseInfo
    ? `${courseInfo.client_nom || "Client"} — ${courseInfo.adresse_depart || ""} → ${courseInfo.adresse_arrivee || ""}`
    : `Course #${courseId?.slice(-6) || ""}`;
  return (
    <div style={viewport} className="fixed inset-x-0 z-[80] flex flex-col min-h-0 bg-[#16191d]">
      <div className="flex items-center gap-2 p-3 safe-area-top bg-[#0f1216] text-white">
        <button onClick={onBack} aria-label="Retour aux messages" className="p-2 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-xs truncate">{label}</span>
      </div>
      <ChatWindow courseId={courseId} senderType={myType} senderId={myId}
        senderName={myName} fullHeight />
    </div>
  );
}
