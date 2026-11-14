# Vishnu's Game Night: Last Night in the Mansion, BID-COIN!, RIGGED! and Land Grab

Party games for the TV and everyone's phones. Open `/tv` on the TV and pick one. Phones join with the code on screen.

## Last Night in the Mansion

A spooky, silly co-op game for 2 to 8 players, about 20 minutes. Everyone wins together or loses together. Join at `/mn`. With exactly 2 people, two guests (bots) join to fill the jobs.

The group shares one candle. It burns slowly while you are in a room, and mistakes melt it faster. Mortimer, the dead butler, leads you through 5 rooms picked from 20 (talking rooms, timing rooms, speed rooms and memory rooms, never the same kind twice in a row). Each room gives every phone a different job. Clear a room to win a key piece. Fail and you lose 15% of the candle and move on.

Between rooms the house possesses one person (never the same one twice in a row). Their phone gets a 15-second challenge that everyone watches on the TV: win and the candle grows, lose and it shrinks. There are only 1 or 2 jump scares a night.

The finale is the Front Door: the Key, the Lock, the Lookout and the Flame all at once, with the key pieces you won. Escape before the candle goes out. Any picture, music or sound named in the art doc can be dropped into `public/assets` at any time; until then the game draws and plays its own.

The old Writers' Room still works at `/tv/writers`, but it is no longer on the game menu.

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

A storage-locker bidding war for 2 to 8 players (bots can fill seats), about 15 to 20 minutes. Everyone starts with AED 40,000 and bids in steps of 500, 1,000 or 5,000. Eight lockers come up for auction. Richest at the end wins.

1. **Peek:** the door rolls up a little and each phone shows a different thing inside. The player in last place sees two.
2. **Auction:** tap +500, +1,000 or +5,000. Five seconds with no bids and the hammer falls. The server decides who was first, so bids never clash.
3. **Boom or bust:** everyone else bets AED 2,000 on whether the winner makes money.
4. **Reveal:** the locker is opened one thing at a time, with the back of the locker last. Junk, decent, rare, legendary and cursed things. Sealed boxes are opened at the very end. Cursed things cost money at the end unless you pass them on.
5. **Disasters:** about one locker in four hides a disaster behind something innocent in the peek (a "classic car under a dust sheet" that turns out to be stolen). Fixed fines of AED 15,000 to 60,000, or a tax audit (25% of your cash) or a lawsuit (30%). Paid on the spot, never below zero. The vault and garages are riskier.
6. **Power cards:** everyone starts with two and holds up to three. Win a locker or a bet to get another. X-Ray Specs, Insider Tip, The Plant (fakes one thing in everyone else's peek of the next locker), Freeze, Phantom Bidder, Steal (price plus 50%), Tax Man (15%), Swap Meet (takes the second-best find), Appraiser (best find x1.5), Pass the Curse, and Lock.
7. **Locks:** everyone gets one free Lock. When someone plays Steal, Tax Man, Swap Meet, Pass the Curse or Freeze on you, your phone gives you five seconds to block it. Lock cards give you more.

One locker in the middle of the game is a mystery locker (no peeking). Most games have a garage locker with a car at the back, from a rusty Corolla to a Skyline worth AED 250,000. The last locker is a billionaire's vault with more and better things. The AI invents one or two one-of-a-kind finds each game.

**Items:** about 520 real things and 30 cars (a Rolex Submariner 126610LN, a 1965 Ford Mustang, a Singer 201, a box of Uni-ball Signo pens...) in `server/bc-items.js` and `server/bc-items-more.js` (with the disasters), each with a rarity, a realistic resale value in AED, a funny line and a photo search.

**Item photos:** the game server looks each item up on Wikimedia Commons by itself (freely licensed photos), and the TV and phones load them straight from Wikimedia. The photographer is credited under each photo on the TV. Check progress at `/bidcoin/photos-status`, and see every item with its photo at `/bidcoin/gallery`. To change a photo, add a line to `server/bc-photo-overrides.json`, either an exact Commons file name like `"File:Something.jpg"` or better search words. A file saved as `public/assets/bc/items/<id>.webp` always wins.

**Testing on your own:** open `/tv/bidcoin?test`. The lobby has **Add a bot**, **Fill to 3**, **Remove bots** and **Start**. To be several players on one laptop, open `/bc?test` in several tabs. In a normal game, the first player's phone also has **Add a bot**, so two people can play against bots.

## RIGGED!

A trivia game show for 2 to 8 players (bots can fill seats), about 20 minutes. Everyone starts with $1,000 in Bucks. Bucks buy a head start in the final race, and whoever wins the race wins the show. Join at `/rg` (or type the code on the front page).

1. **The Dossier:** three odd questions about yourself, answered in secret in 60 seconds. Vince reads them out all game.
2. **Round One:** five multiple-choice questions (only the first is easy) and one "who wrote this?" question from the Dossier.
3. **Lie Detector:** a weird true fact with a blank. Write a fake answer, then find the truth among everyone's lies and Vince's.
4. **Round Three:** five harder questions and another Dossier question.
5. **The Bomb:** true or false, passed from phone to phone with a shrinking fuse.
6. **Grudge Match:** last place picks anyone to duel. The winner gets a head start.
7. **The Rigged Race:** one shared question at a time, six options, tap every one that fits. Right taps step you forward, wrong taps step you back. Last place starts furthest ahead. One question is about the room's Dossier answers.

**Showdowns:** every round ends with the leader against last place: one question, fastest right answer takes a pot from the loser. Everyone else bets on who wins. One Showdown is a Dossier Duel (who wrote this, you or them?) and one brings back the Lie Detector's best lie.

**Rule cards:** after rounds 1 to 3, last place picks one of three rule cards. Only one rule is live at a time: Double or Nothing, Speed Tax, Robin Hood, Bounty, Last Laugh, Blind Buttons, Hot Hands, Copycat.

**One sabotage each:** once per game, tap the red button and a face. Something random hits their phone: Fog, Shuffle, Mirror, Tiny Text, Earthquake or Freeze.

**Two players:** Vince joins as **The House**, a third contestant that cheats. If the House wins, nobody wins.

**Questions:** `server/rg-trivia.js` and `server/rg-trivia-more.js` (about 390 multiple-choice questions in 12 categories, mostly medium and hard), `server/rg-race.js` (the finale's tap-every-one questions) and `server/rg-content.js` (true or false statements, Lie Detector facts, Dossier questions, rule cards). The game remembers what it has asked, so repeats are rare. Vince's lines are in `server/rg-lines.js`.

**Pause and quit:** every phone (in every game except Writers' Room) has a round menu button in the corner. Anyone can pause; the TV stops the clock, music and narrator. Anyone can resume, after a 3-second countdown. Quitting to the game menu needs most of the room to agree.

**Testing on your own:** open `/tv/rigged?test`. The lobby has **Add a bot**, **Fill to 4**, **Remove bots** and **Start**. In a normal game, the first player's phone has **Add a bot** too.

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

Everything lives in `public/assets`: pictures in `img` (title, rooms, `genre-<name>`, `bust-01` onward, small `t-` copies for phones, Land Grab's `lg-` pictures, BID-COIN!'s `bc-` pictures and RIGGED!'s `rg-` pictures), music in `music` (one track per game stage and per genre) and sound effects in `sfx`. Anything missing is drawn or played by the game itself, so a file can be removed or swapped at any time with the same name.

## Optional settings (Render, Environment tab)

| Setting | What it does |
| --- | --- |
| `ELEVENLABS_VOICE_ID` | Johnny's voice (default is Chris) |
| `ELEVENLABS_EXEC_VOICE_ID` | The Network exec's voice (default is Daniel) |
| `ELEVENLABS_LG_VOICE_ID` | Land Grab's tea shop gossip. If not set, an English voice with an Indian accent is picked from the ElevenLabs voice library |
| `ELEVENLABS_BC_VOICE_ID` | BID-COIN!'s auctioneer (default is Charlie) |
| `ELEVENLABS_RG_VOICE_ID` | RIGGED!'s host, Vince Velvet (default is Brian) |
| `ELEVENLABS_MN_VOICE_ID` | The Mansion's butler, Mortimer (default is George, an older British voice) |
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

Then open http://localhost:3000/tv. To watch bots play a whole game: `URL=http://localhost:3000 N=6 npm run bots`. For Land Grab: `URL=http://localhost:3000 N=7 GAMES=5 node test/lg-bots.js`. For BID-COIN!: `URL=http://localhost:3000 N=5 GAMES=3 node test/bc-bots.js`. For RIGGED!: `URL=http://localhost:3000 N=3 GAMES=3 node test/rg-bots.js` (start the server with `WR_SPEED=0.1` to make it quick). For the Mansion: `URL=http://localhost:3000 N=4 HUMANS=0 GAMES=2 node test/mn-bots.js`, and every room on its own: `node test/mn-rooms-test.js`. Pause and quit in every game: `node test/pause-test.js`. The iPhone check (every phone screen at four iPhone sizes): `python3 test/phone-fit.py` with the server on `WR_SPEED=0.25`.
