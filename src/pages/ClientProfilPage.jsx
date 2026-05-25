import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ClientProfil from "./ClientProfil";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function ClientProfilPage() {
  const navigate = useNavigate();

  const { data: clientProfil } = useQuery({
    queryKey: ["client-profil"],
    queryFn: async () => {
      const user = await base44.auth.me();
      const clients = await base44.entities.ClientExterne.filter({
        user_email: user.email
      });
      return clients && clients.length > 0 ? clients[0] : null;
    },
  });

  const handleComplete = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ClientProfil 
        existingProfil={clientProfil} 
        onComplete={handleComplete}
      />
    </div>
  );
}