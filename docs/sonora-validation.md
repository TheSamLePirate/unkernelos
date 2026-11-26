# Sonora et App SDK — validation locale

Version vérifiée le 26 novembre 2026 sur Chrome headless, Apple M1 Max / ANGLE Metal, Debian en VM. Les données audio sont des signaux MP3 générés localement avec FFmpeg et de vrais fichiers/blobs lus par le navigateur.

- `bun run typecheck` : réussi.
- `bun test test` : 25 tests, 425 assertions, aucun échec.
- `bun run build` : réussi. Le warning Vite existant sur les chunks supérieurs à 500 kB reste présent.
- `bun run test:sonora-browser` : 27 scénarios réussis.
- `bun run test:horizon-browser` : 44 scénarios existants réussis.
- Aucune exception JavaScript dans ces deux parcours.
- Les producteurs d’applications Bun, Node et Rust ont été exécutés localement ; leurs sorties HTML ont été installées et contrôlées dans le vrai système via le SDK. Cela ne prétend pas certifier un backend natif Rust ou un toolchain absent de la VM.

## Parcours Sonora / SDK

- Sonora publie son contexte et ses actions par défaut
- Les vrais MP3 sont importés et leurs tags ID3 sont lus
- Lecture MP3 réelle : le temps audio avance
- Dock gauche : le même élément audio continue de jouer
- Le clic sur le dock met réellement en pause
- Le dock relance réellement le même audio
- Dock droit : play/pause reste la commande de la session
- L’agent pilote la pause sans grant manuel
- Seek, volume, mute, répétition et aléatoire sont pilotables
- L’agent sélectionne la piste suivante
- Les révisions périmées restent refusées
- Le tiroir de l’app est lisible par défaut
- La session privée coupe l’accès par défaut
- Les contrôles d’interface sont aussi accessibles par l’agent
- Les fichiers et la collection sont conservés dans IndexedDB
- Les zones data-private sont exclues du contexte de l’interface
- Une nouvelle session retrouve les MP3 et leurs blobs persistés
- Un agent importe un vrai MP3 depuis le système Linux
- Bun : app générée, installée, contexte et action agent via SDK
- Node : app générée, installée, contexte et action agent via SDK
- Rust : app générée, installée, contexte et action agent via SDK
- Le dock d’une app SDK appelle sa vraie fonction dans l’iframe
- Un rechargement SDK invalide les anciennes révisions et commandes
- Le contrat SDK est découvrable par les agents via app.sdk
- Sonora reste utilisable sur petit écran
- Le shell classique conserve aussi le contrat agent du lecteur
- Aucune exception JavaScript pendant les parcours

La lecture réelle est vérifiée par le décodage et l’avancement de `HTMLAudioElement.currentTime`. Le rendu audio sur des haut-parleurs physiques, les touches matérielles et les navigateurs mobiles réels nécessitent des essais sur ces appareils. Les cas d’erreur autoplay, les paramètres invalides et les fins de file sont également couverts par les tests unitaires.

Les captures du lecteur, du dock et du téléphone sont dans `.cache/sonora-qa/`. Guide : `docs/sonora.md`. Contrat des apps : `docs/app-sdk.md`.
