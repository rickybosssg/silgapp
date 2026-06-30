import React, { useState } from "react";
import { Download, FileText, FileSpreadsheet, ChevronDown } from "lucide-react";
import { jsPDF } from "jspdf";

function buildKpiRows(kpis) {
  return [
    ["Total clients", kpis.total_clients],
    ["Total livreurs", kpis.total_livreurs],
    ["Total partenaires", kpis.total_partenaires],
    ["Pharmacies", kpis.total_pharmacies],
    ["Boutiques", kpis.total_boutiques],
    ["Restaurants", kpis.total_restaurants],
    ["Courses creees", kpis.courses_creees],
    ["Courses terminees", kpis.courses_terminees],
    ["Courses annulees", kpis.courses_annulees],
    ["Livreurs en ligne", kpis.livreurs_en_ligne],
    ["Livreurs hors ligne", kpis.livreurs_hors_ligne],
    ["Utilisateurs connectes", kpis.utilisateurs_connectes],
    ["Chiffre d'affaires (FCFA)", kpis.ca_total],
    ["Telechargements totaux", kpis.telechargements_total],
  ];
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportButtons({ kpis, parPays, periode }) {
  const [open, setOpen] = useState(false);
  if (!kpis) return null;

  const rows = buildKpiRows(kpis);
  const dateStr = new Date().toISOString().split("T")[0];

  const exportCSV = () => {
    let csv = "Indicateur;Valeur\n";
    rows.forEach(([label, val]) => { csv += `${label};${val}\n`; });
    csv += "\nRepartition par pays\n";
    csv += "Pays;Clients;Livreurs;Courses;CA (FCFA);Installations\n";
    Object.entries(parPays || {}).forEach(([code, d]) => {
      csv += `${code};${d.clients};${d.livreurs};${d.courses};${d.ca};${d.installations}\n`;
    });
    downloadBlob("\ufeff" + csv, `statistiques_silgapp_${dateStr}.csv`, "text/csv;charset=utf-8;");
    setOpen(false);
  };

  const exportExcel = () => {
    let html = "<table border='1'>";
    html += "<tr><th colspan='2'>Statistiques SILGAPP</th></tr>";
    html += `<tr><td>Periode</td><td>${periode?.debut?.split("T")[0]} - ${periode?.fin?.split("T")[0]}</td></tr>`;
    html += "<tr><th>Indicateur</th><th>Valeur</th></tr>";
    rows.forEach(([label, val]) => { html += `<tr><td>${label}</td><td>${val}</td></tr>`; });
    html += "<tr><th colspan='2'>Repartition par pays</th></tr>";
    html += "<tr><th>Pays</th><th>Clients / Livreurs / Courses / CA / Installations</th></tr>";
    Object.entries(parPays || {}).forEach(([code, d]) => {
      html += `<tr><td>${code}</td><td>${d.clients} / ${d.livreurs} / ${d.courses} / ${d.ca} / ${d.installations}</td></tr>`;
    });
    html += "</table>";
    downloadBlob("\ufeff" + html, `statistiques_silgapp_${dateStr}.xls`, "application/vnd.ms-excel;charset=utf-8;");
    setOpen(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("Statistiques SILGAPP", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Periode: ${periode?.debut?.split("T")[0]} - ${periode?.fin?.split("T")[0]}`, 14, y);
    y += 6;
    doc.text(`Genere le: ${new Date().toLocaleString("fr-FR")}`, 14, y);
    y += 10;

    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text("Indicateurs cles", 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    rows.forEach(([label, val]) => {
      doc.text(`${label}:`, 16, y);
      doc.text(String(val).toLocaleString(), 120, y);
      y += 5.5;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    y += 8;
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text("Repartition par pays", 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    Object.entries(parPays || {}).forEach(([code, d]) => {
      doc.text(`${code}: ${d.clients}C / ${d.livreurs}L / ${d.courses}Co / ${d.ca}F / ${d.installations}I`, 16, y);
      y += 5.5;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    doc.save(`statistiques_silgapp_${dateStr}.pdf`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white text-xs font-bold shadow-md hover:opacity-90 transition-opacity"
      >
        <Download className="w-4 h-4" />
        Exporter
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden w-44">
            <button onClick={exportCSV} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <FileText className="w-4 h-4 text-green-500" /> CSV
            </button>
            <button onClick={exportExcel} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50">
              <FileSpreadsheet className="w-4 h-4 text-blue-500" /> Excel
            </button>
            <button onClick={exportPDF} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50">
              <FileText className="w-4 h-4 text-red-500" /> PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}