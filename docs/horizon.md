# Horizon — interface principale d’unkernelOS

Horizon compose les applications réelles du bureau dans un plan de travail central et une profondeur continue vers les deux côtés. Chaque fenêtre reste montée avec sa session React, son terminal ou sa surface Linux. Les vues latérales ne sont pas des captures recréées.

## Utilisation

- Ouvrir une app dans le dock ou le lanceur ; une nouvelle fenêtre prend sa place au centre et les autres restent accessibles dans les ailes.
- Glisser l’en-tête vers un côté : la fenêtre recule, tourne et diminue progressivement selon sa position. Le relâchement conserve sa profondeur et sa hauteur ; les côtés ne sont pas des rectangles de snapping.
- Aller jusqu’à l’extrémité gauche/droite pour docker la session. Le repère annonce **Relâcher pour docker**. L’élément du dock garde la vraie app montée. Glisser son icône vers le centre la ressort ; sa flèche de rappel offre une alternative sans drag. Le menu propose aussi **Docker à gauche/droite**.
- Échap, annulation du pointeur ou perte de fenêtre annulent le geste. Le mode à plat conserve les tailles progressives, en supprimant la rotation.
- Rappeler avec le titre d’une carte, le dock, Exposé ou le menu de fenêtre. Les boutons du chrome offrent aussi un placement sans drag.
- Choisir une, deux ou trois fenêtres centrales dans la barre d’espace. Les huit bords/coins permettent le resize ; le menu offre une taille numérique.
- Le bouton vert **Plein écran**, le double-clic sur le titre ou le menu de fenêtre couvrent toute la largeur et toute la hauteur du navigateur, au-dessus des barres et du dock. **Restaurer la fenêtre** retrouve la taille et la disposition précédentes, sans recréer l’app. Le tiroir coulisse alors à l’intérieur de l’écran. Exposé reste accessible par F3. Les agents utilisent `wm.snap` avec `zone: "maximize"`, puis `zone: "none"` pour restaurer.
- F3 ouvre Exposé ; F4 le lanceur. Les boutons restent disponibles lorsque le système ou le navigateur réserve une touche.
- Ctrl/⌘ + Alt + flèche gauche/droite/haut place la fenêtre active dans une aile ou au centre ; Ctrl/⌘ + Alt + Z annule le placement et Shift permet de rétablir.
- Les raccourcis de l’app, la saisie et la composition IME ont priorité sur les raccourcis généraux non explicites. Les raccourcis ne constituent pas un keymap personnalisable dans cette version.
- Le tiroir est directement attaché au bord de sa propre fenêtre, dans le même plan transformé. L’onglet latéral et le bouton de barre de titre le font coulisser. Plusieurs tiroirs peuvent rester ouverts ; fermer l’un ne ferme pas les autres et conserve son brouillon.
- Sélectionner du texte, puis ouvrir le tiroir de cette fenêtre et choisir **Garder la sélection**. Les copies attribuables dans les apps intégrées alimentent aussi sa liste d’extraits et de copies. Ce tiroir est non modal : il ne bloque pas le reste du bureau.
- Déposer des textes, images, fichiers hôtes ou références de fichiers Linux. Les fichiers Linux restent des références au fichier courant ; leur téléchargement peut échouer si la source a disparu.
- Dans l’explorateur, glisser un fichier vers un autre dossier le copie ; Shift demande un déplacement. Les collisions de noms créent une destination distincte.
- Le menu **Votre Horizon** propose une apparence claire/sombre, les surfaces à plat, les mouvements réduits et le mode privé. Le shell classique est accessible lorsque les fenêtres sont fermées afin de préserver les sessions en cours.

Ouvrir un tiroir sur une surface distante ou dockée agrandit temporairement son plan pour permettre la lecture, tout en conservant sa profondeur mémorisée et sa session. Le fermer retrouve sa taille précédente. Le tiroir est ajusté au viewport avec son propriétaire ; il ne devient pas un panneau global du bureau. Sur téléphone, il coulisse à l’intérieur de la fenêtre.

Sur téléphone, une seule surface centrale est présentée ; les autres sessions restent dans le ruban de rappel. Sur tablette, les contrôles et les zones de resize sont agrandis. La sélection tactile du terminal possède un mode explicite pour la distinguer du défilement.

## Tiroirs et reprise

Les métadonnées, extraits, événements et dispositions sont dans IndexedDB `unkernelos-horizon`. Les blobs sont stockés séparément afin qu’un changement de disposition ne réécrive pas tous les fichiers joints. Le statut distingue l’enregistrement en cours et les erreurs de conservation. Les éléments épinglés et fichiers restent conservés ; l’historique de texte non épinglé est limité à 100 éléments par contexte.

Deux fenêtres ont des tiroirs distincts. Notes, l’éditeur et l’explorateur associent leur contexte au document/dossier et à la vue. Une réouverture peut retrouver un contexte non utilisé de ce document, avec priorité au plus récent. La reprise d’un espace conserve les identifiants et les placements. Les documents Notes et IDE ainsi que le dossier de l’explorateur sont réouverts depuis leurs références.

Une disposition enregistrée ne constitue pas un snapshot de la mémoire Linux : un terminal fermé rouvre un processus ; une app Wayland disparue doit être relancée. Un document non enregistré est protégé par le dialogue de fermeture de sa fenêtre intégrée. La fermeture de l’onglet reste soumise au cycle de vie du navigateur et de la VM.

Le mode privé empêche les nouveaux ajouts et événements. Il ne supprime pas les données déjà conservées. Les exports du tiroir contiennent les références et extraits ; les blobs se téléchargent individuellement.

## Applications compatibles avec le dock

`useAppSurface` accepte une présentation déclarative `dock` en plus de l’état et des actions de la session. L’application reste la source de vérité ; sa révision doit évoluer avec les changements d’état, y compris ceux de sa présentation dans le dock. Exemple pour un lecteur déjà implémenté :

```tsx
useAppSurface({
  revision,
  state: { playing, title },
  dock: {
    label: playing ? "Mettre en pause" : "Lire",
    glyph: playing ? "pause" : "play",
    value: title,
    detail: artist,
    primaryAction: playing ? "pause" : "play",
    progress: duration ? currentTime / duration : 0,
  },
  actions: {
    play: { label: "Lire", run: () => player.play() },
    pause: { label: "Mettre en pause", run: () => player.pause() },
  },
});
```

Champs disponibles : `label`, `value`, `detail`, `glyph`, `primaryAction`, `progress` (0–1). Les glyphes fournis sont `play`, `pause`, `sun`, `cloud`, `rain`, `snow`, `activity` ; sans glyphe, l’icône de l’application est utilisée. Une météo pourrait publier `glyph: "sun", value: "21°"` depuis ses vraies données. Ce contrat ne crée pas un lecteur ou un service météo factice.

Sonora, le lecteur MP3, utilise cette interface pour proposer play/pause et la progression dans les docks gauche/droite. Le Shader/Synth utilise aussi cette interface : son élément de dock devient une commande pause/reprise et expose son scénario courant. Notes montre son état enregistré/modifié. Pour les autres apps, l’icône rappelle la fenêtre ; les commandes de contexte et de rappel restent distinctes. Les actions du dock sont déclenchées par l’utilisateur ; les agents continuent à utiliser les grants et contrôles de révision décrits ci-dessous.

La vue de dock ne remplace pas le composant applicatif et ne suspend pas implicitement son processus. Une app non compatible reste ouverte avec une icône de rappel. Plusieurs colonnes se forment si un dock contient plus d’éléments que la hauteur disponible.

## Agents

Notes, IDE, Explorer, terminal, Preview et Shader/Synth publient des capacités adaptées à ce qu’ils savent réellement exposer. Une prévisualisation iframe reste opaque : son URL et sa commande de rechargement sont disponibles, pas un accès fictif à son DOM.

Le contexte et toutes les actions publiées sont partagés par défaut avec les agents du système. Le tiroir permet de rendre une session privée. Les grants explicites restent disponibles pour limiter un accès aux éléments et aux actions sélectionnés ; ils expirent après 15 minutes et sont révocables. Le mode privé global coupe le partage par défaut. Préparer un prompt dans Agent Studio n’exécute pas automatiquement une mission.

Méthodes disponibles via `window.unkernelOS.call`, `osctl` et MCP :

- `horizon.status` : mode, disposition et placements.
- `horizon.sessions` : cibles, capacités, schémas des paramètres, état du partage et révisions.
- `horizon.session.read` avec `windowId` : état et tiroir de la session partagée. `grantId` optionnel applique un périmètre explicite.
- `horizon.session.action` avec `windowId`, `action`, `expectedRevision`, `requestId`, `args` : action publiée et révision vérifiée ; un même requestId est dédupliqué. `grantId` est optionnel pour un périmètre explicite.

Les nouveaux grants complètent le pare-feu OS existant ; ils ne remplacent pas ses permissions globales pour les anciennes méthodes. La révocation interdit les nouvelles commandes, mais ne promet pas d’annuler une opération déjà engagée lorsque l’application n’a pas de mécanisme d’annulation.

## Vérification

```sh
bun run typecheck
bun test test
bun run build
```

La vérification du navigateur utilise un profil Chromium séparé et le protocole CDP, sans dépendance de production ni endpoint de test dans l’application :

```sh
bun run dev
# Lancer un Chromium isolé avec --remote-debugging-port=9333,
# ouvrir http://localhost:3080/?app=notes et laisser Linux démarrer.
bun run test:horizon-browser
```

`PORT=3081 bun run dev`, puis `bun run test:fullscreen-browser`, vérifie le plein écran dans un Chromium isolé : bord à bord, tiroir interne, resize mobile, restauration, Exposé et shells classiques 2D/3D. Les artefacts sont dans `.cache/fullscreen-qa/`.

Les captures et le rapport sont générés dans `.cache/horizon-qa/`. Les tests vérifient les vraies fenêtres, les gestes via le pointeur, la sélection, les tiroirs, la persistance, les fichiers Linux et les permissions. Les gestes tactiles sur matériel réel, les lecteurs d’écran et toutes les variantes de pilotes Wayland/GPU nécessitent une validation dédiée ; le profil émulé ne certifie pas ces appareils.

La projection des pointeurs du terminal, de GL et de l’adaptateur d’entrée Wayland utilise les coordonnées locales du plan transformé. Les menus de shell et de l’explorateur sont rendus dans le repère écran. Les popups natifs complexes des clients Wayland dépendent aussi du comportement du compositor wland et doivent être vérifiés client par client.

Le SDK des applications et ses exemples Bun/Node/Rust sont documentés dans [app-sdk.md](app-sdk.md). Le lecteur intégré est décrit dans [sonora.md](sonora.md).
