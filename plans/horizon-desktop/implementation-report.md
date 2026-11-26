# Horizon — rapport d’implémentation

Horizon est intégré comme interface principale du code d’unkernelOS. Cette première version a été commitée et poussée sur `main` sous `15ffe5a` à la demande de l’utilisateur. Le rapport ci-dessous conserve les vérifications de cette version initiale ; les évolutions de profondeur et de dock sont décrites dans `spatial-docks-report.md`.

## Livré

- Shell principal avec décor local, barre de session, dock, quatre espaces, centre simple/double/triple et ailes en perspective. Les apps restent montées pendant les placements et rappels.
- Exposé compose les vraies surfaces avec une liste recherchable et un parcours clavier. Modes plat, clair/sombre et mouvements réduits.
- Drag à seuil, annulation distincte, huit bords de resize, taille numérique, undo/redo, menus dans le repère écran et protection des documents intégrés non enregistrés.
- Coordonnées projetées du terminal/GL et adaptation de l’entrée Wayland ; sélection tactile du terminal et gestion des IME.
- Tiroirs indépendants : extraits, provenance, épinglage, fichiers/blobs séparés, références Linux, recherche, reprise, export et mode privé. Les erreurs de stockage et de presse-papiers sont visibles.
- Registre de capacités Notes, IDE, Explorer, Terminal, Preview et Shader/Synth. Grants par fenêtre/contexte, expiration, révocation, contrôles de révision et déduplication des actions.
- Préparation explicite du contexte dans Agent Studio sans envoi automatique ; prompt multiligne.
- Références de documents Notes/IDE et dossiers Explorer réouverts lors de la reprise d’un espace. Les processus fermés sont relancés plutôt que présentés comme des processus restaurés.

## Vérifications

- `bun run typecheck` : réussi.
- `bun test test` : 12 tests, 49 assertions, aucun échec.
- `bun run build` : réussi. Le warning Vite sur les chunks supérieurs à 500 kB reste présent ; le renderer Three.js demeure chargé à la demande pour les variantes classiques.
- `bun run test:horizon-browser` : 30 scénarios réussis dans le vrai navigateur, sans exception JavaScript.

Environnement observé : Chrome headless, Apple M1 Max / ANGLE Metal, viewport 1512×982 et émulation 390×844, Debian aarch64 en VM, 2048 Mo et 4 vCPU, WebGPU disponible.

Échantillon de cadence avec quatre fenêtres dont un shader actif : 119 intervalles, médiane 16.665 ms, p95 16.670 ms. Cette mesure porte sur la cadence rAF de ce profil ; elle ne constitue ni une mesure de latence entrée→présentation ni une comparaison avec des OS natifs.

Parcours navigateur vérifiés :

- Horizon est le shell principal
- Notes réelle chargée depuis Linux
- Session et DOM conservés centre/aile
- Sélection de texte conservée
- Deux vraies fenêtres partagent le centre
- Tiroir écrit dans IndexedDB
- Deux tiroirs indépendants
- Ouvrir un tiroir latéral ne rappelle pas la fenêtre
- Shader réel intégré au registre
- Grant refuse une autre session
- Révision périmée refusée
- Action agent met le vrai shader en pause
- Rejeu idempotent après changement de révision
- Reprise du vrai shader
- Révocation effective
- Disposition mémorisée puis restaurée
- Pointeur projeté exact sur le vrai terminal
- Deux documents de Notes gardent des sessions distinctes
- Fichier du tiroir restauré depuis le stockage séparé
- Réouverture du document retrouve son tiroir
- Dépôt d’un fichier Linux dans le tiroir
- Dépôt Explorer copie réellement le fichier dans Linux
- Le terminal embarqué ne remplace pas les capacités de l’éditeur
- Contexte préparé reçu par Agent Studio même au chargement initial
- Échap annule le drag réel sans dépôt
- Drag réel dépose la fenêtre dans l’aile
- Poignée réelle redimensionne la fenêtre
- Exposé expose les vraies sessions et une liste accessible
- Shell mobile sans débordement horizontal
- Aucune exception JavaScript pendant les parcours

## Portée et limites

- Les captures sont générées depuis le vrai système dans `.cache/horizon-qa/`, pas depuis le prototype HTML.
- Tablettes physiques, lecteurs d’écran, IME sur matériel et clients Wayland variés restent à valider. Aucun client GTK/Qt n’était installé dans l’image Debian locale de test ; la projection Wayland a été vérifiée par lecture des types et compilation, pas par une session GTK/Qt de bout en bout.
- Les permissions par session des nouvelles méthodes Horizon complètent le pare-feu des anciennes méthodes OS. Les iframes opaques et les applications sans adaptateur restent identifiées comme telles.
- Un rechargement de l’onglet, un arrêt de la VM ou un document non restaurable ne deviennent pas une reprise mémoire automatique. Les dépendances au navigateur et au client applicatif sont décrites dans le guide.
- Le keymap est fixe dans cette version ; les commandes de placement, Exposé et tiroirs possèdent des alternatives visibles.

Fichiers de conception et sources vidéo conservés dans ce dossier. Guide de fonctionnement : `docs/horizon.md`.
