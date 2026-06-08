import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiagnosticPushPanel from "@/components/admin/DiagnosticPushPanel";

export default function DiagnosticPushComplet() {
  const [params] = useSearchParams();
  const email = params.get("email") || "";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/externe">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <h1 className="text-lg sm:text-xl font-black text-slate-900">
                Diagnostic notifications push
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Tokens web, tokens Android, test Firebase et diagnostic APK local.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <DiagnosticPushPanel defaultSearchEmail={email} />
        </div>
      </div>
    </div>
  );
}
