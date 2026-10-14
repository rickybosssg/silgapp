import React, { useState } from "react";
import { Download, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function ExportClientsBFButton() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleExport = async () => {
    setExporting(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("exportClientsBF", {});
      const data = res?.data || res;
      if (!data?.success) {
        throw new Error(data?.error || "Échec de l'export");
      }

      // ── Téléchargement du CSV ──
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      link.href = url;
      link.download = `clients_silgapp_bf_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setResult({
        total: data.total_clients,
        excluded_test: data.excluded_test,
        excluded_dnc: data.excluded_do_not_contact,
        duplicates: data.duplicates_count,
      });

      toast.success(`${data.total_clients} clients exportés`);
    } catch (error) {
      console.error("[ExportClientsBF] Erreur:", error);
      toast.error("Erreur : " + (error?.message || "export impossible"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleExport}
        disabled={exporting}
        className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-4 h-4 mr-2" />
        )}
        {exporting ? "Export en cours..." : "Exporter clients BF (CSV)"}
      </Button>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {result.total} clients exportés
          </p>
          <div className="text-green-600 space-y-0.5">
            <p>{result.excluded_test} compte(s) de test exclu(s)</p>
            <p>{result.excluded_dnc} contact(s) "ne plus contacter" exclu(s)</p>
            {result.duplicates > 0 && (
              <p className="flex items-center gap-1 text-amber-600 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {result.duplicates} numéro(s) en doublon signalé(s)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}