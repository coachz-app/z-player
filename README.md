# Z Player

Lecteur vidéo réutilisable pour le streaming HLS, construit sur [Mux Player](https://www.mux.com/player) (media-chrome + hls.js). Utilisé par Coach Z, utilisable dans n'importe quel projet React ou JavaScript.

## Ce qu'il apporte

| Domaine | Fonction |
|---|---|
| Streaming | qualité adaptative, plafonnée à la taille du lecteur ; rien n'est téléchargé avant la lecture ; CMCD (le CDN sert mieux chaque spectateur) ; **économie de données** (`maxResolution`) |
| Live | faible latence (flux Mux en mode `low`), **DVR** (`streamType: 'live:dvr'` : revenir en arrière jusqu'au début, `goLive()` pour revenir au direct), signal `onLiveEnded` quand le flux s'arrête (bascule vers le replay) |
| Synchronisation | `onTimeUpdate` (position, retard sur le direct), `onLiveEdgeChange`, `getState()`, `seek()` : pour rejouer un chat au bon moment ou afficher son propre bouton « Revenir au direct » |
| Confort | aperçus au survol de la barre (storyboards Mux), sous-titres, vitesses 0,75–2×, plein écran, image dans l'image, AirPlay, Chromecast, raccourcis clavier |
| Application | interface en français, thème aux couleurs du projet, **reprise de position** (`startTime` + `onProgress` toutes les 10 s, à la pause, à la fin, quand la page est masquée ou fermée et en quittant), **une seule vidéo à la fois** sur la page |
| Mesure | Mux Data intégré (`analytics.envKey`, identifiant de vidéo et de spectateur, mis à jour sur place s'il arrive après le montage) |
| Lecture signée | `tokens` (vidéo, vignette, aperçus) fournis par votre serveur ; un nouveau jeton ne reconstruit pas le lecteur (voir plus bas) |

## Installation

Chaque version est publiée en archive sur les [releases](https://github.com/coachz-app/z-player/releases) (aucun compte ni jeton nécessaire) :

```bash
npm install https://github.com/coachz-app/z-player/releases/download/v0.4.0/coachz-app-z-player-0.4.0.tgz
```

## React

```tsx
import { lazy, Suspense } from 'react'
const ZPlayer = lazy(() => import('@coachz-app/z-player/react'))

<Suspense fallback={<div className="aspect-video bg-black" />}>
  <ZPlayer
    source={{ playbackId: 'abc123', tokens: { playback, thumbnail, storyboard } }}
    title="Négocier en position de faiblesse"
    poster={thumbnailUrl}
    startTime={savedPosition}
    maxResolution="1080p"
    theme={{ accent: '#FFA500' }}
    analytics={{ envKey: MUX_DATA_ENV_KEY, videoId: 'content:12', viewerId: '42' }}
    onProgress={(position, duration) => save(position, duration)}
    onEnded={playNext}
  />
</Suspense>
```

Live : `source={{ playbackId }}` + `streamType="live:dvr"` (retour en arrière possible) ou `streamType="live"` (toujours au direct) + `onLiveEnded={reload}`. L'ancienne écriture `live` (DVR par défaut, `dvr={false}` pour le désactiver) reste acceptée.

Mux Player n'a plus de valeur `live:dvr` : Z Player la traduit en `stream-type="live"` + `target-live-window="Infinity"` (fenêtre de 0 pour `live`), comme le recommande la documentation de Mux. La barre de progression permet alors de revenir en arrière, et le bouton « Direct » de Mux Player ramène au direct.

### Suivre la lecture (direct et replay)

```tsx
const player = useRef<ZPlayerHandle | null>(null)

<ZPlayer
  source={{ playbackId }}
  streamType="live:dvr"
  handleRef={player}
  onLiveEdgeChange={(atLive) => setBehind(!atLive)}
  onTimeUpdate={({ position }) => chat.syncTo(position)}
/>
{behind && <button onClick={() => player.current?.goLive()}>Revenir au direct</button>}
```

`onTimeUpdate` reçoit `{ position, duration, live, behindLive, atLiveEdge, paused }` environ 4 fois par seconde pendant la lecture et après chaque déplacement. `position` est en secondes depuis le début de la vidéo ; pendant un direct avec DVR, depuis le début du flux. Un spectateur est « au direct » à moins de `LIVE_EDGE_TOLERANCE_S` (10 s) du bord. `onLiveEdgeChange` n'est appelé qu'aux changements. Le même état est lisible à tout moment avec `getState()` ; `seek(secondes)` déplace la lecture (borné à ce qui est accessible) ; `goLive()` revient au bord du direct et relance la lecture.
Une URL quelconque (HLS ou MP4) : `source={{ src: 'https://…/video.m3u8' }}`.

Reprise de position : `onProgress` est aussi appelé quand la page passe en arrière-plan (`visibilitychange`) ou se ferme (`pagehide`). Envoyez alors la position avec `fetch(url, { method: 'PUT', keepalive: true, … })` : sans `keepalive`, le navigateur annule la requête quand la page se ferme.

Mux Data : `title` et les identifiants `analytics` (`viewerId`, `videoId`, `playerName`) sont mis à jour dans la vue en cours, sans reconstruire le lecteur ; on peut donc monter le lecteur avant de connaître l'utilisateur (profil encore en chargement). `envKey`, `cookies` et `analytics={false}` ne s'appliquent qu'à un nouveau lecteur.

Jetons signés : le lecteur n'est reconstruit que si la vidéo change (`playbackId` ou `src`, type de flux, `autoplay`). Un nouveau jeton pour la même vidéo (votre API en signe un à chaque requête) est appliqué sur place, et seulement quand le jeton en cours expire dans moins de 5 minutes : remplacer le jeton vidéo recharge le flux, Z Player garde alors la position et la lecture en cours.

## JavaScript

```js
import { createZPlayer } from '@coachz-app/z-player'

const player = createZPlayer(document.querySelector('#player'), { source: { src: url }, title: 'Ma vidéo' })
// player.update({ theme: { accent: '#0070f3' } }) ; player.update({ tokens }) ; player.update({ analytics: { viewerId: '42' } })
// player.getState() ; player.seek(120) ; player.goLive() ; player.destroy()
```

Le module charge Mux Player (≈ 320 Ko compressés, hls.js inclus) : importez-le à la demande (`import()`), au moment d'afficher un lecteur.

## Options

| Option | Rôle |
|---|---|
| `source` | `{ playbackId, tokens? }` (Mux) ou `{ src }` |
| `title`, `poster` | nom accessible / titre analytics, image avant lecture |
| `streamType` | `on-demand` (par défaut), `live` (toujours au direct), `live:dvr` (direct avec retour en arrière) |
| `live`, `dvr` | ancienne écriture : direct, retour au début (par défaut oui) |
| `autoplay` | lecture immédiate (avec le son si le navigateur l'accepte, sinon coupé) |
| `startTime` | reprise (en secondes, vidéo à la demande) |
| `maxResolution` | `720p` / `1080p` / `1440p` / `2160p` : plafond (économie de données) |
| `theme` | `accent` (boutons, barre), `primary` (icônes), `secondary` (fond des commandes) |
| `cast` | Chromecast (oui par défaut) ; `false` : rien n'est chargé depuis Google et le bouton disparaît (pour toute la page) |
| `lang` | langue de l'interface (`fr` par défaut) |
| `analytics` | `envKey`, `videoId`, `viewerId`, `playerName`, `cookies` (Mux Data, sans cookie par défaut, Do Not Track respecté) ; `false` pour ne rien mesurer |
| `progressInterval` | secondes entre deux `onProgress` (10 par défaut) |
| `onProgress`, `onEnded`, `onLiveEnded`, `onError` | événements |
| `onTimeUpdate`, `onLiveEdgeChange` | position de lecture, arrivée au direct / départ du direct |
| `handleRef` (React) | reçoit la poignée du lecteur (`getState`, `seek`, `goLive`…) |

## Sécurité du contenu (CSP)

Mux Player injecte ses styles dans son Shadow DOM : `style-src` doit autoriser `'unsafe-inline'`. Chromecast charge `https://www.gstatic.com/cv/js/sender/…` (`script-src`), sauf avec `cast: false`. Il charge les flux depuis `stream.mux.com` / `*.mux.com` (`media-src`, `connect-src`, `img-src https:`) et utilise des `blob:` (`media-src`, `worker-src`).

## Développement

```bash
npm ci
npm test        # tests (jsdom)
npm run lint
npm run build   # dist/ (ES modules + types)
```

Publier une version : mettre à jour `version` dans `package.json`, puis pousser un tag `vX.Y.Z` : la CI construit, teste et attache l'archive à la release.

Licence MIT.
