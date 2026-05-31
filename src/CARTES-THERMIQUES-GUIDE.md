# 🗺️ Cartes Thermiques SILGAPP - Guide d'Utilisation

## Vue d'ensemble

Les cartes thermiques SILGAPP sont des outils d'analyse opérationnelle qui permettent de visualiser en temps réel :
- La **demande clients** par zone géographique
- La **couverture livreurs** et les zones sous-couvertes

## 🔥 Carte Thermique "Demande Clients"

### Données utilisées
- **Clients GPS actifs** : positions GPS récentes (< 30 min)
- **Courses créées récemment** : courses créées il y a moins de 2 heures

### Code couleur
- **🔴 Rouge** = Forte demande (concentration élevée de clients)
- **🟡 Jaune** = Demande moyenne
- **🟢 Vert** = Faible demande

### Cas d'usage
✅ Identifier les quartiers à forte concentration de clients  
✅ Cibler les campagnes marketing  
✅ Optimiser les zones de prospection  
✅ Analyser les pics de demande  

### Interprétation
- **Zones rouges** : quartiers où les clients sont très concentrés → prioriser le marketing
- **Zones jaunes** : demande modérée → potentiel de croissance
- **Zones vertes** : faible demande → zones résidentielles ou peu commerciales

---

## 🟢 Carte Thermique "Couverture Livreurs"

### Données utilisées
- **Livreurs disponibles** : statut "disponible" + GPS récent
- **Livreurs en course** : statut "en_course" + GPS récent

### Code couleur
- **🔴 Rouge** = Manque de livreurs (zone sous-couverte)
- **🟡 Jaune** = Couverture moyenne
- **🟢 Vert** = Bonne couverture (suffisamment de livreurs)

### Cas d'usage
✅ Identifier les zones sous-couvertes (rouges)  
✅ Optimiser le recrutement de nouveaux livreurs  
✅ Rééquilibrer la répartition des livreurs  
✅ Analyser la couverture terrain  

### Interprétation
- **Zones rouges** : manque de livreurs → opportunité de recrutement
- **Zones jaunes** : couverture modérée → surveillance nécessaire
- **Zones vertes** : bonne couverture → zone bien desservie

---

## 📊 Utilisation Stratégique

### 1. Recrutement de Livreurs
**Cible** : Zones rouges sur la carte "Couverture livreurs"
- Ces zones ont peu de livreurs par rapport à la demande
- Prioriser le recrutement dans ces quartiers
- Exemple : Si une zone a beaucoup de clients (carte Demande) mais peu de livreurs (carte Couverture) → **opportunité prioritaire**

### 2. Campagnes Marketing
**Cible** : Zones rouges sur la carte "Demande clients"
- Ces zones ont une forte concentration de clients
- Idéal pour : promotions, publicité ciblée, partenariats commerciaux
- Exemple : Distribuer des flyers dans les zones rouges

### 3. Expansion Géographique
**Analyse croisée** :
- Carte Demande (rouge) + Carte Couverture (verte) = Zone saturée en livreurs
- Carte Demande (rouge) + Carte Couverture (rouge) = Zone prioritaire pour recrutement
- Carte Demande (verte) + Carte Couverture (verte) = Zone à potentiel marketing

### 4. Optimisation du Dispatch
- Utiliser la carte Couverture pour identifier les livreurs disponibles près des zones de forte demande
- Anticiper les besoins en livreurs selon les pics de demande

---

## 🌍 Filtrage par Pays

Les cartes thermiques sont **filtrées par pays actif** :
- Seules les données du pays sélectionné sont utilisées
- Permet une analyse précise par marché
- Basculez entre les pays via le sélecteur en bas à gauche

---

## ⚡ Temps Réel

Les données sont **actualisées toutes les 15 secondes** :
- Positions GPS des clients et livreurs
- Statut des livreurs (disponible, en course)
- Nouvelles courses créées

---

## 📋 Légende et Indicateurs

### Qualité GPS
- ❤️ < 2 min : Excellent
- 💚 2-5 min : Bon
- 🧡 5-15 min : Moyen
- ❤️‍🩹 15-30 min : Faible
- ❤️‍🔥 > 30 min : Expiré

### Seuils de Détection
- **Minimum requis** : 3 points pour afficher une carte thermique
- **Message d'alerte** : Si données insuffisantes, un bandeau jaune s'affiche

---

## 🎯 Exemples Concrets

### Scénario 1 : Recrutement
**Problème** : Beaucoup de courses en attente dans le quartier X  
**Action** :
1. Ouvrir carte "Couverture livreurs"
2. Identifier zone rouge (manque de livreurs)
3. Lancer campagne de recrutement ciblée
4. Suivre l'évolution de la couleur (rouge → jaune → vert)

### Scénario 2 : Marketing
**Problème** : Faible activité dans le quartier Y  
**Action** :
1. Ouvrir carte "Demande clients"
2. Si zone verte : faible densité de clients
3. Lancer promotion ciblée (réductions, offres spéciales)
4. Surveiller l'évolution (verte → jaune → rouge)

### Scénario 3 : Expansion
**Problème** : Identifier les meilleures zones pour s'étendre  
**Action** :
1. Comparer les deux cartes thermiques
2. Zones rouges (Demande) + zones rouges (Couverture) = **Priorité 1**
3. Zones rouges (Demande) + zones vertes (Couverture) = **Marché saturé**
4. Zones vertes (Demande) + zones rouges (Couverture) = **Potentiel à développer**

---

## 🛠️ Accès

**Chemin** : Dashboard Admin → Carte → Bouton "Cartes thermiques"  
**Modes disponibles** :
- Carte standard (marqueurs)
- 🔥 Demande clients
- 🟢 Couverture livreurs

---

## 📈 Bonnes Pratiques

1. **Actualiser régulièrement** : Les données évoluent en temps réel
2. **Comparer les deux cartes** : L'analyse croisée donne les meilleurs insights
3. **Filtrer par pays** : Analyser chaque marché séparément
4. **Surveiller l'historique** : Observer les tendances sur plusieurs jours
5. **Agir rapidement** : Les zones rouges sont des opportunités immédiates

---

## 🎓 Formation Équipe

**Pour les admins** :
- Former à l'interprétation des couleurs
- Expliquer les cas d'usage concrets
- Démontrer l'analyse croisée
- Suivre les actions entreprises (recrutement, marketing)

**Pour les équipes terrain** :
- Utiliser les cartes pour guider les actions quotidiennes
- Reporter les observations terrain
- Proposer des actions correctives

---

## 📞 Support

Pour toute question ou amélioration :
- Consulter la documentation technique
- Contacter l'équipe de développement
- Proposer de nouvelles fonctionnalités

---

**Dernière mise à jour** : 31 mai 2026  
**Version** : 2.0 - Cartes thermiques opérationnelles