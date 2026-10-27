# MEOW MANSION

A silly little multiplayer browser game. You are a cat. You live in a house
with other cats. You can knock things over, shred the couch, dig in the litter
box, chase a laser pointer, and say "meow" in a comic-book starburst.

All art is procedural canvas drawing — thick outlines, halftone dots, speech
bubbles, action bursts. No image assets, no audio files.

## Run it

```bash
npm install
npm run dev        # node server on :8081 + vite dev server on :5173
```

Open http://localhost:5173 in two tabs (or two browsers, or two machines) to
see multiplayer. Everyone who types the same room name ends up in the same
house — share `mansion` or make up your own.

For a "prod" run: `npm run build` then `npm start` — the node server serves
`client/dist` and the websocket on one port (`:8081`, override with `PORT`).

## Controls

| Key | Action |
|---|---|
| WASD / arrows | walk |
| E | interact with the nearest thing (prompt shows what) |
| Enter | chat (comic speech bubble) |
| 1 | MEOW! |
| 2 | HISS! |
| 3 | purr (hearts) |
| 4 | ZOOMIES!! |
| 5 | boop the nearest cat |
| L | laser pointer — your mouse controls the dot, everyone sees it |

## Things to ruin

Vases, cups, a photo frame, a stack of books, a mug — all knockable, and they
stay knocked over for everyone until they respawn. The couch accumulates
scratch damage for the whole room. The toilet paper roll can be unspooled.
The bed and couch are walkable surfaces — standing on the bed makes you nap
(zzz), standing on the couch makes you sit (and you can still shred it).

## Layout

```
server/server.js   ws relay + tiny static host; owns object state + couch dmg
client/src/
  main.ts          loop, net glue, interactions
  house.ts         room/wall/furniture layout + collision
  render.ts        floors, furniture art, painter-sorted entities
  catdraw.ts       procedural comic cats
  comic.ts         halftone, starbursts, speech bubbles, captions
  effects.ts       transient fx (bursts, hearts, shards, stink lines)
  customize.ts     DOM join screen with live cat preview
  net.ts / input.ts / sfx.ts / types.ts
```
