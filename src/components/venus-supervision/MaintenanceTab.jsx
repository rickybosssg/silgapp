import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { Settings, Shield, Users, AlertTriangle, CheckCircle } from 'lucide-react';

export default function MaintenanceTab({ maintenance, roles, userInfo, onRefresh }) {
  const [active, setActive] = useState(maintenance?.active || false);
  const [message, setMessage] = useState(maintenance?.message || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await base44.functions.invoke('supervisionVenus', {
        action: 'toggle_maintenance',
        active,
        message,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await onRefresh();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Settings className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mode maintenance</h2>
            <p className="text-sm text-gray-500">Désactive les fonctionnalités IA actives de VENUS</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
            <div>
              <p className="font-medium text-sm text-gray-900">Activer le mode maintenance</p>
              <p className="text-xs text-gray-500">VENUS informera poliment les utilisateurs</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Message affiché aux utilisateurs
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Certaines fonctionnalités sont momentanément indisponibles. Nous revenons très vite !"
              rows={2}
              disabled={!active}
            />
            <p className="text-xs text-gray-400 mt-1">
              Ne divulguez aucune information technique dans ce message
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Sauvegarde...' : saved ? (
              <><CheckCircle className="w-4 h-4 mr-2" /> Enregistré</>
            ) : 'Enregistrer'}
          </Button>
        </div>

        {active && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-700">
              VENUS est actuellement en mode maintenance. Les utilisateurs recevront le message ci-dessus.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Gestion des rôles</h2>
            <p className="text-sm text-gray-500">Permissions par rôle</p>
          </div>
        </div>

        {userInfo && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <p className="text-sm text-blue-700">
              Vous êtes connecté en tant que <strong>{userInfo.role_label}</strong>
            </p>
          </div>
        )}

        <div className="space-y-3">
          {roles && Object.entries(roles).map(([roleKey, roleConfig]) => (
            <div key={roleKey} className="p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm text-gray-900">{roleConfig.label}</p>
                <code className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{roleKey}</code>
              </div>
              <div className="flex flex-wrap gap-1">
                {roleConfig.permissions.includes('*') ? (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                    Accès complet
                  </span>
                ) : (
                  roleConfig.permissions.map((p) => (
                    <span key={p} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {p}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}