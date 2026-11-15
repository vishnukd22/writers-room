'use strict';
// BID-COIN! Even more of the catalogue: oddities, icons and disasters added after play-testing.
// Rows use the same shape as bc-items.js: [id, name, category, rarity, value in AED, the funny line, photo search]
// Rarity: j junk (5 to 400), d decent (400 to 3,000), r rare (3,000 to 15,000), l legendary (15,000 to 90,000), x cursed (costs you)

const EXTRA = [
  // ---------------------------------------------------------------- junk
  ['tickle-elmo', 'Tickle Me Elmo (1996)', 'toys', 'j', 60, 'Laughs at nothing. Forever.', 'wd:Tickle Me Elmo'],
  ['pet-rock', 'Pet Rock, still in its box', 'weird', 'j', 30, 'Low maintenance. Zero affection.', 'Pet Rock'],
  ['shake-weight', 'Shake Weight', 'sports', 'j', 30, 'Bought in January. Retired in January.', 'Shake Weight'],
  ['titanic-vhs', 'Titanic on VHS, both tapes', 'music', 'j', 15, 'Tape two is where it sinks.', 'Titanic VHS tape'],
  ['fidget-500', 'Box of 500 fidget spinners', 'toys', 'j', 150, '2017 called. It wants them all back.', 'fidget spinner'],
  ['rotary-phone', 'Rotary dial telephone', 'home', 'j', 180, 'Calling anyone takes about a minute.', 'rotary dial telephone'],
  ['minidisc', 'Sony MiniDisc player', 'tech', 'j', 250, 'The future of music. For about a year.', 'Sony MiniDisc Walkman'],
  ['crypto-wallet', 'Hardware crypto wallet with a sticky note', 'tech', 'j', 100, 'Might hold millions. The note says "password". Just that.', 'hardware cryptocurrency wallet'],
  ['plastic-dallah', 'Plastic dallah coffee pot', 'home', 'j', 20, 'Pours coffee and regret in equal measure.', 'dallah coffee pot'],
  ['gold-crocs', 'Gold-painted Crocs', 'fashion', 'j', 80, 'Fashion. Allegedly.', 'Crocs shoes'],
  ['hamster-ball', 'Hamster exercise ball', 'weird', 'j', 20, 'Contains one very old sunflower seed.', 'hamster exercise ball'],
  ['astronaut-icecream', 'Box of astronaut ice cream', 'weird', 'j', 60, 'Freeze-dried in 1996. Still crunchy. Still pink.', 'freeze-dried ice cream'],
  ['clapper', 'The Clapper sound switch', 'home', 'j', 25, 'Clap on. Clap off. Clap until your hands hurt.', 'The Clapper'],
  ['bowling-dave', 'Glow-in-the-dark bowling ball engraved "DAVE"', 'sports', 'j', 120, 'Who is Dave? Where is Dave?', 'bowling ball'],
  ['nokia-ringtones', 'Ringtone composer book (2001)', 'tech', 'j', 15, 'Page 47: the Mission Impossible theme, in 12 beeps.', 'Nokia ringtone'],
  ['beyblade', 'Beyblade stadium with 30 tops', 'toys', 'j', 180, 'Let it rip. It ripped. It is in three pieces.', 'Beyblade'],

  ['glow-nunchucks', 'Glow-in-the-dark nunchucks', 'sports', 'j', 40, 'Confiscated from a 13-year-old in 1994.', 'nunchaku'],
  ['bigfoot-cast', 'Plaster cast of a "Bigfoot" footprint', 'weird', 'j', 150, 'Size 52. Suspiciously like a man in wellies.', 'Bigfoot footprint cast'],
  ['disco-ball', 'Disco ball, missing a few mirrors', 'home', 'j', 120, 'Still turns. Still fabulous. Mostly.', 'disco ball'],

  // ---------------------------------------------------------------- decent
  ['kiddie-horse', 'Coin-operated kiddie horse ride', 'toys', 'd', 2700, 'Costs one dirham. Gallops nowhere. Kids love it.', 'coin-operated kiddie ride'],
  ['neon-camel', 'Pink neon camel sign', 'art', 'd', 1900, 'Glows pink. Hums slightly. Never blinks.', 'neon sign'],
  ['vintage-scuba', 'Vintage scuba tank and mask', 'sports', 'd', 700, 'Last dive: 1987. Bubbles not included.', 'vintage scuba diving equipment'],
  ['segway', 'Segway PT', 'weird', 'd', 1800, 'Ride it into a room and nobody takes you seriously again.', 'wd:Segway PT'],
  ['theremin', 'Moog Etherwave theremin', 'music', 'd', 1900, 'Play music without touching anything. Badly.', 'Moog Etherwave theremin'],
  ['olivetti-valentine', 'Olivetti Valentine typewriter', 'office', 'd', 2200, 'Bright red. Writes angry letters beautifully.', 'Olivetti Valentine typewriter'],
  ['mtg-box', 'Shoebox of 1994 Magic: The Gathering cards', 'toys', 'd', 1500, 'Mostly basic lands. Probably. Check anyway.', 'Magic: The Gathering cards'],
  ['owl-dome', 'Stuffed owl in a glass dome', 'weird', 'd', 1200, 'It is watching. It was always watching.', 'taxidermy owl glass dome'],
  ['lever-espresso', 'Lever espresso machine', 'home', 'd', 2600, 'Makes one perfect coffee. After forty minutes.', 'lever espresso machine'],
  ['dyson-supersonic', 'Dyson Supersonic hair dryer', 'home', 'd', 900, 'Sounds like a jet. Dries like a dream.', 'Dyson Supersonic'],
  ['celestron', 'Celestron telescope', 'weird', 'd', 1700, 'Pointed at the neighbours. Allegedly.', 'Celestron telescope'],
  ['super8-projector', 'Super 8 projector with unlabelled reels', 'tech', 'd', 650, 'Reel one: a holiday, 1978. Reel two: do not play reel two.', 'Super 8 film projector'],
  ['ibm-model-m', 'IBM Model M keyboard', 'office', 'd', 700, 'Loud enough to wake the dead. It has.', 'IBM Model M keyboard'],
  ['oud', 'Hand-made oud', 'music', 'd', 2400, 'Eleven strings. Infinite heartbreak songs.', 'oud instrument'],
  ['tamiya-grasshopper', 'Tamiya Grasshopper RC car (1984)', 'toys', 'd', 900, 'Top speed: faster than the dog.', 'Tamiya Grasshopper'],
  ['magician-box', "Magician's sawing-in-half box", 'weird', 'd', 2800, 'Comes with half a sequin costume. Only half.', 'magician sawing a woman in half box'],
  ['vespa-helmet', 'Chrome bubble motorcycle helmet', 'fashion', 'd', 600, 'Makes you look like a 1970s astronaut on a budget.', 'bubble motorcycle helmet'],
  ['metal-detector', 'Metal detector, plus everything it ever found', 'weird', 'd', 450, 'Forty bottle caps, one ring, a very old key to nowhere.', 'metal detector'],
  ['arcade-joystick', 'Street Fighter II arcade control panel', 'toys', 'd', 1300, 'The buttons are worn into the shape of one man\'s thumbs.', 'Street Fighter II arcade'],
  ['tiki-bar', 'Bamboo tiki bar', 'home', 'd', 1600, 'Smells faintly of pineapple and bad decisions.', 'tiki bar'],
  ['jukebox-mini', 'Countertop jukebox', 'music', 'd', 1100, 'Twelve songs. Eleven are by the same Swedish band.', 'countertop jukebox'],
  ['cuckoo-clock', 'Black Forest cuckoo clock', 'antiques', 'd', 1400, 'The cuckoo is tired. It still does its job.', 'Black Forest cuckoo clock'],
  ['hoverboard-ok', 'Hoverboard, working', 'tech', 'd', 500, 'Works fine. Do not ask how we know.', 'hoverboard'],
  ['ouija', 'Victorian talking board', 'weird', 'd', 1800, 'Spells out "HELLO" when nobody is touching it.', 'antique talking board'],

  // ---------------------------------------------------------------- rare
  ['addams-pinball', 'The Addams Family pinball machine', 'toys', 'r', 14000, 'The best-selling pinball ever. The hand still waves.', 'The Addams Family pinball'],
  ['vespa-1960s', '1960s Vespa scooter', 'cars', 'r', 12000, 'Starts first time. Stops whenever it likes.', 'vintage Vespa scooter'],
  ['iron-meteorite', 'Iron meteorite', 'weird', 'r', 6000, 'It fell from space. Then into a box. Then here.', 'iron meteorite'],
  ['trex-tooth', 'Tyrannosaurus rex tooth', 'weird', 'r', 14000, 'Older than the pyramids. Sharper than your ex.', 'Tyrannosaurus tooth fossil'],
  ['arabia-map', 'Antique map of Arabia (1800s)', 'antiques', 'r', 8000, 'Dubai is just a dot. A very hopeful dot.', 'antique map of Arabia'],
  ['bronze-falcon', 'Bronze falcon statue', 'art', 'r', 5500, 'Heavier than it looks. Like most decisions.', 'bronze falcon sculpture'],
  ['celestial-globe', 'Celestial globe (1800s)', 'antiques', 'r', 9500, 'Maps the stars. Wrongly, but beautifully.', 'antique celestial globe'],
  ['ship-in-bottle', 'Ship in a bottle, the size of a fridge', 'antiques', 'r', 4800, 'How did they get it in? How do you get it home?', 'ship in a bottle'],
  ['astro-boy-robot', 'Tin toy robot (1950s), boxed', 'toys', 'r', 6500, 'Walks, sparks, and has outlived its maker.', 'vintage tin toy robot'],
  ['nautilus-shell', 'Mounted chambered nautilus shell', 'antiques', 'r', 3500, 'Perfect spiral. Nature showing off.', 'chambered nautilus shell'],
  ['rolex-explorer', 'Rolex Explorer 214270', 'jewels', 'r', 14500, 'Built for Everest. Used for brunch.', 'Rolex Explorer'],
  ['wolf-pelt-coat', 'Fur-lined aviator jacket from the 1940s', 'fashion', 'r', 4200, 'Survived a war. May not survive the dry cleaner.', '1940s aviator jacket'],
  ['karak-cart', 'Restored vintage tea cart', 'home', 'r', 3200, 'Served ten thousand cups of karak. Wants to serve more.', 'vintage tea cart'],

  ['photo-booth-1962', 'Vintage photo booth', 'weird', 'r', 11000, 'Four strips of strangers pulling faces since 1962.', 'photo booth'],
  ['lunar-module-model', 'Lunar module model from a NASA contractor', 'weird', 'r', 9000, 'Built by the people who built the real one. On their lunch break.', 'Apollo Lunar Module model'],
  ['stained-glass', 'Stained glass window from a demolished chapel', 'antiques', 'r', 7500, 'Glows like a sunset. Weighs like a car.', 'stained glass window'],

  // ---------------------------------------------------------------- legendary
  ['moon-meteorite', 'Piece of a Moon meteorite', 'weird', 'l', 30000, 'Real Moon. Smaller than you hoped.', 'lunar meteorite'],
  ['golden-record', 'Gold-plated copy of the Voyager record', 'weird', 'l', 35000, 'Greetings to aliens in 55 languages. No replies yet.', 'Voyager Golden Record'],
  ['concorde-seat', 'Concorde passenger seat', 'weird', 'l', 28000, 'London to New York in three hours. Living room to kitchen in one.', 'Concorde seat'],
  ['nasa-glove', 'NASA spacesuit glove', 'weird', 'l', 55000, 'Flew on a real mission. Still smells faintly of space.', 'NASA spacesuit glove'],
  ['sputnik-model', 'Sputnik 1 engineering model', 'weird', 'l', 75000, 'Beep. Beep. Beep. Since 1957.', 'Sputnik 1 model'],
  ['italian-violin', '19th century Italian violin', 'music', 'l', 70000, 'Not a Stradivarius. But it has met one.', 'antique Italian violin'],
  ['iphone-2007-sealed', 'Original iPhone (2007), factory sealed', 'tech', 'l', 80000, 'Never opened. Collectors faint when they see it.', 'first generation iPhone'],
  ['mars-meteorite', 'Piece of a Mars meteorite', 'weird', 'l', 40000, 'Actual Mars. In a jar. In a storage unit in Al Quoz.', 'Martian meteorite'],
  ['silver-dallah', 'Solid silver dallah coffee pot', 'antiques', 'l', 22000, 'Hand-made. Pours like royalty.', 'silver dallah coffee pot'],
  ['apollo-checklist', 'Apollo mission checklist page', 'weird', 'l', 65000, 'Handwritten notes in the margin. In space.', 'Apollo flight plan checklist'],
  ['f1-nosecone', 'Formula 1 nose cone from a race-winning car', 'sports', 'l', 48000, 'Still has the dent from the champagne celebration.', 'Formula One car nose cone'],
  ['tiara', 'Diamond tiara (1920s)', 'jewels', 'l', 88000, 'Fit for a princess. Or for brunch, if you are brave.', 'antique diamond tiara'],

  // ---------------------------------------------------------------- cursed
  ['blinking-doll', 'Antique doll that blinks by itself', 'weird', 'x', -2000, 'The priest charged extra. Removal fee on you.', 'antique porcelain doll'],
  ['live-beehive', 'Live beehive', 'weird', 'x', -1800, '50,000 new roommates. The beekeeper call-out is yours.', 'beehive'],
  ['piano-4th-floor', 'Upright piano, fourth floor, no lift', 'music', 'x', -2500, 'Free piano! The movers want AED 2,500.', 'upright piano'],
  ['no-reflection-mirror', 'Mirror with no reflection', 'weird', 'x', -3000, 'You are in the room. The mirror disagrees. Exorcist fee.', 'antique mirror'],
  ['durian-crates', 'Forty crates of rotting durian', 'home', 'x', -3500, 'The smell got out before you did. Fumigation fee.', 'durian'],
  ['escaped-python', 'Empty python tank', 'weird', 'x', -4000, 'The tank is empty. That is the problem. Snake catcher fee.', 'reticulated python'],
  ['timeshare', 'Box of timeshare contracts in your name', 'office', 'x', -2200, 'You now own one week a year in a swamp. Exit fee.', 'timeshare'],
  ['swollen-hoverboard', 'Hoverboard with a swollen battery', 'tech', 'x', -1200, 'Do not charge it. Do not look at it. Disposal fee on you.', 'lithium battery fire'],
  ['dead-jetski', 'Jet ski with a seized engine', 'cars', 'x', -2800, 'It floats. It does nothing else. Towing fee.', 'jet ski'],
];

module.exports = { EXTRA };
