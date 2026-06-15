# Contribuer à Vinylarium

Merci de l'intérêt que vous portez au projet ! 🎶 Toute contribution est la
bienvenue : correction de bug, nouvelle fonctionnalité, documentation ou simple
retour d'expérience.

## Avant de commencer

- Lisez le [README](../README.md) — en particulier la section **Architecture**
  et la **feuille de route**.
- Vérifiez les [issues](https://github.com/Nyx-Off/Vinylarium/issues) existantes
  pour éviter les doublons.
- L'interface et la documentation du projet sont **en français** ; merci de
  garder cette langue pour les textes visibles par l'utilisateur.

## Signaler un bug ou proposer une idée

Passez par les [modèles d'issue](https://github.com/Nyx-Off/Vinylarium/issues/new/choose) :
**🐛 Rapport de bug** ou **✨ Demande de fonctionnalité**. Plus c'est précis
(version, étapes, journaux), plus c'est facile à traiter.

## Mettre en place l'environnement de développement

Le projet tourne entièrement sous **Docker** ; pour développer, il faut **Node 20**
plus un PostgreSQL et un Redis accessibles.

```bash
# Backend (deux points d'entrée, dans deux terminaux)
cd backend && npm install && npx prisma migrate dev
npm run dev          # API sur :3000
npm run dev:worker   # worker

# Frontend (proxy /api et /media vers :3000)
cd frontend && npm install && npm run dev   # Vite sur :5173
```

Ou toute la stack via Docker :

```bash
bash scripts/setup.sh
docker compose up -d --build   # app sur http://localhost:8080
```

## Style de code et vérifications

Il n'y a **ni linter ni suite de tests** configurés. Avant d'ouvrir une PR,
vérifiez que tout compile :

```bash
cd backend  && npm run build       # tsc → dist/
cd frontend && npm run typecheck    # tsc --noEmit
```

Quelques principes :

- **TypeScript** partout, typage strict ; validez les entrées d'API avec Zod.
- Le backend et le worker **partagent une seule image** (`backend/`) ; le code
  partagé vit sous `src/lib/` et `src/db/`.
- Respectez les invariants existants (idempotence de l'enrichissement, accès à
  la config via `src/config`, `fetchWithTimeout` pour les appels réseau…).

## Commits

Format **[Conventional Commits](https://www.conventionalcommits.org/)**, en
français :

```
feat(bibliothèque): vue « piles » par artiste
fix(enrichissement): upsert de label tolérant à la concurrence
docs(readme): documente le recalcul des années
```

## Pull requests

1. Créez une branche à partir de `main`.
2. Gardez la PR ciblée sur un seul sujet.
3. Remplissez le modèle de PR (description, type, issue liée, vérifications).
4. Assurez-vous que `npm run build` (backend) et `npm run typecheck` (frontend)
   passent.

Merci d'avance pour vos contributions ! 🙌
