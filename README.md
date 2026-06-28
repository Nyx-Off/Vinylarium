<div align="center">

# 🎶 Vinylarium

**Transformez votre collection Discogs en une véritable bibliothèque musicale, visuelle et interactive — auto-hébergée.**

Une idée de **Julien Campinotti**, portée par **Samy Bensalem**.

</div>

---

Vinylarium importe l'export Discogs de votre collection de vinyles, l'enrichit via l'API Discogs
(pochettes, crédits, tracklist, labels, pays, genres…) et l'affiche dans une interface
chaleureuse et moderne, pensée pour *explorer* sa collection plutôt que simplement la consulter :
mur de pochettes, bac à vinyles, fiches détaillées, recherche croisée, rangement physique et
profils utilisateurs.

> État : **fonctionnel.** Import Discogs, bibliothèque visuelle, fiches détaillées (galerie d'images
> complète), recherche avancée, paroles via Genius, **origine des artistes via MusicBrainz**, globe
> interactif, mode vitrine (avec inertie tactile), ajout manuel, rangement physique et profils sont
> opérationnels (voir la [feuille de route](#-feuille-de-route)).

## ✨ Fonctionnalités

- **Récupération de la collection Discogs par l'API** — renseignez votre identifiant Discogs (et votre jeton pour une collection privée) dans votre profil : un bouton va chercher tous vos disques, sans export CSV, avec dédoublonnage. L'import CSV classique reste disponible.
- **Ajout d'un disque via Discogs** — recherche en direct (nom, artiste, **code-barres**, n° de catalogue), choix de la bonne édition, et l'enrichissement fait le reste ; la saisie manuelle reste possible pour les pièces absentes de Discogs.
- **Enrichissement automatique** — un *worker* récupère **toutes les images** (recto, verso, rondelles, encarts…), crédits, musiciens, tracklist, labels, pays, genres et styles via l'API Discogs (en respectant les quotas). Les **crédits par piste** sont aussi ingérés, avec le **modèle exact des instruments** quand Discogs le précise (« Synthesizer · Yamaha DX7 »).
- **Origine des artistes (MusicBrainz)** — le worker géolocalise chaque artiste/groupe (1 req/s, sans jeton) : le globe montre d'où vient *la musique*, pas seulement où le vinyle a été pressé.
- **Fiches artistes (MusicBrainz)** — pour chaque groupe : **membres** avec instruments, périodes (arrivée/départ, deux passages distincts), badge fondateur ; pour chaque musicien : ses groupes ; plus ses disques et ses apparitions en crédit dans la collection.
- **Paroles (Genius + LRCLIB)** — récupération automatique des paroles piste par piste lors de l'enrichissement (file dédiée, *best-effort*), ou à la demande ; chaque résultat est **validé** (titre **et** artiste doivent correspondre) et le **meilleur** est retenu, pas le premier venu, pour qu'un live/remaster/reprise ne passe pas devant l'original. La recherche gère les **compilations et B.O.** (chaque piste est cherchée avec **son** artiste, pas le « Various » du disque), ignore les artistes fictifs (« Unknown Artist »…) plutôt que de stocker de fausses paroles, essaie **plusieurs formulations** (la recherche Genius rate parfois un titre selon l'ordre des mots) et **confirme avec l'album** quand un morceau existe en plusieurs versions. Quand la recherche Genius échoue, l'app tente l'**URL canonique** de la page (avec variantes d'orthographe « Ya/You »…) puis **liste le catalogue de l'artiste** pour retrouver un titre orthographié autrement ; en dernier recours, **LRCLIB** (gratuit, sans clé) complète Genius, matché sur artiste + titre + album + durée — les paroles **saisies à la main** ne sont jamais écrasées.
- **Anecdotes d'album (Genius)** — la description « à propos » de l'album est récupérée avec les paroles, **traduite automatiquement en français** (langue configurable via `ANECDOTE_LANG`) et affichée sur la fiche du disque.
- **Bibliothèque visuelle** — mur de pochettes, **piles par artiste** (des piles mal agencées vues du dessus, qu'on **éclate d'un coup de molette** pour voir chaque disque, ou d'un doigt sur mobile) ou **allée de bacs à vinyles** : des caisses en bois en 3D alignées sur une grille (~12 disques chacune, étiquetées selon le tri), toute la collection sur une seule page. On feuillette **de disque en disque et de bac en bac** comme chez un disquaire : le paquet se tient debout, les pochettes déjà vues basculent vers l'avant contre le rebord, le disque courant fait face — molette directement sur le bac sous la souris, glissement, flèches clavier, clic pour ouvrir la fiche. Bouton **« au hasard »** avec effet roulette.
- **Fiches détaillées** — crédits regroupés (musiciens / chant / auteurs / production) avec le détail des instruments, **line-up du groupe à l'année du disque** (déduit des périodes MusicBrainz), tracklist, paroles, anecdotes, identifiants, versions (live, réédition, remaster…), notes, lien Discogs ; **galerie de toutes les images** (recto / verso / photos) avec visionneuse plein écran navigable.
- **Mode vitrine** — affichage plein écran d'un disque, pochette en **objet 3D** qui tourne pour montrer recto/verso ; lancer la pochette au doigt lui donne de l'**inertie** (pensé tablette).
- **Globe interactif** — globe « cartographie ancienne » manipulable (rotation, glisser, **zoom molette / pincement**), deux vues : **origine des artistes** (MusicBrainz) ou **pays de pressage** (Discogs) ; clic sur un pays pour filtrer.
- **Frise chronologique** — la collection en **parcours de point en point** : chaque année est un point posé librement sur la toile (pas d'axe rectiligne), relié au suivant par une **courbe qui serpente**, et les pochettes **virevoltent** en nuage autour de leur année (animation suspendue au survol) ; accès rapide par décennie, molette ou glisser pour voyager du plus ancien au plus récent.
- **Recherche croisée** — filtrez par artiste, instrument (« qui joue de la basse »), genre, style, label, pays, **format (33/45 tours, LP/EP/Single…)**, décennie, version, tag, emplacement, et par **données manquantes** (sans année, sans pochette, sans paroles, sans crédits… cumulables — pratique pour repérer ce qui reste à compléter). Tous les filtres et la page courante vivent dans l'URL : le bouton retour revient exactement où vous étiez.
- **Année de la musique, pas du pressage** — l'enrichissement va chercher l'**année de sortie originale** (master Discogs) ; l'année du pressage reste affichée à part sur la fiche. Un bouton **« Recalculer les années »** (Paramètres) corrige les disques enrichis avant cette distinction en ne récupérant que le master — sans re-télécharger les pochettes.
- **Disques masqués** — masquez un vinyle de la bibliothèque (doublons, hors-sujet…) tout en le gardant **recherchable** ; un filtre « Masqués » les regroupe.
- **Ré-enrichissement sélectif** — en plus du « tout ré-enrichir », deux boutons ne traitent **que les manquants** (Discogs / paroles Genius) ; quota épuisé = pause automatique puis reprise là où la file en était.
- **Rangement physique en 3D** — recréez votre pièce et vos meubles en 3D : **cubes (Kallax)**, cube unique, **tour à vinyles**, **bac à disques**, **vitrine**, **chevalet**, **étagère** et **cadre**. Déplacez-les **sur une grille** (avec collisions : ils ne se traversent plus, se collent bord à bord et restent dans la pièce), redimensionnez-les, réglez leur **position X/Y/Z** (pour empiler ou **accrocher au mur**), et **cliquez une case** pour y ranger des disques. Les **pochettes apparaissent dans les meubles** : de tranche dans les cubes / étagères / vitrines, face avant dans les bacs / cadres / chevalets. Les anciens emplacements « texte » restent disponibles, et la recherche filtre toujours par emplacement.
- **Ajout manuel** — pour les disques absents de Discogs.
- **Profils utilisateurs** — façon Plex : sélection à l'accueil, mot de passe optionnel, avatars ; **état des API**, **ré-enrichissement global** (start/stop) et **import Discogs** regroupés dans les paramètres.
- **Affichage configurable (par profil)** — dans Paramètres, des interrupteurs activer/désactiver pour la **carte**, la **frise**, le **rangement**, les trois vues de bibliothèque (**mur / bac / pile**) et le bouton **« au hasard »** : ce qui est désactivé disparaît de la navigation et des sélecteurs (au moins une vue reste toujours active).
- **Clés API depuis l'interface** — les jetons Discogs et Genius du serveur se saisissent dans Paramètres (admin) et s'appliquent sans redémarrage ; le fichier `.env` reste le repli quand un champ est vide.
- **Sauvegarde de la collection (export / restauration)** — depuis les paramètres : export d'un fichier JSON contenant les disques et tout ce qui vous appartient (notes, étoiles, tags, rangement, paroles et anecdotes manuelles) ; la restauration recrée les disques manquants (l'enrichissement Discogs se relance automatiquement) et remet vos données, sans doublon. Distinct de l'import Discogs.
- **Sauvegarde / restauration serveur** — scripts fournis pour la base et les médias.
- **Mise à jour intégrée** — depuis les paramètres : **numéro de version** (fichier `VERSION` du dépôt) comparé à celui publié sur GitHub pour savoir d'un coup d'œil si vous êtes à jour, **vérification quotidienne automatique** (+ bouton « Vérifier maintenant », liste des commits en retard), et bouton **« Mettre à jour »** (admin) qui fait `git pull` + rebuild + redémarrage via un conteneur *updater* dédié, avec progression en direct.
- **Vider le cache du site** — un bouton dans les paramètres vide les caches navigateur de Vinylarium (et seulement de Vinylarium) puis recharge, sans vous déconnecter — utile si l'affichage semble figé sur une ancienne version.

## 🏗️ Architecture

Six services Docker (`docker-compose.yml`) :

```
        navigateur ─── http://localhost:8080
                              │
                       ┌──────▼───────┐    /api     ┌───────────────┐        ┌───────────────┐
                       │   frontend   │ ──────────▶ │    backend    │ ─────▶ │ db            │
                       │    (nginx)   │             │   (Fastify)   │        │ PostgreSQL 16 │
                       └──────┬───────┘             └───┬───────┬───┘        └───────▲───────┘
                              │ /media                  │       │ enqueue           │
                       ┌──────▼───────┐                 │   ┌───▼───┐   files   ┌───┴───────┐
                       │   volume     │◀────────────────┼───│ Redis │◀─────────▶│  worker   │
                       │  /data       │  pochettes,     │   │BullMQ │  (4 files)│  (BullMQ) │
                       │  (storage)   │  avatars, CSV   │   └───────┘           └─────┬─────┘
                       └──────────────┘                 │                             │
                                          ┌─────────────▼──┐        ┌────────────────┼─────────────────┐
                                          │    updater     │        ▼                ▼                 ▼
                                          │ (git + compose)│     Discogs          Genius          MusicBrainz
                                          └────────────────┘   (fiches, images,  (paroles,       (origine des
                                                                 collections)     anecdotes)      artistes, membres)
```

| Service    | Rôle                                                       | Stack |
|------------|------------------------------------------------------------|-------|
| `frontend` | Interface web (SPA), sert aussi `/media` (pochettes) en production | React + Vite + Tailwind, servie par nginx |
| `backend`  | API REST : auth (JWT), bibliothèque/recherche, ajout & recherche Discogs en direct, sauvegarde JSON, clés API, mise à jour ; applique les migrations Prisma au démarrage et **met en file** les tâches longues | Node 20 + Fastify + Prisma + Zod |
| `worker`   | Consomme les files : imports (CSV **et** collection Discogs via l'API), enrichissement Discogs (fiches + master pour l'année originale + toutes les images), paroles & anecdotes Genius (traduites), origines/membres MusicBrainz | Node 20 + BullMQ |
| `db`       | Base de données principale                                 | PostgreSQL 16 |
| `redis`    | Files d'attente BullMQ                                     | Redis 7 |
| `updater`  | Mise à jour intégrée : surveille la demande déposée par l'API, puis `git pull` + rebuild + redémarrage de `backend`/`worker`/`frontend` (jamais la base, jamais lui-même) | docker CLI + compose + git |

**Le backend et le worker partagent une seule image et un seul code** (`backend/`), seuls les
points d'entrée diffèrent (`server.ts` / `worker.ts`) : l'API ne fait jamais d'appel long
elle-même, elle met en file ; le worker fait tout le travail externe. Quatre files BullMQ :

- **`import`** — parsing de l'export CSV, ou récupération paginée de la collection via l'API
  Discogs (identifiant/jeton du profil) ; dédoublonnage par identifiant Discogs dans les deux cas.
- **`enrich`** — un job par disque : fiche Discogs complète + master (année de sortie originale),
  téléchargement de **toutes** les images, crédits par piste, etc. *Rate-limitée* pour rester
  sous les quotas Discogs (60 req/min avec jeton, 25 sans).
- **`lyrics`** — paroles piste par piste + anecdote d'album via Genius (traduite en français),
  séparée pour ne jamais ralentir l'enrichissement ; en cas de quota épuisé la file **se met en
  pause et reprend seule**, sans rien perdre.
- **`musicbrainz`** — origine des artistes et membres des groupes, plafonnée à ~1 req/s
  (la limite publique de MusicBrainz).

Les statuts (`enrichmentStatus`, dates des derniers passages Discogs/Genius) vivent en base : un
redémarrage en plein travail reprend où il en était, et le ré-enrichissement sélectif ne refait
que ce qui manque.

## 🚀 Installation

Pré-requis : **Docker** et **Docker Compose** (v2).

```bash
git clone https://github.com/Nyx-Off/Vinylarium.git
cd Vinylarium

# Génère un .env avec des secrets aléatoires (ou copiez .env.example à la main)
bash scripts/setup.sh

# (Recommandé) Renseignez votre jeton Discogs dans .env :
#   DISCOGS_TOKEN=...   →  https://www.discogs.com/settings/developers

docker compose up -d --build
```

Ouvrez ensuite **http://localhost:8080** (port configurable via `FRONTEND_PORT`).
Au premier lancement, l'application vous invite à **créer le premier compte**.

### Importer sa collection

Le plus simple — **par l'API Discogs** :

1. Dans Vinylarium : **Paramètres → Profil**, renseignez votre **identifiant Discogs** (et votre
   jeton personnel si votre collection est privée).
2. **Paramètres → Récupérer ma collection** : tous vos disques arrivent, déjà dédoublonnés.
3. Les pochettes et crédits apparaissent au fil de l'enrichissement.

Ou par **export CSV** : sur Discogs *Collection → Exporter*, puis **Paramètres → Import Discogs (CSV)**.

> Sans `DISCOGS_TOKEN`, l'enrichissement fonctionne mais reste limité (25 req/min et certaines
> images sont indisponibles). Avec un jeton : 60 req/min et pochettes complètes.

## ⚙️ Configuration (`.env`)

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Identifiants PostgreSQL |
| `DATABASE_URL` | URL de connexion (doit correspondre aux valeurs ci-dessus) |
| `JWT_SECRET` | Secret de signature des sessions (généré par `setup.sh`) |
| `FRONTEND_PORT` | Port public de l'interface (défaut `8080`) |
| `DISCOGS_TOKEN` | Jeton d'accès personnel Discogs (enrichissement) — modifiable aussi depuis Paramètres (admin) |
| `DISCOGS_USER_AGENT` | User-Agent envoyé à Discogs (requis par leur API) |
| `GENIUS_ACCESS_TOKEN` | *Client Access Token* Genius (active les paroles) — https://genius.com/api-clients — modifiable aussi depuis Paramètres (admin) |
| `ANECDOTE_LANG` | Langue de traduction des anecdotes d'album (défaut `fr` ; vide = anglais d'origine) |
| `MUSICBRAINZ_USER_AGENT` | User-Agent MusicBrainz (origine des artistes ; lecture sans OAuth ni jeton) |

## 🔄 Mise à jour

Le plus simple : **Paramètres → Mise à jour de l'application** dans l'interface (vérification
quotidienne automatique, bouton « Mettre à jour » pour les admins — le conteneur `updater` fait
`git pull` + rebuild + redémarrage tout seul). En ligne de commande :

```bash
bash scripts/update.sh
```

Le script enchaîne : sauvegarde de la base → `git pull` → rebuild des images → redéploiement
(les migrations Prisma s'appliquent automatiquement au démarrage du backend). Équivalent manuel :

```bash
bash scripts/backup.sh
git pull
docker compose build
docker compose up -d
```

> **« git pull a échoué (commits locaux ?) » ?** L'historique distant a été réécrit : votre copie
> a divergé et ne peut plus avancer en *fast-forward*. Réalignez-la une fois sur GitHub (les
> fichiers non suivis — `.env`, volumes `/data` — ne sont pas touchés), puis relancez la mise à jour :
>
> ```bash
> git fetch origin && git reset --hard origin/main
> ```
>
> Les versions récentes de l'`updater` font ce réalignement automatiquement.

## 💾 Sauvegarde & restauration

```bash
# Sauvegarde : crée backups/db-*.sql.gz et backups/storage-*.tar.gz
bash scripts/backup.sh

# Restauration (écrase la base et les médias actuels)
bash scripts/restore.sh backups/db-XXXX.sql.gz backups/storage-XXXX.tar.gz
```

Les données persistent dans les volumes Docker `vinylarium_pgdata`, `vinylarium_redisdata` et
`vinylarium_storage`.

## 🛠️ Développement

```bash
# Backend (API + worker) — nécessite Node 20, une base Postgres et Redis joignables
cd backend && npm install && npx prisma migrate dev
npm run dev          # API sur :3000
npm run dev:worker   # worker

# Frontend — proxy /api vers :3000
cd frontend && npm install && npm run dev   # Vite sur :5173
```

## 🗺️ Feuille de route

- [x] Import Discogs + enrichissement (toutes les images typées recto/verso/photos, crédits, tracklist)
- [x] Bibliothèque (mur / **bacs à vinyles 3D** feuilletables de bac en bac), fiches détaillées + galerie d'images, recherche croisée
- [x] Rangement physique, ajout manuel, profils
- [x] **Rangement physique en 3D** : pièce et meubles modélisés (cubes/Kallax, cube, tour à vinyles, bac, vitrine, chevalet, étagère, cadre), déplacement sur grille avec **collisions** (collage bord à bord, murs), **position X/Y/Z** (empilage + accrochage au mur), **pochettes affichées dans les meubles** (de tranche ou face avant selon le meuble), cases cliquables pour ranger les disques
- [ ] **Localiser un disque dans la pièce 3D** : cliquer l'emplacement depuis la fiche du disque met en évidence son meuble et sa case dans le rangement 3D
- [x] **Paroles via Genius** (récupération automatique piste par piste)
- [x] **Globe / carte du monde** interactif : origine des **artistes** (MusicBrainz) ou du pressage
- [x] Mode vitrine 3D (inertie tactile), mode aléatoire, zoom pochettes, ré-enrichissement global
- [x] **Fiches artistes** : membres de groupes, instruments et périodes (MusicBrainz)
- [x] **Anecdotes d'album via Genius** (description « à propos », **traduite en français**) + line-up du groupe à l'année du disque
- [x] Crédits par piste et modèles d'instruments ; paroles Genius validées (titre + artiste) et **complètes** (extraction corrigée des pages Genius)
- [x] **Paroles plus complètes** : replis quand la recherche Genius échoue (URL canonique + variantes d'orthographe, puis catalogue de l'artiste) et **2ᵉ source LRCLIB** (gratuite, sans clé, complémentaire) — ajoutée à l'« État des API »
- [x] **Paroles fiables sur les compilations / B.O.** : artiste par piste (au lieu du « Various » du disque), meilleur résultat retenu (pas le premier), formulations de recherche multiples, confirmation par l'album et filtrage des artistes fictifs
- [x] **Frise chronologique** en parcours de point en point (pochettes virevoltant autour de chaque année, navigation par décennie)
- [x] **Pagination mémorisée dans l'URL** : le retour arrière (depuis une fiche) revient sur la bonne page, saut direct de la page 1 à la page 4 (pagination numérotée), **nombre de disques par page** au choix
- [x] **Masquer des vinyles** de la bibliothèque tout en les gardant **recherchables**
- [x] **Tri** complet de la bibliothèque : A→Z **et** Z→A (titre, artiste), par année
- [x] **Filtre format** dans la recherche : 33 / 45 tours, LP / EP / Single…
- [x] **Année de sortie originale** de la musique (master Discogs) au lieu de l'année du pressage — le pressage reste affiché à part
- [x] **Ré-enrichissement sélectif** : un bouton Discogs et un bouton Genius qui ne traitent **que les disques jamais enrichis** (date du dernier passage mémorisée) ; en cas de quota épuisé, la file **se met en pause et reprend toute seule** là où elle en était
- [x] **Ajout via Discogs** : recherche en direct (nom, artiste, code-barres, n° catalogue) à la place de la saisie manuelle ; le menu « Ajouter » disparaît de la navigation
- [x] **Clés API dans le profil** : identifiant + jeton Discogs par utilisateur, et **récupération de la collection Discogs directement par l'API** (sans export CSV)
- [x] **Vue « piles »** (3ᵉ mode de bibliothèque, après le mur et le bac) : des **piles de pochettes par artiste** posées en vrac sur la table — pochettes empilées dans tous les sens, vue du dessus légèrement penchée vers l'arrière ; **molette sur une pile pour l'éclater** en éventail et voir chaque disque, re-scroller pour la rempiler (au doigt : toucher la pile l'éclate, l'étiquette la rempile) ; le tri de la bibliothèque ordonne les piles (A→Z, année…) et la barre de recherche devient un **filtre d'artistes** instantané
- [x] **Affichage configurable par profil** : activer/masquer la carte, la frise, le rangement, les vues mur/bac/pile et le bouton « au hasard » depuis les paramètres
- [x] **Numéro de version** (fichier `VERSION`) comparé à GitHub pour la détection de mise à jour, et bouton **« vider le cache du site »**
- [x] **Recalcul des années** (origine / pressage) : un bouton léger dans les paramètres qui ne récupère que le master (sans re-télécharger les pochettes) pour corriger les disques enrichis avant l'ajout de la distinction — ciblé par instance et idempotent

## 📦 Stockage des données

Toutes les entités du cahier des charges sont modélisées (voir
[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)) : disques, artistes, crédits
(rôles catégorisés → musiciens / chanteurs / auteurs / producteurs), labels, pays, genres, styles,
formats, tracklists, paroles, anecdotes, pochettes, emplacements physiques, tags, jobs d'import et
liens externes.

## 📄 Licence

MIT — voir [LICENSE](LICENSE).
