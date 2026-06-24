# Rapport — Démo locale « Joueur vs Bot »

Branche : **`agent/local-demo`** (depuis `agent/setup` `d1f21a1`).
Objectif livré : une **première démo jouable dans le navigateur contre un bot**, entièrement
**hors-ligne** (aucun WebSocket, aucun serveur). Le moteur multijoueur d'origine est conservé
intact et reste accessible via un sélecteur de mode.

> Non réalisé (volontairement, hors périmètre) : Wallet/LitVM, NFT, smart contracts,
> multijoueur en ligne, WebSocket, rebranding final, animations avancées, nouveaux assets,
> déploiement Vercel.

---

## 1. Comment lancer la démo

```bash
cd "D:\LAYET VM"
npm install        # déjà fait ; .npmrc gère le conflit react-sky/React 18
npm start          # http://localhost:3000  -> cliquer sur « Local vs Bot »
```

Autres commandes :

```bash
npm run build                                          # build de production
$env:CI='true'; npx react-scripts test --watchAll=false   # tests (PowerShell Windows)
```

---

## 2. Règles implémentées (conformes à la demande)

| Règle | Implémentation |
| --- | --- |
| Deck de 18 cartes | `buildDefaultDeck()` = 3 × 6 personnages |
| Main initiale 6 | distribution de 6 cartes ; la pioche du 1er tour porte la main active à 7 |
| Pioche 1/tour | `beginActiveTurn()` pioche 1 carte au début de chaque tour |
| 4 emplacements | `config.fieldSlots = 4` ; terrain = 4 cases |
| 2 000 PV | `config.startingHp = 2000` |
| 1 invocation normale/tour | drapeau `flags.summonedThisTurn` |
| Attaque dès l'invocation | la carte invoquée a `attackedThisTurn = false` |
| 1 attaque/carte/tour | `attackedThisTurn` par carte |
| Max 8 tours | compteur `turn` (1→8, un tour = le tour d'un joueur) |
| Victoire immédiate à 0 PV | `resolveImmediateWin()` |
| Après le 8e tour : plus de PV gagne | `finishByHp()` |
| Égalité si PV égaux | `finishByHp()` → `RESULT.DRAW` |
| Max 3 exemplaires (normale) | `validateDeck()` |
| Max 1 légendaire | `validateDeck()` |
| Légendaire = 2 sacrifices | `summon()` (option `sacrificeInstanceIds`) |

**Combat (déterministe)** : attaquant > cible → cible détruite, dégâts = différence ;
attaquant < cible → attaquant détruit, dégâts = différence ; égalité → les deux détruits,
0 dégât ; attaque directe possible **uniquement** si le terrain adverse est vide.

**Note légendaire / math des 6 personnages** : avec seulement 6 personnages, atteindre
exactement 18 cartes en respectant « max 3 normales » + « max 1 légendaire » n'est possible
qu'avec un deck **100 % normal** (6 × 3 = 18). La mécanique légendaire (validation + coût de
2 sacrifices) est donc **implémentée et testée** (`SAMPLE_LEGENDARY`, tests unitaires) mais
n'apparaît pas dans le deck de test par défaut. Elle devient jouable dès qu'une 7e carte existe.

---

## 3. Personnages de test (données temporaires simples)

`src/LocalDemo/engine/cards.js` — champs : nom, élément, puissance, rareté, capacité (libellé
d'affichage, **sans effet** pour ce premier test), chemin d'illustration.

| Clé | Nom | Élément | Puissance | Rareté |
| --- | --- | --- | --- | --- |
| NYRA | Nyra | ELECTRIC | 500 | normal |
| PYRA | Pyra | FIRE | 600 | normal |
| NERIS | Neris | WATER | 450 | normal |
| GORAM | Goram | EARTH | 700 | normal |
| SYLVA | Sylva | NATURE | 400 | normal |
| NOX | Nox | SHADOW | 800 | normal |

---

## 4. Le bot (`src/LocalDemo/engine/bot.js`)

À son tour, le bot : **pioche** (automatique), **invoque** la meilleure carte normale
possible, **choisit une cible** (la plus forte carte qu'il peut battre) ou **attaque
directement** si le terrain adverse est vide (jamais d'attaque suicidaire), puis **termine
son tour**. 100 % déterministe. Côté UI, le tour du bot se déclenche tout seul (setTimeout
700 ms, garde anti-double via `botTurnRef`).

---

## 5. Protections (anti-triche / robustesse)

Toutes vérifiées par tests unitaires :

- plusieurs invocations normales dans le même tour → **refusé** ;
- attaque multiple d'une même carte → **refusé** ;
- terrain dépassant 4 cartes → **refusé** ;
- toute action après la fin du match → **refusée** ;
- dépassement de la limite de 8 tours → **impossible** (fin forcée par PV).

Les actions rejetées renvoient `{ ok: false, error }` ; l'UI affiche le message via
`game.lastError`.

---

## 6. Architecture & préservation du dépôt

- **Moteur pur** `src/LocalDemo/engine/` (cards / gameLogic / bot) : fonctions pures, aucune
  dépendance à React, Redux ou socket → testable et sans serveur.
- **UI** `src/LocalDemo/LocalDemo.jsx` + `.css` : `useReducer` au-dessus du moteur. Placeholders
  CSS colorés par élément ; `<img>` tente de charger l'illustration et **retombe** sur le
  placeholder si absente (`onError`).
- **Sélecteur de mode** `src/App.jsx` : « Local vs Bot » (immédiat) / « Multijoueur » (chargé en
  `React.lazy`).
- **Isolation du socket** `src/Components/Main/MultiplayerApp.jsx` : le `Provider` Redux + le
  store (qui importe `Core → Client → io(ENDPOINT)`) et la CSS semantic-ui sont **isolés** dans
  ce module chargé paresseusement. `src/index.js` rend `<App/>` **sans** importer le store.
  → En mode local, **aucune** connexion réseau n'est créée. Le build confirme le découpage :
  `main.js` perd 84,7 ko, le multijoueur part dans un chunk séparé (`662.*.js` 81,6 ko +
  `662.*.css` 98,8 ko, chargé seulement si on choisit le mode en ligne).
- Le composant `Main` multijoueur d'origine et le moteur `Core` ne sont **pas modifiés**.

### Intégration future des illustrations
Les cartes pointent vers `/assets/cards/artworks/<fichier>.png` (`ARTWORK_BASE` dans
`cards.js`). Ces fichiers vivent sous `assets/` à la racine (hors `public/` de CRA) : ils ne
sont donc pas encore servis et le placeholder CSS s'affiche. Pour les activer plus tard :
servir `assets/` en statique **ou** copier/lier `assets/cards/artworks/` dans `public/` — les
chemins resteront valides. (Aucun asset n'a été créé/modifié, conformément à la consigne.)

---

## 7. Fichiers ajoutés / modifiés

**Ajoutés**
- `src/LocalDemo/engine/cards.js`
- `src/LocalDemo/engine/gameLogic.js`
- `src/LocalDemo/engine/bot.js`
- `src/LocalDemo/engine/__tests__/engine.test.js`
- `src/LocalDemo/__tests__/render.test.js`
- `src/LocalDemo/LocalDemo.jsx`
- `src/LocalDemo/LocalDemo.css`
- `src/App.jsx`
- `src/App.css`
- `src/Components/Main/MultiplayerApp.jsx`
- `.agents/LOCAL_DEMO_REPORT.md` (ce fichier)

**Modifiés**
- `src/index.js` — rend `<App/>` sans importer le store (démo sans socket).
- `src/setupTests.js` — correction d'un import cassé pré-existant
  (`@testing-library/jest-dom/extend-expect`, paquet non installé) qui **bloquait tous les
  tests** ; jest-dom est désormais chargé seulement s'il est présent.

**Non touchés** : `assets/` (autre agent), moteur `Core`, store Redux, `Main.jsx`.

---

## 8. Résultats build & tests

- `npm run build` → **exit 0** (build de production OK ; découpage de code vérifié).
- Tests → **24 / 24 passés**, 2 suites (`engine.test.js` 22, `render.test.js` 2).
  - couverture : validation de deck, état initial, invocation + protections, sacrifices
    légendaires, combat (4 cas + attaque directe), fin de partie (victoire immédiate /
    limite de tours / égalité), décisions du bot, **simulation de matchs complets** sur
    plusieurs graines, rendu des composants.

---

## 9. Commits (branche `agent/local-demo`, non poussée)

1. `178e53d` — moteur pur + bot + tests.
2. `312c0ad` — UI jouable + sélecteur de mode (sans serveur).
3. (ce rapport) — documentation.

---

## 10. Prochaines étapes suggérées

- Servir/lier `assets/cards/artworks/` pour afficher les illustrations à la place des
  placeholders.
- Introduire une vraie carte légendaire (7e+ carte) pour activer la règle des 2 sacrifices
  dans un deck.
- Capacités déterministes simples par élément, puis effets plus riches.
- Choix aléatoire/équilibré du joueur qui commence ; sélection manuelle des sacrifices (UI).
