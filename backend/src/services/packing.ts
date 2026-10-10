/**
 * What Americans most often say they wish they'd brought to Japan (Oct 10 2026, for Julie — Ken: "these should
 * legitimately be things based on your research and the discussion on travel review sites indicate Americans mention
 * wishing they had brought"). Only items that come up again and again in travelers' own accounts (Rick Steves forum
 * threads by US travelers, first-person articles, American travel writers); the rules checked against official sources
 * (Japan's health ministry, the US Embassy, JR Central, Japan's tourism board). Left out as obvious or not Japan-specific:
 * walking shoes, rain gear, a phone battery (Backroads' own list covers its week). Scout answers from this and nothing
 * else (chat.ts rule 46f).
 */
export type PackingItem = {
  say: string;   // what to tell them, one plain sentence
  why: string;   // why travelers say it matters
  tieTo?: string; // where it may meet their own days, when the Guide shows it
  rule?: boolean; // rests on an official rule — say its source
  source?: string;
};

export const PACKING: { about: string; items: PackingItem[]; end: string } = {
  about: "What American travelers most often say they wish they'd brought to Japan, from their own accounts; the rules from official sources. Not general travel advice.",
  items: [
    {
      say: "A small hand towel or handkerchief in your bag.",
      why: "Many restrooms have no paper towels or hand dryers; people in Japan carry their own. It's the most consistent thing travelers say they wish they'd brought.",
    },
    {
      say: "A coin purse.",
      why: "Coins pile up fast, and the ¥500 coin is worth a few dollars.",
    },
    {
      say: "Shoes that slip on and off easily, and socks you don't mind people seeing.",
      why: "Shoes come off at traditional inns, temple halls and restaurants with tatami floors — sometimes several times a day.",
      tieTo: "nights at a ryokan or traditional inn; temple visits",
      source: "https://www.japan.travel/en/responsible-travel-guide/japanese-customs-and-etiquette/",
    },
    {
      say: "A smaller suitcase than you think — and send it ahead when you can.",
      why: "Stations have long stairs, trains have little room for bags, and rooms are small; it's the strongest regret in Americans' first-trip accounts. Hotels and convenience stores send a suitcase to your next hotel, usually by the next day (check a small inn takes deliveries). On the Tokaido, Sanyo and Kyushu bullet trains, a bag over 160 cm (length + width + height) needs a seat with an oversized-baggage area reserved, or there's a ¥1,000 fee; a standard US checked bag (62 inches, 157 cm) is just under. Worth checking Backroads' own bag limit too.",
      // (the rule is the Tokaido, Sanyo and Kyushu shinkansen only — not the HARUKA or other limited expresses; Oct 10
      // audit: Andy's answer stretched it to the HARUKA)
      tieTo: "their days on the Tokaido, Sanyo or Kyushu shinkansen only (never the HARUKA or another limited express); moving between hotels",
      rule: true,
      source: "https://global.jr-central.co.jp/en/info/oversized-baggage/",
    },
    {
      say: "Your medicines in their original bottles, with a copy of the prescription — and leave Sudafed-type decongestants at home.",
      why: "Some common American medicines are illegal in Japan. Stimulant ADHD medicines such as Adderall can't be brought in at all, even with a prescription. Japan restricts decongestants with pseudoephedrine (Sudafed-type): bringing them can need a permit applied for at least 14 days ahead. Up to a month's supply of a prescription medicine (two months of over-the-counter ones) needs no paperwork. The US Embassy suggests carrying the prescription and a letter saying what it's for.",
      rule: true,
      source: "https://jp.usembassy.gov/services/importing-medication/ · https://www.ncd.mhlw.go.jp/en/application2.html · https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iyakuhin/kojinyunyu/topics/tp010401-1_00001.html",
    },
    {
      say: "A small bag for your own trash.",
      why: "Public bins are rare away from train stations and convenience stores, so people carry their trash until they find one.",
      source: "https://www.japan.travel/en/ca/etiquette/",
    },
    {
      say: "Some yen for temples, shrines and small restaurants.",
      why: "Cards work almost everywhere else now, but those often still take only cash. ATMs at 7-Eleven and post offices take US cards.",
      tieTo: "temple and shrine visits",
    },
  ],
  end: "Tell me how you like to travel — light, or with options; whether you'll do laundry — and I'll tailor it.",
};
