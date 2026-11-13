'use strict';
// Vince Velvet: gold suit, perfect teeth, zero morals. Forty years hosting RIGGED! and never once honest.
// {name} {target} {n} {card} {answer} {amount} {by} are filled in by the game. Lists get a random pick.

const SAY = {
  welcome: "Good evening, ladies, gentlemen and whatever you are! Welcome to RIGGED! The only quiz show where the questions are fair and absolutely nothing else is. I'm your host, Vince Velvet.",
  welcomeHouse: "And because there are only two of you, I'll be playing too. Say hello to The House. The House plays to win, the House cheats, and if the House finishes first, nobody wins. Least of all you.",
  dossier: "Before we start, I need to know you. Intimately. Your phones have a few questions. Answer honestly. Or don't. I'll find out either way.",
  dossierMid: ["Take your time. Actually, don't. We've got sponsors.", "Some of these answers are already concerning. Keep going.", "Lovely, lovely. The lawyers will hate this."],
  dossierDone: "Thank you. That's all going in your permanent file. Let's play!",

  round: {
    1: "Round one. The Warm-Up! Four questions. The first one is clean. After that, it gets dirty.",
    2: "Round two. The Lie Detector! I'll give you a weird true fact with a blank. You fill in a fake answer. Fool your friends, collect their money.",
    3: "Round three. Who In This Room? Remember the Dossier? I do. Let's find out who wrote what.",
    3.5: "Round three. Lie About Yourself! I'll show you one of your Dossier answers. Write a fake one next to it. Your rival guesses which is real.",
    4: "Round four. The Bomb! One phone gets the bomb and a true or false question. Get it right and pass it on. Get it wrong and, well. Boom.",
    5: "Round five. Closest Number! Real numbers, real guesses, and a side bet on who's going to be the most hilariously wrong.",
    6: "Round six. Double Trouble! Everything is worth double, sabotage is half price, and I have had three espressos.",
    7: "The finale! The Rigged Ladder! Seven rungs, two hundred and fifty Bucks a rung, and two thousand Bucks for whoever reaches the top first. The room picks your questions. Climb!",
  },
  demoSab: "From now on, the buttons under your answers are sabotage. Pick a nasty trick, tap a rival's face, and it hits their phone instantly. Buy a shield if you're scared. You should be.",
  demoRemote: "And whoever is in last place gets my Audience Remote. Boo, cheer, heckle, or spin the Rule Wheel. Free, once per question. Losing has its perks.",
  demoBribe: "Bribes are open! Hints, peeks, stopwatches. All secret. Mostly. I'm a terrible liar about other people's money.",
  demoCopy: "And now, copying! Once somebody locks in, you can pay to copy them. Blind is cheaper. Named is classier. They get a royalty either way.",

  read: ['{q}'],
  lastSecs: ['Five seconds!', 'Tick tock!', 'Lock it in!', 'Any time now!'],
  allLocked: ['Everyone locked in. Brave.', "All in. Let's see.", 'Locked and loaded.'],
  reveal: ['The answer is... {answer}!', "It's {answer}!", '{answer}! Obviously.', 'And the right answer is {answer}.'],
  nobody: ['Nobody got it. Not one of you. I am so proud.', 'Zero for everyone. The House thanks you.'],
  everyone: ['Everybody got it. Boring! Next.', 'All of you? Someone leaked the answers. It was me.'],
  oneRight: ['Only {name} got that. Suspicious.', '{name} alone! Somebody check their sleeves.'],

  // tricks
  sabHit: ['{by} just hit {target}!', 'Oof, {target}! Courtesy of {by}.', '{by} is playing dirty with {target}. I love it.', 'Direct hit on {target}!'],
  sabBounce: ["{target}'s shield bounced it straight back at {by}!", 'Shield! {by} gets a taste of their own medicine.'],
  bribeHint: ["Someone in this room has been VERY generous tonight.", "I've just been tipped. I won't say who. Rhymes with... no.", 'Ooh. A little brown envelope. Thank you, anonymous friend.', 'Somebody just bought themselves a favour.'],
  bribeSnitch: ['{by} just bribed me! Snitches get riches. Well, I do.', 'Breaking news: {by} paid for a {card}.'],
  copied: ['{by} is copying {target}. Shameless. Respect.', 'Copy cat alert! {by} is riding on {target}.'],
  copyWrong: ['And {by} copied {target}, who was wrong. Beautiful.'],
  heckle: ['{target}, a message from the cheap seats: {heckle}', '{by} wants {target} to know: {heckle}'],
  boo: ['{by} booed {target}! Five seconds gone.', 'The crowd turns on {target}!'],
  cheer: ['{by} is cheering for {target}. Double money on their next right answer.'],
  spin: ['{by} just spun the Rule Wheel! After this question, the rules change.'],

  // rule wheel
  wheel: ['Time to spin the Rule Wheel! {name}, you are in last place, so you get to choose.', 'Rule Wheel! {name}, you are losing, so the power is yours.', '{name}, from the bottom of the leaderboard, pick a new rule.'],
  wheelPicked: ['{name} picks... {card}!', 'And the new rule is {card}!', '{card}! Excellent choice, {name}.'],
  vetoed: ['VETOED! {by} paid to make that card disappear. Money talks.', 'Ooh, {by} had a veto. That card is gone.'],
  ruleOff: '{card} is off the board.',
  chairs: 'Musical Chairs! Everybody shuffle one seat to the left. Your money is now your neighbour\'s money.',
  switch: 'Switcheroo! {name} and {target}, you have just swapped all your Bucks.',
  passphone: 'Pass the Phone! Everybody, hand your phone to the person on your left. Now.',
  passBack: 'Phones back to their owners, please. No peeking at their messages.',
  alliance: 'Alliance! You are paired up for the next round. Share the money, share the shame.',
  jackpot: 'Jackpot! The next question is worth a thousand Bucks to the fastest right answer.',
  house: 'The House Always Wins! I am taking ten percent from everybody. The next correct answer wins the whole pot.',
  jackpotWon: '{name} grabs the jackpot!',
  potWon: "{name} takes the House's pot! {amount} Bucks!",

  // lie detector
  lieWrite: ['Write your lie. Make it believable.', 'Lie to me. You are good at it, I can tell.'],
  lieVote: ['Now, find the truth. One of these is real. The rest are lies. Including mine.'],
  lieFooled: ['{names} fell for it!', 'That was {author}! And it fooled {names}.'],
  lieNobody: ['Nobody fell for that one. Sad.'],
  lieVince: ['That one was mine! Pay up, {names}.', "That was my lie, and {names} fell for it. Two hundred Bucks, thank you."],
  lieTruth: ['And the truth is... {answer}!'],

  // who in this room
  whoAsk: ['Who wrote this?', 'Somebody in this room wrote this. Who?'],
  whoReveal: ['It was {name}!', 'That was {name}! Of course it was.', '{name} wrote that. Are you okay, {name}?'],
  layWrite: ['Here is one of your own Dossier answers. Write a fake one to sit next to it.'],
  layAsk: ['Which one did {name} really write?'],

  // bomb
  bombStart: ['Bomb number {n}! {name}, you have it.', 'Here comes bomb {n}. {name}, catch!'],
  bombPass: ['Pass!', 'Next!', 'Safe!', 'Keep it moving!'],
  bombBoom: ['BOOM! {name} blew up!', 'Kaboom! Sorry, {name}. Not sorry.', 'And {name} is toast!'],

  // closest number
  numAsk: ['{q} Guess a number.'],
  numBet: ['Now, bet a hundred Bucks on who will be the furthest off.'],
  numReveal: ['The answer is {answer}!'],
  numClosest: ['{name} was closest!', 'Closest guess: {name}!'],
  numFurthest: ['And the most wrong person in the room is {name}!'],

  // ladder
  ladderGo: 'Three, two, one, climb!',
  ladderLift: '{name} bought a lift! Up a rung.',
  ladderGrease: '{by} greased the ladder under {target}! Down they go.',
  ladderTop: '{name} reached the top!',
  ladderTime: "Time's up!",

  // scores
  leader: ['{name} is in the lead. I hate that.', '{name} is winning. For now.', 'Look at {name}, top of the board. Somebody do something.'],
  bottom: ['And {name} is in last place, which means {name} picks the next rule. Be afraid.', 'Down at the bottom, {name}. Never mind, last place has all the power here.', '{name}, you are last. Enjoy the remote.'],
  amnesiaLie: ['Who is winning? {name}. Definitely. Probably. No idea.', "I can tell you that {name} is winning. I can also tell you I'm lying."],
  robin: ['Robin Hood! {name} pays two hundred Bucks to {target}.'],
  bounty: ['Bounty! {name} steals from the leader.'],

  // end
  results: "That's the show! Let's count the money. The money that's left, anyway.",
  winner: '{name} wins RIGGED! with {amount} Bucks! Congratulations, you crook.',
  houseWins: "The House wins! Which means nobody wins. Thank you for your money, and goodnight!",
  goodnight: "I'm Vince Velvet. Remember: it's not cheating if the host is in on it. Goodnight!",
};

module.exports = { SAY };
