import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package } from "lucide-react";
import CourseListItem from "../components/courses/CourseListItem";
import CourseDetailDialog from "../components/courses/CourseDetailDialog";
import AssignLivreurDialog from "../components/courses/AssignLivreurDialog";

const statuts = [
  { value: "tous", label: "Tous les statuts" },
  { value: "nouvelle", label: "Nouvelle" },
  { value: "en_attente_livreur", label: "En attente livreur" },
  { value: "acceptee", label: "Acceptée" },
  { value: "en_route_recuperation", label: "En route récupération" },
  { value: "colis_recupere", label: "Colis récupéré" },
  { value: "en_livraison", label: "En livraison" },
  { value: "livree", label: "Livrée" },
  { value: "annulee", label: "Annulée" },
];

export default function ToutesCourses() {
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("tous");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignCourse, setAssignCourse] = useState(null);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.list("-created_date", 500),
    initialData: [],
  });

  const filtered = useMemo(() => {
    return courses.filter(c => {
      const matchSearch = !search || 
        c.client_nom?.toLowerCase().includes(search.toLowerCase()) ||
        c.client_telephone?.includes(search) ||
        c.adresse_depart?.toLowerCase().includes(search.toLowerCase()) ||
        c.adresse_arrivee?.toLowerCase().includes(search.toLowerCase()) ||
        c.livreur_nom?.toLowerCase().includes(search.toLowerCase());
      const matchStatut = statutFilter === "tous" || c.statut === statutFilter;
      return matchSearch && matchStatut;
    });
  }, [courses, search, statutFilter]);

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Toutes les courses</h1>
        <span className="text-sm text-muted-foreground ml-2">({courses.length})</span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher client, livreur, quartier..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuts.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-center py-12 text-muted-foreground text-sm">Chargement...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center py-12 text-muted-foreground text-sm">Aucune course trouvée</p>
        )}
        {filtered.map(course => (
          <CourseListItem
            key={course.id}
            course={course}
            onView={setSelectedCourse}
            onAssign={setAssignCourse}
          />
        ))}
      </div>

      <CourseDetailDialog course={selectedCourse} open={!!selectedCourse} onClose={() => setSelectedCourse(null)} />
      <AssignLivreurDialog course={assignCourse} open={!!assignCourse} onClose={() => setAssignCourse(null)} />
    </div>
  );
}