# Sonora — lecteur MP3 d’unkernelOS

Ouvrir **Musique / Sonora** dans le dock ou le lanceur (`wm.open` avec `appId: "music"`). Sonora lit de vrais fichiers audio avec le moteur média du navigateur. Sa platine est un décor animé pendant la lecture, pas une analyse du signal.

- Ajouter plusieurs fichiers depuis l’hôte ou les déposer dans la fenêtre.
- Importer un chemin Linux ou une URL HTTP(S) avec le bouton dossier de la collection.
- Ouvrir un MP3 depuis l’explorateur Linux : il est routé vers Sonora.
- Lire, mettre en pause, choisir une piste, avancer/revenir, chercher une position et régler le volume ou le mute.
- Rechercher dans la collection ; activer l’aléatoire ou la répétition off/all/one ; retirer des titres.
- Glisser la fenêtre jusqu’à l’extrémité gauche/droite, ou utiliser ses commandes de docking. Son élément devient play/pause et affiche le titre courant et sa progression. La même instance audio continue de jouer.

La bibliothèque et les blobs audio sont conservés séparément dans IndexedDB `unkernelos-sonora`. Les tags texte ID3v2 supportés fournissent titre/artiste/album ; les noms de fichiers servent de repli. Une nouvelle session retrouve les fichiers conservés, en pause. Les erreurs de quota ou de stockage indiquent une conservation en mémoire uniquement ou interrompue. Les URLs distantes restent dépendantes de leur source et du réseau.

Le MP3 et les autres formats audio décodables par le navigateur sont acceptés. Un fichier invalide ou un codec indisponible produit une erreur. Si le navigateur refuse `play()`, Sonora le signale et demande un clic ; l’interface n’annonce pas une lecture qui n’a pas démarré.

## Actions agent

Le contexte est partagé par défaut, comme pour les autres apps compatibles. Les actions suivantes correspondent aux commandes du lecteur :

| Action | Paramètres |
| --- | --- |
| `play`, `pause`, `toggle` | Aucun |
| `next`, `previous` | Aucun |
| `seek` | `seconds` |
| `volume` | `value` de 0 à 1 |
| `mute` | `muted` booléen |
| `shuffle` | `enabled` booléen |
| `repeat` | `mode`: `off`, `all`, `one` |
| `select` | `id`, `play` optionnel |
| `import` | `path` Linux ou `url` HTTP(S) |
| `remove` | `id` |
| `clear` | Aucun ; vide la bibliothèque |

Découvrir les sessions avec `horizon.sessions`, lire avec `horizon.session.read`, puis appeler `horizon.session.action` avec la révision et un requestId unique. Les horloges de lecture sont des données de suivi ; elles ne changent pas à elles seules la révision sémantique des commandes.

Le sélecteur de fichiers de l’hôte nécessite l’utilisateur. Un agent utilise `import` avec un fichier Linux ou une URL. Les touches média sont reliées à Media Session quand le navigateur les prend en charge.

## Vérifier

```sh
bun run typecheck
bun test test
bun run build
```

Le script `bun run test:sonora-browser` utilise un **profil Chromium isolé** sur CDP 9333 et réinitialise sa bibliothèque de test. Il attend deux MP3 de test dans `.cache/sonora-qa/` et les sorties des trois exemples sous `/tmp/sonora-example-{bun,node,rust}.html`. Les MP3 de validation ont été générés localement avec FFmpeg (signaux de test, aucun morceau téléchargé).

Le rapport et les captures du lecteur réel sont produits dans `.cache/sonora-qa/`. Le contrôle des touches matérielles et des appareils audio physiques n’est pas certifié par le test headless.

Le contrat réutilisable et les exemples sont décrits dans [app-sdk.md](app-sdk.md).

Préparer les fixtures locales (FFmpeg et Rust doivent être installés sur la machine de test) :

```sh
mkdir -p .cache/sonora-qa
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=220:duration=24' -c:a libmp3lame -b:a 96k -metadata title='Signal Study No. 1' -metadata artist='unkernelOS · signal de test' -metadata album='Studio sessions' -y .cache/sonora-qa/signal-one.mp3
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=330:duration=18' -c:a libmp3lame -b:a 96k -metadata title='Signal Study No. 2' -metadata artist='unkernelOS · signal de test' -metadata album='Studio sessions' -y .cache/sonora-qa/signal-two.mp3
bun run examples/horizon-app/build.ts /tmp/sonora-example-bun.html
node examples/horizon-app/build.mjs /tmp/sonora-example-node.html
rustc examples/horizon-app/build.rs -o /tmp/horizon-counter
/tmp/horizon-counter /tmp/sonora-example-rust.html
```

Lancer ensuite le serveur `bun run dev` et un Chromium avec un profil dédié `--user-data-dir=/tmp/unkernel-sonora-qa --remote-debugging-port=9333`, puis exécuter le script navigateur. Les captures illustrent des signaux de test, pas une bibliothèque fournie avec le produit.
