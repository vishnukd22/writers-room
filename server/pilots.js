'use strict';
// WRITERS' ROOM (pilot season): everything the host and the Network say, and every prompt the room writes to.
// Johnny Primetime is our host: a washed-up game show host now "running" the guild for the Network.
// [tags] are ElevenLabs v3 delivery cues. {placeholders} are filled in by the game.

const HOST = {
  welcome: "[excited] Welcome to Writers' Room, where dreams come true... [beat] and then get cancelled after one episode. I'm Johnny Primetime. Yes, THE Johnny Primetime. [beat] Stop clapping. [beat] Nobody's clapping. Okay.",
  how: "[briskly] Here's the deal. The Network wants a hit. You lot are going to write two pilots tonight. You write, you vote, and I make it come to life. [beat] If neither pilot scores a seven, the Network fires all of us. [whispers] Including me. [normal] So no pressure.",
  showrunner: '[excited] {name}, you are tonight\'s showrunner! Pick a genre on your phone. [beat] Everybody else, shout your opinions at {name}. That always helps.',
  showrunner2: '[dramatic] Pilot number two. {name}, the network trusts you. [beat] I don\'t. But the network does. Pick a genre.',
  genrePicked: '[excited] {genre}! [beat] Bold. Brave. Probably a mistake. Let\'s go.',
  pitchIntro: "[briskly] First, the pitch. One sentence. Fill in the blanks on your phone. Make the Network want to throw money at you. You've got two minutes.",
  traitsIntro: "[excited] Now we build our stars. Everyone gets a different question about our hero or our rival. Answer it. Don't overthink it. [beat] Actually, do overthink it. It's funnier.",
  problemIntro: '[dramatic] Act one. Every show needs a problem. Finish the sentence: it all goes wrong when... [beat] And remember the Network note!',
  endingIntro: '[dramatic] The finale. How does it end? [beat] The Network has one more note. Of course they do.',
  writeHalf: '[amused] One minute left. Some of you are typing. Some of you are just staring at your phone like it owes you money.',
  writeLast: '[impatient] Thirty seconds! {names}, the whole room is looking at you.',
  hurry: [
    '[impatient] {w}! The room says hurry up. I say hurry up. Your mother says hurry up.',
    '[dry] {w} is still typing. Bless.',
    '[whispers] {w}, it doesn\'t have to be good. It has to be finished.',
    '[sarcastic] Take your time, {w}. Shakespeare also kept people waiting. Then he died.',
  ],
  shortlist: '[briskly] Lots of entries! Your phone is showing you two of them. Like the ones you love. The best three make the final.',
  finalists: '[excited] Here are your finalists.',
  voteNow: '[briskly] Vote on your phone. You can\'t vote for yourself. [beat] I checked.',
  pitchWinner: '[excited] The Network is buying it! Written by... {name}!',
  beatWinner: '[excited] The room has spoken! That one came from {name}.',
  tie: "[dry] It's a tie. Showrunner {name}, you broke it. Hope you can live with that.",
  dateJudge: '[dramatic] Two entries. One winner. The Network exec will decide.',
  meetHero: '[excited] Meet our hero.',
  meetRival: '[mischievous] And our rival.',
  rollScene: '[excited] Roll it!',
  screening: '[dramatic] The Network watched your pilot. [beat] They have notes.',
  rating: '[excited] {title} scores... {score} out of ten!',
  ratingLow: '[sighs] {title}. {score} out of ten. [beat] I\'ve seen worse. I\'ve hosted worse.',
  upfronts: '[dramatic] The upfronts. The Network decides who gets a series, and who gets a cardboard box.',
  greenlit: '[excited] {title} gets a full season! You all keep your jobs! [beat] For now.',
  fired: "[sighs] Neither pilot hit a seven. [beat] You're all fired. [beat] I'm fired. [beat] Somebody's taking the coffee machine.",
  headWriter: '[excited] And your head writer tonight, with the most ideas on screen, is... {name}!',
  goodnight: "[warmly] That's our show. Goodnight, writers. [beat] Same time next week, if they let us back in the building.",
};

// One-sentence pitch, built from four short blanks.
const PITCH = [
  { k: 'a', label: 'A...', hint: 'blind chef' },
  { k: 'who', label: 'who...', hint: 'cooks by smell' },
  { k: 'must', label: 'must...', hint: 'win MasterChef' },
  { k: 'before', label: 'before...', hint: 'her nose insurance runs out' },
];

// Questions for the character round. The first two are always asked.
const TRAITS_FIRST = [
  { who: 'hero', k: 'name', q: "What is our hero's name?" },
  { who: 'rival', k: 'name', q: "What is our rival's name?" },
];
const TRAITS = [
  { who: 'hero', k: 'collects', q: 'What does our hero secretly collect?' },
  { who: 'rival', k: 'fear', q: 'What is our rival terrified of?' },
  { who: 'hero', k: 'catchphrase', q: "What is our hero's catchphrase?" },
  { who: 'rival', k: 'secret', q: "What is our rival's darkest secret?" },
  { who: 'hero', k: 'fear', q: 'What is our hero terrified of?' },
  { who: 'rival', k: 'catchphrase', q: "What is our rival's catchphrase?" },
  { who: 'hero', k: 'habit', q: "What is our hero's most annoying habit?" },
  { who: 'rival', k: 'collects', q: 'What does our rival secretly collect?' },
  { who: 'hero', k: 'secret', q: "What is our hero's darkest secret?" },
  { who: 'rival', k: 'habit', q: "What is our rival's most annoying habit?" },
];
const TRAIT_LABEL = { collects: 'Secretly collects', fear: 'Terrified of', catchphrase: 'Catchphrase', secret: 'Dark secret', habit: 'Annoying habit' };

// What the room finishes in each act.
const BEATS = {
  problem: { label: 'Act one', lead: 'It all goes wrong when...', hint: 'the hero accidentally marries the rival' },
  ending: { label: 'The finale', lead: 'In the end...', hint: 'they team up and open a dosa truck' },
};

// The Network meddles. One note for act one and one for the finale.
const NOTES = [
  'Our sponsor is Maggi. Get Maggi in there.', 'Our test audience is seven years old.', 'Someone has to die.', 'Make it sexier. Much sexier.',
  'We need a dance number.', 'Add a dog. Audiences love dogs.', 'The hero needs a long-lost twin.', 'It has to happen at a wedding.',
  "Somebody's mother must get involved.", 'We need a huge explosion.', 'Make it educational. Somehow.', 'There must be a dramatic slap.',
  'Add a celebrity cameo.', 'The rival must turn out to be right.', 'It has to end with a song.', 'Set it on a plane.',
  'Somebody has to cry. Ugly crying.', 'The Network CEO\'s nephew needs a role.', 'Make it a musical. Just this part.', 'Somebody must say "I am your father".',
];

// Ticker headlines along the bottom of the TV. {title}, {genre}, {network} filled in.
const TICKER = [
  'BREAKING: Network executive describes {title} as "legally a TV show"', 'Critics already disappointed by pilot they have not seen',
  'Writers\' guild coffee machine declared a crime scene', '{genre} ratings up 2%, nobody knows why', 'Johnny Primetime denies being washed up',
  'Studio intern promoted to head of drama after writing one good tweet', 'Test audience walks out during the trailer for {title}',
  'Network insists the dog stays', 'Showrunner seen crying in the car park. Again.', 'Sources say the twist is "a second twist"',
  'Advertisers pull out of {title}, then quietly back in', 'Local man watches all of {title}, demands refund for time',
];

// When the AI is offline, scenes are built from these. {hero}, {rival}, {beat}.
const SCENE_FALLBACK = {
  problem: [
    ['narrator', 'And then. {beat}'],
    ['hero', 'No. No no no. This cannot be happening.'],
    ['rival', 'Oh, it is happening. And I planned all of it.'],
    ['hero', 'You will pay for this, {rival}.'],
  ],
  ending: [
    ['narrator', 'And in the end... {beat}'],
    ['rival', 'I suppose... I was wrong about you, {hero}.'],
    ['hero', 'Everyone was wrong about me. That is my brand.'],
    ['narrator', 'Roll credits.'],
  ],
};
const EXEC_FALLBACK = [
  'I laughed. Then I checked the budget and stopped laughing.', 'My kids would watch this. My kids are not allowed to watch TV.',
  'It is a bold choice. We hate bold choices. We love this.', 'I need to lie down. In a good way. Mostly.',
  'Strong pilot. Weak hair. Fix the hair.', 'I have questions. Lawyers will have more questions.',
];

module.exports = { HOST, PITCH, TRAITS_FIRST, TRAITS, TRAIT_LABEL, BEATS, NOTES, TICKER, SCENE_FALLBACK, EXEC_FALLBACK };
