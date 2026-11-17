'use strict';
// BID-COIN! What the Auctioneer says. Lines without {placeholders} are recorded once and reused instantly.

const SAY = {
  welcome: "[excited] Welcome to BID-COIN! Eight storage lockers, nobody knows what's inside, and you've each got forty thousand dirhams. Richest at the end wins!",
  how: "Same rules as last time. Peek, bid, bet, and pray. Let's make some money!",
  locker: ['Locker {n}! This one belonged to {origin}.', 'Locker number {n}. It came from {origin}.', "Here's locker {n}, straight from {origin}."],
  mystery: "Locker {n}. No label. No history. And no peeking! It's a pure gamble.",
  mega: '[excited] The final locker. The big one. A billionaire\'s private vault!',
  peek: ['Flashlights on! Check your phone.', "Take a peek. Keep a straight face.", 'Have a look inside. Tell nobody. Or lie!'],
  peekMystery: "No peeking at this one. Unless you've got X-Ray Specs.",
  open: ['Bidding is open!', 'Who wants it? Bidding is open!', 'Start your bidding!'],
  once: 'Going once!',
  twice: 'Going twice!',
  sold: 'SOLD!',
  noTakers: "No takers? Fine. Let's see what you all missed.",
  phantomWins: "[laughs] The mystery bidder wins it! Nobody gets this locker. Spooky.",
  soldTo: ['Sold to {name}, for {price} dirhams!', '{name} takes it, for {price} dirhams!'],
  bet: 'Boom or bust? Place your bets!',
  stolen: 'STOLEN! {name} snatches it at the last second!',
  reveal: ["Let's open it up!", "Right. Let's see what's inside.", 'Open the door!'],
  back: 'And right at the back of the locker...',
  legend: ['[gasps] {item}! That is a legendary find!', '[gasps] No way. {item}!'],
  aiLegend: '[gasps] {item}! I have never seen one of those. Ever!',
  cursed: ['Oh no. {item}. That one is cursed.', '[nervously] {item}. Nobody wants that. It costs you at the end.'],
  sealed: 'A {item}! Sealed tight. We open it at the very end.',
  plant: 'Hold on. Where is the {item} everyone saw? It was planted by {name}!',
  disaster: ['[gasps] Wait. That is not a {look}. That is a {item}! That will cost you AED {cost}.', 'Oh dear. Oh dear oh dear. {item}. The bill? AED {cost}.', '[nervously] Everyone step back. {item}. That is an AED {cost} problem.'],
  disasterPct: ['[gasps] {item}! That takes {pct} percent of everything you have. Gone.', 'Oh no. {item}. Say goodbye to {pct} percent of your cash.'],
  car: ['[gasps] There is a car back there! {item}!', 'Is that... a whole car? {item}!'],
  locked: 'Blocked! {name} had a Lock.',
  boom: ['[excited] BOOM! {name} made {profit} dirhams!', 'BOOM! {profit} dirhams of profit for {name}!'],
  bust: ['Ouch. BUST! {name} lost {loss} dirhams.', '[sighs] Bust. {name} is down {loss} dirhams on that one.'],
  even: '{name} roughly broke even. Boring, but safe.',
  unsoldTotal: 'All that, worth {total} dirhams. And nobody bought it.',
  after: 'Last chance for power cards!',
  finale: "That's every locker sold! Now, those sealed boxes.",
  noSealed: 'No sealed boxes this time. Straight to the money.',
  sealedOpen: "{name}'s {item}. Let's crack it open...",
  sealedIn: ['It was {item}! Worth {value} dirhams.', 'Inside: {item}! {value} dirhams.'],
  sealedBad: "It's {item}. That's cursed. Minus {value} dirhams.",
  cursedPay: 'And now, the cursed things. Somebody has to pay to get rid of them.',
  winner: '[excited] {name} wins BID-COIN, with {cash} dirhams!',
  goodnight: 'Thanks for bidding. Same time next week. Bring cash!',
  // syndicates
  synOpen: ['We have a syndicate! {names}, bidding together.', 'Team-up alert! {names} have pooled their cash.'],
  // Shifty Sid's back room. Sid's lines are read in his own voice.
  brIntro: ["Psst. Over here. No, don't look at me. Look at the locker.", "Keep your voice down. The big spenders can't know about this."],
  brInvite: ["{names}. Yeah, you lot. I've got a locker. Bit grubby. Very cheap. Interested?", "This one's just for {names}. Nobody else. Capiche?"],
  brRules: ['One secret bid each. Highest bid takes it. Everyone else, bet on it.', 'Sealed bids only. The rest of you, boom or bust?'],
  brNoBids: ["Nobody? Fine. I'll sell it to the pigeons.", 'No bids. Your loss. Sid is out of here.'],
  // Sid's Crew and Sid's loan
  crewJoin: ["Psst. Some of you are skint. Sid's got work for you. Check your phones. Quietly.", "Times are hard, eh? Sid is hiring. If you're short of cash, look at your phone. Say nothing."],
  caught: ['{name}! You muppet. Nobody bid over you. That is a {fine} dirham fine, and the locker comes back to Sid.', 'Oh, {name}. The hammer fell on your fake bid. {fine} dirhams. Sid is very disappointed.'],
  loan: ["{name} has borrowed {amount} dirhams from Sid. Pays back {owe}. Sid always collects.", 'A loan for {name}. {amount} now, {owe} at the end. Lovely doing business.'],
  repoIntro: ["Before anyone counts their money. Sid's loans. Pay up.", 'One last thing. Sid lent some of you money. Time to settle.'],
  repoPaid: ['Paid in full. Pleasure doing business.', 'Every dirham back. Sid likes you. For now.'],
  repoTaken: ["{names} can't pay. Boys, take everything.", "Not enough, {names}? Sid's associates will take the lot."],
  brWon: ['{name}, it is yours. {price} dirhams. No refunds. No questions.', 'Sold to {name}. {price}. Pleasure doing business.'],
};

// The rules, four short slides on the very first game.
const TUTORIAL = [
  { key: 'peek', title: 'Peek', line: 'First, the peek. Each of you sees something different on your phone. Keep it to yourself. Or lie about it.' },
  { key: 'bid', title: 'Bid', line: "Then the auction. Tap plus five hundred, plus a thousand, or plus five thousand. Five seconds with no bids, and it's sold!" },
  { key: 'bet', title: 'Boom or bust', line: 'Everyone else bets. Will the winner make money? You pick how much. If you are in the bottom half, you can go all in.' },
  { key: 'comeback', title: 'Falling behind?', line: "Fall into the bottom half and you get help. Team up with another player to bid together. And a shady man called Sid might invite you to a secret sale." },
  { key: 'cards', title: 'Power cards', line: "And you each get power cards. Freeze a rival. Steal a locker. Everyone gets one free Lock to block an attack. And watch out: some lockers hide a disaster. Let's go!" },
];

module.exports = { SAY, TUTORIAL };
