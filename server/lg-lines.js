'use strict';
// LAND GRAB: everything the tea shop gossip says, the files, the headlines and the bots' rumours.
// [tags] are ElevenLabs v3 delivery cues. {placeholders} are filled in by the game.

const SAY = {
  welcome: "Psst. Come closer. Welcome to Greenwater. Paddy fields, a canal, my little tea shop. And a man in a white car who wants to buy it all.",
  how: "The Godfather has paid some of you. One of you is his Puppet. Five Protect files save the village. Six Sell files, or the Puppet as Secretary after three Sells, and he wins. Check your phones. Secretly.",
  roles: "Look at your role. Don't make a face. Somebody just made a face.",
  first: "Right then. Let's see who you trust.",
  nominate: [
    '{pres} is President. Pick a Secretary.',
    '{pres}, choose your Secretary. I love drama.',
    'President {pres}. Who gets the files?',
    '{pres} is President. Everyone else, make some noise.',
  ],
  voteNow: '{pres} wants {sec}. Vote now.',
  votePass: 'Passed. {pres} and {sec} take the files.',
  voteFail: ['Rejected. The village is restless.', 'No deal. One step closer to a shutdown.'],
  voteFail2: "Two in a row. One more and the village shuts down.",
  shutdown: 'Three failed votes. Greenwater shuts down, and a file gets signed anyway.',
  notPuppet: '{sec} is Secretary. And {sec} is not the Puppet. Phew. For now.',
  filesPres: '{pres}, bin one file. Quietly.',
  filesSec: '{sec}, sign one.',
  protect: ['Protect! {title}.', 'A Protect file. {title}.', 'Protect. {title}. The paddy fields thank you.'],
  sell: ['Sold! {title}.', 'A Sell file. {title}.', 'Sell. {title}. The Godfather is smiling.'],
  claims: 'President, Secretary. What did you see? Tell us on your phone.',
  clash: 'Ooh. Those stories do not match.',
  inquiry: '{pres}, look into someone. Pick a player.',
  inquiryDone: '{pres} has seen {target}\'s file. Ask what it said.',
  peek: '{pres} sees the next three files.',
  urgent: '{pres} picks the next President.',
  urgentDone: '{target} runs the next round.',
  runout: '{pres} must run someone out of town. Choose.',
  runoutDone: '{target}, your bus is here.',
  notPuppetGone: 'The village is not saved yet. So {target} was not the Puppet.',
  vetoUnlocked: 'From now on, the Secretary can ask to bin both files. If the President agrees.',
  vetoAsk: '{sec} wants to bin both files. {pres}, agree?',
  vetoYes: 'Both files in the bin. Nothing signed.',
  vetoNo: 'Refused! {sec}, sign one.',
  rumour: ['Someone at the tea shop says... {text}', 'I heard a rumour... {text}', 'A little bird told me... {text}'],
  winVillage: "Greenwater is saved! The Godfather's car just drove away. In reverse.",
  winGodfather: "It's over. Greenwater belongs to the Godfather. My tea is a premium experience from tomorrow.",
  winPuppetElected: '{name} was the Puppet, and now runs the council. The Godfather wins.',
  winPuppetGone: '{name} was the Puppet! Run out of town! Greenwater is saved!',
  reveal: "Let's see who was who.",
  goodnight: 'Same time next week. If the village is still here.',
};

// The tutorial: six slides on the TV, read by the gossip. Played once per room, skippable.
const TUTORIAL = [
  { key: 'teams', title: 'Two sides', line: "Most of you are honest villagers. A few secretly work for the Godfather, and they know each other. One of them is his Puppet." },
  { key: 'round', title: 'Every round', line: 'Each round, the President picks a Secretary and everyone votes yes or no. Everybody sees your vote.' },
  { key: 'files', title: 'The files', line: "If they get in, the President draws three files, bins one, and passes two to the Secretary, who signs one. Green protects. Red sells. And there are far more red files, so even an honest President can get stuck." },
  { key: 'claims', title: 'Who is lying?', line: "Afterwards, both say what they saw. They can lie. If the stories don't match, somebody is lying." },
  { key: 'powers', title: 'Powers and shutdowns', line: 'Some Sell files give the President a power, like running someone out of town. Three failed votes in a row and a file gets signed anyway.' },
  { key: 'win', title: 'How to win', line: "Villagers win with five Protects, or by running the Puppet out of town. The Godfather wins with six Sells, or if the Puppet becomes Secretary after three Sells. And send me rumours. I read everything." },
];
// One-time tips during the first game of the night.
const TIPS = {
  vote: 'Everyone sees your vote. That is evidence.',
  limited: "Last round's pair can't be Secretary. The TV marks them.",
  fail: 'A failed vote. Three in a row shuts the village down.',
  files: 'No talking while the files are out.',
  claims: 'The dots show what each of them claimed. Watch them.',
  three: 'Three Sells. If the Puppet is made Secretary now, the Godfather wins.',
};

const PROTECT_FILES = [
  'Restore the temple pond', 'Ban the stone quarry', 'Plant a thousand coconut palms', 'Fix the old wooden bridge',
  'Keep the tea shop open forever', 'Protect the paddy fields', 'Clean up the canal', 'Build a new village school',
  'Save the fishing nets', 'Repaint the welcome arch', 'Free boat rides for grandmothers', 'Ban billboards on the canal',
  'Turn the empty plot into a cricket ground', 'Fund the village festival', 'Keep the bus to town running',
];
const SELL_FILES = [
  'Fill the paddy field for a 40-storey resort', 'Turn the toddy shop into a craft cocktail bar', 'Name the new bridge after the Godfather\'s son',
  'Turn the village pond into an infinity pool', 'Put a jet ski dock on the canal', 'Replace the tea shop with a coffee lounge',
  'Build a cable car over the lagoon', 'Cut down the palms for a car park', 'Sell the fishing nets as wall art',
  'Rename the village Godfather City', 'Make the temple grounds a VIP parking zone', 'Put a golf course on the cricket ground',
  'Move the bus stop behind the resort', 'Give the Godfather the school playground', 'Charge villagers to sit by the canal',
  'Turn the festival into a resort gala', 'Build a helipad on the football field', 'Sell the canal to a speedboat company',
];

const HEAD_PROTECT = [
  'COUNCIL SAYS NO TO THE GODFATHER', 'GREENWATER BREATHES AGAIN', 'VILLAGE 1, GODFATHER 0', 'PADDY FIELDS SAFE FOR NOW',
  'TEA SHOP REGULARS CELEBRATE', 'GODFATHER SEEN SULKING IN WHITE CAR',
];
const HEAD_SELL = [
  'SOLD!', 'BULLDOZERS ARRIVE BY MORNING', 'VILLAGERS FURIOUS', 'GODFATHER RESORTS GROWS', 'WHO SIGNED THIS?',
  'COUNCIL BLAMES COUNCIL', 'TEA SHOP REGULARS IN SHOCK',
];

// What the bots whisper at the tea shop. {a} and {b} are random players.
const BOT_RUMOURS = [
  '{a} was seen getting into a white car.', '{a} has a new gold watch. Interesting.', '{a} and {b} keep whispering.',
  'I trust {a}. That is all.', '{a} smiled when the last Sell file was signed.', '{a} paid for everyone\'s tea. Suspicious.',
  '{a} knows something about {b}.', 'Never trust anyone who votes yes that fast. Looking at you, {a}.',
  '{a} is definitely a villager. Probably.', '{b} said {a} is lying. {a} said {b} is lying. Classic.',
];

module.exports = { SAY, TUTORIAL, TIPS, PROTECT_FILES, SELL_FILES, HEAD_PROTECT, HEAD_SELL, BOT_RUMOURS };
