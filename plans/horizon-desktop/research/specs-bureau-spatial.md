# Bureau spatial et contextuel

Spécifications fonctionnelles

## 1. Expérience cible

L’utilisateur lance ses applications depuis un bureau qui occupe tout l’écran. Il travaille au centre et garde d’autres fenêtres visibles et actives dans deux zones latérales en perspective. Il retrouve autour de chaque fenêtre les éléments utiles à sa tâche et peut confier à un agent une action sur cette même session.

Les gestes de base sont **ouvrir, repousser, surveiller, agir et reprendre**. Une fenêtre déplacée vers un bord poursuit son activité et conserve son état.

## 2. Bureau et navigation spatiale

| ID | Exigence |
| --- | --- |
| BUR-01 | Le lanceur permet de rechercher et d’ouvrir une application, de retrouver ses fenêtres ouvertes et de choisir la fenêtre à amener au centre. Si l’app peut ouvrir une nouvelle fenêtre, l’utilisateur peut demander explicitement cette action. |
| BUR-02 | La zone centrale accueille une fenêtre principale ou plusieurs fenêtres côte à côte. L’utilisateur ajuste la disposition et voit quelle fenêtre reçoit ses entrées. |
| BUR-03 | En glissant vers un bord, la fenêtre s’éloigne visuellement, rétrécit et s’incline progressivement. Au bout du geste, elle rejoint le dock de gauche ou de droite. Le mouvement inverse rend la fenêtre à sa taille de travail. |
| BUR-04 | L’utilisateur choisit le côté, réordonne les fenêtres et peut les rappeler au centre d’un clic ou au clavier. Les deux côtés sont disponibles librement pour organiser le travail. |
| BUR-05 | Le retour au centre retrouve la même fenêtre et la même session, avec le document, la navigation, la sélection et l’activité en cours, dans la mesure où l’application les conserve. |
| BUR-06 | Une liste des fenêtres permet d’identifier et de rappeler directement celles qui se chevauchent ou sont trop éloignées pour être distinguées. Les gestes de déplacement et de retour ont un équivalent clavier. Un mode à animations réduites conserve les mêmes destinations et commandes. |

## 3. Fenêtres latérales en direct

| ID | Exigence |
| --- | --- |
| VIV-01 | Toute fenêtre latérale annoncée comme **en direct** continue de montrer les mises à jour de son contenu pendant que l’utilisateur travaille au centre. Une vidéo, un journal ou une simulation qui évolue doit rester visiblement animé jusque dans le dock. |
| VIV-02 | Le passage du centre au côté conserve la continuité de l’activité et du rendu. Le bureau adapte le niveau de détail à la taille visible et préserve la réactivité du centre. |
| VIV-03 | Aux tailles qui le permettent, l’utilisateur clique et fait défiler le contenu directement sur la surface en perspective. L’interaction cible la bonne fenêtre et le contrôle situé sous le pointeur. Le focus clavier est explicite. Les interactions que l’app ne prend pas en charge sur le côté sont accessibles en ramenant la fenêtre au centre. |
| VIV-04 | Une app intégrée peut proposer une présentation compacte à mesure que sa fenêtre recule. Cette présentation reste vivante, reflète la même session et conserve les commandes essentielles. Un lecteur affiche par exemple la piste en cours et le bouton pause. |
| VIV-05 | Le bureau indique les capacités disponibles pour chaque fenêtre. Une interruption du direct ou une déconnexion est signalée sur la carte. Si une dernière image reste visible, son état figé est identifiable et la récupération du direct se reflète dans l’interface. |

## 4. Tiroirs et presse-papiers contextuels

| ID | Exigence |
| --- | --- |
| TIR-01 | Chaque fenêtre dispose d’un tiroir indépendant, accessible depuis le centre et depuis sa carte latérale. L’utilisateur peut aussi retrouver les éléments de plusieurs fenêtres depuis une vue regroupée par application. |
| TIR-02 | Le tiroir accepte du texte, des images, des liens et des fichiers. L’utilisateur peut y déposer, épingler, rechercher, réutiliser ou supprimer un élément. Les éléments copiés peuvent être repris depuis le tiroir d’une autre fenêtre. |
| TIR-03 | Lorsqu’une copie peut être attribuée à la fenêtre source, elle rejoint son historique. L’utilisateur peut toujours choisir explicitement un tiroir de destination. Une provenance incertaine est signalée et peut être corrigée. |
| TIR-04 | Chaque entrée indique sa provenance connue, par exemple l’application, le document, l’URL, la fenêtre ou la sélection. L’utilisateur peut revenir à la source si elle reste accessible. |
| TIR-05 | Pour une app qui identifie durablement un document ou une session, l’utilisateur peut retrouver le tiroir associé lors d’une réouverture. Deux sessions de la même application gardent des tiroirs distincts. |
| TIR-06 | L’utilisateur peut transmettre à un agent des éléments précis du tiroir. Le choix des éléments à partager est visible avant leur transmission. |

## 5. Contexte et actions des applications

Chaque application intégrée expose une surface commune au bureau et aux agents. Ses capacités sont déclarées pour l’application entière ou pour une fenêtre, un document ou une session précise.

| ID | Exigence |
| --- | --- |
| CTX-01 | Le bureau connaît les fenêtres ouvertes, leur disposition, le focus, leur rattachement à une session et les capacités disponibles. Il indique si une donnée vient de l’application ou d’une observation du bureau. |
| CTX-02 | Une app intégrée décrit son état courant de manière structurée. Selon son usage, elle expose le document actif, la sélection, la progression d’une opération et ses résultats. Elle publie les changements observables par le bureau et les agents autorisés. |
| CTX-03 | Une app intégrée déclare les actions qu’elle rend accessibles de l’extérieur, avec leur cible, leurs paramètres, leurs conditions de disponibilité et leurs résultats attendus. Les actions utiles restent disponibles pendant que la fenêtre est sur le côté. |
| CTX-04 | Le bureau peut présenter une action sous forme de commande. Un agent peut demander la même action sur la même cible, et l’app publie le nouvel état visible pour l’utilisateur. |
| CTX-05 | Une action peut être acceptée, en cours, terminée, échouée ou refusée. Si le document ou la sélection a changé depuis la lecture de l’agent, l’app signale le changement avant d’exécuter une action qui dépendait de cet état. |
| CTX-06 | Pour une app sans intégration, le bureau utilise les capacités qu’il peut observer. Les informations et les actions indisponibles sont identifiables dans la fenêtre et dans le contexte présenté à l’agent. |

## 6. Agent et reprise du travail

| ID | Exigence |
| --- | --- |
| AGT-01 | L’utilisateur choisit le périmètre de travail d’un agent, par exemple une fenêtre, une session ou un espace regroupant plusieurs fenêtres. Il peut voir et modifier les éléments auxquels l’agent a accès. |
| AGT-02 | L’agent peut consulter l’état accessible, suivre son évolution et demander les actions autorisées sur une cible explicite. L’interface affiche ce que l’agent a demandé, la cible et le résultat. |
| AGT-03 | L’utilisateur garde la main pendant l’activité de l’agent. Il peut interrompre sa participation, retirer un accès ou annuler une opération lorsque l’application offre cette possibilité. |
| REP-01 | L’utilisateur peut enregistrer un espace de travail et le reprendre avec la disposition de ses fenêtres, les documents ou sessions identifiés et leurs tiroirs. Si une app ou un document est indisponible, le bureau indique ce qui reste à rouvrir. |
| REP-02 | Un historique consultable permet de revenir à un événement utile, comme l’ouverture d’un document, l’ajout d’un extrait au tiroir ou le résultat d’une action. L’utilisateur peut effacer des entrées et choisir les éléments d’historique qu’il partage. |

## 7. Scénarios d’acceptation

1. **Surveiller en périphérie.** Depuis le lanceur, ouvrir un éditeur, un journal animé et une simulation. Repousser le journal à gauche et la simulation à droite. Continuer d’écrire au centre pendant que les deux fenêtres latérales se mettent à jour, puis ramener le journal au centre sans interrompre son déroulement.
2. **Agir sur place.** Mettre en pause une simulation depuis sa vue compacte. Vérifier que l’image et l’état exposé passent en pause. Reprendre depuis le centre au même instant simulé.
3. **Retrouver ses copies.** Ouvrir deux documents de la même application, copier un extrait depuis chacun et y ajouter un lien. Vérifier les deux tiroirs distincts, réutiliser un extrait dans l’autre fenêtre, puis fermer et rouvrir l’un des documents pour retrouver son tiroir.
4. **Partager un contexte précis.** Donner à un agent l’accès à une seule simulation et à un scénario choisi dans son tiroir. L’agent charge ce scénario dans la bonne session. La trajectoire change en direct sur la carte et l’interface affiche le résultat de l’action.
5. **Récupérer après une interruption.** Interrompre le direct d’une fenêtre latérale. Vérifier que la carte signale l’interruption, que la fenêtre peut être ramenée au centre et que le statut redevient actif lorsque les mises à jour reprennent.
6. **Reprendre un espace de travail.** Fermer puis restaurer un espace contenant plusieurs fenêtres. Vérifier leur placement, la réassociation des tiroirs et le signalement explicite d’un document indisponible.
