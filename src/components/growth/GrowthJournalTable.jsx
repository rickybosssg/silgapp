import React from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

const STATUS_COLORS = {
  "sent": "bg-blue-100 text-blue-700",
  "converted": "bg-emerald-100 text-emerald-700",
  "failed": "bg-rose-100 text-rose-700",
  "control": "bg-slate-100 text-slate-500",
  "active": "bg-blue-100 text-blue-700",
  "completed": "bg-slate-100 text-slate-500",
  "expired": "bg-amber-100 text-amber-700",
  "validee": "bg-emerald-100 text-emerald-700",
  "pending": "bg-amber-100 text-amber-700",
};

export default function GrowthJournalTable({ entries, loading }) {
  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-400 text-center py-8">Chargement du journal…</p>
      </Card>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-400 text-center py-8">Aucune entrée dans le journal pour cette période.</p>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Moteur</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs">Statut</TableHead>
              <TableHead className="text-xs text-right">CA généré</TableHead>
              <TableHead className="text-xs text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, i) => (
              <TableRow key={i} className="hover:bg-slate-50">
                <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                  {formatDateTime(entry.date)}
                </TableCell>
                <TableCell className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  {entry.moteur}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {entry.action}
                  {entry.error && (
                    <span className="block text-[10px] text-rose-500 mt-0.5">⚠ {entry.error}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`text-[10px] ${STATUS_COLORS[entry.statut] || "bg-slate-100 text-slate-500"}`}>
                    {entry.statut}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right text-slate-600">
                  {entry.revenue > 0 ? `${entry.revenue.toLocaleString()} F` : "—"}
                </TableCell>
                <TableCell className="text-xs text-right text-slate-600">
                  {entry.commission > 0 ? `${entry.commission.toLocaleString()} F` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}