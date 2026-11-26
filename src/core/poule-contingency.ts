import type { PouleExample } from "./poule.ts";

/** A conditional cosmological argument, with modal definitions and explicit PSR. */
export const CONTINGENCY_EXAMPLE: PouleExample = {
  id: "necessary-being",
  level: "expert",
  title: "L’être nécessaire · la contingence",
  blurb: "Leibniz : définitions modales, raison suffisante et hypothèses explicites, avec récit",
  source: `(* L'ETRE NECESSAIRE — ARGUMENT DE CONTINGENCE
   Formalisation pédagogique inspirée de Leibniz, Monadologie, §§ 36–39 :
   https://fr.wikisource.org/wiki/Monadologie/%C3%89dition_Gerhardt

   Nécessaire : un même être existe dans tous les mondes possibles.
   Contingent : il existe actuellement et pourrait ne pas exister.
   Quantifier sur Etre ne signifie pas affirmer une existence actuelle :
   celle-ci est exprimée par existe(x, Reel).

   HYPOTHESES PHILOSOPHIQUES, rendues explicites :
   P1. Il existe au moins un être contingent.
   P2. Le fait total qu'il existe des êtres contingents a une raison suffisante,
       portée par un être actuel. C'est une version FORTE du principe :
       expliquer chaque membre séparément ne suffit pas à justifier P2.
   P3. Cette raison totale est extérieure à l'ensemble des contingents.
       Cette exigence d'extériorité est une prémisse discutée, pas un théorème.
   P4. Pour un être actuel : existence dans tous les mondes OU absence dans
       au moins un monde. C'est un principe de logique modale CLASSIQUE,
       ajouté explicitement au noyau constructif de Poule.

   RECIT GUIDE : P1 et P2 donnent un être actuel qui explique le fait total.
   Par P4, cet être existe dans tous les mondes, ou manque dans un monde.
   Dans le second cas il serait contingent, donc membre de la totalité.
   Cela contredirait P3. Il existe donc dans tous les mondes : il est nécessaire.

   Poule vérifie la déduction SOUS ces hypothèses. Leur vérité métaphysique
   reste à discuter. L'unicité, la personnalité et les attributs divins
   demanderaient des arguments supplémentaires.

   Les constructeurs ci-dessous fournissent des noms potentiels, sans leur
   attribuer d'existence actuelle. La preuve ne fait aucun raisonnement par
   énumération de ces noms ni aucune induction sur leur construction. *)

type Etre = Temoin | AutreEtre of Etre
type Monde = Reel | AutreMonde of Monde
pred existe : (Etre, Monde)
pred necessaire : (Etre)
pred contingent : (Etre)
pred membre_totalite : (Etre)
pred raison_totale : (Etre)

(* DEFINITIONS POUR LE RECIT — modifiables dans « Vocabulaire du récit ». *)
(*@ Etre : un être — un individu potentiel du domaine, dont l'existence actuelle n'est pas présupposée *)
(*@ Monde : un monde possible — une situation complète considérée comme métaphysiquement possible dans ce modèle *)
(*@ Reel : notre monde actuel — le monde où nous évaluons l'existence actuelle *)
(*@ Temoin : un nom potentiel — ce nom ne présuppose pas que son référent existe actuellement *)
(*@ AutreEtre(x) : un autre nom d'être — le constructeur fournit des noms, sans affirmer leur existence actuelle *)
(*@ AutreMonde(w) : un autre nom de monde — un nom supplémentaire dans le domaine des mondes possibles *)
(*@ existe(x, w) : {x} existe dans {w} — l'individu {x} est réalisé dans {w} *)
(*@ necessaire(x) : {x} existe nécessairement — le même individu {x} existe dans tous les mondes possibles, y compris le monde actuel *)
(*@ contingent(x) : {x} est contingent — {x} existe actuellement et il existe un monde possible où {x} n'existe pas *)
(*@ membre_totalite(x) : {x} appartient à la totalité des contingents — {x} est l'un des êtres actuellement existants qui pourraient ne pas exister *)
(*@ raison_totale(x) : {x} explique le fait total de la contingence — {x} porte une explication de l'existence de l'ensemble des êtres contingents, et pas seulement d'un membre particulier *)
(*@ def_necessaire : la définition de l'existence nécessaire — existence du même être dans tous les mondes possibles *)
(*@ def_contingent : la définition de la contingence — existence actuelle accompagnée d'une possibilité de non-existence *)
(*@ def_totalite : la définition de la totalité des contingents — ses membres sont exactement les êtres contingents *)
(*@ p1_contingence : l'hypothèse P1 — il existe au moins un être contingent *)
(*@ p2_raison_suffisante : l'hypothèse de raison suffisante P2 — dès qu'il y a des contingents, leur fait total possède une explication portée par un être actuel *)
(*@ p3_exteriorite : l'hypothèse d'extériorité P3 — aucun membre de la totalité ne porte l'explication totale de cette même totalité *)
(*@ p4_modalite_classique : la dichotomie modale classique P4 — un être actuel existe dans tous les mondes ou manque dans au moins un monde possible *)
(*@ etre_necessaire_et_raison : le résultat de l'argument de contingence sous P1 à P4 — il existe un être nécessaire qui porte l'explication totale *)
(*@ necessaire_existe_actuellement : le lemme d'existence actuelle — ce qui existe dans tous les mondes existe dans le monde actuel *)
(*@ contingent_existe_actuellement : le lemme d'actualité du contingent — être contingent inclut le fait d'exister actuellement *)
(*@ contingent_peut_manquer : le lemme de non-existence possible — un être contingent manque dans au moins un monde possible *)
(*@ necessaire_exclut_contingent : l'incompatibilité entre nécessité et contingence — le même être ne peut pas exister partout et manquer quelque part *)
(*@ raison_totale_exclut_contingent : le lemme d'extériorité — sous P3, une raison totale ne peut être contingente *)
(*@ un_meme_etre_dans_tous_les_mondes : la conclusion modale — un seul et même témoin existe dans chaque monde possible *)

(* DEFINITIONS FORMELLES : Poule n'a pas de macro de prédicat ; chaque
   abréviation est donc reliée à sa formule par les deux implications. *)
axiom def_necessaire : forall (x : Etre).
  (necessaire(x) -> (forall (w : Monde). existe(x, w))) /\\
  ((forall (w : Monde). existe(x, w)) -> necessaire(x))

axiom def_contingent : forall (x : Etre).
  (contingent(x) -> existe(x, Reel) /\\ (exists (w : Monde). existe(x, w) -> Bottom)) /\\
  ((existe(x, Reel) /\\ (exists (w : Monde). existe(x, w) -> Bottom)) -> contingent(x))

axiom def_totalite : forall (x : Etre).
  (membre_totalite(x) -> contingent(x)) /\\ (contingent(x) -> membre_totalite(x))

(* LES QUATRE PREMISSES — aucune n'affirme directement la conclusion. *)
axiom p1_contingence : exists (x : Etre). contingent(x)

axiom p2_raison_suffisante :
  (exists (x : Etre). contingent(x)) ->
  exists (y : Etre). existe(y, Reel) /\\ raison_totale(y)

axiom p3_exteriorite : forall (x : Etre).
  raison_totale(x) -> membre_totalite(x) -> Bottom

axiom p4_modalite_classique : forall (x : Etre). existe(x, Reel) ->
  (exists (w : Monde). existe(x, w) -> Bottom) \\/ (forall (w : Monde). existe(x, w))

(* PREUVE PRINCIPALE : le premier théorème chargé dans l'interface. *)
theorem etre_necessaire_et_raison : exists (x : Etre). necessaire(x) /\\ raison_totale(x) =
  (fun (r : exists (y : Etre). existe(y, Reel) /\\ raison_totale(y)) =>
    unpack (r, x, hx,
      match p4_modalite_classique [x] (fst hx) with
      | left absence =>
          abort (p3_exteriorite [x] (snd hx)
            ((snd (def_totalite [x]))
              ((snd (def_contingent [x])) (fst hx, absence))))
          : exists (x : Etre). necessaire(x) /\\ raison_totale(x)
      | right partout =>
          pack [Etre, x, ((snd (def_necessaire [x])) partout, snd hx)]))
    (p2_raison_suffisante p1_contingence)

(* LEMMES PEDAGOGIQUES : choisir chacun dans les onglets de théorèmes
   permet de lire son arbre et son propre récit. *)
theorem necessaire_existe_actuellement : forall (x : Etre).
  necessaire(x) -> existe(x, Reel) =
  gen (x : Etre) => fun (hn : necessaire(x)) =>
    ((fst (def_necessaire [x])) hn) [Reel]

theorem contingent_existe_actuellement : forall (x : Etre).
  contingent(x) -> existe(x, Reel) =
  gen (x : Etre) => fun (hc : contingent(x)) =>
    fst ((fst (def_contingent [x])) hc)

theorem contingent_peut_manquer : forall (x : Etre).
  contingent(x) -> exists (w : Monde). existe(x, w) -> Bottom =
  gen (x : Etre) => fun (hc : contingent(x)) =>
    snd ((fst (def_contingent [x])) hc)

theorem necessaire_exclut_contingent : forall (x : Etre).
  necessaire(x) -> contingent(x) -> Bottom =
  gen (x : Etre) => fun (hn : necessaire(x)) => fun (hc : contingent(x)) =>
    (fun (absence : exists (w : Monde). existe(x, w) -> Bottom) =>
      unpack (absence, w, manque, manque (((fst (def_necessaire [x])) hn) [w])))
    (contingent_peut_manquer [x] hc)

theorem raison_totale_exclut_contingent : forall (x : Etre).
  raison_totale(x) -> contingent(x) -> Bottom =
  gen (x : Etre) => fun (hr : raison_totale(x)) => fun (hc : contingent(x)) =>
    p3_exteriorite [x] hr ((snd (def_totalite [x])) hc)

(* L'ordre des quantificateurs est essentiel : le MEME être existe partout.
   Ce résultat est plus précis que « dans chaque monde, quelque chose existe ». *)
theorem un_meme_etre_dans_tous_les_mondes : exists (x : Etre). forall (w : Monde). existe(x, w) =
  unpack (etre_necessaire_et_raison, x, hx,
    pack [Etre, x, (fst (def_necessaire [x])) (fst hx)])
`,
};
