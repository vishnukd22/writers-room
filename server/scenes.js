'use strict';
// WRITERS' ROOM (Cold Read + CUT!): everything the scenes draw from. Add to any list and it just works.
// {a} and {b} are replaced with the actors' names where used.

// Per genre: a one-line setting, roles for the actors (2 or 3 are used), and possible opening lines for actor 1.
const SETUPS = {
  serial: {
    setting: 'The family haveli. Diwali night. Somebody has hidden the will.',
    roles: ['the scheming mother-in-law', 'the innocent new bahu', 'the evil twin nobody knew about', 'the uncle who only says "Hai Ram"'],
    openers: ['You think you can walk into MY kitchen and touch MY pickle?', 'Who switched off the diya? Who?!', 'I know what you did at the sangeet.'],
  },
  hospital: {
    setting: 'A hospital supply closet. A patient is flatlining down the hall.',
    roles: ['a surgeon who faints at blood', 'the nurse who knows everything', 'the intern who lied on their CV', 'a patient who refuses to leave'],
    openers: ['We need to talk. Not about the patient. About us.', 'Scalpel. No. The other scalpel. The emotional one.', 'I have twelve minutes before my next surgery and I want to spend them crying.'],
  },
  noir: {
    setting: 'A frozen lake at dawn. There is a body under the ice. Nobody is surprised.',
    roles: ['a detective who hates snow', 'the suspect who knits', 'the coroner who is far too cheerful', 'the dead man\'s twin'],
    openers: ['The body was found at four. I was here at three. Explain that.', 'You knitted this sweater. And there is blood on the sleeve.', 'In this town, everybody lies. Except the snow.'],
  },
  dating: {
    setting: 'The villa firepit. Recoupling is in ten minutes.',
    roles: ['the influencer with a fake tan', 'the gym boy who loves his mum', 'the bombshell who just arrived', 'the producer pretending not to stir it'],
    openers: ['Can I pull you for a chat?', 'I\'m not here to make friends. I\'m here to make a skincare brand.', 'My head is turned. My neck is literally turned. I need a physio.'],
  },
  space: {
    setting: 'The bridge of a dying starship. Life support has six minutes left.',
    roles: ['the captain who has never flown', 'the alien diplomat with a cold', 'the robot who wants to be a poet', 'the chosen one, allegedly'],
    openers: ['Captain, the galaxy is collapsing and you are eating crisps.', 'I sense a disturbance. It is my stomach.', 'Before we die, there is something I must tell you about the toilet.'],
  },
  royal: {
    setting: 'The palace ballroom. The king has been poisoned. Again.',
    roles: ['the queen who poisons people', 'the secret heir who works in the stables', 'the duchess who faints for attention', 'the royal taster, very nervous'],
    openers: ['The king is dead. Long live... whoever is holding this goblet.', 'Your Majesty, your corset is speaking to me.', 'I have come to claim my throne. And also a sandwich.'],
  },
  truecrime: {
    setting: 'An interview room. The tape is rolling. The neighbour looks guilty.',
    roles: ['the suspicious neighbour', 'the podcast host who solved nothing', 'the detective who retired twice', 'the victim\'s very calm wife'],
    openers: ['Where were you on the night of the barbecue?', 'For the podcast, can you sound more guilty?', 'I didn\'t kill him. I just... helped him stop living.'],
  },
  zombie: {
    setting: 'A barricaded supermarket. The zombies are at the glass.',
    roles: ['the survivor who hoards toilet roll', 'the leader nobody voted for', 'the one who is clearly bitten', 'the zombie who seems nice'],
    openers: ['Show me your arm. Now. The other arm. The third arm.', 'We have two cans of beans and one chance.', 'I\'m not bitten. This is a love bite. From a zombie. It\'s different.'],
  },
  cop80s: {
    setting: 'The precinct. The captain wants their badges by sunset.',
    roles: ['the loose cannon cop', 'the partner two days from retirement', 'the captain who shouts everything', 'the informant in a pastel suit'],
    openers: ['Captain wants our badges. I say we give him our feelings instead.', 'You blew up the car, partner. My car. With my lunch in it.', 'I play by my own rules. Rule one, no rules. Rule two, snacks.'],
  },
  cooking: {
    setting: 'The final cook-off. Ninety seconds left. The souffle has collapsed.',
    roles: ['the terrifying head judge', 'the contestant who only cooks Maggi', 'the sous chef who sabotages everyone', 'the guest judge who is allergic to food'],
    openers: ['What... is... this?', 'Chef, I can explain. The chicken was already like that.', 'You call that a souffle? I call that a war crime.'],
  },
  kdrama: {
    setting: 'A bus stop in the rain. They have met by fate. Fourth time this week.',
    roles: ['the rich heir with a cold heart', 'the poor girl with a big heart', 'the jealous best friend', 'the grandmother who controls everything'],
    openers: ['Why is it always you, at every bus stop, in every rain?', 'Let go of my wrist. No. Hold it again.', 'My chaebol family will never accept you. Also you owe me for that umbrella.'],
  },
  nature: {
    setting: 'The savanna at dusk. Two humans approach the watering hole.',
    roles: ['the dominant alpha uncle', 'the young human seeking a mate', 'the rival who smells of Lynx', 'the documentary crew member who got too close'],
    openers: ['This is my watering hole. Find your own.', 'I have been watching you for three weeks. For science.', 'Do not make eye contact. He can smell fear and cologne.'],
  },
  telenovela: {
    setting: 'The hacienda staircase. Someone has torn up the love letter.',
    roles: ['the heiress with a dark secret', 'the gardener who is secretly a millionaire', 'the evil stepmother in red', 'the twin who came back from the dead'],
    openers: ['You! I thought you died at sea!', 'Our love is impossible. You are my cousin. Probably.', 'I did not tear the letter. I bit it.'],
  },
  legal: {
    setting: 'The courtroom. The surprise witness has just walked in.',
    roles: ['the lawyer who never studied law', 'the surprise witness', 'the judge who is falling asleep', 'the defendant, clearly guilty'],
    openers: ['Objection! I object to all of this.', 'Your Honour, I would like to call my mother to the stand.', 'Where were you on the night of the murder? And why were you wearing my shirt?'],
  },
  superhero: {
    setting: 'A city rooftop. The villain has stolen the cape.',
    roles: ['a hero whose power is mild inconvenience', 'the villain who just wants a hug', 'the sidekick who wants a raise', 'the mayor who is in on it'],
    openers: ['Give me back my cape. It has sentimental value. And my house keys.', 'I didn\'t choose to be a hero. A pigeon bit me.', 'You and I are not so different. We both moisturise.'],
  },
  corporate: {
    setting: 'A meeting room. Layoffs start at three. It is two fifty-nine.',
    roles: ['the manager who loves synergy', 'the employee who replies all', 'the intern running the company in secret', 'HR, smiling too much'],
    openers: ['Let\'s take this offline. And by offline I mean to the roof.', 'Per my last email, I am resigning. Per my next email, I am staying.', 'Can I borrow you for a quick sync about your future here?'],
  },
  shakespeare: {
    setting: 'A castle balcony at midnight. A ghost has been spotted. It is wearing Crocs.',
    roles: ['the prince who cannot decide', 'the witch with a prophecy', 'the jester who knows too much', 'the ghost of the king'],
    openers: ['To be, or not to be. Actually, can I get back to you?', 'Hark! What light through yonder window breaks? Oh. It is a phone.', 'Is this a dagger I see before me? No. It is a spoon. Even worse.'],
  },
  western: {
    setting: 'The saloon. High noon. Someone has stolen the sheriff\'s horse.',
    roles: ['the sheriff who is scared of horses', 'the outlaw with a soft side', 'the saloon owner who waters the whisky', 'the horse, in human form'],
    openers: ['This town ain\'t big enough for the both of us. It\'s barely big enough for me.', 'Draw. No, I mean draw a picture. I\'m having a day.', 'Where is my horse? And why are you wearing his saddle?'],
  },
  horror: {
    setting: 'The attic of a haunted house. Something is breathing behind the boxes.',
    roles: ['the skeptic who still screams', 'the ghost who is lonely', 'the estate agent selling the house', 'the child who speaks in riddles'],
    openers: ['Did you hear that? That was not the wind. The wind does not say my name.', 'Let\'s split up. It\'s always worked before.', 'I\'m not scared. I just have urgent business in a different country.'],
  },
  heist: {
    setting: 'Inside the vault. The lasers are on. The plan has failed.',
    roles: ['the mastermind with no plan', 'the hacker who cannot type', 'the inside man who is outside', 'the security guard who wants in'],
    openers: ['Okay. Plan B. Does anyone remember plan A?', 'I\'m in. I\'m in the wrong building, but I\'m in.', 'Nobody move. Except you. You can move a little.'],
  },
  cult: {
    setting: 'The wellness retreat bonfire. The leader is about to announce something.',
    roles: ['the cult leader who sells candles', 'the new member who asks questions', 'the true believer', 'the undercover journalist in a robe'],
    openers: ['Welcome, child. Please leave your phone and your bank details at the door.', 'Brother, why do we only eat beige food?', 'The prophecy is clear. Someone here must clean the toilets.'],
  },
  sports: {
    setting: 'The locker room at half time. Down by three. The coach is crying.',
    roles: ['the coach who never played', 'the star who hates the sport', 'the benchwarmer\'s big moment', 'the team mascot with a secret'],
    openers: ['Listen up. I\'ve never been prouder of a team this bad.', 'Coach, I need to tell you something. I\'ve been playing for the other team.', 'Give me the ball. I\'ve waited my whole life. Mostly on that bench.'],
  },
  spy: {
    setting: 'A foggy bridge in Berlin. The exchange is at midnight. Nobody brought the briefcase.',
    roles: ['the double agent who forgets which side', 'the handler with a code name', 'the defector who wants a sandwich', 'the spy who is clearly a spy'],
    openers: ['The eagle has landed. The eagle is also lost.', 'Do you have the documents? I mean the receipt for the documents.', 'Trust no one. Especially me. I\'m terrible.'],
  },
  wedding: {
    setting: 'The mandap. The muhurat is in five minutes. The groom is missing.',
    roles: ['the bride\'s scary father', 'the groom who ran off', 'the aunty who knows a secret', 'the wedding planner on the edge'],
    openers: ['Where is the groom? The pandit is charging by the minute!', 'Beta, before you marry, I must confess. I am also your father.', 'Nobody leaves this mandap until someone tells me who ate the cake.'],
  },
};

// Stage directions the room slaps on the next line.
const DIRECTIONS = [
  'Whispering', 'Sobbing', 'Furious', 'In slow motion', 'Like a news anchor', 'Like a cricket commentator', 'Singing it', 'As a rap',
  'Like a villain', 'Seductively', 'Like a toddler', 'Terrified', 'Like a Bollywood hero', 'Like a robot', 'Like you just won an Oscar',
  'Like a pirate', 'In a Kerala uncle accent', 'Like your mum on the phone', 'Very drunk', 'Like a WhatsApp forward', 'While dancing',
  'Like a sports coach', 'Like a game show host', 'On your knees', 'Like a ghost', 'Like a shy teenager', 'Like a weather forecast',
  'Like a flight announcement', 'Like an old radio drama', 'While eating', 'Like a motivational speaker', 'In a terrible French accent',
  'Like a dramatic soap opera slap is coming', 'Very, very slowly', 'Like a cat', 'Laughing evilly', 'Like a horror movie child',
  'With your eyes closed', 'Like an auctioneer', 'Like a yoga teacher', 'Like a tired dad', 'Like a stand-up comic', 'Like a nature documentary',
  'Like a cheap advert', 'Out of breath', 'Like a judge on a talent show', 'In a posh British accent', 'Like an angry auto driver',
  'Like a politician dodging a question', 'With a dramatic pause in the middle',
];

// Used when a writer runs out of time. Still funny out of context, which is the point.
const FALLBACK_LINES = [
  'I have never told anyone this, but I am three raccoons in a coat.',
  'Is that... is that my toothbrush in your pocket?',
  'I need you to know that I have been lying about my height.',
  'Before you say anything, I sold your car.',
  'Mother was right about you. And about the curtains.',
  'I can explain. No, I can\'t. Goodbye.',
  'You smell like betrayal and garlic.',
  'Fine. Then I will tell everyone about the goat.',
  'Somebody had to say it. That somebody was me. I regret nothing.',
  'Wait. Did you hear that? That was my heart. Breaking. And my knee.',
  'I am not crying. My eyes are just sweating emotionally.',
  'You will pay for this. In instalments.',
  'I never loved you. I only loved your WiFi.',
  'This is the worst day of my life. And I have been to IKEA.',
  'Say that again. Slower. And with feeling.',
  'There is something I have to show you. It is in my sock.',
  'Do you know who I am? Neither do I. Please help.',
  'Kiss me. Or don\'t. I am flexible. Literally, I do yoga.',
  'I came here to forgive you. I changed my mind in the car.',
  'Your mother called. She said no.',
];

// Little nudges on the writer's phone. Tapping one just adds it to the box.
const IDEAS = [
  'Confess something', 'Accuse them', 'Reveal a twin', 'Propose marriage', 'Fake your death', 'Bring up their mum', 'Quit dramatically',
  'Talk about food', 'Reveal you\'re rich', 'Reveal you\'re broke', 'Insult their outfit', 'Declare war', 'Burst into song', 'Blame the dog',
];

// The narrator teasing a slow writer. {w} is the writer.
const QUIPS = [
  '[whispers] {w} is still writing. The actors are ageing in real time.',
  '[sighs] Any moment now, {w}. Any moment.',
  '[dry] {w} is typing. Deleting. Typing. Classic.',
  '[amused] Take your time, {w}. Shakespeare also kept people waiting.',
  '[whispers] Somebody check on {w}. Blink twice if you need help.',
  '[impatient] {w}, the network is watching. And so is everyone in this room.',
];

// Fixed narrator lines. [tags] are ElevenLabs v3 cues. {x} placeholders are filled in by the game.
const LINES = {
  welcome: "[warmly] Good evening, and welcome to Writers' Room. [beat] Tonight, you write the lines... and your friends have to perform them. Cold. No rehearsal.",
  how: '[briskly] Two of you act, everyone else writes, one line at a time. Make the actors laugh, you score. Keep a straight face, you score. Ready?',
  sceneIntro: '{title}. A {genre}. [beat] {setting}',
  starring: 'Starring {cast}. [excited] Stand up, you lot. Action!',
  wrap: '[laughs] And... scene!',
  lineOfScene: '[excited] Line of the scene goes to... {name}!',
  bestActor: '[dramatically] And the best actor is... {name}!',
  actorVote: '[curious] Who was the better actor? Vote on your phone.',
  cracked: '[laughs] {name} cracked!',
  cutIntro: '[mischievously] The finale. Everyone is in this one. I will read it. But the moment you hit CUT on your phone, you take over the next line. First one to hit it wins the pen.',
  cutCalled: '[excited] Cut! {name} has the pen.',
  froze: '[sighs] {name} froze. Rolling again.',
  noCuts: '[teasing] Nobody wants to cut? Coward energy.',
  thatsAWrap: "[laughs] And that's a wrap! Let's see who wrote the funniest stuff tonight.",
  biggestLaugh: '[warmly] The biggest laugh of the night came from this line. Written by {name}.',
  headWriter: '[dramatically] Tonight\'s head writer is... {name}!',
  goodnight: "[warmly] Thank you, writers. Same time next week?",
  dateWelcome: "[warmly] Good evening, and welcome to Writers' Room: Date Night. [beat] Tonight, you two write each other's lines. And then you have to say them. Out loud. To each other.",
  dateHow: '[mischievously] Say your line, then write your partner\'s reply, and pick how they have to say it. Make them crack, you score. And watch out. I might barge in.',
  dateStarring: 'Starring {cast}. [whispers] Try not to laugh. Action!',
  criticWatching: '[curious] The critic has been watching.',
  critic: '[dry] {name}, {outlet}. {stars} stars. {review}',
  coin: '[dramatically] A disputed crack! The coin will decide...',
  coinCracked: '[laughs] Heads. You cracked. Points stand.',
  coinClean: '[surprised] Tails. Straight face confirmed. Points cancelled.',
  lineOfNight: '[warmly] The line of the night was written by {name}.',
};

// Date Night: when the AI is offline, the third character barges in with one of these.
const NPC_FALLBACK = [
  'Sorry to interrupt. Who ordered the divorce?', 'I heard everything. And I am telling your mother.', 'Should I come back later? I feel like I should come back later.',
  'Not to be dramatic, but the house is on fire.', 'Is this a bad time? I brought samosas.', 'I have been standing here the whole time. The whole time.',
  'Plot twist. I am in love with both of you.', 'The neighbours can hear you. They are taking notes.', 'Quick question. Whose shoes are these?',
];
// Date Night: canned critic reviews. {a} and {b} are the two players.
const REVIEW_FALLBACK = [
  '{a} committed to every line like rent was due. {b} looked like they were reading a hostage note.',
  'I laughed twice. Once at {b}, and once at the idea that {a} rehearsed.',
  'Chemistry so strong I had to open a window. Writing so weak I had to close it again.',
  '{b} gave a performance. {a} gave a performance review. Neither was asked for.',
  'Bold, confusing, and at one point, legally concerning. I will be watching again.',
  'If marriage is a partnership, this scene was a hostile takeover. Magnificent.',
];

// Fallback CUT! finale. Speakers are indexes into the cast; the game fills in names.
const FINALE_FALLBACK = [
  [0, 'Everybody stay calm. I have gathered you all here because one of you stole my biryani.'],
  [1, 'How dare you. I would never steal biryani. I would only borrow it, forever.'],
  [2, 'Can we focus? The building is on fire.'],
  [0, 'The building can wait. My biryani cannot.'],
  [3, 'I have a confession. I am not a real doctor. And this is not a real hospital.'],
  [1, 'Then why have you been operating on me for six years?'],
  [2, 'Everybody, look out the window! It is our mother, and she has a lawyer.'],
  [0, 'Mother? But she sailed to Goa in 1998 and never came back.'],
  [3, 'She came back. She just never told anyone. She has been living in the attic.'],
  [1, 'That explains the noises. And the missing biryani.'],
  [2, 'So it was her. All along. The biryani thief was... family.'],
  [0, 'I forgive her. I forgive all of you. Except you. You know what you did.'],
  [3, 'I do. And I would do it again.'],
  [1, 'Then there is only one thing left to do. Group hug. Then lawsuit.'],
];

module.exports = { SETUPS, DIRECTIONS, FALLBACK_LINES, IDEAS, QUIPS, LINES, FINALE_FALLBACK, NPC_FALLBACK, REVIEW_FALLBACK };
