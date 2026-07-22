import { Loader2, Search, MessageCircle, Bot, User, Globe, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
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
  { code: "", label: "Tous", icon: null },
  { code: "active", label: "Actives", icon: null },
  { code: "venus", label: "Venus", icon: Bot },
  { code: "admin", label: "Admin", icon: User },
  { code: "archived", label: "Archivées", icon: Archive },
];

function formatTimestamp(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm", { locale: fr });
  if (isYesterday(d)) return "Hier";
  return format(d, "dd/MM", { locale: fr });
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-600",
  "from-lime-500 to-green-600",
  "from-fuchsia-500 to-pink-600",
];

function getAvatarGradient(name) {
  const charCode = (name || "?").charCodeAt(0);
  return AVATAR_GRADIENTS[charCode % AVATAR_GRADIENTS.length];
}

export default function WhatsAppConversationList({
  conversations, activeConvId, onSelect,
  search, setSearch, filterCountry, setFilterCountry,
  filterStatus, setFilterStatus, loading,
}) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Premium Header */}
      <div className="px-5 pt-6 pb-3 bg-white border-b border-slate-100 safe-area-top">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <MessageCircle className="w-5 h-5 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">WhatsApp Admin</h2>
            <p className="text-xs text-slate-400 font-medium">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Premium Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou numéro..."
            className="w-full h-11 pl-11 pr-4 rounded-2xl bg-slate-100/80 border border-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10 transition-all"
          />
        </div>

        {/* Premium Filter Chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
          {STATUSES.map(s => {
            const Icon = s.icon;
            const isActive = filterStatus === s.code;
            return (
              <button
                key={s.code}
                onClick={() => setFilterStatus(s.code)}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0",
                  isActive
                    ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {s.label}
              </button>
            );
          })}
          <div className="w-px h-8 bg-slate-200 flex-shrink-0" />
          <div className="relative flex-shrink-0">
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="appearance-none h-8 pl-3 pr-8 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold hover:bg-slate-200 transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
            >
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <Globe className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
            <p className="text-xs text-slate-400 font-medium">Chargement des conversations...</p>
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Aucune conversation</p>
            <p className="text-xs text-slate-400">Les conversations WhatsApp apparaîtront ici</p>
          </div>
        )}
        {!loading && conversations.map(conv => (
          <ConvItem key={conv.id} conv={conv} active={conv.id === activeConvId} onClick={() => onSelect(conv)} />
        ))}
        {!loading && conversations.length > 0 && (
          <div className="h-4" />
        )}
      </div>
    </div>
  );
}

function ConvItem({ conv, active, onClick }) {
  const isUnread = conv.last_sender_type === "client" && conv.last_message_date && (
    !conv.admin_last_read_date || new Date(conv.last_message_date) > new Date(conv.admin_last_read_date)
  );

  const title = conv.title || conv.whatsapp_phone || "Inconnu";
  const initial = (title || "?").charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left group relative",
        active
          ? "bg-white shadow-md shadow-slate-200/60 ring-1 ring-emerald-500/20"
          : isUnread
            ? "hover:bg-white hover:shadow-sm"
            : "hover:bg-slate-50"
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={cn(
          "w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white text-base font-bold shadow-sm transition-all",
          getAvatarGradient(title)
        )}>
          {initial}
        </div>
        {isUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={cn(
            "text-sm truncate",
            isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-700"
          )}>
            {title}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
            {conv.last_message_date && (
              <span className={cn(
                "text-[11px] font-medium",
                isUnread ? "text-emerald-600" : "text-slate-400"
              )}>
                {formatTimestamp(conv.last_message_date)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {conv.venus_active ? (
            <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-semibold flex-shrink-0">
              <Bot className="w-2.5 h-2.5" />
              Venus
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 font-semibold flex-shrink-0">
              <User className="w-2.5 h-2.5" />
              Admin
            </span>
          )}
          {conv.country_code && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold flex-shrink-0">
              {conv.country_code}
            </span>
          )}
          <p className={cn(
            "text-xs truncate flex-1",
            isUnread ? "font-medium text-slate-600" : "text-slate-400"
          )}>
            {conv.last_message}
          </p>
        </div>
      </div>
    </button>
  );
}