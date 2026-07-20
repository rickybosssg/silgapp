import { Loader2, Search, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const COUNTRIES = [
  { code: "", label: "Tous pays" },
  { code: "BF", label: "Burkina Faso" },
  { code: "CI", label: "Côte d'Ivoire" },
  { code: "TG", label: "Togo" },
  { code: "BJ", label: "Bénin" },
  { code: "SN", label: "Sénégal" },
  { code: "ML", label: "Mali" },
  { code: "GN", label: "Guinée" },
  { code: "NE", label: "Niger" },
  { code: "GH", label: "Ghana" },
];

const STATUSES = [
  { code: "", label: "Tous" },
  { code: "active", label: "Actives" },
  { code: "venus", label: "🤖 Venus" },
  { code: "admin", label: "👤 Admin" },
  { code: "archived", label: "Archivées" },
];

export default function WhatsAppConversationList({
  conversations, activeConvId, onSelect,
  search, setSearch, filterCountry, setFilterCountry,
  filterStatus, setFilterStatus, loading,
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white border-b border-gray-100 safe-area-top">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-extrabold text-gray-900">WhatsApp Admin</h2>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom ou numéro..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="h-8 rounded-lg border border-gray-200 text-xs px-2 bg-white"
          >
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 rounded-lg border border-gray-200 text-xs px-2 bg-white"
          >
            {STATUSES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucune conversation</p>
          </div>
        )}
        {conversations.map(conv => (
          <ConvItem key={conv.id} conv={conv} active={conv.id === activeConvId} onClick={() => onSelect(conv)} />
        ))}
      </div>
    </div>
  );
}

function ConvItem({ conv, active, onClick }) {
  const isUnread = conv.last_sender_type === "client" && conv.last_message_date && (
    !conv.admin_last_read_date || new Date(conv.last_message_date) > new Date(conv.admin_last_read_date)
  );

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
        active ? "bg-green-50 border border-green-200" :
        isUnread ? "bg-red-50/40 border border-red-100 hover:bg-red-50/70" :
        "hover:bg-gray-50 border border-transparent"
      )}
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
        {(conv.title || "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("text-sm truncate", isUnread ? "font-extrabold text-gray-900" : "font-semibold text-gray-800")}>
            {conv.title || conv.whatsapp_phone}
          </p>
          {conv.last_message_date && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {format(new Date(conv.last_message_date), "HH:mm", { locale: fr })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {conv.venus_active ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">🤖 Venus</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">👤 Admin</span>
          )}
          {conv.country_code && (
            <span className="text-[10px] text-gray-400">{conv.country_code}</span>
          )}
          <p className={cn("text-xs truncate flex-1", isUnread ? "font-semibold text-gray-600" : "text-gray-400")}>
            {conv.last_sender_name ? `${conv.last_sender_name}: ` : ""}{conv.last_message}
          </p>
        </div>
      </div>
      {isUnread && <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />}
    </button>
  );
}