import React from 'react';
import { Truck, AlertTriangle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSilgappAuth } from '@/lib/silgappAuth';

const UserNotRegisteredError = () => {
  const { logout } = useSilgappAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-amber-600" />
          </div>
          <Truck className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Compte non autorisé</h1>
          <p className="text-muted-foreground text-sm">
            Votre email n'est pas enregistré dans Silga Livraison.
          </p>
        </div>

        <div className="bg-card border rounded-lg p-4 space-y-3 text-left">
          <h2 className="font-semibold text-sm">Solutions possibles :</h2>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">1.</span>
              <span>Si vous êtes <strong>livreur</strong> : contactez un administrateur pour qu'il crée votre compte</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              <span>Si vous voulez <strong>devenir livreur</strong> : remplissez le formulaire d'inscription</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              <span>Vérifiez que vous utilisez le bon email</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => logout()}
            variant="outline"
            className="gap-2"
          >
            <Mail className="w-4 h-4" />
            Changer de compte
          </Button>
          <Button
            onClick={() => window.location.href = '/inscription-livreur'}
            className="gap-2"
          >
            <Truck className="w-4 h-4" />
            Formulaire d'inscription livreur
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;