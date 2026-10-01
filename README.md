# Z Player

Lecteur vidéo réutilisable pour le streaming HLS, construit sur [Mux Player](https://www.mux.com/player) (media-chrome + hls.js). Utilisé par Coach Z, utilisable dans n'importe quel projet React ou JavaScript.

## Ce qu'il apporte

| Domaine | Fonction |
|---|---|
| Streaming | qualité adaptative, plafonnée à la taille du lecteur ; rien n'est téléchargé avant la lecture ; CMCD (le CDN sert mieux chaque spectateur) ; **économie de données** (`maxResolution`) |
| Live | faible latence (flux Mux en mode `low`), **DVR** (revenir au début), signal `onLiveEnded` quand le flux s'arrête (bascule vers le replay) |
| Confort | aperçus au survol de la barre (storyboards Mux), sous-titres, vitesses 0,75–2×, plein écran, image dans l'image, AirPlay, Chromecast, raccourcis clavier |
| Application | interface en français, thème aux couleurs du projet, **reprise de position** (`startTime` + `onProgress` toutes les 10 s, à la pause et en quittant), **une seule vidéo à la fois** sur la page |
| Mesure | Mux Data intégré (`analytics.envKey`, identifiant de vidéo et de spectateur) |
| Lecture signée | `tokens` (vidéo, vignette, aperçus) fournis par votre serveur |

## Installation

Chaque version est publiée en archive sur les [releases](https://github.com/coachz-app/z-player/releases) (aucun compte ni jeton nécessaire) :

```bash
npm install https://github.com/coachz-app/z-player/releases/download/v0.1.0/coachz-app-z-player-0.1.0.tgz
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

Live : `source={{ playbackId }}` + `live` (DVR par défaut, `dvr={false}` pour le désactiver) + `onLiveEnded={reload}`.
Une URL quelconque (HLS ou MP4) : `source={{ src: 'https://…/video.m3u8' }}`.

## JavaScript

```js
import { createZPlayer } from '@coachz-app/z-player'

const player = createZPlayer(document.querySelector('#player'), { source: { src: url }, title: 'Ma vidéo' })
// player.update({ theme: { accent: '#0070f3' } }) ; player.destroy()
```

Le module charge Mux Player (≈ 150 Ko compressés) : importez-le à la demande (`import()`), au moment d'afficher un lecteur.

## Options

| Option | Rôle |
|---|---|
| `source` | `{ playbackId, tokens? }` (Mux) ou `{ src }` |
| `title`, `poster` | nom accessible / titre analytics, image avant lecture |
| `live`, `dvr` | direct, retour au début (par défaut oui) |
| `autoplay` | lecture immédiate (avec le son si le navigateur l'accepte, sinon coupé) |
| `startTime` | reprise (en secondes, vidéo à la demande) |
| `maxResolution` | `720p` / `1080p` / `1440p` / `2160p` : plafond (économie de données) |
| `theme` | `accent` (boutons, barre), `primary` (icônes), `secondary` (fond des commandes) |
| `lang` | langue de l'interface (`fr` par défaut) |
| `analytics` | `envKey`, `videoId`, `viewerId` (Mux Data) |
| `progressInterval` | secondes entre deux `onProgress` (10 par défaut) |
| `onProgress`, `onEnded`, `onLiveEnded`, `onError` | événements |

## Sécurité du contenu (CSP)

Mux Player injecte ses styles dans son Shadow DOM : `style-src` doit autoriser `'unsafe-inline'`. Il charge les flux depuis `stream.mux.com` / `*.mux.com` (`media-src`, `connect-src`, `img-src https:`) et utilise des `blob:` (`media-src`, `worker-src`).

## Développement

```bash
npm ci
npm test        # tests (jsdom)
npm run lint
npm run build   # dist/ (ES modules + types)
```

Publier une version : mettre à jour `version` dans `package.json`, puis pousser un tag `vX.Y.Z` : la CI construit, teste et attache l'archive à la release.

Licence MIT.
