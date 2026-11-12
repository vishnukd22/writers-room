'use strict';
// LAND GRAB: everything the tea shop gossip says, the files, the headlines and the bots' rumours.
// [tags] are ElevenLabs v3 delivery cues. {placeholders} are filled in by the game.

const SAY = {
  welcome: "[whispers] Psst. Come closer. [normal] Welcome to Greenwater. Paddy fields, the canal, my little tea shop. [beat] And a man in a white car who wants to buy all of it.",
  how: "[briskly] The Godfather has paid some of you. One of you is his Puppet. Sign five Protect files and the village is safe. Sign six Sell files, or make the Puppet Secretary once three Sell files have passed, and the Godfather wins. [beat] Now check your phones. Secretly.",
  roles: "Look at your role. Don't make a face. [beat] Somebody just made a face.",
  first: '[mischievous] Right then. Let\'s see who you trust.',
  nominate: [
    '{pres} is President. Pick a Secretary. Everyone else, start pointing fingers.',
    '{pres}, you\'re President now. Choose your Secretary. Choose wisely. Or don\'t. I love drama.',
    'President {pres}. Who do you trust with the files?',
    '{pres} is President this round. The rest of you, make some noise.',
  ],
  voteNow: '{pres} wants {sec} as Secretary. Vote on your phone.',
  votePass: 'Passed. {pres} and {sec} take the files.',
  voteFail: ['Rejected. [beat] The village is getting restless.', 'No deal. [sighs] One step closer to a shutdown.'],
  voteFail2: '[nervous] That\'s two in a row. One more and the whole village shuts down.',
  shutdown: '[sighs] Three failed votes. Greenwater shuts down. [beat] And while nobody is watching, a file gets signed anyway.',
  notPuppet: '{sec} is the new Secretary. [beat] And {sec} is... not the Puppet. [relieved] Phew. For now.',
  filesPres: '{pres}, three files. Throw one in the bin. Quietly.',
  filesSec: '{sec}, two files left. Sign one.',
  protect: ['[relieved] Protect! {title}.', '[happy] A Protect file. {title}.', 'Protect. {title}. The paddy fields thank you.'],
  sell: ['[gasps] Sold! {title}.', '[sighs] A Sell file. {title}.', 'Sell. {title}. [beat] Somewhere, the Godfather is smiling.'],
  claims: 'President. Secretary. What did you see? Tell us on your phone.',
  clash: '[delighted] Ooh. Those two stories do not match.',
  inquiry: '{pres} can look into one player\'s file. Pick someone.',
  inquiryDone: '{pres} has seen {target}\'s file. [beat] Ask {pres} what it said. They might even tell the truth.',
  peek: '{pres} gets a secret look at the next three files.',
  urgent: '{pres} calls an urgent meeting and picks the next President.',
  urgentDone: '{target} will run the next round.',
  runout: '[dramatic] {pres} must run someone out of town. [beat] Choose.',
  runoutDone: '{target}, your bus is here. [beat] Pack your things.',
  notPuppetGone: '[beat] The village is not saved yet. So {target} was not the Puppet.',
  vetoUnlocked: '[whispers] From now on, the Secretary can ask to throw both files away. If the President agrees.',
  vetoAsk: '{sec} wants to throw both files away. {pres}, do you agree?',
  vetoYes: 'Both files go in the bin. [beat] Nothing gets signed.',
  vetoNo: 'Refused! {sec}, sign one.',
  rumour: ['[whispers] Someone at the tea shop says... {text}', '[mischievous] I heard a rumour... {text}', 'A little bird told me... {text}'],
  winVillage: '[excited] Greenwater is saved! [beat] The Godfather\'s car just drove away. In reverse.',
  winGodfather: '[sighs] It\'s over. Greenwater belongs to the Godfather now. [beat] My tea is a premium experience from tomorrow.',
  winPuppetElected: '[gasps] {name} was the Puppet. And now the Puppet runs the council. [beat] The Godfather wins.',
  winPuppetGone: '[excited] {name} was the Puppet! Run out of town! Greenwater is saved!',
  reveal: 'Let\'s see who was who.',
  goodnight: '[warmly] Same time next week. If the village is still here.',
};

// The tutorial: six slides on the TV, read by the gossip. Played once per room, skippable.
const TUTORIAL = [
  { key: 'teams', title: 'Two sides', line: "Here's how it works. Most of you are honest villagers. A few of you secretly work for the Godfather, and they know each other. [beat] One of them is his Puppet." },
  { key: 'round', title: 'Every round', line: 'Every round there is a President. The President picks a Secretary, and everyone votes yes or no on that pair. [beat] Everybody sees how you voted.' },
  { key: 'files', title: 'The files', line: "If they get in, the President draws three files, secretly bins one, and passes two to the Secretary, who signs one. Green protects the village. Red sells it. [beat] And the tray is rigged. There are far more red files than green. So even an honest President can get stuck with nothing but Sell." },
  { key: 'claims', title: 'Who is lying?', line: "After every file, the President and Secretary tell you what they saw. They are allowed to lie. [beat] If their stories don't match, somebody is lying. The TV keeps a record of every claim." },
  { key: 'powers', title: 'Powers and shutdowns', line: 'Some Sell files give the President a power. Look into a player, peek at the next files, pick the next President, or run someone out of town. [beat] And if three votes fail in a row, the village shuts down and a file gets signed anyway.' },
  { key: 'win', title: 'How to win', line: "Villagers win with five Protect files, or by running the Puppet out of town. The Godfather wins with six Sell files. [beat] Or if the Puppet becomes Secretary once three Sell files have passed. So late in the game, be very careful who you vote in. [beat] Oh, and send me rumours from your phone. I read everything." },
];
// One-time tips during the first game of the night.
const TIPS = {
  vote: 'Remember, everyone will see how you voted. That is evidence.',
  limited: "Tip. Whoever was just President or Secretary can't be Secretary this round. The TV marks them.",
  fail: 'Tip. That was a failed vote. Three in a row and the village shuts down.',
  files: 'House rule. No talking while the files are out.',
  claims: 'Those dots on the register show what each of them claimed. Green is Protect. Keep an eye on them.',
  three: '[serious] Three Sell files. From now on, if the Puppet is elected Secretary, the Godfather wins on the spot.',
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
