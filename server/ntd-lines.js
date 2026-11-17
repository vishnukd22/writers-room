'use strict';
// Supervisor Brenda, on the airport tannoy. Deadpan, bored, never surprised. ElevenLabs v3 tags in [brackets].
// {name} = a player, {n} = how many, {what} = what they declared, {amt} = an amount like AED 2,000.
const SAY = {
  welcome: "[flat, bored] Good evening, and welcome to Arrivals. This is Supervisor Brenda. Please have your passports ready. And your lies.",
  rules: "[deadpan] Here's how this works. Each round, one of you works the customs desk. Everyone else packs a suitcase and tells me what's in it. Pack contraband if you like. If the officer opens your bag and finds it, you pay a fine. If they open an honest bag, they pay you. And yes. Bribes are accepted.",
  rulesShort: "[sighs] Same as last time. Pack. Declare. Lie, if you must. The officer decides who gets opened.",
  rulesTwo: "[deadpan] There are only a few of you, so everybody gets two suitcases. Twice the bags. Twice the lies.",
  // a new round
  officer: [
    "[flat] Tonight's customs officer is {name}. Try to look official.",
    "[flat] {name}, you're on the desk this round. Hat on. Eyes open.",
    "[bored] Shift change. {name} is your customs officer now. Good luck to all of you.",
  ],
  pack: [
    "[flat] Travellers, pack your bags on your phone. Say what's inside. Whether it's true is your business. For now.",
    "[flat] Pack your bags, please. Green lane if you've got nothing to declare. Red lane if you're honest and boring.",
  ],
  packHurry: ["[flat] Ten seconds. Zip it up.", "[sighs] The belt is moving. Zip your bags."],
  // the red lane: honest people paying the five percent duty
  redLane: [
    "[flat] {name} went through the red lane and paid the duty. How wholesome.",
    "[bored] {name} declared everything and paid five percent. No drama. Next.",
  ],
  // the desk
  desk: [
    "[flat] {name}, to the desk please. Declaring {what}.",
    "[tannoy voice] Would passenger {name} please approach the customs desk. {name} says: {what}.",
    "[bored] Next. {name}. Apparently it's {what}.",
  ],
  bribe: ["[dry] Oh look. {name} has placed {amt} on the desk. Purely a coincidence, I'm sure.", "[flat] {name} is offering {amt}. I didn't see that. Officially."],
  bribeUp: ["[dry] And now it's {amt}.", "[flat] {amt}. The price of freedom keeps going up."],
  sniff: ["[flat] Biscuit. Sniff.", "[bored] Send in Biscuit."],
  bark: ["[deadpan] Biscuit is barking. Biscuit is never wrong.", "[flat] Woof. That's a yes from Biscuit."],
  quiet: ["[flat] Biscuit has lost interest. Biscuit wants a snack.", "[bored] Nothing. Biscuit is just happy to be here."],
  wave: ["[flat] Waved through. Welcome to the country.", "[bored] Off you go. Enjoy your stay."],
  waveBribe: ["[dry] Waved through. And the officer is {amt} richer. I saw nothing.", "[flat] Cleared. {amt} has changed hands. Lovely."],
  open: ["[flat] Open the bag, please.", "[bored] The officer would like a look inside.", "[deadpan] Unzip it. Slowly."],
  honest: [
    "[sighs] It's all exactly as declared. The officer owes {name} {amt} for the trouble.",
    "[flat] Completely honest. How disappointing. Pay up, officer. {amt}.",
  ],
  caught: [
    "[flat] Well, well. That is not {what}. Fine: {amt}.",
    "[deadpan] {name}, that is not what you said. {amt}, please.",
    "[pleased] Got one. {amt} to the officer.",
  ],
  timeout: ["[flat] The officer couldn't decide, so I'll decide. Through you go."],
  // between rounds
  scores: ["[flat] Here's who has the most cash. What they actually smuggled, we'll find out at the end.", "[bored] Cash in hand. The goods stay a secret until the awards."],
  lastRound: "[flat] Final round. Last chance to smuggle something stupid.",
  // the awards night
  awardsIntro: "[a little warmer] Ladies and gentlemen, welcome to the Customs Awards Night. First, let's see what really got past us.",
  smuggled: ["[flat] {name} smuggled in {what}. Right under our noses.", "[dry] Look at that. {name} walked out with {what}."],
  cleanRecord: "[flat] {name} smuggled nothing at all. A model citizen. How dull.",
  royalty: "[flat] And the duty free crowns. Most of each kind of goods gets a bonus.",
  smuggler: "[flat] Smuggler of the Year goes to {name}. We'll be watching you.",
  winner: "[flat, a hint of respect] And the richest traveller tonight is {name}. Congratulations. Please don't come back.",
  tie: "[flat] It's a tie. You can share the shame.",
  // Brenda's moods for her picture on the TV
};

module.exports = { SAY };
