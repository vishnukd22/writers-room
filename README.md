# Game night: Writers' Room and Land Grab

Two party games. Open `/tv` on the TV and pick one. Phones join with the code on screen.

## Writers' Room

A party game for 2 to 12 people, about 35 minutes. You are writers at a guild, and the Network wants a hit. Your host, Johnny Primetime, makes you write one show, a whole season, in one night.

**Set-up:** the showrunner picks a genre, everyone pitches the show in one sentence and votes, then everyone answers a question about the hero or the rival to build the two characters.

**Three episodes:** the Pilot, Episode Two and the Season Finale. In each one, everyone writes what goes wrong, then how it ends (Episode Two ends on a cliffhanger). The room votes, and the winning idea is acted out on the TV with character voices. Each act comes with a Network note to work in.

**The bar rises:** the Pilot needs 5 out of 10, Episode Two needs 6, the Finale needs 7. The rating builds live on screen from laughs, honoured notes and the Network exec's verdict. Miss twice and the show is cancelled. Hit 7 in the Finale for season two.

Points come from winning votes, likes and laughs. With exactly 2 players it becomes Date Night, and the Network exec judges instead of votes.

## Land Grab

A hidden-role game for 5 to 10 players, about 30 to 45 minutes. A developer called the Godfather wants to turn the village of Greenwater into a mega resort. Most players are villagers. A few secretly work for the Godfather, and one of them is his Puppet.

1. Each round the President (the job rotates) picks a Secretary. Everyone votes yes or no.
2. If the vote passes, the President draws 3 files, bins one in secret and passes 2 to the Secretary, who signs one. Files are Protect or Sell. There are more Sell files than Protect, so honest players sometimes have no choice.
3. Both then say on their phone what they saw. They can lie. The TV shows both stories side by side.
4. Some Sell files unlock a power for the President: look into a player's side, peek at the next files, pick the next President, or run someone out of town.
5. Three failed votes in a row cause a shutdown, and the top file is signed with nobody watching.
6. Villagers win with 5 Protect files, or by running the Puppet out of town. The Godfather wins with 6 Sell files, or if the Puppet becomes Secretary once 3 Sell files have passed.

Extras: anyone can send an anonymous rumour to the TV once per round, and one villager gets a secret tip-off at the start naming another villager.

### Testing Land Grab on your own

Open `/tv/landgrab?test` on the TV (or `/tv?test` and pick Land Grab). The lobby then has **Add a bot**, **Fill to 5**, **Remove bots** and **Start** buttons. Bots play every role. Join on your phone as usual and play with them.

To be several players on one laptop, open `/lg?test` in several tabs. Each tab is a separate player.

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

Everything lives in `public/assets`: pictures in `img` (title, rooms, `genre-<name>`, `bust-01` onward, small `t-` copies for phones, and Land Grab's `lg-` pictures), music in `music` (one track per game stage and per genre) and sound effects in `sfx`. Anything missing is drawn or played by the game itself, so a file can be removed or swapped at any time with the same name.

## Optional settings (Render, Environment tab)

| Setting | What it does |
| --- | --- |
| `ELEVENLABS_VOICE_ID` | Johnny's voice (default is Chris) |
| `ELEVENLABS_EXEC_VOICE_ID` | The Network exec's voice (default is Daniel) |
| `ELEVENLABS_LG_VOICE_ID` | Land Grab's tea shop gossip. If not set, an English voice with an Indian accent is picked from the ElevenLabs voice library |
| `ELEVENLABS_FAST_MODEL` | The quick voice model for Writers' Room characters (default `eleven_flash_v2_5`) |
| `ELEVENLABS_MODEL` | Defaults to `eleven_v3`, which does the whispers and laughs |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| `PUBLIC_URL` | Only if the QR code shows the wrong address |

## Running it on a laptop

```
npm install
npm start
```

Then open http://localhost:3000/tv. To watch bots play a whole game: `URL=http://localhost:3000 N=6 npm run bots`. For Land Grab: `URL=http://localhost:3000 N=7 GAMES=5 node test/lg-bots.js`.
