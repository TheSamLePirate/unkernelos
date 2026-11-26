# Applications unkernelOS : un état, des commandes, plusieurs présentations

Une application compatible publie son état structuré, toutes ses commandes et sa présentation de dock. L’interface, le dock et les agents appellent les mêmes fonctions. Le contexte et les actions sont partagés par défaut dans Horizon ; le propriétaire peut rendre la session privée depuis son tiroir.

## Créer une application sans dépendance

L’OS injecte `window.unkernelOS` dans les apps installées avec `app.install`. Le frontend est du HTML/JavaScript, éventuellement complété par du WebAssembly. Bun, Node, Rust ou un autre outil peut générer/construire ce frontend. Un backend natif n’est pas automatiquement inspectable : ses fonctionnalités doivent être reliées aux commandes publiées par le frontend.

Exemple complet : `examples/horizon-app/counter.html`. Les trois producteurs utilisent cette même interface :

```sh
# Dans le projet, avec les runtimes installés :
bun run examples/horizon-app/build.ts /tmp/compteur.html
# ou
node examples/horizon-app/build.mjs /tmp/compteur.html
# ou
rustc examples/horizon-app/build.rs -o /tmp/compteur
/tmp/compteur /tmp/compteur.html
```

Lorsque le fichier est dans Linux unkernelOS, l’agent l’installe ainsi :

```sh
osctl call app.install '{"id":"compteur","title":"Mon compteur","guestPath":"/tmp/compteur.html","open":true}'
```

`guestPath` désigne le système de fichiers Linux de la VM, pas celui de l’ordinateur hôte. L’autre possibilité est de passer le document directement dans `html`. `app.open` lance ensuite une app déjà installée.

## Publier les capacités

```js
let value = 0;
const app = unkernelOS.app.define({
  title: 'Mon compteur',
  document: 'counter:main',
  getState: () => ({ value }),
  getDock: () => ({
    label: 'Ajouter un',
    value: String(value),
    glyph: 'activity',
    primaryAction: 'increment',
  }),
  actions: {
    increment: {
      label: 'Ajouter un',
      paramsSchema: { type: 'object', properties: {} },
      run: () => {
        value++;
        document.querySelector('#value').textContent = value;
        return { value };
      },
    },
  },
});
document.querySelector('button').onclick = () => app.invoke('increment');
```

Chaque fonctionnalité doit posséder une action, avec un nom stable, un libellé, ses paramètres JSON Schema et une fonction qui valide les arguments. Les schémas sont découvrables ; la validation métier reste à implémenter dans `run`. Les boutons de l’app utilisent `app.invoke`, qui exécute la commande puis republie l’état. Un changement externe — réponse du backend, timer, événement média — appelle `app.publish()`.

`getState()` retourne des données clonables et sérialisables JSON. Il expose l’état utile de la session, sans objets DOM, fonctions, tokens ou mots de passe. `getStatus()` est optionnel (`live`, `paused`, `loading`, `disconnected`, `opaque`). Un état publié est limité à 256 Kio ; une app peut annoncer jusqu’à 100 commandes.

Le dock accepte `label`, `glyph`, `value`, `detail`, `progress` (0–1) et `primaryAction`. Les glyphes sont `play`, `pause`, `sun`, `cloud`, `rain`, `snow`, `activity`. La commande principale doit être une action publiée. Un lecteur expose play/pause ; une météo peut afficher son icône et sa température réelle. La réduction dans le dock conserve le composant et ses processus vivants.

Les apps React intégrées utilisent `useAppSurface` et `useSurfaceRevision` au lieu du bridge iframe. Sonora est l’exemple complet dans `src/components/apps/MusicPlayerApp.tsx`.

## Piloter depuis un agent

Le contrat est accessible dans l’OS via `osctl call app.sdk '{}'`. Les instructions injectées dans `~/AGENTS.md` et `~/CLAUDE.md` décrivent aussi la création et l’installation d’apps.

```sh
osctl call horizon.sessions '{}'
osctl call horizon.session.read '{"windowId":"music-…"}'
osctl call horizon.session.action '{"windowId":"music-…","action":"pause","expectedRevision":"révision lue","requestId":"requête-unique","args":{}}'
```

Les mêmes méthodes sont disponibles via MCP et `window.unkernelOS.call`. La découverte retourne les actions, leurs paramètres, la révision et la présentation du dock. La lecture retourne l’état et les éléments du tiroir de cette session. `expectedRevision` empêche d’agir sur un état périmé ; `requestId` évite de rejouer une opération en cas de retry. Relire après une commande ou un conflit.

Le partage est actif par défaut. Désactiver le partage dans le tiroir coupe la lecture et l’exécution par défaut. Les grants explicites existants restent utilisables jusqu’à leur expiration/révocation et peuvent limiter les éléments et les actions. Le mode privé global coupe également le partage par défaut. Le pare-feu OS conserve ses modes existants, notamment le mode lecture seule pour les appels guest/MCP.

Les apps HTML intégrées disposent aussi de `state.ui.controls`, de `state.ui.text` et des commandes `ui.activate`, `ui.input`, `ui.scroll`. Leurs identifiants désignent les contrôles de cette fenêtre. Les champs password, les zones `data-private` et les entrées cachées sont exclus. Une action sémantique reste préférable pour importer un fichier Linux ou piloter une opération complexe.

## Cycle de vie et limites concrètes

Le bridge vérifie la fenêtre émettrice et un identifiant propre au document. Un reload change cet identifiant, invalide les anciennes révisions et annule les requêtes en attente. Les appels expirent après 20 secondes pour une commande applicative, 30 secondes pour un appel OS. Le wildcard de `postMessage` est nécessaire pour le destinataire sandbox à origine opaque ; il est accompagné du contrôle de source et de document.

Une app qui ne publie pas le contrat reste opaque au niveau de son état interne. Un iframe externe ou un client Wayland n’expose pas automatiquement ses pixels comme un modèle de données. Le bridge n’installe pas automatiquement un environnement Bun/Node/Rust absent de la VM. Pour un backend HTTP déjà lancé dans Linux, `preview.url` fournit son URL de relais ; l’app doit encore implémenter son protocole et ses règles CORS.

Les permissions du navigateur restent applicables : un agent ne peut pas choisir arbitrairement un fichier sur l’hôte, et la lecture audio peut nécessiter un premier clic utilisateur. Les apps exposent donc des alternatives explicites (par exemple import Linux et erreurs de lecture retournées par Sonora).

Références : [messagerie entre fenêtres](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), [lecture média et erreurs de permission](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play), [fichiers Bun](https://bun.com/docs/runtime/file-io).
