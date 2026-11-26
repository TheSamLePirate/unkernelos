import type { PouleExample } from "./poule.ts";

export const CONTINGENCY_CRITIQUE_EXAMPLE: PouleExample = {
  id: "necessary-being-critique",
  level: "expert",
  title: "Contingence · critique et contre-modèles",
  blurb: "Deux mondes habités, aucun être nécessaire : pourquoi la contingence seule ne suffit pas",
  source: `(* CRITIQUE DE L'ARGUMENT DE CONTINGENCE

   Une déduction valide SOUS P1–P4 ne devient pas une preuve sans hypothèses.
   On ne peut pas réfuter sa validité en retirant une prémisse : on démontre
   plutôt que la conclusion ne suit PAS des prémisses qui restent.

   CONTRE-MODELE : deux individus, deux mondes possibles, tous deux HABITES.
                     Reel      Autre
     IndividuIci     existe    absent
     IndividuAilleurs absent   existe
   Chaque individu manque dans un monde : aucun n'est nécessaire.
   IndividuIci existe actuellement et peut manquer : P1 est vraie.
   L'objection ne suppose donc pas la possibilité d'un monde vide.

   SCENARIO A : aucune raison totale n'est attribuée à un individu.
     P1, P3 et P4 restent vraies ; P2 est fausse et la conclusion est fausse.
   SCENARIO B : IndividuIci porte la raison totale, sans sortir des contingents.
     P1, P2 et P4 restent vraies ; P3 est fausse et la conclusion est fausse.

   Les deux affectations de raison_totale sont des hypotheses LOCALES de
   théorèmes différents. On ne les affirme jamais ensemble comme axiomes.
   Les tests sémantiques vérifient leur cohérence et les prémisses conservées
   dans le langage exact de l'argument original.

   PORTEE : ces mondes sont des scénarios logiques, pas une description de
   la réalité. Ils réfutent l'inférence « contingent, donc nécessaire » sans
   prémisses supplémentaires. Ils ne prouvent ni que P2 ou P3 sont réellement
   fausses, ni qu'aucun être nécessaire n'existe réellement.
   La déduction complète de l'autre exemple conserve sa validité conditionnelle.

   Pour la discussion philosophique :
   https://plato.stanford.edu/entries/cosmological-argument/ (sections 5.3–5.4). *)

type Etre = IndividuIci | IndividuAilleurs
type Monde = Reel | Autre
pred existe : (Etre, Monde)
pred necessaire : (Etre)
pred contingent : (Etre)
pred membre_totalite : (Etre)
pred raison_totale : (Etre)

(*@ Etre : un individu du modèle — un individu potentiel, sans existence actuelle présupposée *)
(*@ Monde : un monde du modèle — l'un des deux scénarios possibles de cette interprétation logique *)
(*@ Reel : le monde actuel du modèle — le point où l'on évalue l'existence actuelle *)
(*@ Autre : l'autre monde du modèle — une possibilité alternative, également habitée *)
(*@ IndividuIci : l'individu d'ici — l'individu réalisé dans le monde actuel du modèle, absent de l'autre monde *)
(*@ IndividuAilleurs : l'individu d'ailleurs — l'individu réalisé dans l'autre monde, absent du monde actuel *)
(*@ existe(x, w) : {x} existe dans {w} — {x} est réalisé dans {w} selon la table d'existence *)
(*@ necessaire(x) : {x} est nécessaire dans ce modèle — le même individu {x} existe dans tous les mondes du modèle *)
(*@ contingent(x) : {x} est contingent dans ce modèle — {x} existe actuellement et manque dans au moins un monde possible *)
(*@ membre_totalite(x) : {x} appartient à la totalité des contingents — {x} est l'un des individus actuellement existants qui pourraient ne pas exister *)
(*@ raison_totale(x) : {x} porte une raison totale dans ce scénario — l'interprétation attribue à {x} l'explication du fait total de la contingence *)
(*@ def_necessaire : la même définition de nécessité que dans l'argument original *)
(*@ def_contingent : la même définition de contingence que dans l'argument original *)
(*@ def_totalite : la même définition de totalité que dans l'argument original *)
(*@ table_existence : la table d'existence du contre-modèle — chaque individu existe dans exactement un des deux mondes *)
(*@ profil_ici : la première ligne de cette table — l'individu d'ici existe dans Reel et manque dans Autre *)
(*@ profil_ailleurs : la seconde ligne de cette table — l'individu d'ailleurs existe dans Autre et manque dans Reel *)
(*@ contingence_sans_etre_necessaire : le contre-exemple à la contingence seule — il existe un contingent dans ce modèle, et aucun être nécessaire *)
(*@ deux_mondes_habites : le fait que les deux mondes sont habités — l'absence d'être nécessaire n'exige pas ici un monde vide *)
(*@ temoin_contingent : le témoin concret de P1 — l'individu d'ici est contingent *)
(*@ aucun_necessaire : l'absence de nécessité dans ce contre-modèle — chaque individu manque dans l'un des deux mondes *)
(*@ p4_satisfaite : la validité de P4 dans ce contre-modèle — tout individu actuel manque dans un monde possible *)
(*@ conclusion_originale_fausse : l'échec de la conclusion dans ce modèle — aucun individu n'y est à la fois nécessaire et porteur d'une raison totale *)
(*@ sans_raison_p2_echoue : le scénario A contre P2 — sans raison totale, P1 ne peut fournir l'explication exigée par P2 *)
(*@ sans_raison_p3_reste_vraie : la conservation de P3 dans le scénario A — aucune raison totale ne peut alors être un membre de la totalité *)
(*@ raison_interne_p2_satisfaite : la conservation de P2 dans le scénario B — une raison totale peut être attribuée à l'individu contingent d'ici *)
(*@ raison_interne_p3_echoue : le scénario B contre P3 — cette raison totale interne est elle-même membre des contingents *)

(* DEFINITIONS IDENTIQUES A CELLES DE L'ARGUMENT ORIGINAL. *)
axiom def_necessaire : forall (x : Etre).
  (necessaire(x) -> (forall (w : Monde). existe(x, w))) /\\
  ((forall (w : Monde). existe(x, w)) -> necessaire(x))

axiom def_contingent : forall (x : Etre).
  (contingent(x) -> existe(x, Reel) /\\ (exists (w : Monde). existe(x, w) -> Bottom)) /\\
  ((existe(x, Reel) /\\ (exists (w : Monde). existe(x, w) -> Bottom)) -> contingent(x))

axiom def_totalite : forall (x : Etre).
  (membre_totalite(x) -> contingent(x)) /\\ (contingent(x) -> membre_totalite(x))

(* SPECIFICATION DU MODELE, et non affirmations sur notre réalité. *)
axiom table_existence : forall (x : Etre).
  (existe(x, Reel) /\\ (existe(x, Autre) -> Bottom)) \\/
  ((existe(x, Reel) -> Bottom) /\\ existe(x, Autre))
axiom profil_ici : existe(IndividuIci, Reel) /\\ (existe(IndividuIci, Autre) -> Bottom)
axiom profil_ailleurs : (existe(IndividuAilleurs, Reel) -> Bottom) /\\ existe(IndividuAilleurs, Autre)

(* RESULTAT PRINCIPAL : P1 et la négation de l'existence d'un être nécessaire
   sont compatibles dans ce scénario précis. *)
theorem contingence_sans_etre_necessaire :
  (exists (x : Etre). contingent(x)) /\\ ((exists (x : Etre). necessaire(x)) -> Bottom) =
  (pack [Etre, IndividuIci,
     (snd (def_contingent [IndividuIci]))
       (fst profil_ici, pack [Monde, Autre, snd profil_ici])],
   fun (h : exists (x : Etre). necessaire(x)) =>
     unpack (h, x, hn,
       match table_existence [x] with
       | left ici => (snd ici) (((fst (def_necessaire [x])) hn) [Autre])
       | right ailleurs => (fst ailleurs) (((fst (def_necessaire [x])) hn) [Reel])))

theorem deux_mondes_habites :
  (exists (x : Etre). existe(x, Reel)) /\\ (exists (x : Etre). existe(x, Autre)) =
  (pack [Etre, IndividuIci, fst profil_ici],
   pack [Etre, IndividuAilleurs, snd profil_ailleurs])

theorem temoin_contingent : contingent(IndividuIci) =
  (snd (def_contingent [IndividuIci]))
    (fst profil_ici, pack [Monde, Autre, snd profil_ici])

theorem aucun_necessaire : forall (x : Etre). necessaire(x) -> Bottom =
  gen (x : Etre) => fun (hn : necessaire(x)) =>
    match table_existence [x] with
    | left ici => (snd ici) (((fst (def_necessaire [x])) hn) [Autre])
    | right ailleurs => (fst ailleurs) (((fst (def_necessaire [x])) hn) [Reel])

theorem p4_satisfaite : forall (x : Etre). existe(x, Reel) ->
  (exists (w : Monde). existe(x, w) -> Bottom) \\/ (forall (w : Monde). existe(x, w)) =
  gen (x : Etre) => fun (actuel : existe(x, Reel)) =>
    match table_existence [x] with
    | left ici => left pack [Monde, Autre, snd ici] : forall (w : Monde). existe(x, w)
    | right ailleurs => left pack [Monde, Reel, fst ailleurs] : forall (w : Monde). existe(x, w)

theorem conclusion_originale_fausse :
  (exists (x : Etre). necessaire(x) /\\ raison_totale(x)) -> Bottom =
  fun (h : exists (x : Etre). necessaire(x) /\\ raison_totale(x)) =>
    unpack (h, x, hx, aucun_necessaire [x] (fst hx))

(* SCENARIO A : la relation raison_totale est vide. L'hypothèse reste LOCALE. *)
theorem sans_raison_p2_echoue :
  (forall (x : Etre). raison_totale(x) -> Bottom) ->
  (((exists (x : Etre). contingent(x)) -> exists (y : Etre). existe(y, Reel) /\\ raison_totale(y)) -> Bottom) =
  fun (sans_raison : forall (x : Etre). raison_totale(x) -> Bottom) =>
  fun (p2 : (exists (x : Etre). contingent(x)) -> exists (y : Etre). existe(y, Reel) /\\ raison_totale(y)) =>
    (fun (r : exists (y : Etre). existe(y, Reel) /\\ raison_totale(y)) =>
      unpack (r, y, hy, sans_raison [y] (snd hy)))
    (p2 (fst contingence_sans_etre_necessaire))

theorem sans_raison_p3_reste_vraie :
  (forall (x : Etre). raison_totale(x) -> Bottom) ->
  forall (x : Etre). raison_totale(x) -> membre_totalite(x) -> Bottom =
  fun (sans_raison : forall (x : Etre). raison_totale(x) -> Bottom) =>
    gen (x : Etre) => fun (hr : raison_totale(x)) => fun (hm : membre_totalite(x)) =>
      sans_raison [x] hr

(* SCENARIO B : la raison est attribuée à IndividuIci. Ce n'est PAS un axiome
   ajouté au scénario A : l'hypothèse est locale à chacun des théorèmes suivants. *)
theorem raison_interne_p2_satisfaite : raison_totale(IndividuIci) ->
  ((exists (x : Etre). contingent(x)) -> exists (y : Etre). existe(y, Reel) /\\ raison_totale(y)) =
  fun (hr : raison_totale(IndividuIci)) => fun (observation : exists (x : Etre). contingent(x)) =>
    pack [Etre, IndividuIci, (fst profil_ici, hr)]

theorem raison_interne_p3_echoue : raison_totale(IndividuIci) ->
  ((forall (x : Etre). raison_totale(x) -> membre_totalite(x) -> Bottom) -> Bottom) =
  fun (hr : raison_totale(IndividuIci)) =>
  fun (p3 : forall (x : Etre). raison_totale(x) -> membre_totalite(x) -> Bottom) =>
    p3 [IndividuIci] hr ((snd (def_totalite [IndividuIci])) temoin_contingent)
`,
};
