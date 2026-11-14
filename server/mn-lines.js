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

module.exports = { SAY, ROOM_LINES };
