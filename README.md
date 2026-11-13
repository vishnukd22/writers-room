# Vishnu's Game Night: Writers' Room, Land Grab and BID-COIN!

Three party games. Open `/tv` on the TV and pick one. Phones join with the code on screen.

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

## BID-COIN!

A storage-locker bidding war for 2 to 8 players (bots can fill seats), about 15 to 20 minutes. Everyone starts with AED 4,000. Eight lockers come up for auction. Richest at the end wins.

1. **Peek:** the door rolls up a little and each phone shows a different thing inside. The player in last place sees two.
2. **Auction:** tap +50, +100 or +500. Five seconds with no bids and the hammer falls. The server decides who was first, so bids never clash.
3. **Boom or bust:** everyone else bets AED 200 on whether the winner makes money.
4. **Reveal:** the locker is opened one thing at a time, with the back of the locker last. Junk, decent, rare, legendary and cursed things. Sealed boxes are opened at the very end. Cursed things cost money at the end unless you pass them on.
5. **Power cards:** everyone starts with two and holds up to three. Win a locker or a bet to get another. X-Ray Specs, Insider Tip, The Plant, Freeze, Phantom Bidder, Steal, Tax Man, Swap Meet, Appraiser, Pass the Curse.

One locker in the middle of the game is a mystery locker (no peeking). The last locker is worth double. The AI invents one or two one-of-a-kind finds each game.

**Items:** about 260 items in `server/bc-items.js`, each with a name, a category, a rarity, a value in AED, a funny line and a photo search term.

**Item photos:** real, freely licensed photos from Wikimedia Commons, saved in `public/assets/bc/items`. They are fetched by the "BID-COIN photos" robot on GitHub (Actions tab, Run workflow), which also writes `public/assets/bc/credits.json`. See every item, its photo and its credit at `/bidcoin/gallery`. To change one photo, add a line to `server/bc-photo-overrides.json` (a Commons file name like `"File:Something.jpg"`, or different search words), then run the robot again with that item's id in the "redo" box.

**Testing on your own:** open `/tv/bidcoin?test`. The lobby has **Add a bot**, **Fill to 3**, **Remove bots** and **Start**. To be several players on one laptop, open `/bc?test` in several tabs. In a normal game, the first player's phone also has **Add a bot**, so two people can play against bots.

## Put it online (Render, free)

1. Make a new GitHub repository called `writers-room`.
2. Upload everything in this folder: the `public`, `server`, `scripts` and `test` folders, plus `package.json`, `package-lock.json`, `render.yaml`, `README.md` and `.gitignore`.
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

Everything lives in `public/assets`: pictures in `img` (title, rooms, `genre-<name>`, `bust-01` onward, small `t-` copies for phones, Land Grab's `lg-` pictures and BID-COIN!'s `bc-` pictures), music in `music` (one track per game stage and per genre) and sound effects in `sfx`. Anything missing is drawn or played by the game itself, so a file can be removed or swapped at any time with the same name.

## Optional settings (Render, Environment tab)

| Setting | What it does |
| --- | --- |
| `ELEVENLABS_VOICE_ID` | Johnny's voice (default is Chris) |
| `ELEVENLABS_EXEC_VOICE_ID` | The Network exec's voice (default is Daniel) |
| `ELEVENLABS_LG_VOICE_ID` | Land Grab's tea shop gossip. If not set, an English voice with an Indian accent is picked from the ElevenLabs voice library |
| `ELEVENLABS_BC_VOICE_ID` | BID-COIN!'s auctioneer (default is Charlie) |
| `BC_LOCKERS` | How many lockers in a BID-COIN! game (default 8) |
| `ELEVENLABS_FAST_MODEL` | The quick voice model for Writers' Room characters (default `eleven_flash_v2_5`) |
| `ELEVENLABS_MODEL` | Defaults to `eleven_v3`, which does the whispers and laughs |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| `PUBLIC_URL` | Only if the QR code shows the wrong address |

## Running it on a laptop

```
npm install
npm start
```

Then open http://localhost:3000/tv. To watch bots play a whole game: `URL=http://localhost:3000 N=6 npm run bots`. For Land Grab: `URL=http://localhost:3000 N=7 GAMES=5 node test/lg-bots.js`. For BID-COIN!: `URL=http://localhost:3000 N=5 GAMES=3 node test/bc-bots.js` (start the server with `WR_SPEED=0.1` to make it quick).
