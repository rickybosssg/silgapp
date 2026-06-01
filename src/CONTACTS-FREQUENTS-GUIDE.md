# 📖 Contacts Fréquents - SILGAPP

## Fonctionnalité

La sélection de contacts fréquents permet aux clients de rapidement choisir un destinataire ou expéditeur sans avoir à ressaisir manuellement le numéro de téléphone à chaque course.

## Comment ça marche

### 1. Sélection d'un contact
- Lors de la création d'une course (expédier ou recevoir), le client voit un bouton **"📖 Choisir dans mes contacts fréquents"**
- En cliquant, une modale s'ouvre avec la liste des contacts fréquents
- Le client peut rechercher un contact par nom ou numéro
- Un clic sur un contact remplit automatiquement :
  - Le nom du contact
  - Le numéro de téléphone

### 2. Mémorisation automatique
- Après chaque utilisation, le contact est sauvegardé dans les **contacts fréquents**
- Le système compte le nombre d'utilisations
- Les contacts sont triés par fréquence d'utilisation (les plus utilisés en premier)
- Maximum 20 contacts fréquents conservés

### 3. Persistance des données
- Les contacts fréquents sont stockés localement sur l'appareil du client
- Utilise `@capacitor/preferences` pour le stockage
- Les données persistent entre les sessions
- Fonctionne sur : Android, iOS, PWA

## Compatibilité

### ✅ Android (APK)
- Fonctionne parfaitement avec Capacitor Preferences
- Stockage local sécurisé
- Accès rapide aux contacts

### ✅ iOS (iPhone)
- Fonctionne parfaitement avec Capacitor Preferences
- Stockage local sécurisé

### ✅ PWA (Web)
- Fonctionne avec les APIs web de stockage
- Limitation : stockage navigateur uniquement

## Avantages

1. **Réduction des erreurs** : Plus d'erreurs de saisie de numéro
2. **Gain de temps** : Sélection en 1 clic au lieu de taper le numéro
3. **Expérience utilisateur** : Reconnaissance automatique des contacts réguliers
4. **Simplicité** : Interface intuitive et familière

## Utilisation type

### Scénario 1 : Expédition vers un contact régulier
1. Client clique sur "Expédier un colis"
2. Étape 2 : "À qui envoyer le colis ?"
3. Client clique sur **"📖 Choisir dans mes contacts fréquents"**
4. Sélectionne "Jean Ouédraogo" dans la liste
5. Le formulaire se remplit automatiquement avec le nom et le numéro

### Scénario 2 : Réception depuis un expéditeur habituel
1. Client clique sur "Recevoir un colis"
2. Étape 1 : "Chez qui récupérer le colis ?"
3. Client clique sur **"📖 Choisir dans mes contacts fréquents"**
4. Sélectionne "Boutique Kadi"
5. Le formulaire se remplit automatiquement

## Structure des données

```json
{
  "nom": "Jean Ouédraogo",
  "telephone": "+226 70 00 00 00",
  "usage_count": 5,
  "last_used": "2026-06-01T12:00:00.000Z"
}
```

## Fichiers concernés

- `components/client/ContactPicker.jsx` - Composant de sélection
- `components/client/CourseStepForm.jsx` - Intégration dans le formulaire
- `pages/CourseExterneFormSync.jsx` - Formulaire principal

## Évolutions possibles

- [ ] Export/Import des contacts fréquents
- [ ] Synchronisation cloud des contacts
- [ ] Ajout de notes personnalisées par contact
- [ ] Catégorisation (Famille, Travail, Amis, etc.)
- [ ] Suggestions intelligentes basées sur l'heure/lieu