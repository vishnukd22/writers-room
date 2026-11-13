'use strict';
// BID-COIN! What the Auctioneer says. Lines without {placeholders} are recorded once and reused instantly.

const SAY = {
  welcome: "[excited] Welcome to BID-COIN! Eight storage lockers, nobody knows what's inside, and you've each got four thousand dirhams. Richest at the end wins!",
  how: "Same rules as last time. Peek, bid, bet, and pray. Let's make some money!",
  locker: ['Locker {n}! This one belonged to {origin}.', 'Locker number {n}. It came from {origin}.', "Here's locker {n}, straight from {origin}."],
  mystery: "Locker {n}. No label. No history. And no peeking! It's a pure gamble.",
  mega: '[excited] The final locker. The big one. Everything in here is worth double!',
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
};

// The rules, four short slides on the very first game.
const TUTORIAL = [
  { key: 'peek', title: 'Peek', line: 'First, the peek. Each of you sees something different on your phone. Keep it to yourself. Or lie about it.' },
  { key: 'bid', title: 'Bid', line: "Then the auction. Tap plus fifty, plus one hundred, or plus five hundred. Five seconds with no bids, and it's sold!" },
  { key: 'bet', title: 'Boom or bust', line: 'Everyone else bets. Will the winner make money? Then we open the locker, one thing at a time.' },
  { key: 'cards', title: 'Power cards', line: "And you each get power cards. Freeze a rival. Plant a fake treasure. Steal a locker. Use them well. Let's go!" },
];

module.exports = { SAY, TUTORIAL };
