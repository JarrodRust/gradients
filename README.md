# Gradients — Deployment Guide

A real-time classroom vocabulary game. Students sort words into zones along
a semantic scale. The host screen shows the answer key and live leaderboard.

---

## Running locally (to test first)

```bash
npm install
npm start
# Open http://localhost:3000
```

Host screen: http://localhost:3000/host.html
Player screen: http://localhost:3000/player.html

---

## Deploying to Render (free)

1. Push this folder to a GitHub repository
2. Go to render.com → New → Web Service → connect your repo
3. Settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free
4. Click Deploy

Your app will be live at something like https://gradients.onrender.com

**Note:** Free Render services sleep after 15 minutes of inactivity.
Open the host screen a minute before class to wake it up.

---

## How to play

1. Host opens /host.html, picks year level and settings, clicks "Create room"
2. A 5-character room code appears — display this on the big screen
3. Students go to /player.html on their devices, enter the code and their name
4. Host clicks "Start game" when everyone has joined
5. Each round:
   - A scale appears (e.g. glacial → incandescent)
   - Students drag words into the 5 zones
   - When time runs out (or everyone submits), the round ends
   - Answer key appears on the host screen — great discussion starter
6. Scores accumulate across rounds — champion crowned at the end

## Scoring

- Correct zone: 20 points
- One zone off: 10 points
- Further off: 0 points

## Year levels

- Year 3: 5 words per round (1 per zone) — concrete, unambiguous
- Year 4: 10 words per round (2 per zone) — familiar vocabulary
- Year 5: 15 words per round (3 per zone) — sophisticated vocabulary
- Year 6+: 15 words per round (3 per zone) — challenging, near-synonyms within zones

## Adding word lists

Edit data/scales.js — each scale follows this format:

```js
{ cat: 'Category', left: 'left anchor', right: 'right anchor',
  words: [
    { w: 'word1', z: 1 },  // z = zone 1-5
    { w: 'word2', z: 2 },
    // etc.
  ]
}
```

Rules:
- Anchor words must NOT appear in the words array
- No modified phrases ("very angry") — use real single words
- Year 3: exactly 5 words (1 per zone)
- Year 4: exactly 10 words (2 per zone)
- Year 5/6: exactly 15 words (3 per zone)
