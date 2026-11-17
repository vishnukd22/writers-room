'use strict';
// NOTHING TO DECLARE: everything a traveller might carry through customs. Real things, real prices.
// Values are roughly what each one costs in the UAE in late 2026 (shop prices, or auction prices for the odd ones).
// Each row: [id, name, category, value in AED, Brenda's line when she finds it, photo search, copies in the deck]
// Categories: four kinds of legal goods you can declare, and contraband, which you can never declare.
// Photo search works like BID-COIN's: Wikimedia Commons, or "wd:" to look the thing up on Wikidata first.

const CATS = {
  perfume: { name: 'Perfume', one: 'bottle of perfume', many: 'bottles of perfume', icon: '🧴' },
  sweets: { name: 'Sweets', one: 'box of sweets', many: 'boxes of sweets', icon: '🍫' },
  tech: { name: 'Gadgets', one: 'gadget', many: 'gadgets', icon: '📱' },
  fashion: { name: 'Fashion', one: 'fashion item', many: 'fashion items', icon: '👟' },
  contra: { name: 'Contraband', one: 'piece of contraband', many: 'pieces of contraband', icon: '🚨' },
};
const LEGAL = ['perfume', 'sweets', 'tech', 'fashion'];

const ROWS = [
  // ---------------------------------------------------------------- perfume
  ['chanel-5', 'Chanel No. 5, 100ml', 'perfume', 720, 'Chanel No. 5. Classic. Unlike your excuses.', 'Chanel No. 5 perfume bottle', 2],
  ['dior-sauvage', 'Dior Sauvage, 100ml', 'perfume', 520, 'Dior Sauvage. Every man at this airport smells of it.', 'Dior Sauvage', 2],
  ['creed-aventus', 'Creed Aventus, 100ml', 'perfume', 1400, 'Creed Aventus. One thousand four hundred dirhams to smell like pineapple.', 'Creed Aventus perfume', 2],
  ['ck-one', 'CK One, 200ml', 'perfume', 260, 'CK One. Last fashionable in 1996.', 'CK One perfume', 2],
  ['tom-ford-oud', 'Tom Ford Oud Wood, 50ml', 'perfume', 1050, 'Tom Ford Oud Wood. Very smoky. Very expensive.', 'Tom Ford Oud Wood', 2],
  ['br540', 'Baccarat Rouge 540, 70ml', 'perfume', 1350, 'Baccarat Rouge 540. It smells like a hotel lobby, and costs like one.', 'Baccarat Rouge 540', 2],
  ['jo-malone', 'Jo Malone Lime Basil and Mandarin', 'perfume', 640, 'Jo Malone. Somebody\'s mother is getting a present.', 'Jo Malone London perfume', 2],
  ['acqua-di-gio', 'Armani Acqua di Gio, 100ml', 'perfume', 450, 'Acqua di Gio. Smells like a gym changing room in 2004.', 'Acqua di Gio', 2],

  // ---------------------------------------------------------------- sweets
  ['toblerone', 'Toblerone, 360g', 'sweets', 35, 'A Toblerone. Bought in a panic at the gate. As always.', 'wd:Toblerone', 3],
  ['ferrero', 'Ferrero Rocher, box of 24', 'sweets', 60, 'Ferrero Rocher. The ambassador is spoiling us.', 'Ferrero Rocher', 3],
  ['lindor', 'Lindt Lindor, 337g', 'sweets', 75, 'Lindt Lindor. One each. Nobody stops at one.', 'Lindt Lindor', 3],
  ['patchi', 'Patchi chocolate box, 500g', 'sweets', 330, 'Patchi. For when you need to apologise to someone.', 'Patchi chocolate', 2],
  ['godiva', 'Godiva Gold Collection, 24 pieces', 'sweets', 230, 'Godiva. Very fancy. Already half eaten.', 'Godiva chocolate', 2],
  ['bateel', 'Bateel dates, 1kg gift box', 'sweets', 280, 'Bateel dates. Your aunt will be thrilled.', 'Medjool dates', 2],
  ['dubai-choc', 'Dubai chocolate bar (pistachio and kunafa)', 'sweets', 70, 'The Dubai chocolate bar. Everyone in Europe is fighting over these.', 'Dubai chocolate', 3],
  ['kitkat-matcha', 'Japanese matcha KitKats', 'sweets', 45, 'Matcha KitKats from Japan. Green, and somehow still a KitKat.', 'KitKat matcha', 3],
  ['haribo', 'Haribo Goldbears, 1kg', 'sweets', 40, 'A kilo of Haribo. Adult behaviour.', 'Haribo Goldbears', 3],

  // ---------------------------------------------------------------- gadgets
  ['iphone-17-pro', 'iPhone 17 Pro, 256GB', 'tech', 4700, 'An iPhone 17 Pro. Still in the box. Very convenient.', 'iPhone 17 Pro', 2],
  ['airpods-pro', 'AirPods Pro 3', 'tech', 950, 'AirPods. Both of them. That\'s a first.', 'AirPods Pro', 2],
  ['ps5-pro', 'PlayStation 5 Pro', 'tech', 3100, 'A PlayStation 5 Pro. For the children, I\'m sure.', 'PlayStation 5 Pro', 2],
  ['switch-2', 'Nintendo Switch 2', 'tech', 1800, 'A Nintendo Switch 2. I want one.', 'Nintendo Switch 2', 2],
  ['kindle', 'Kindle Paperwhite', 'tech', 600, 'A Kindle. A reader. How refreshing.', 'Kindle Paperwhite', 2],
  ['gopro', 'GoPro HERO13 Black', 'tech', 1700, 'A GoPro. Filming this, are we?', 'GoPro HERO camera', 2],
  ['airwrap', 'Dyson Airwrap', 'tech', 2300, 'A Dyson Airwrap. Two thousand dirhams of hot air. Like this conversation.', 'Dyson Airwrap', 2],
  ['meta-glasses', 'Ray-Ban Meta smart glasses', 'tech', 1200, 'Smart glasses with a camera in them. Take them off, please.', 'Ray-Ban Meta smart glasses', 2],

  // ---------------------------------------------------------------- fashion
  ['jordan-1', 'Nike Air Jordan 1 High', 'fashion', 750, 'Air Jordans. Never worn. Never will be.', 'Air Jordan 1', 2],
  ['levis-501', 'Levi\'s 501 jeans', 'fashion', 350, 'Levi\'s 501s. Timeless. Unlike this queue.', 'Levi\'s 501 jeans', 2],
  ['wayfarer', 'Ray-Ban Wayfarer sunglasses', 'fashion', 650, 'Ray-Bans. Wear them indoors and I will know.', 'Ray-Ban Wayfarer', 2],
  ['neverfull', 'Louis Vuitton Neverfull MM', 'fashion', 8500, 'A real Louis Vuitton Neverfull. Real. I checked the stitching.', 'Louis Vuitton Neverfull', 1],
  ['hermes-scarf', 'Hermes silk scarf, 90cm', 'fashion', 2000, 'A Hermes scarf. Two thousand dirhams. It is a square.', 'Hermes silk scarf', 2],
  ['crocs', 'Crocs Classic Clogs', 'fashion', 200, 'Crocs. Legal. Unfortunately.', 'Crocs shoes', 2],
  ['barbour', 'Barbour waxed jacket', 'fashion', 1600, 'A Barbour jacket. Going somewhere muddy?', 'Barbour jacket', 2],
  ['madrid-shirt', 'Real Madrid home shirt', 'fashion', 380, 'A Real Madrid shirt. I\'m a Barcelona fan. Noted.', 'Real Madrid shirt', 2],

  // ---------------------------------------------------------------- contraband: the real thing
  ['macaw', 'A live scarlet macaw', 'contra', 11000, 'A live scarlet macaw. Endangered. Furious. Squawking in my face.', 'wd:Scarlet macaw', 1],
  ['rolex', 'Undeclared Rolex Submariner', 'contra', 41700, 'A Rolex Submariner, undeclared. Forty thousand dirhams on a wrist that wasn\'t mentioned.', 'Rolex Submariner', 1],
  ['gold-bar', '100g gold bar', 'contra', 48500, 'A hundred grams of gold bar. In a sock. Very subtle.', 'gold bar 100 g', 1],
  ['cash', 'AED 70,000 in cash, undeclared', 'contra', 70000, 'Seventy thousand dirhams in cash. Anything over sixty thousand must be declared. You knew that.', 'United Arab Emirates dirham banknotes', 1],
  ['behike', 'Cohiba Behike 52, box of 10', 'contra', 9800, 'Cuban Cohiba Behikes. Nearly ten thousand dirhams of cigars. Illegal in America, suspicious everywhere.', 'Cohiba cigars', 1],
  ['beluga', 'Beluga caviar, 250g tin', 'contra', 9500, 'Beluga caviar. From an endangered fish. Banned in America. Delicious, I\'m told.', 'wd:Beluga caviar', 1],
  ['u238', 'Gilbert U-238 Atomic Energy Lab (with real uranium)', 'contra', 32500, 'A 1950 children\'s toy with real uranium in it. Thirty two thousand dirhams. Please stand back.', 'Gilbert U-238 Atomic Energy Lab', 1],
  ['ivory', 'A carved elephant tusk', 'contra', 22000, 'Elephant ivory. Illegal everywhere. That one goes straight to the police.', 'carved ivory tusk', 1],
  ['jamon', 'A whole Iberico ham leg', 'contra', 3000, 'A whole leg of Iberico ham. Meat imports are banned. Also, it\'s a leg.', 'Jamón ibérico leg', 1],
  ['fake-lv', 'Counterfeit Louis Vuitton bag', 'contra', 300, 'A fake Louis Vuitton. It says Louis Vitton. With one U.', 'counterfeit handbags', 2],
  ['vapes', '50 disposable vapes', 'contra', 1250, 'Fifty disposable vapes. Banned in more countries than I can count.', 'disposable e-cigarette', 2],
  ['fireworks', 'A box of fireworks', 'contra', 400, 'Fireworks. In a suitcase. On a plane. Sit down.', 'fireworks box', 2],
  // ---------------------------------------------------------------- contraband: the ridiculous (all genuinely banned somewhere)
  ['kinder', 'Kinder Surprise eggs, 24 pack', 'contra', 120, 'Kinder Surprise eggs. Banned in America. The surprise is a fine.', 'Kinder Surprise', 2],
  ['haggis', 'A Scottish haggis', 'contra', 60, 'A haggis. Banned in America since 1971. Sheep\'s lungs, travelling first class.', 'wd:Haggis', 2],
  ['gum', '200 packs of chewing gum', 'contra', 600, 'Two hundred packs of chewing gum. That\'s illegal in Singapore. You know who you are.', 'chewing gum packs', 2],
  ['poppy-bagels', 'A bag of poppy seed bagels', 'contra', 40, 'Poppy seed bagels. Poppy seeds are banned in this country. Breakfast is cancelled.', 'poppy seed bagel', 2],
  ['durian', 'A Musang King durian', 'contra', 250, 'A durian. Banned on Singapore\'s trains. The whole hall can smell it.', 'wd:Durian', 2],
  ['beach-sand', '2kg of Sardinian beach sand', 'contra', 20, 'Two kilos of sand from Sardinia. Taking it is illegal, with fines up to three thousand euros. It\'s sand.', 'Sardinia beach sand', 2],
  ['mimolette', 'A wheel of Mimolette cheese', 'contra', 180, 'Mimolette cheese. America blocked it in 2013 over cheese mites. Yes. Mites.', 'wd:Mimolette', 2],
  ['hoverboard', 'A hoverboard', 'contra', 1200, 'A hoverboard. Banned from planes. They catch fire. Like your story.', 'hoverboard', 1],
];

const ITEMS = ROWS.map(([id, name, cat, value, line, q, copies]) => ({ id: `ntd-${id}`, name, cat, value, line, q, copies }));
const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
module.exports = { CATS, LEGAL, ITEMS, BY_ID };
