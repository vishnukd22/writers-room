'use strict';
// Mortimer, the dead butler of Hollowmere House. Unfailingly polite, very dry, quietly delighted when you fail.
// {name} {room} {n} are filled in by the game. Lists get a random pick.

const SAY = {
  welcome: "Good evening, and welcome to Hollowmere House. I am Mortimer. I have been the butler here for forty years, and dead for a hundred. The door has locked behind you. It does that.",
  rules: "You have one candle between you. When it burns out, the house keeps you. Forever. Clear five rooms, collect the pieces of the front door key, and leave before dawn. Do try to work together. The last guests didn't.",
  welcomeBots: "I see there are only two of you. I have taken the liberty of inviting some other guests. Don't ask where they came from.",
  roomsLeft: ['Onwards. The house is getting impatient.', 'Next room. Mind the stairs. Some of them bite.', 'Do follow me. Quietly, if you can manage it.'],

  // when the job cards go out
  jobs: ['Your instructions are on your phones. I suggest you read them.', 'Each of you has a job. Do try to do it.'],

  win: ['Splendid teamwork. Truly. The ghosts are furious.', 'Well. That was unexpectedly competent.', 'A key piece. How very irritating. For the house, I mean.', 'Bravo. I shall inform the others. They will be disappointed.'],
  winFast: ['That quickly? The house will need a lie down.', 'Remarkable. The last guests took a century.'],
  fail: ["Oh dear. Was that scream yours, or the house's? I can never tell.", 'Time is up. The room is not pleased. Neither is your candle.', 'A pity. The house enjoyed that far more than you did.'],
  mistake: ['Tsk.', 'Oh dear.', 'Careful.', 'The candle felt that.'],
  candleHalf: 'Half your candle is gone. I mention it only because I care.',
  candleLow: 'The flame is very low now. I have started airing your rooms.',
  candleOut: "And there goes the candle. Goodnight. Your rooms are ready.",

  possessIntro: "I'm terribly sorry. The house has chosen... {name}.",
  possessWatch: '{name}, the rest of you may shout. You may not touch.',
  possessWin: ['{name} is free. For now.', 'Well done, {name}. The house will try someone else next time.'],
  possessFail: ['The house enjoyed that. {name} did not.', "Bad luck, {name}. You'll stop shaking eventually."],
  scare: ["Do forgive the staff. They're very keen.", 'Apologies. That one gets out sometimes.', 'Pay no attention to her. She does that.'],

  door: "The Front Door. Every key piece you found is in your hands. The ghosts know you're leaving, and they will try to stop you. Everyone has one last job. Go.",
  doorPieces: { 5: 'All five key pieces. I am almost impressed.', 4: 'Four pieces of the key. You will have to find the last one here.', 3: 'Only three pieces. You will have to find the rest at the door.', low: 'Barely any of the key. This will be difficult. For you.' },
  doorFreeze: ['They are looking. Freeze.', 'Do not move.'],
  escape: 'The door is open. Dawn is breaking. Off you go, then. Do come again. You always do.',
  lost: "The door won't open. The candle is out. Your rooms are ready.",

  end: { win: 'You escaped Hollowmere House.', lose: 'The house kept you.' },
  again: 'Another night? The house would be delighted.',
};

// one line for each room, when its door creaks open
const ROOM_LINES = {
  library: 'The library. The master hid his secrets in his books. His diary pages are scattered among you.',
  maze: 'The hedge maze. Only one of you has a lantern. The rest of you will have to trust them. I would not.',
  cellar: 'The wine cellar. One of these bottles holds the key. The rest hold wine, and in one case, a previous guest.',
  greenhouse: 'The greenhouse. The plants are hungry. They are always hungry. Feed them before they feed themselves.',
  mirror: 'The bathroom. Someone has written on the mirror again. Backwards, naturally.',
  bedroom: 'The master bedroom. It is quite dark. Something lives under the bed. It is shy, but it is not patient.',
  study: 'The study. The old master would like to discuss his will. He is dead, so do humour him.',
  staircase: 'The grand staircase. The stairs move. Make them meet the landing before they get bored of you.',
  ballroom: 'The ballroom. The guests would like a waltz. Do keep in time. They take dancing very seriously.',
  attic: 'The attic. Something is sleeping up here. Some floorboards creak. I would not step on those.',
  nursery: 'The nursery. The doll does not like to be watched while it is watching. Move only when it looks away.',
  chapel: 'The chapel. Ring the bells in the right order, and the spirits will let you pass. Ring them wrong, and, well.',
  clock: 'The clock tower. Set the hands to midnight. The gears are stubborn. So, I gather, are you.',
  well: 'The well. The key is at the bottom, in the bucket. Pull together, or the bucket goes back down.',
  kitchen: 'The kitchen. Brew the antidote. Follow the recipe exactly. Cook would have wanted it that way. Cook is in the pot.',
  fusebox: 'The fuse box. The lights are failing. You will need to flip a great many switches, very quickly.',
  dining: 'The dining room. Dinner is served. Well. It will be, if you serve it. The guests are getting restless.',
  music: 'The music room. The piano plays by itself. Play its tune back, or it will play yours.',
  gallery: 'The portrait gallery. One of these paintings has changed. Find it before the eyes finish turning.',
  seance: 'The seance room. The spirits forbid talking. Point. Mime. Suffer in silence.',
};


// ---------------------------------------------------------------- the 8-bit house
const PX = {
  rules: "You have one candle between you. When it burns out, the house keeps you. Forever. Behind four doors are four rooms, and four pieces of the front door key. Walk the hallway together and choose a door. Every room shows you how first, then lets you practise. Do try to work together. The last guests didn't.",
  hubFirst: 'This is the hallway. Use the arrows on your phone to walk. Stand at a door with most of your group, and in you go. Do look around. The house hides things.',
  hubAgain: ['Back in the hallway. Choose the next door.', 'The hallway again. Where to now?', 'Pick a door. Any door. Well. Not any door.'],
  hubFront: 'All four rooms are done. The front door is waiting. So is the house.',
  hubMercy: 'Your candle is very low. I have opened a little room for you, on the far left. Do not tell the house.',
  hubSlow: 'Indecisive. I shall choose for you.',
  demo: {
    ice: 'Watch my ghost. On ice, you slide until something stops you. A rock, a friend, or a patch of floor. Someone has to stand on each red button, all at once, to open the gate.',
    cellar: 'Watch my ghost. Push the crates onto the red buttons. If one gets stuck in a corner, reset them. The grey iron crates are heavy. Two of you must push, one standing behind the other.',
    dodge: 'Watch. Drag your finger on your phone to move your heart. Dodge everything. A blue bar only hurts if you move, so stand still. An orange bar only hurts if you stand still, so keep moving.',
    chat: 'This ghost wants something. Each of you has a secret clue on your phone. Read them out, work out the right order, then everyone picks the same act. When the ghost is happy, its name turns yellow. Then choose mercy.',
  },
  practice: ['Now you try. This is practice. The candle will not mind.', 'Your turn. Practice first. Nothing counts yet.'],
  stage: { 1: 'Stage one. The candle is burning.', 2: 'Stage two. A little harder.', 3: 'Final stage. Do not disappoint me. Or do. I enjoy it.' },
  stageWin: ['Well done.', 'Splendid.', 'Hm. Competent.', 'That will do.'],
  stageFail: ['Oh dear.', 'Time is up. The candle felt that.', 'The house enjoyed that.'],
  roomKey: ['A piece of the key. The house is sulking.', 'You found the key piece. How very irritating. For the house, I mean.'],
  roomNoKey: ['No key piece from that room, I am afraid. The house will be harder to persuade.', 'The key piece stays here. You will miss it at the end.'],
  mercy: 'A small kindness. Light the candles. Quickly, before the house notices.',
  boss: 'Oh dear. You have woken the house itself. It does not want you to leave. Nobody ever does. Listen to what it remembers, and show it the memories you found. When its name turns yellow, show it mercy.',
  bossKeys: { 4: 'All four key pieces. Its grip is already weak.', 3: 'Three key pieces. That will help.', 2: 'Two key pieces. It will hold on tightly.', low: 'Hardly any of the key. It will hold on very tightly indeed.' },
};
// one story piece after each room, told in the hallway
const STORY = {
  ice: "Every winter, little Lily Hollowmere flooded that hall and let it freeze, so she could skate indoors. The house loved the sound of her laughing. It still listens for it. You found her skates.",
  cellar: "The night the family left, they went out through the cellar, carrying one lantern. The house watched the light go down the hill. It never came back up. You found the lantern.",
  dodge: "The ghosts in the storm room were guests too, once. They sheltered from a storm a hundred years ago. The house was so happy to have company, it never let the storm end. You know now that it must.",
  chat: "Before she left, Lily wrote the house a letter. I never delivered it. I thought it would make the house sad. It says: Thank you for keeping us warm. Let the next people go home. You have the letter now.",
};
const ROOM_INTRO = {
  ice: 'The Ice Hall. The pipes froze a century ago. Nobody fixed them. Nobody ever fixes anything here.',
  cellar: 'The Wine Cellar. The master kept his wine here. Then he drank it. Then he stacked the crates very badly.',
  dodge: 'The Storm Room. The ghosts in here are not angry. They are just very, very bored. Mind the lightning.',
  chat: 'The Parlour. The ghosts in here love a chat. They will not let you pass until they feel listened to.',
};

// ---------------------------------------------------------------- the painted rooms (with acting directions for the voice)
const M2 = {
  welcome: "[slowly] Good evening. [pause] Welcome to Hollowmere House. [chuckles darkly] I am Mortimer, the butler. Dead for a hundred years, give or take. [whispers] The door has locked behind you. It does that.",
  rules: "[clears throat] One candle, shared by all of you. When it goes out... [whispers] you stay. Forever. [brightly] So. Pick a door, do what your phone tells you, and try not to scream. It excites the house.",
  doors: ['[whispers] Two doors. Choose wisely. [pause] Or don\'t. I am not your mother.', '[sighs] More doors. The house does love its doors.', '[mischievously] Which one? I know what is behind both. I am not telling.'],
  lastDoor: '[ominously] One door left. No choice now.',
  mercyDoor: '[softly] Your candle is very weak. I have left a little door open for you. [whispers] Do not tell the house.',
  intro: {
    doll: '[whispering] The nursery. [pause] She hates being watched. But she loves to watch. Move only when her back is turned.',
    hide: '[gleefully] Hide and seek! The house\'s favourite game. [whispers] It always wins.',
    seance: '[dramatically] A seance. The spirits wish to speak. [dryly] Badly. They need your help to spell.',
    ice: '[shivering] The ice hall. Mind your step. [chuckles] You will not be able to stop.',
    mercy: '[gently] Quickly now. Everyone hold the flame, all at once.',
  },
  round: { 1: '[whispers] Round one.', 2: '[ominously] Round two. [pause] It gets worse.' },
  win: ['[impressed] Well, well.', '[dryly] Beginner\'s luck.', '[sighs] Fine. Well done.', '[surprised] Oh. You actually did it.'],
  fail: ['[delighted] Oh dear!', '[chuckles] The candle felt that.', '[whispers] The house is pleased.', '[mock sympathy] Never mind. You were doomed anyway.'],
  key: ['[annoyed] A piece of the key. The house is sulking.', '[grudgingly] A key piece. Do not get cocky.'],
  noKey: ['[gleefully] No key piece. The house keeps it.', '[tutting] No key. You will regret that later.'],
  collapse: '[urgently] Oh no. [pause] You have made it angry. The house is coming down! [shouting] Every room, one more time. FAST!',
  quake: ['[shouting] Faster!', '[panicking] The ceiling!', '[shouting] Keep going!', '[screaming] Run!'],
  afterScare: ['[chuckles] Sorry. The house does that.', '[innocently] Was that me? No.', '[whispers] Did somebody scream? I heard screaming.'],
  intro2: {
    lights: '[whispers] Lights out. [pause] One of you gets the lantern. The rest of you... [chuckles] good luck.',
    fuse: '[sighs] The fuse box. Again. One of you sees the box, the rest of you read the manual. Talk to each other. Loudly.',
    kitchen: '[cheerfully] The kitchen! Cook is very particular. [whispers] Do not spoil the soup.',
  },
  possessed: '[whispers] Careful. [pause] One of you is not quite themselves this round.',
  accuse: '[slyly] So. Who was it? Point the finger.',
  caught: ['[impressed] Caught them! The spirit lets go.', '[sighs] Spotted. How disappointing. For the spirit.'],
  missed: ['[gleefully] Wrong! The spirit got away with it.', '[chuckles] Not them. The real one is smiling right now.'],
  escape: '[amazed] The front door... is open. [pause] You actually made it. [softly] Go on, then. Before it changes its mind.',
  candleOut: '[whispers] The candle is out. [pause] Welcome home. [chuckles darkly] Forever.',
  candleHalf: '[concerned] Your candle is half gone. I would hurry.',
  candleLow: '[whispers] The candle is nearly out. I can hear the house breathing.',
};

module.exports = { SAY, ROOM_LINES, PX, STORY, ROOM_INTRO, M2 };
