'use strict';
// Vince Velvet: gold suit, perfect teeth, zero morals. Forty years hosting RIGGED! and never once honest.
// {name} {target} {n} {card} {answer} {amount} {by} {q} {a} are filled in by the game. Lists get a random pick.

const SAY = {
  welcome: "Good evening, ladies, gentlemen and whatever you are! Welcome to RIGGED! The only quiz show where the questions are fair and absolutely nothing else is. I'm your host, Vince Velvet.",
  welcomeHouse: "And because there are only two of you, I'll be playing too. Say hello to The House. The House plays to win, the House cheats, and if the House wins, nobody wins. Least of all you.",
  rules: "Here's how it works. Answer questions, win Bucks. Bucks buy you a head start in the final race, and whoever wins the race wins the show. Everyone gets one sabotage for the whole game. Use it wisely. Or cruelly.",
  dossier: "But first, I need to know you. Intimately. Three questions on your phones. Sixty seconds. Answer honestly. Or don't. I'll use it against you either way.",
  dossierMid: ["Twenty seconds! Type faster. Lie faster.", "Some of these answers are already concerning. Keep going.", "Lovely, lovely. The lawyers will hate this."],
  dossierDone: "Thank you. That's all going in your permanent file. And I will be reading from it.",

  round: {
    1: "Round one! Five questions, and one from your Dossier. The first question is easy. That's the last kindness you'll get from me.",
    2: "Round two. The Lie Detector! I give you a weird true fact with a blank. You write a fake answer. Fool your friends, take their money.",
    3: "Round three. More trivia, and it's harder. Much harder. I wrote these myself, out of spite.",
    4: "Round four. The Bomb! One phone gets the bomb and a true or false question. Get it right, pass it on. Get it wrong, and, well. Boom.",
  },
  demoSab: "Quick reminder. That big button on your phone is your one sabotage for the whole game. Tap it, tap a face, and something horrible happens to their phone. I won't tell you what. Neither will it.",

  lastSecs: ['Five seconds!', 'Tick tock!', 'Lock it in!', 'Any time now!'],
  reveal: ['The answer is... {answer}!', "It's {answer}!", '{answer}! Obviously.', 'And the right answer is {answer}.'],
  nobody: ['Nobody got it. Not one of you. I am so proud.', 'Zero for everyone. The House thanks you.'],
  everyone: ['Everybody got it. Boring! Next.', 'All of you? Someone leaked the answers. It was me.'],
  oneRight: ['Only {name} got that. Suspicious.', '{name} alone! Somebody check their sleeves.'],

  sabHit: ['{by} just sabotaged {target}!', 'Oof, {target}! Courtesy of {by}.', '{by} is playing dirty with {target}. I love it.', 'Direct hit on {target}!'],

  // the Dossier comes back
  whoAsk: ['From the Dossier. Who wrote this?', 'Somebody in this room wrote this. Who?', 'Dossier time. One of you said this. Out loud. Well, on a phone.'],
  whoReveal: ['It was {name}!', 'That was {name}! Of course it was.', '{name} wrote that. Are you okay, {name}?'],
  roast: [
    "Let's check {name}'s file. Question: {q} Answer: {a}. That explains the scoreboard.",
    "{name}, you told me: {a}. I think about that a lot. Not in a good way.",
    "A reminder that {name}, when asked {q}, said: {a}. No further questions.",
    "From the Dossier: {name} says {a}. And yet here they are, on television.",
  ],

  // rule cards
  rulePick: ['Rule card time! {name}, you are in last place, so you pick the next rule.', '{name}, from the bottom of the leaderboard, choose a new rule. Only one rule at a time, so make it hurt.'],
  rulePicked: ['{name} picks... {card}!', 'And the new rule is {card}!', '{card}! Excellent choice, {name}.'],
  ruleReplaced: '{old} is gone.',

  // lie detector
  lieWrite: ['Write your lie. Make it believable.', 'Lie to me. You are good at it, I can tell.'],
  lieVote: ['Now, find the truth. One of these is real. The rest are lies. Including mine.'],
  lieFooled: ['{names} fell for it!', 'That was {author}! And it fooled {names}.'],
  lieVince: ['That one was mine! Pay up, {names}.', "That was my lie, and {names} fell for it. Two hundred Bucks, thank you."],
  lieTruth: ['And the truth is... {answer}!'],

  // bomb
  bombStart: ['Bomb number {n}! {name}, you have it.', 'Here comes bomb {n}. {name}, catch!'],
  bombPass: ['Pass!', 'Next!', 'Safe!', 'Keep it moving!'],
  bombBoom: ['BOOM! {name} blew up!', 'Kaboom! Sorry, {name}. Not sorry.', 'And {name} is toast!'],

  // showdowns
  showdown: ['Showdown! The leader, {a}, against last place, {b}. One question, fastest right answer wins. Everyone else, place your bets.', 'It is Showdown time! {a} at the top, {b} at the bottom. Head to head. The rest of you, bet on a winner.'],
  showdownHouse: ['Showdown! {a} against {b}. Fastest right answer takes the pot.'],
  showdownDossier: ['A Dossier Duel! I read an answer. You tell me who wrote it, {a} or {b}. Fastest finger wins.'],
  showdownLie: ['A callback! Remember the Lie Detector? One of these is the real fact, one is the lie that fooled the most people. Pick the truth.'],
  showdownWin: ['{name} wins the Showdown and takes {amount} Bucks from {target}!', '{name} wins it! {target}, hand over {amount} Bucks.'],
  showdownNone: ['Neither of you got it. Embarrassing. Bets are off.', 'Two wrong answers! Nobody wins. I win, emotionally.'],
  betsPaid: ['The smart money was on {name}.'],

  // grudge match
  grudge: ['Before the finale, a Grudge Match! {name}, you are in last place. Pick anyone in the room to duel. Win, and you get a head start in the race.', 'Grudge Match! {name}, choose your enemy. Winner gets a head start in the finale.'],
  grudgePicked: ['{name} has chosen... {target}! This is personal.', '{name} picks {target}. Ooh. What did you do, {target}?'],
  grudgeWin: ['{name} wins the Grudge Match and gets a head start!'],

  // finale race
  raceIntro: "The finale! The Rigged Race! Every question, tap every answer that fits. Each right tap moves you forward a step, each wrong tap moves you back. Your Bucks bought you a head start. First across the line wins RIGGED!",
  raceQ: ['{q}', 'Next. {q}', 'Here we go. {q}'],
  raceLead: ['{name} is out in front!', "{name} leads the race! Somebody stop them!", '{name} is pulling away!'],
  raceClose: ['It is neck and neck!', 'Nothing in it!', 'Too close to call!'],
  raceRoom: "The Room! This one's about you lot. Tap every answer {name} wrote in their Dossier.",
  raceWin: '{name} crosses the line! {name} wins RIGGED!',
  raceTime: "That's the last question! Whoever is furthest along wins. And that's {name}!",

  // scores
  leader: ['{name} is in the lead. I hate that.', '{name} is winning. For now.', 'Look at {name}, top of the board. Somebody do something.'],
  bottom: ['And {name} is in last place. Never mind. Last place picks the rules here.', 'Down at the bottom, {name}. Chin up. Lower. There.'],

  // end
  results: "That's the show!",
  winner: '{name} wins RIGGED! Congratulations, you crook.',
  houseWins: "The House wins! Which means nobody wins. Thank you for your money, and goodnight!",
  goodnight: "I'm Vince Velvet. Remember: it's not cheating if the host is in on it. Goodnight!",
};

module.exports = { SAY };
