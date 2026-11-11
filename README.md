# Writers' Room

A party game for 2 to 12 people, about 30 minutes. You are writers at a guild, and the Network wants a hit. Your host, Johnny Primetime, makes you write two TV pilots in one night:

1. The showrunner picks a genre.
2. Everyone writes a one-sentence pitch. The room votes for the best one.
3. Everyone answers a question about the hero or the rival. Those answers become the two main characters.
4. Act one: everyone writes what goes wrong. The room votes, and the winning idea is acted out on the TV.
5. The finale: everyone writes how it ends. Same again.
6. The Network rates the pilot out of 10. If neither pilot scores 7 or more, everyone is fired.

Points come from winning votes, likes and laughs. With exactly 2 players it becomes Date Night, and the Network exec judges instead of votes.

## Put it online (Render, free)

1. Make a new GitHub repository called `writers-room`.
2. Upload everything in this folder: the `public`, `server` and `test` folders, plus `package.json`, `package-lock.json`, `render.yaml`, `README.md` and `.gitignore`.
3. On Render: New, then Blueprint. Pick the `writers-room` repository.
4. Render asks for two values. Paste your keys there:
   - `ANTHROPIC_API_KEY`: the AI writer (show titles, scenes, the exec's verdict)
   - `ELEVENLABS_API_KEY`: the voices
5. Click Apply. When it says Live, open `https://<your-app>.onrender.com/tv` on the TV.

The game still works without either key. It uses backup scripts and the browser's voice instead.

## Playing

- TV: open `/tv` and click the button (browsers need one click before they play sound).
- Phones: scan the QR code, or open the site and type the room code. Type your name and pick your portrait.
- The first person to join starts the game.
- On the TV, the faint buttons in the bottom right corner turn music, sounds and the narrator on or off, skip a step, or go full screen.

## Art, music and sounds

Everything lives in `public/assets`: pictures in `img` (title, rooms, `genre-<name>`, `bust-01` onward, and small `t-` copies for phones), music in `music` (one track per game stage and per genre) and sound effects in `sfx`. Anything missing is drawn or played by the game itself, so a file can be removed or swapped at any time with the same name.

## Optional settings (Render, Environment tab)

| Setting | What it does |
| --- | --- |
| `ELEVENLABS_VOICE_ID` | Johnny's voice (default is Chris) |
| `ELEVENLABS_EXEC_VOICE_ID` | The Network exec's voice (default is Daniel) |
| `ELEVENLABS_MODEL` | Defaults to `eleven_v3`, which does the whispers and laughs |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| `PUBLIC_URL` | Only if the QR code shows the wrong address |

## Running it on a laptop

```
npm install
npm start
```

Then open http://localhost:3000/tv. To watch bots play a whole game: `URL=http://localhost:3000 N=6 npm run bots`.
