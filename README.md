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

> État : **fonctionnel.** Import Discogs, bibliothèque visuelle, fiches détaillées (recto **et verso**),
> recherche avancée, paroles via Genius, globe interactif, mode vitrine, ajout manuel, rangement
> physique et profils sont opérationnels. L'enrichissement MusicBrainz reste à venir
> (voir la [feuille de route](#-feuille-de-route)).

## ✨ Fonctionnalités

- **Import Discogs** — déposez votre export CSV, suivez la progression en direct, dédoublonnage automatique.
- **Enrichissement automatique** — un *worker* récupère pochettes (recto **et verso**), crédits, musiciens, tracklist, labels, pays, genres et styles via l'API Discogs (en respectant les quotas).
- **Paroles (Genius)** — récupération automatique des paroles piste par piste lors de l'enrichissement (file dédiée, *best-effort*), ou à la demande.
- **Bibliothèque visuelle** — mur de pochettes ou **bac à vinyles** (feuilletage vertical façon disquaire), bouton **« au hasard »**, responsive du mobile à la tablette.
- **Fiches détaillées** — crédits regroupés (musiciens / chant / auteurs / production), tracklist, paroles, identifiants, versions (live, réédition, remaster…), notes, lien Discogs ; clic sur une pochette pour l'agrandir.
- **Mode vitrine** — affichage plein écran d'un disque, pochette en **objet 3D** qui tourne pour montrer recto/verso (pensé tablette).
- **Globe interactif** — carte du monde manipulable (rotation, glisser) des origines de pressage ; clic sur un pays pour filtrer.
- **Recherche croisée** — filtrez par artiste, instrument (« qui joue de la basse »), genre, style, label, pays, décennie, version, tag, emplacement…
- **Rangement physique** — décrivez meubles, étagères, bacs et positions ; retrouvez et filtrez vos disques par emplacement.
- **Ajout manuel** — pour les disques absents de Discogs.
- **Profils utilisateurs** — façon Plex : sélection à l'accueil, mot de passe optionnel, avatars ; **état des API** et **ré-enrichissement global** (start/stop) dans les paramètres.
- **Sauvegarde / restauration** — scripts fournis pour la base et les médias.

## 🏗️ Architecture

```
┌──────────┐   /api   ┌──────────┐        ┌────────────┐
│ frontend │ ───────▶ │ backend  │ ─────▶ │ PostgreSQL │
│  (nginx) │          │ (Fastify)│        └────────────┘
└──────────┘          └────┬─────┘
                           │ enqueue (BullMQ)
                      ┌────▼─────┐  ┌───────┐
                      │  worker  │─▶│ Redis │
                      │ (Discogs)│  └───────┘
                      └──────────┘
```

| Service    | Rôle                                                       | Stack |
|------------|------------------------------------------------------------|-------|
| `frontend` | Interface web (SPA)                                        | React + Vite + Tailwind, servie par nginx |
| `backend`  | API REST, auth, import, recherche ; applique les migrations | Node 20 + Fastify + Prisma |
| `worker`   | Tâches longues : parsing CSV, enrichissement Discogs, pochettes, paroles | Node 20 + BullMQ |
| `db`       | Base de données principale                                 | PostgreSQL 16 |
| `redis`    | File d'attente + cache                                     | Redis 7 |

Le backend et le worker partagent une seule image (même code, deux points d'entrée). Le worker
traite trois files BullMQ : `import` (parsing CSV), `enrich` (Discogs, *rate-limité*) et `lyrics`
(Genius, séparée pour ne pas ralentir l'enrichissement).

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

1. Sur Discogs : *Collection → Exporter* → téléchargez le CSV.
2. Dans Vinylarium : page **Import**, déposez le fichier, suivez la progression.
3. Les pochettes et crédits apparaissent au fil de l'enrichissement.

> Sans `DISCOGS_TOKEN`, l'enrichissement fonctionne mais reste limité (25 req/min et certaines
> images sont indisponibles). Avec un jeton : 60 req/min et pochettes complètes.

## ⚙️ Configuration (`.env`)

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Identifiants PostgreSQL |
| `DATABASE_URL` | URL de connexion (doit correspondre aux valeurs ci-dessus) |
| `JWT_SECRET` | Secret de signature des sessions (généré par `setup.sh`) |
| `FRONTEND_PORT` | Port public de l'interface (défaut `8080`) |
| `DISCOGS_TOKEN` | Jeton d'accès personnel Discogs (enrichissement) |
| `DISCOGS_USER_AGENT` | User-Agent envoyé à Discogs (requis par leur API) |
| `GENIUS_ACCESS_TOKEN` | *Client Access Token* Genius (active les paroles) — https://genius.com/api-clients |
| `MUSICBRAINZ_USER_AGENT` | User-Agent MusicBrainz (enrichissement à venir ; lecture sans OAuth) |

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

- [x] Import Discogs + enrichissement (pochettes recto/verso, crédits, tracklist)
- [x] Bibliothèque (mur / bac feuilletable), fiches détaillées, recherche croisée
- [x] Rangement physique, ajout manuel, profils
- [x] **Paroles via Genius** (récupération automatique piste par piste)
- [x] **Globe / carte du monde** interactif des origines
- [x] Mode vitrine 3D, mode aléatoire, zoom pochettes, ré-enrichissement global
- [ ] Enrichissement **MusicBrainz** (origine des artistes, membres de groupes, instruments)
- [ ] Enrichissement **Genius** des anecdotes / annotations
- [ ] Moteur de recherche dédié (**Meilisearch**) : recherche floue, paroles, anecdotes
- [ ] Statistiques avancées, timeline, exploration par instruments, thèmes personnalisables

## 📦 Stockage des données

Toutes les entités du cahier des charges sont modélisées (voir
[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)) : disques, artistes, crédits
(rôles catégorisés → musiciens / chanteurs / auteurs / producteurs), labels, pays, genres, styles,
formats, tracklists, paroles, anecdotes, pochettes, emplacements physiques, tags, jobs d'import et
liens externes.

## 📄 Licence

MIT — voir [LICENSE](LICENSE).
