# L’être nécessaire et la contingence

Dans **Preuves → Exemples → L’être nécessaire · la contingence**, le premier théorème présente l’argument principal. Six lemmes détaillent l’existence actuelle, la non-existence possible, l’incompatibilité entre nécessité et contingence, l’extériorité et la conclusion portant sur le même être dans tous les mondes. Chaque théorème dispose d’un arbre vérifié et d’un **Récit** en français. Les définitions sont modifiables dans le vocabulaire du récit et conservées dans le source Poule.

Cette formalisation pédagogique s’inspire de la *Monadologie*, §§ 36–39, où Leibniz cherche une raison suffisante du détail des contingences en dehors de cette série. Elle explicite les hypothèses retenues ; elle ne prétend pas reproduire toute sa métaphysique. [Texte de Leibniz](https://fr.wikisource.org/wiki/Monadologie/%C3%89dition_Gerhardt).

## Définitions et prémisses

- `existe(x, w)` : l’individu potentiel `x` existe dans le monde `w`. Quantifier sur un individu ne lui attribue pas une existence actuelle.
- `necessaire(x)` : le même individu existe dans tous les mondes possibles, dont le monde actuel `Reel`.
- `contingent(x)` : il existe actuellement et manque dans au moins un monde possible.
- `membre_totalite(x)` : il est l’un des êtres contingents ; aucun objet supplémentaire appelé « l’univers » n’est présupposé par ce prédicat.
- `raison_totale(x)` : il porte l’explication du fait total qu’il existe des êtres contingents.

Les prédicats `necessaire`, `contingent` et `membre_totalite` sont reliés à leurs formules par deux implications (`def_necessaire`, `def_contingent`, `def_totalite`). Les hypothèses philosophiques sont distinctes : P1 pose l’existence de contingents ; P2 demande une raison suffisante actuelle de leur fait total ; P3 exige que cette raison soit extérieure à la totalité. P4 ajoute explicitement une dichotomie modale classique au vérificateur constructif.

## Récit guidé

1. P1 et P2 donnent un être actuel qui porte l’explication totale.
2. Par P4, il existe dans tous les mondes ou manque dans un monde.
3. S’il manquait dans un monde, il serait contingent, donc membre de la totalité.
4. Cela contredirait P3. Il existe donc dans tous les mondes : il est nécessaire.

Poule vérifie cette conséquence logique des hypothèses, dont l’acceptation philosophique reste à discuter. En particulier, P2 dépasse une explication séparée de chaque contingent et P3 ne découle pas de la seule définition d’une collection. L’unicité de cet être et ses éventuels attributs divins exigeraient des arguments supplémentaires. [Discussion des prémisses et de la portée de l’argument](https://plato.stanford.edu/entries/cosmological-argument/).

## Vérification

`bun test test/poule-contingency.test.ts` vérifie les définitions, un modèle cohérent et des contre-modèles quand P1, P2 ou P3 est retirée. `POULE_BIN=/chemin/vers/poule bun run test:poule-contingency` fait vérifier les sept théorèmes par le vrai compilateur Poule et produit les sept récits dans `.cache/proof-qa/necessary-being-stories.txt`.
