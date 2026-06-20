import React from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function ChatBubble({ message, isMine }) {
  const senderLabel = {
    client: "Client",
    livreur: "Livreur",
    admin: "SILGAPP Admin",
  };

  return (
    <div className={cn("flex gap-2 mb-3", isMine ? "justify-end" : "justify-start")}>
      {!isMine && (
        <div className="flex flex-col items-center flex-shrink-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white",
            message.sender_type === "livreur" ? "bg-blue-500" :
            message.sender_type === "admin" ? "bg-amber-500" : "bg-gray-400"
          )}>
            {message.sender_type === "livreur" ? "L" : message.sender_type === "admin" ? "A" : "C"}
          </div>
        </div>
      )}
      <div className={cn("max-w-[75%]", isMine && "flex flex-col items-end")}>
        {!isMine && (
          <p className="text-[10px] text-gray-500 font-semibold mb-0.5 px-1">
            {message.sender_name} · {senderLabel[message.sender_type] || message.sender_type}
          </p>
        )}
        <div className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isMine ? "bg-primary text-white rounded-br-md" : "bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm"
        )}>
          <p>{message.content}</p>
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5 px-1">
          {message.created_date ? format(new Date(message.created_date), "HH:mm") : ""}
        </p>
      </div>
      {isMine && (
        <div className="flex flex-col items-center flex-shrink-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white",
            message.sender_type === "livreur" ? "bg-blue-500" :
            message.sender_type === "admin" ? "bg-amber-500" : "bg-gray-400"
          )}>
            {message.sender_type === "livreur" ? "L" : message.sender_type === "admin" ? "A" : "C"}
          </div>
        </div>
      )}
    </div>
  );
}