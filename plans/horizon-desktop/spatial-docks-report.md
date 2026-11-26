# Horizon — profondeur continue, tiroirs attachés et docks actifs

La version Horizon initiale a été commitée et poussée sur `main` sous `15ffe5a`. Cette évolution remplace les anciennes cartes latérales à disposition fixe.

## Comportement livré

- Chaque fenêtre contient son propre tiroir, rattaché à son bord dans le même plan transformé. Le bouton de titre et l’onglet latéral permettent l’ouverture/fermeture coulissante. Plusieurs tiroirs peuvent rester ouverts, avec des brouillons et des contextes indépendants. Ils sont non modaux.
- La profondeur et la hauteur d’une fenêtre latérale sont conservées au relâchement. La réduction et la rotation suivent la position de manière continue, sans rectangles de snapping latéraux. Undo/redo et les espaces enregistrés conservent ces coordonnées.
- Les extrémités gauche/droite produisent des éléments de dock. La vraie application reste montée. L’utilisateur peut tirer l’icône vers le centre, cliquer sur le rappel ou utiliser le clavier et le menu de fenêtre.
- Les applications compatibles peuvent fournir `SurfaceAdapter.dock` : icône, valeur, détail, progression et action principale. Le shader propose déjà pause/reprise depuis son dock ; Notes expose son état enregistré/modifié. Les autres apps gardent une icône de rappel. Le contrat permet un lecteur musical ou une météo futurs, sans simuler ces applications aujourd’hui.
- Un clic sur une commande de dock conserve la fenêtre de travail active. La capture du pointeur commence après le seuil de drag sur le bureau stable. L’ouverture d’un tiroir distant agrandit temporairement son plan pour le rendre lisible, puis sa fermeture retrouve la profondeur mémorisée.
- Le téléphone conserve les sessions dans son ruban ; le tiroir coulisse à l’intérieur de la surface. Les alternatives de clavier restent disponibles.

## Vérification finale

- `bun run typecheck` : réussi.
- `bun test test` : 19 tests, 402 assertions, aucun échec.
- `bun run build` : réussi ; le warning Vite existant sur les chunks supérieurs à 500 kB reste présent.
- `bun run test:horizon-browser` : 44 scénarios réussis, aucune exception JavaScript.

Le navigateur vérifie les vraies applications et la VM Debian : persistance et séparation des tiroirs, brouillons après toggle, DOM conservé, projection du terminal, commandes agent, copie de fichiers Linux, deux profondeurs distinctes, contrôle du shader dans le dock, clic natif sans prise de focus, drag vers l’extrémité et retour depuis l’icône, rappel au clavier et tiroir mobile. Les événements souris CDP déclarent explicitement leurs boutons maintenus ; les événements Entrée incluent le caractère nécessaire à l’activation native.

Cadence observée dans ce profil Chrome headless sur M1 Max, quatre fenêtres avec shader réel : médiane 16.665 ms, p95 16.67 ms sur 119 intervalles rAF. Ce n’est pas une mesure de latence de saisie ni une comparaison avec les OS natifs.

Les captures réelles et le rapport brut sont générés dans `.cache/horizon-qa/` : `depth-docks.png`, `attached-drawer.png`, `mobile-drawer.png`, `report.json`.

## Contrats et limites

Le guide `docs/horizon.md` décrit l’API de dock et les comportements de reprise. Les processus restent vivants pendant le docking ; aucun composant applicatif n’est remplacé par sa vue compacte. Ouvrir un tiroir ne constitue pas une restauration mémoire de VM. Les lecteurs d’écran, tablettes physiques et clients Wayland variés restent à qualifier comme indiqué dans le guide.

Références consultées : [transformations CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform), [capture du pointeur](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture), [perte de capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/lostpointercapture_event), [événements d’entrée CDP](https://chromedevtools.github.io/devtools-protocol/tot/Input/).
