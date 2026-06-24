# Rapport de préparation technique — agent/setup

Base : fork local du frontend `yugioh_web` (rickypeng99), fusionné dans la racine du projet
`D:\LAYET VM` en conservant l'historique git upstream (dernier commit upstream `b7d2f5e`).
Objectif : base locale propre et fonctionnelle, prête à devenir un jeu de cartes original
jouable contre un bot dans le navigateur. **Aucune règle n'a été modifiée. Aucun rebranding.
Aucun asset visuel généré/modifié. Pas de LitVM / wallet / NFT / multijoueur.**

---

## 1. Technologies utilisées

| Domaine | Outil / version |
| --- | --- |
| Build / scaffolding | Create React App (`react-scripts` 5.0.1) |
| UI lib | React 18.2 + ReactDOM 18.2 |
| State management | Redux 4.2 + react-redux 8 |
| Composants UI | @mui/material 5 (+ @emotion/react, @emotion/styled), semantic-ui-react 2 + semantic-ui-css |
| Réseau (multijoueur) | socket.io-client 4.6 |
| Animations | react-transition-group 4, `react-sky` 1.1 (⚠ peer React^16, incompatible React 18) |
| Runtime local | Node v24.16.0, npm 11.13.0 |

---

## 2. Fichiers principaux du moteur

État central = un seul objet **`environment`** : `environment[SIDE][LOCATION]`.
- `SIDE` = `MINE` / `OPPONENT` ; PV = `environment[side].hp`.
- `LOCATION` = `DECK`, `EXTRA_DECK`, `MONSTER_FIELD`, `SPELL_FIELD`, `HAND`, `GRAVEYARD` (`BANISHED` défini).

| Fichier | Rôle |
| --- | --- |
| `src/Core/index.js` | Agrège Battle, Summon, Misc, Utils, Effect, Constant |
| `src/Core/Battle/index.js` | Combats : attaque directe / sur monstre, calcul des dégâts, envoi cimetière |
| `src/Core/Summon/index.js` | Invocation normale/set + tribut. `summon_priorities = [2,3,1,4,0]` ⇒ **5 cases** |
| `src/Core/Effect/index.js` | Activation/chaînage d'effets, invocation fusion. Même `summon_priorities` pour les magies |
| `src/Core/Misc/index.js` | `draw_card_from_deck`, `move_cards_to_graveyard` |
| `src/Core/utils/index.js` | Requêtes sur l'état (matériaux de fusion, cartes sur le terrain, recherche par id…) |
| `src/Store/store.js` + `src/Store/reducers/*` | Redux : `environmentReducer`, `gameMetaReducer`, `battleMetaReducer`, `serverReducer`, `mouseReducer`, `toolReducer` |

**Données de cartes** : `src/Components/Card/Monster/MonsterData/index.js` (`monster_database`, 6 monstres E-HERO),
`src/Components/Card/Spell/SpellData/index.js` (`spell_database`, Polymerization),
`src/Components/Card/CardMeta.js` (id → `CARD_TYPE`),
`src/Components/Card/utils/constant.js` (CARD_TYPE / SIDE / ENVIRONMENT / ATTRIBUTE / CARD_POS),
`src/Components/Card/utils/utils.js` (`create_card`, `load_card_to_environment`).

**Tours & phases** : `src/Components/PlayerGround/utils/constant.js` (PHASE = DRAW/STANDBY/MP1/BATTLE/MP2/END) ;
boucle auto dans `src/Components/PlayerGround/Game.jsx` (`componentDidUpdate` + `auto_next_phase`) ;
alternance de tour dans `src/Store/reducers/gameMetaReducer.js` (sur `END_PHASE`, `current_turn` bascule).
⚠ **Aucun compteur de tour ni limite (8 tours) n'existe** — à créer.

**Terrain & main** : init dans `src/Components/PlayerGround/Game.jsx` → `initializeEnvironment()` :
`Array(5)` cases monstres + `Array(5)` magies, main = `slice(0,5)`, `hp: 8000`.
Grille d'affichage : `src/Components/PlayerGround/Field/utils/index.js` → `constructFieldFromEnv()` :
grille **14 cases/côté**, indices spéciaux `0`=terrain-magie, `6`=cimetière, `7`=extra deck, `13`=compteur deck.
Composants UI : `Field/Field.jsx`, `Field/Side/Side.jsx`, `Hand/Hand.jsx`, `HealthBar/HealthBar.jsx` (barre `/8000`),
`PhaseSelector/`, `CardSelector/`, `Settings/`, `Main/Main.jsx`, `Main/LeftPanel/`.

---

## 3. Dépendances au serveur (point clé pour le mode local)

- `src/Client/index.js` : `const socket = io("http://127.0.0.1:4001")` **créé dès l'import** du module
  (importé transitivement via `Core/Effect`). Écoute : `matched`, `receive_deck`, `opponent_summon`,
  `opponent_move_card_to_graveyard`, `opponent_change_phase`, `opponent_attack_start`,
  `opponent_attack_ack`, `opponent_card_activate`, `card_operate`, `opponent_card_operated`, `opponent_effect_ack`.
- `src/Client/Sender.js` : tous les `emit_*` (`exchange_deck`, `summon`, `move_card_to_graveyard`,
  `attack_start`, `attack_ack`, `change_phase`, `activate_effect`, `effect_ack`, `card_finish_operate`).
- Le **moteur appelle `emit_*` même pour les actions locales** (Summon, Misc, Effect, PhaseSelector, Game).
- `src/Components/Main/Main.jsx` : le **démarrage de la partie est entièrement conditionné au serveur** :
  il attend `opponent_id` (event `matched`), échange les decks, puis attend `opponent_deck`
  (event `receive_deck`) ; tant que ce n'est pas reçu il affiche `"Please wait for an opponent...."`.

➡ **Conséquence** : sans serveur, l'app **compile et se charge** (HTTP 200, titre « Yugioh Web »),
mais reste **bloquée sur l'écran d'attente**. Ce n'est **pas** une erreur de lancement, c'est le
comportement attendu de l'architecture multijoueur actuelle.

---

## 4. Erreurs corrigées (uniquement ce qui empêchait l'installation/le lancement)

1. **Install ERESOLVE** : `react-sky@1.1.0` (peer `react@^16`) vs `react@18.2` ⇒ `npm install` échouait.
   **Corrigé** en ajoutant `.npmrc` (`legacy-peer-deps=true`). `npm install` réussit désormais **sans flag** (exit 0).
2. **`.git` vide/invalide** à la racine `D:\LAYET VM` (faisait échouer toutes les commandes git) ⇒ retiré,
   puis dépôt cloné fusionné dans la racine en conservant l'historique upstream.
3. `yarn.lock` montrait un diff de fin de ligne (LF→CRLF) ⇒ restauré (on utilise npm, pas yarn).

**Aucune erreur de compilation** : `npm run build` réussit (exit 0), dev server répond HTTP 200.
Restent uniquement des **warnings ESLint non bloquants** (`eqeqeq`, `no-unused-vars`,
`import/no-anonymous-default-export`).

---

## 5. Risques techniques

- **react-sky incompatible React 18** : monté via `legacy-peer-deps`. `Main.jsx` rend `<Sky/>` sur l'écran de
  jeu → risque d'erreur runtime à surveiller ; remplacement/retrait conseillé à terme.
- `src/index.js` utilise `ReactDOM.render` (API legacy React 18, dépréciée → warning). Migrer vers `createRoot`.
- **Couplage fort moteur ↔ socket** : pour le mode local il faut neutraliser/rediriger `Sender.js` et
  débrancher le « gating serveur » de `Main.jsx`.
- **Bug latent** : `src/Core/Summon/index.js` importe `emit_tribute`, qui est **commenté (donc `undefined`)**
  dans `Sender.js`. Utilisé seulement dans du code commenté ⇒ inoffensif aujourd'hui, à corriger si on
  réactive le tribut réseau.
- **79 vulnérabilités npm** (transitives, typiques de react-scripts 5). **Ne pas** lancer
  `npm audit fix --force` (casserait CRA).
- Logique de jeu upstream **incomplète** (effets/chaînes partiels, traps « Developing… »).

---

## 6. Recommandation — match local contre un bot (sans WebSocket ni serveur permanent)

Approche conseillée : **couche d'adaptation locale**, sans toucher aux règles ni au moteur.

1. **Transport local** : créer un module exposant les mêmes `emit_*` que `Sender.js`, mais qui route les
   actions vers un bot local en mémoire (et déclenche directement les handlers `opponent_*`) au lieu d'émettre
   sur socket.io. Basculer via une variable d'env (ex. `REACT_APP_LOCAL=1`).
2. **Neutraliser le socket à l'import** : dans `src/Client/index.js`, court-circuiter `io(ENDPOINT)` en mode
   local par un socket factice (no-op) pour éviter les tentatives de connexion répétées.
3. **Débrancher le gating serveur** : dans `src/Components/Main/Main.jsx`, en mode local, fournir directement
   `my_id` / `opponent_id` / `player_starts` (mock) + un `opponent_deck` local, puis `dispatch initialize_meta`
   sans attendre `matched` / `receive_deck`.
4. **Bot/IA** : à son tour (`current_turn == opponent_id`), faire jouer le bot via les fonctions Core existantes
   (`Core.Summon.summon`, `Core.Battle.battle`, `change_phase`) côté `SIDE.OPPONENT`.

> ⚠ Ceci est de l'**analyse/préparation** — l'implémentation du bot n'est PAS faite (hors périmètre de cette tâche).

---

## 7. Fichiers que les prochains agents devront modifier (changements de règles)

| Règle cible | Fichier(s) à modifier | Détail précis |
| --- | --- | --- |
| **Deck de 18 cartes** | `src/Components/Main/Main.jsx` | `this.my_deck.deck` (tableau `heros`, actuellement **9**) + `extra_deck`. Ajouter les nouvelles cartes dans `MonsterData/index.js` + `SpellData/index.js` + `CardMeta.js`. |
| **Main initiale de 6 cartes** | `src/Components/PlayerGround/Game.jsx` | `initializeEnvironment()` : `HAND = slice(0,5)` → `slice(0,6)` (MINE **et** OPPONENT) ; ajuster `DECK = slice(5)` → `slice(6)`. |
| **4 emplacements de terrain** | `src/Components/PlayerGround/Game.jsx` (`Array(5)`→`Array(4)`) ; `src/Core/Summon/index.js` (`summon_priorities`) ; `src/Core/Effect/index.js` (`summon_priorities` magies) ; `src/Components/PlayerGround/Field/utils/index.js` (`constructFieldFromEnv` : `field_size`/indices spéciaux) ; CSS `Field/Side/Side.css` si layout figé. | Réduire à 4 cases monstres (décider du sort des cases magies). La grille d'affichage (14 cases) suppose des positions fixes → à recalibrer. |
| **2 000 PV** | `src/Components/PlayerGround/Game.jsx` (`hp: 8000` ×2) ; `src/Components/PlayerGround/HealthBar/HealthBar.jsx` (`/8000*100`). | Remplacer 8000 → 2000 aux deux endroits. |
| **Limite de 8 tours** | `src/Store/reducers/gameMetaReducer.js` (compteur sur `CHANGE_PHASE`/`END_PHASE`) + `src/Components/PlayerGround/Game.jsx` (fin de partie quand compteur = 8) ; init du compteur dans `Main.jsx` `raw_meta`. | **N'existe pas** : à créer entièrement. |

---

## 8. Commandes d'installation et de lancement

```bash
cd "D:\LAYET VM"
npm install        # le .npmrc gère le conflit react-sky (legacy-peer-deps)
npm start          # serveur de dev → http://localhost:3000
npm run build      # build de production → dossier build/
```

---

## 9. État livré

- Branche : **`agent/setup`** (historique upstream conservé).
- `npm install` ✅ (exit 0, sans flag) · `npm run build` ✅ (exit 0) · dev server ✅ (HTTP 200, « Yugioh Web »).
- Dossiers d'assets prêts (vides) : `assets/cards/artworks` (déjà présent, NON modifié), `assets/cards/frames`,
  `assets/elements`, `assets/ui`, `assets/backgrounds`, `assets/effects`.
- Sans serveur : écran « Please wait for an opponent…. » (comportement attendu).
- Dépôt serveur de référence cloné **hors projet** : `D:\_yugioh_server_ref` (non intégré, non committé).
- Les PNG sous `assets/cards/` et `assets/cards/artworks/` appartiennent à un autre agent : **non touchés, non committés**.
