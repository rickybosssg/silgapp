import React from 'react';
import CityDispatchAdmin from '@/components/admin/CityDispatchAdmin.jsx';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function CityDispatchAdminPage() {
  const { data: user, isLoading, isError } = useQuery({ queryKey: ['city-dispatch-admin-auth'], queryFn: () => base44.auth.me() });
  if (isLoading) return <p className="p-4">Chargement...</p>;
  if (isError || user?.role !== 'admin' || user?.enterprise_id || user?.admin_type === 'pays') return <p className="p-4" role="alert">Accès réservé au Super Admin.</p>;
  return <CityDispatchAdmin />;
}
