# Politique de sécurité

## Versions prises en charge

Seule la dernière version publiée reçoit des correctifs de sécurité.

| Version | Prise en charge    |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

Pensez à garder votre instance à jour (**Paramètres → Mise à jour de
l'application**, ou `bash scripts/update.sh`).

## Signaler une vulnérabilité

**Merci de ne pas ouvrir d'issue publique pour une faille de sécurité.**

Privilégiez le signalement privé via GitHub :

1. Onglet **« Security »** du dépôt → **« Report a vulnerability »**
   ([Private vulnerability reporting](https://github.com/Nyx-Off/Vinylarium/security/advisories/new)).
2. À défaut, contactez le mainteneur [@Nyx-Off](https://github.com/Nyx-Off).

Merci d'inclure si possible :

- une description de la faille et de son impact ;
- les étapes pour la reproduire (version concernée, configuration) ;
- toute idée de correctif.

Vous recevrez un accusé de réception sous quelques jours. Une fois le correctif
disponible, un avis de sécurité pourra être publié — votre contribution sera
créditée si vous le souhaitez.

Ce projet est **auto-hébergé** : pensez aussi à protéger votre déploiement
(secrets du fichier `.env`, accès réseau au reverse-proxy, jetons Discogs/Genius).
