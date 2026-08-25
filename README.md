# L'ASSISTANT

# PROMPT LOVABLE — NOW PILOT by Nowadays Agency

> Copie-colle ce prompt dans Lovable pour lancer la construction de ton MVP.

---

## 🎯 CONCEPT GÉNÉRAL

Crée une application web appelée **"Now Pilot"** — un outil de pilotage de communication pour solopreneuses éthiques, créé par Nowadays Agency.

L'outil a 2 fonctions principales :
1. **Atelier de contenu** : l'utilisatrice choisit un format de post, donne un sujet (ou demande des suggestions), et l'outil lui génère un post Instagram prêt à publier, personnalisé avec son profil. Elle peut copier, ajuster, et ajouter à son plan.
2. **Mini plan de com'** : une vue simple des tâches de communication de la semaine/du mois, avec la possibilité de cocher ce qui est fait.

L'utilisatrice arrive sur un onboarding rapide (4 étapes, 5 minutes) qui capte son profil. Ensuite elle accède à son dashboard avec l'atelier de contenu + le plan de com.

**Stack technique souhaitée** : React + Tailwind + Supabase (auth + base de données) + API OpenAI ou Anthropic (Claude) pour la génération de contenu.

---

## 🎨 IDENTITÉ VISUELLE

L'identité est inspirée de l'art contemporain pop (référence : Yayoi Kusama). Colorée, joyeuse, audacieuse. ZÉRO côté "beige boring éthique". C'est fun, professionnel, et humain.

### Palette de couleurs :
- **Rose framboise (primaire)** : #fb3d80
- **Rose intense / bordeaux (accent sombre)** : #91014b
- **Jaune lumière (accent)** : #FFE561
- **Rose doux** : #FFD6E8
- **Rose moyen** : #ffa7c6
- **Rose très pâle (fond)** : #fff4f8
- **Fond page** : #FFFBFD
- **Texte principal** : #2D2235
- **Texte secondaire** : #6B5E7B

### Typographies :
- **Titres** : Police ronde, chaleureuse, un peu 70's. Utilise Google Fonts "Fraunces" (serif, variable, opsz).
- **Corps de texte** : Police propre et moderne. Utilise "DM Sans" (sans-serif).

### Style UI :
- Border-radius généreux (16px pour les cartes, 10px pour les inputs, 50px pour les boutons pilule)
- Ombres douces et subtiles (pas de drop shadow lourde)
- Micro-animations (transitions smooth 0.2-0.3s, fade-in sur les écrans)
- Pas d'emojis dans l'interface sauf parcimonie (les icônes d'UI doivent être des icônes, pas des emojis)
- Le bouton principal est toujours rose framboise (#fb3d80) avec un hover vers bordeaux (#91014b)
- Les badges/tags utilisent le jaune (#FFE561) sur fond sombre

---

## 📱 STRUCTURE DE L'APPLICATION

### Page 1 : Onboarding (4 étapes)

L'utilisatrice arrive ici à sa première connexion. C'est un formulaire multi-étapes avec une barre de progression en haut (4 points).

**Étape 1 : "Dis-moi qui tu es"**
- Champ texte : Prénom
- Champ texte : "Ton activité en une phrase" (placeholder : "Ex : Je crée des bijoux en céramique faits main")
- Sélection par cartes (grid 2x2) : Type d'activité
  - Créatrice / Artisane — "Tu fabriques des produits"
  - Prestataire de services — "Tu vends ton expertise"
  - Accompagnante / Coach — "Tu guides des personnes"
  - Autre — "Aucune case ne te va"

**Étape 2 : "Ta cliente idéale"**
- Textarea : "Elle ressemble à quoi, ta cliente ?" (placeholder : "Ex : Des femmes de 30-45 ans qui veulent consommer mieux...")
- Champ texte : "Son problème principal (celui que tu résous)"

**Étape 3 : "Tes piliers de contenu"**
- Sélection multiple par chips (sélectionner 3-4) :
  - Coulisses / fabrication
  - Éducation / pédagogie
  - Valeurs / engagements
  - Témoignages clients
  - Vie d'entrepreneuse
  - Inspiration / tendances
  - Conseils pratiques
  - Storytelling personnel
- Sélection multiple par chips : "Ton ton sur les réseaux"
  - Chaleureux, Expert·e, Drôle, Engagé·e, Poétique, Direct, Inspirant·e

**Étape 4 : Récapitulatif + confirmation**
- Afficher un récap du profil dans un encadré rose pâle
- Encadré jaune bordé qui explique ce que Now Pilot va faire pour elle
- Bouton "Accéder à mon atelier ✨"

Quand elle valide, stocker tout le profil en base (Supabase). Afficher une mini animation de confetti à l'arrivée sur le dashboard.

---

### Page 2 : Dashboard (l'écran principal)

Layout en 2 colonnes : contenu principal (gauche, ~65%) + sidebar (droite, ~35%). Sur mobile : une seule colonne, sidebar en dessous.

**Header du dashboard :**
- "Hey [prénom], on crée quoi aujourd'hui ?" (titre en Fraunces)
- Sous-titre : "Ton atelier de contenu est prêt. Choisis un format, donne un sujet, et let's go."

#### Colonne gauche : L'atelier de contenu

C'est une carte blanche avec bordure et ombre douce.

**En-tête de carte** : "🎨 Mon atelier de contenu" + badge "Méthode Nowadays" en jaune.

**Sélecteur de format** : une rangée de chips cliquables (un seul sélectionné à la fois) :
- Storytelling
- Mythe à déconstruire
- Coup de gueule
- Enquête / décryptage
- Conseil contre-intuitif
- Test grandeur nature
- Before / After
- Histoire cliente
- Regard philosophique
- Surf sur l'actu

**Champ de saisie du sujet** : un input avec un bouton "Générer" intégré à droite dans l'input. Placeholder : "De quoi tu veux parler ? Ex : le syndrome de l'impostrice quand on vend..."

**Bouton "Inspire-moi"** : en dessous de l'input, petit lien texte rose. Au clic, afficher 5 suggestions de sujets basées sur le profil de l'utilisatrice. Chaque suggestion est cliquable et remplit le champ.

**Zone de génération** : quand elle clique "Générer" :
1. Afficher un loader animé (3 points qui rebondissent + texte italique "Je rédige avec ta méthodo...")
2. Appeler l'API IA (voir section PROMPT IA plus bas)
3. Afficher le résultat dans une carte rose pâle avec bordure gauche rose :
   - Tag du format en haut (ex : "STORYTELLING")
   - Nombre de caractères approximatif
   - Le texte du post
   - 3 boutons d'action : "📋 Copier" | "🔄 Autre version" | "📅 Ajouter au plan"

**État vide** (avant la première génération) : un message centré avec une icône ✍️ "Ton prochain post t'attend ici" + description.

#### Colonne droite : Sidebar

**Carte 1 : "📋 Mon plan de com'"**
- Regroupé par "Cette semaine" et "Ce mois-ci"
- Chaque tâche a : une checkbox, le texte de la tâche, une durée estimée à droite
- Les tâches cochées sont barrées et grisées
- Tâches par défaut à la création du compte (basées sur le pilier Social Media) :
  - Cette semaine : "Définir mes piliers de contenu" (30 min), "Rédiger 2 posts Instagram" (45 min), "Planifier ma semaine de stories" (20 min)
  - Ce mois-ci : "Créer mon calendrier éditorial" (1h), "Optimiser ma bio Instagram" (20 min)
- Les tâches sont stockées en base et persistantes

**Carte 2 : "📊 Ma progression"**
- Posts créés : compteur (s'incrémente à chaque génération)
- Tâches complétées : X / Y
- Pilier actuel : "Social Media" (statique pour la V1)
- Série en cours : "🔥 X semaines" (compter les semaines consécutives avec au moins 1 post créé)

**Carte 3 : "Le conseil Nowadays"**
- Carte avec fond rose pâle
- Un conseil rotatif (un par jour), dans un ton direct et bienveillant. Exemples :
  - "Tu n'as pas besoin de poster tous les jours. Tu as besoin de poster avec intention."
  - "Un bon post par semaine vaut mieux que 7 posts vides."
  - "Si ton post fait réagir 10 personnes qui correspondent à ta cible, c'est un succès."
  - "Arrête de te comparer aux comptes qui ont 50K abonnés. Toi, tu construis une communauté, pas une audience."
  - "Le contenu parfait n'existe pas. Le contenu publié, oui."

---

### Navigation

Barre de navigation en haut, sticky :
- Logo à gauche : "Now Pilot" en Fraunces + badge "beta" rose
- Onglets au centre (dans un conteneur pilule rose pâle) : "Mon atelier" | "Mon profil"
- Avatar + prénom à droite

"Mon profil" renvoie vers un écran simple qui affiche les infos de l'onboarding et permet de les modifier.

---

## 🤖 PROMPT SYSTÈME POUR L'IA (GÉNÉRATION DE CONTENU)

Quand l'utilisatrice clique "Générer", envoyer un appel API à Claude (Anthropic) ou GPT-4 avec le prompt système suivant. Remplacer les variables entre [crochets] par les données du profil de l'utilisatrice.

```
Tu es un·e expert·e en création de contenu Instagram. Tu rédiges un post (caption) pour une solopreneuse.

CONTEXTE SUR L'UTILISATRICE :
- Prénom : [prénom]
- Activité : [activité]
- Type : [créatrice/prestataire/accompagnante]
- Cible : [description de sa cliente idéale]
- Problème qu'elle résout : [problème principal]
- Piliers de contenu : [piliers sélectionnés]
- Ton souhaité : [tons sélectionnés]

FORMAT DEMANDÉ : [format choisi parmi les 10]
SUJET : [sujet saisi par l'utilisatrice]

CONSIGNES DE RÉDACTION STRICTES :

TON ET STYLE :
- Direct et chaleureux, comme une discussion entre ami·es
- Oral assumé : utiliser des expressions comme "bon", "en vrai", "franchement", "j'avoue", "le truc c'est que", "du coup"
- Des apartés entre parenthèses qui cassent le rythme et ajoutent de la personnalité
- Rythmé par contrastes : phrases longues pour dérouler + phrases courtes qui claquent
- Émotionnel sans pathos : vulnérabilité assumée mais toujours dans l'enseignement
- Une pointe d'humour et d'auto-dérision
- Engagé·e et parfois un peu pushy, mais jamais donneur·se de leçons
- Tutoiement systématique
- Écriture inclusive avec point médian (ex : créateur·ices, entrepreneur·es)
- JAMAIS de tiret cadratin (—), utiliser : ou ;

CE QU'IL FAUT ÉVITER :
- Les phrases artificiellement coupées pour "faire court"
- Le ton corporate ou les formules toutes faites
- Les promesses exagérées type "10K abonnés en 30 jours"
- Le jargon marketing : ROI, tunnel de vente, lead magnet, growth hacking
- Le discours "mindset" ou "abundance"
- Les emojis (sauf si vraiment pertinent, et jamais plus de 2 dans tout le texte)
- Les listes à puces dans le post (c'est un texte fluide, pas un article)

STRUCTURE SELON LE FORMAT :

Si Storytelling : Accroche (moment clé) → Contexte vécu → Retournement/déclic → Leçon applicable
Si Mythe à déconstruire : Le mythe entre guillemets → Pourquoi c'est faux → Preuves/exemples → La vraie leçon
Si Coup de gueule : Affirmation tranchée → Le problème précis → L'impact → L'alternative
Si Enquête/décryptage : Observation intrigante → Contexte → Analyse avec exemples → Ce que ça change
Si Conseil contre-intuitif : Le conseil mainstream → Pourquoi ça ne marche pas → Ton conseil alternatif → Pourquoi ça marche
Si Test grandeur nature : "J'ai testé [X]" → Pourquoi → Résultats honnêtes → Verdict
Si Before/After : Le contraste avant/après → Description honnête → Ce qui a changé → La leçon
Si Histoire cliente : "Elle m'a dit..." → Le blocage → Le déclic → Le résultat → La leçon universelle
Si Regard philosophique : Observation large → Analyse en profondeur → Lien avec la com → Ouverture
Si Surf sur l'actu : L'actu → Ton analyse → Lien avec ton audience → Ta position

PHILOSOPHIE DE FOND (à infuser subtilement, ne pas énoncer explicitement) :
- La communication est un outil d'émancipation, pas de manipulation
- Le beau est légitime et politique, pas superficiel
- Vendre n'est pas manipuler, c'est rendre visible un projet qui mérite de l'être
- Mieux vaut un bon post par semaine que 7 posts vides
- La qualité d'un projet ne suffit pas : il faut savoir le raconter

CONSIGNES FINALES :
- Commence par une accroche forte (pas de "Aujourd'hui je voulais te parler de")
- Longueur : entre 800 et 1500 caractères
- Finis par une ouverture (question ou invitation au dialogue), pas par un CTA commercial
- Donne le texte brut de la caption, sans mise en forme markdown, sans titre, sans indication de format
- Ne mets AUCUNE instruction entre crochets dans le texte final
- Adapte le contenu à l'activité et la cible de l'utilisatrice
```

Pour la fonctionnalité "Inspire-moi" (suggestions de sujets), utiliser ce prompt :

```
Tu es un·e expert·e en stratégie de contenu Instagram pour des solopreneuses éthiques.

Profil de l'utilisatrice :
- Activité : [activité]
- Cible : [cible]
- Piliers de contenu : [piliers]

Propose exactement 5 idées de sujets de posts Instagram, adaptées à son activité et sa cible. Chaque idée doit être formulée comme un sujet concret et spécifique (pas vague), en une phrase.

Varie les angles : un sujet éducatif, un storytelling, un sujet engagé, un sujet pratique, un sujet inspirant.

Réponds uniquement avec les 5 sujets, un par ligne, sans numérotation, sans tiret, sans explication.
```

---

## 🗄️ BASE DE DONNÉES (Supabase)

### Table : profiles
- id (uuid, PK, lié à auth.users)
- prenom (text)
- activite (text)
- type_activite (text) — "creatrice", "prestataire", "accompagnante", "autre"
- cible (text)
- probleme_principal (text)
- piliers (text[]) — array de strings
- tons (text[]) — array de strings
- created_at (timestamp)
- updated_at (timestamp)

### Table : generated_posts
- id (uuid, PK)
- user_id (uuid, FK → profiles.id)
- format (text)
- sujet (text)
- contenu (text)
- added_to_plan (boolean, default false)
- created_at (timestamp)

### Table : tasks
- id (uuid, PK)
- user_id (uuid, FK → profiles.id)
- label (text)
- duration_minutes (integer)
- period (text) — "week" ou "month"
- is_completed (boolean, default false)
- completed_at (timestamp, nullable)
- order_index (integer)
- created_at (timestamp)

### Authentification
Utiliser Supabase Auth avec email + mot de passe. Page de login/signup simple et propre, dans le même style visuel que l'onboarding.

---

## 📋 TÂCHES PAR DÉFAUT À LA CRÉATION DU COMPTE

Quand un nouveau profil est créé, insérer automatiquement ces tâches :

**Période "week" :**
1. Définir mes piliers de contenu — 30 min
2. Rédiger 2 posts Instagram — 45 min
3. Planifier ma semaine de stories — 20 min

**Période "month" :**
4. Créer mon calendrier éditorial — 60 min
5. Optimiser ma bio Instagram — 20 min
6. Définir ma cliente idéale en détail — 30 min
7. Écrire mon storytelling de marque — 45 min

---

## ⚡ FONCTIONNALITÉS DÉTAILLÉES

### Copier un post
Au clic sur "Copier", copier le texte dans le presse-papier et changer le bouton en "✅ Copié !" pendant 1.5 secondes.

### Autre version
Au clic, relancer la génération avec les mêmes paramètres (même format, même sujet).

### Ajouter au plan
Au clic, passer le champ `added_to_plan` à true sur le post. Afficher un feedback visuel "✅ Ajouté !".

### Progression
- "Posts créés" : COUNT des generated_posts de l'utilisatrice
- "Tâches complétées" : COUNT des tasks où is_completed = true / COUNT total
- "Série en cours" : compter les semaines consécutives (du lundi au dimanche) où au moins 1 post a été généré. Si la semaine en cours n'a pas encore de post, ne pas casser la série tant que la semaine n'est pas finie.

### Conseil du jour
Stocker une liste de 15-20 conseils en dur dans le code. Afficher un conseil différent chaque jour (basé sur le day-of-year modulo le nombre de conseils).

---

## 📱 RESPONSIVE

L'application doit être parfaitement responsive :
- **Desktop** : layout 2 colonnes comme décrit
- **Tablette** : réduire la sidebar à un panel pliable ou la passer en dessous
- **Mobile** : une seule colonne, sidebar en dessous du contenu principal. Les chips de format doivent scroller horizontalement.

---

## 🚀 PRIORITÉ DE DÉVELOPPEMENT

1. Auth (login/signup) + création de profil
2. Onboarding (4 étapes) + stockage en base
3. Dashboard avec atelier de contenu + intégration API IA
4. Sidebar avec plan de com + progression
5. Page profil (édition)
6. Polish : animations, responsive, conseils du jour

---

## 💡 NOTES IMPORTANTES

- L'interface doit être 100% en français
- Écriture inclusive avec point médian systématique (créateur·ices, entrepreneur·es)
- Le ton de TOUTE l'interface est chaleureux et direct, jamais corporate. Les microtextes (placeholders, messages vides, labels) doivent sonner comme si une amie parlait, pas un logiciel. Exemples :
  - Placeholder : "De quoi tu veux parler ?" (pas "Entrez votre sujet")
  - Message vide : "Ton prochain post t'attend ici" (pas "Aucun contenu généré")
  - Bouton : "Accéder à mon atelier ✨" (pas "Continuer")
- JAMAIS de tiret cadratin (—) dans toute l'interface. Utiliser : ou ;
- L'outil ne doit JAMAIS être présenté comme "un outil IA". C'est "ton copilote de com" ou "ton atelier de contenu". L'IA est sous le capot, invisible.
- Le nom de l'outil est "Now Pilot" avec le sous-titre "by Nowadays"

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://nowadaysagency.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a4b43f6d-b429-4097-99e1-6c1be647a50f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
