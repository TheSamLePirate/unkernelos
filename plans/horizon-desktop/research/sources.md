# Sources et statut — 26 novembre 2026

- Vidéo demandée : [Scott Jenson — Are we really going to use the same Desktop UX forever?](https://www.youtube.com/watch?v=V7AfAcQwLW0).
- [Enregistrement officiel KDE/c3voc](https://media.ccc.de/v/kde2026-7-are_we_really_going_to_use_the_same_desktop_ux_forever), Scott Jenson, Akademy, 19 septembre 2026. Licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `transcript.en-auto.vtt` : sous-titres automatiques anglais `en-orig`, téléchargés depuis YouTube. Premier essai `en` refusé HTTP 429 ; piste originale récupérée ensuite. Texte non corrigé.
- `transcript.en.txt` : extraction horodatée avec suppression des balises et lignes de recouvrement. Normalisation mécanique ; répétitions et erreurs restantes possibles.
- PNG : extractions sans retouche de l’enregistrement officiel ; horodatages dans les noms. Attribution Scott Jenson / KDE / c3voc, CC BY-SA 4.0. Les éléments tiers dans les démonstrations restent attribués à leurs auteurs.
- `windows-32m10.png` : zone centrale et fenêtres latérales.
- `widget-31m43.png` : lecteur compact dans une aile.
- `scrapbook-33m25.png` : ressources associées au document.
- `history-35m40.png` : historique d’activité.
- `provenance-36m05.png` : source des ressources.
- `specs-bureau-spatial.md` : pièce jointe utilisateur conservée à l’identique.

Documentation primaire consultée :

- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) et [pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event) : capture et annulation des pointeurs.
- [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) : contexte sécurisé, autorisations, activation utilisateur et différences navigateur.
- [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) : origine cible et validation de l’émetteur.
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) : préférence système.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) : alternatives au drag (2.5.7), taille minimale (2.5.8) et améliorée des cibles (2.5.5).

L’audit du dépôt est statique : WindowFrame, Desktop, ThreeDesktop3d, spatial-3d-bridge, MissionControlOverlay, KittyTerminalPane, wm-store, clipboard-store et agent-os-api. Les défauts ne sont pas présentés comme reproduits dans le navigateur.

Le prototype illustre rappel et échange des fenêtres sans remontage DOM, placement depuis l’en-tête, pause/reprise, sélection native, tiroirs simulés, périmètre préparé sans envoi et mémoire de disposition pendant la vie de la page. Il ne valide pas l’intégration Linux/WebGPU, la sélection projetée du terminal existant, la persistance durable, les performances ou les permissions des agents.

Le mouvement progressif de rétrécissement/inclinaison pendant le drag (BUR-03), le resize complet sur huit bords et le partage du centre sont spécifiés dans le plan, mais seulement esquissés ou absents de ce prototype. Voir validation.txt pour la portée des vérifications.
