import { Navigation, ChevronRight } from "lucide-react";
import { getCourseStatusLabel } from "@/lib/courseStatuses";

export default function SuivreCourseCard({ course, onClick }) {
  if (!course) return null;
  const searching = ["nouvelle", "recherche_livreur"].includes(course.statut) && !course.livreur_id;
  const subtitle = searching ? "Recherche d'un livreur" : getCourseStatusLabel(course.statut);
  return (
    <button type="button" data-testid="suivre-course-card" data-course-id={course.id}
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-2xl bg-secondary text-secondary-foreground p-5 shadow-md text-left">
      <span className="w-14 h-14 rounded-2xl bg-secondary-foreground/10 flex items-center justify-center shrink-0">
        <Navigation className="w-7 h-7" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-lg font-black leading-tight">SUIVRE LA COURSE</span>
        <span className="block text-sm mt-1" aria-live="polite">{subtitle}</span>
      </span>
      <ChevronRight className="w-6 h-6 shrink-0" />
    </button>
  );
}