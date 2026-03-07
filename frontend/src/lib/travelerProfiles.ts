interface Interest {
  keywords: string[];
  placeTypes: string[];
  nudges: string[];
}

interface TravelerProfile {
  interests: Interest[];
}

const profiles: Record<string, TravelerProfile> = {
  Ken: {
    interests: [
      {
        keywords: ["ai", "artificial intelligence", "machine learning", "robotics", "tech hub", "innovation"],
        placeTypes: [],
        nudges: [
          "Ken, there's an AI and innovation space nearby — could be worth a look.",
          "Ken, this area has a growing tech scene. Might be interesting to wander through.",
          "Ken, I noticed a technology exhibit nearby in case you're curious.",
        ],
      },
      {
        keywords: ["philosophy", "bookstore", "book shop", "reading room", "library"],
        placeTypes: ["book_store", "library"],
        nudges: [
          "Ken, there's an independent bookstore nearby — the philosophy section might have something good.",
          "Ken, I noticed a bookshop that carries titles on philosophy and ideas. Thought you'd want to know.",
        ],
      },
      {
        keywords: ["cooking class", "cooking school", "culinary", "food tour", "cooking workshop"],
        placeTypes: [],
        nudges: [
          "Ken, there's a cooking class nearby — could be a great one for the group.",
          "Ken, I found a culinary workshop close by. Might be worth planning around.",
        ],
      },
      {
        keywords: ["gallery", "art museum", "contemporary art", "modern art", "art exhibit"],
        placeTypes: ["art_gallery", "museum"],
        nudges: [
          "Ken, there's an art gallery nearby that might catch your eye.",
          "Ken, I noticed an art space close by — thought you'd want to know.",
        ],
      },
      {
        keywords: ["japanese", "zen garden", "tea ceremony", "wabi-sabi", "ukiyo-e", "calligraphy"],
        placeTypes: [],
        nudges: [
          "Ken, this place is known for its connection to traditional Japanese culture.",
          "Ken, I noticed something nearby with deep roots in Japanese tradition — thought of you.",
        ],
      },
    ],
  },

  Julie: {
    interests: [
      {
        keywords: ["ceramic", "pottery", "kiln", "clay", "porcelain", "studio", "glaze", "earthenware"],
        placeTypes: ["art_gallery"],
        nudges: [
          "Julie, there's a ceramics studio nearby — might be worth a visit.",
          "Julie, I noticed a pottery workshop close by. You and Larisa might enjoy this one.",
          "Julie, this place works with local clay. Thought you'd want to know.",
          "Julie, there's a ceramics gallery nearby — the work here has a good reputation.",
        ],
      },
      {
        keywords: ["melon", "fruit stand", "fresh fruit", "organic market", "farmers market", "juice bar", "seasonal produce"],
        placeTypes: ["grocery_or_supermarket"],
        nudges: [
          "Julie, locals say the fresh fruit here is exceptional — even out of season.",
          "Julie, this market is known for sourcing the best seasonal produce in the area.",
          "Julie, I noticed a produce stand nearby that has a reputation. Thought of you.",
        ],
      },
      {
        keywords: ["cooking class", "cooking school", "culinary workshop", "food workshop"],
        placeTypes: [],
        nudges: [
          "Julie, there's a cooking class here — could be fun with the group.",
          "Julie, I found a culinary workshop nearby. Might be one for the whole crew.",
        ],
      },
      {
        keywords: ["sportswear", "athletic", "activewear", "outdoor gear", "sports shop", "running store", "performance wear"],
        placeTypes: ["clothing_store", "shoe_store"],
        nudges: [
          "Julie, this shop carries quality sportswear from local makers. Could be interesting.",
          "Julie, I noticed an activewear store nearby — they have pieces from smaller brands.",
          "Julie, there's a shop here with athletic gear that might have something good.",
        ],
      },
    ],
  },

  Larisa: {
    interests: [
      {
        keywords: ["frog", "ceramic frog", "garden ornament", "animal figurine"],
        placeTypes: [],
        nudges: [
          "Larisa, they have ceramic frogs here — your mother would love this.",
          "Larisa, I noticed hand-painted animal ceramics nearby. Thought of your mom.",
          "Larisa, this shop has the kind of ceramic creatures your mother collects.",
        ],
      },
      {
        keywords: ["tulip", "flower market", "floral", "botanical print", "flower shop"],
        placeTypes: ["florist"],
        nudges: [
          "Larisa, there's a flower market nearby — tulips and more.",
          "Larisa, I noticed a place known for tulip art and botanical prints.",
          "Larisa, this market has beautiful florals. Thought your mom would appreciate something from here.",
        ],
      },
      {
        keywords: ["ceramic", "pottery", "kiln", "clay", "porcelain", "studio", "glaze"],
        placeTypes: ["art_gallery"],
        nudges: [
          "Larisa, there's a ceramics studio nearby — you and Julie might want to explore.",
          "Larisa, I found a pottery workshop close by. Could be a good afternoon.",
          "Larisa, this place does ceramics with local materials. Thought of you.",
        ],
      },
      {
        keywords: ["gift shop", "souvenir", "handmade", "artisan", "craft", "local goods", "boutique", "handcraft"],
        placeTypes: ["store"],
        nudges: [
          "Larisa, there's a local artisan shop nearby — the kind with beautiful small finds.",
          "Larisa, I noticed a boutique with handmade local goods. Worth a browse.",
          "Larisa, this shop has locally crafted gifts. Thought you'd want to know.",
        ],
      },
      {
        keywords: ["custard", "donut", "doughnut", "matcha", "pastry", "patisserie", "sweet", "bakery", "dessert", "gelato", "ice cream", "mochi", "macaron", "tart", "croissant"],
        placeTypes: ["bakery", "cafe"],
        nudges: [
          "Larisa, this place is known for their pastries — could be your kind of stop.",
          "Larisa, locals line up for the sweets here. Just saying.",
          "Larisa, the matcha here has a reputation. Might be worth a detour.",
          "Larisa, I noticed a bakery nearby that people rave about. Thought of you.",
        ],
      },
      {
        keywords: ["sportswear", "athletic", "running", "sports equipment", "outdoor gear", "sports shop"],
        placeTypes: ["clothing_store"],
        nudges: [
          "Larisa, they have quality sports gear here from local brands.",
          "Larisa, I noticed a sports shop nearby — might have something good.",
        ],
      },
    ],
  },

  Andy: {
    interests: [
      {
        keywords: ["temple", "meditation", "zen", "buddhist", "dharma", "monastery", "shrine", "zazen", "mindfulness", "contemplative"],
        placeTypes: ["buddhist_temple", "hindu_temple", "place_of_worship"],
        nudges: [
          "Andy, this temple is known for morning meditation — might be worth an early start.",
          "Andy, locals come here to sit quietly. The garden is supposed to be exceptional.",
          "Andy, I noticed a Zen temple nearby with public meditation sessions.",
          "Andy, this place has a contemplative garden that draws people in the early morning.",
          "Andy, there's a temple nearby known for its stillness. Thought you'd want to know.",
        ],
      },
      {
        keywords: ["ai", "artificial intelligence", "technology", "startup", "innovation", "robotics", "tech hub", "coworking"],
        placeTypes: [],
        nudges: [
          "Andy, there's a tech innovation space nearby — might spark some thinking.",
          "Andy, this area has an interesting AI and startup scene emerging.",
          "Andy, I noticed a technology venue close by. Could be worth a conversation.",
        ],
      },
      {
        keywords: ["bookstore", "book shop", "philosophy", "reading room"],
        placeTypes: ["book_store"],
        nudges: [
          "Andy, there's an independent bookstore nearby — the philosophy and technology sections might have something.",
          "Andy, I noticed a bookshop that carries deeper titles. Thought of you.",
          "Andy, this bookstore is known for carrying things you won't find elsewhere.",
        ],
      },
    ],
  },
};

// Rate-limit nudges to ~1 per day per user
const NUDGE_STORAGE_KEY = "wander:last-nudge";

function canShowNudge(userName: string): boolean {
  try {
    const stored = localStorage.getItem(NUDGE_STORAGE_KEY);
    if (!stored) return true;
    const data = JSON.parse(stored);
    const lastTime = data[userName];
    if (!lastTime) return true;
    // Allow one nudge per 8 hours (roughly once per exploration session)
    const hoursSinceLast = (Date.now() - lastTime) / (1000 * 60 * 60);
    return hoursSinceLast >= 8;
  } catch {
    return true;
  }
}

function recordNudge(userName: string): void {
  try {
    const stored = localStorage.getItem(NUDGE_STORAGE_KEY);
    const data = stored ? JSON.parse(stored) : {};
    data[userName] = Date.now();
    localStorage.setItem(NUDGE_STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/** Word-boundary-aware keyword match to avoid "tart" matching "Startup" etc. */
function keywordInText(kw: string, text: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function getNudgesForPlace(
  userName: string,
  placeName: string,
  placeTypes: string[] = [],
): string | null {
  const profile = profiles[userName];
  if (!profile) return null;
  if (!canShowNudge(userName)) return null;

  for (const interest of profile.interests) {
    const keywordMatch = interest.keywords.some((kw) =>
      keywordInText(kw, placeName)
    );

    const typeMatch = interest.placeTypes.length > 0 &&
      interest.placeTypes.some((t) => placeTypes.includes(t));

    if (keywordMatch || typeMatch) {
      // Pick a nudge using a hash of the date + place name so it's consistent
      // within a day but varies across days
      const today = new Date().toDateString();
      const hash = simpleHash(today + placeName + userName);
      const nudge = interest.nudges[hash % interest.nudges.length];
      recordNudge(userName);
      return nudge;
    }
  }

  return null;
}

// For experience detail view — always show (no rate limit) since user chose to look
export function getNudgeForExperience(
  userName: string,
  experienceName: string,
  themes: string[] = [],
): string | null {
  const profile = profiles[userName];
  if (!profile) return null;

  for (const interest of profile.interests) {
    const keywordMatch = interest.keywords.some((kw) =>
      keywordInText(kw, experienceName)
    );

    const themeMatch = themes.some((t) =>
      interest.keywords.some((kw) => keywordInText(kw, t))
    );

    if (keywordMatch || themeMatch) {
      const today = new Date().toDateString();
      const hash = simpleHash(today + experienceName + userName);
      return interest.nudges[hash % interest.nudges.length];
    }
  }

  return null;
}

// ── Daily Greeting ──────────────────────────────────────────────────

const GREETING_STORAGE_KEY = "wander:last-greeting";

export function canShowDailyGreeting(userName: string): boolean {
  try {
    const stored = localStorage.getItem(GREETING_STORAGE_KEY);
    if (!stored) return true;
    const data = JSON.parse(stored);
    const lastDate = data[userName];
    if (!lastDate) return true;
    return lastDate !== new Date().toDateString();
  } catch {
    return true;
  }
}

export function recordDailyGreeting(userName: string): void {
  try {
    const stored = localStorage.getItem(GREETING_STORAGE_KEY);
    const data = stored ? JSON.parse(stored) : {};
    data[userName] = new Date().toDateString();
    localStorage.setItem(GREETING_STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

interface GreetingExperience {
  name: string;
  themes: string[];
}

/**
 * Build a daily greeting message by scanning today's planned experiences
 * for matches against the user's interest profile.
 */
export function getDailyGreeting(
  userName: string,
  todayExperiences: GreetingExperience[],
  cityName?: string,
): string | null {
  const profile = profiles[userName];
  if (!profile) return null;

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Find the first matching experience
  for (const exp of todayExperiences) {
    for (const interest of profile.interests) {
      const nameMatch = interest.keywords.some((kw) => keywordInText(kw, exp.name));
      const themeMatch = (exp.themes || []).some((t) =>
        interest.keywords.some((kw) => keywordInText(kw, t))
      );

      if (nameMatch || themeMatch) {
        const hash = simpleHash(new Date().toDateString() + userName + "greeting");
        const templates = [
          `${timeGreeting}, ${userName}. I noticed ${exp.name} is on your list today — thought you'd enjoy that one.`,
          `${timeGreeting}, ${userName}. ${exp.name} might be a highlight today. Enjoy your wander.`,
          `${timeGreeting}, ${userName}. You have ${exp.name} ahead of you today — seems like your kind of place.`,
        ];
        return templates[hash % templates.length];
      }
    }
  }

  // No interest match — city-specific discovery suggestions (the "mint on the pillow")
  if (cityName) {
    const hash = simpleHash(new Date().toDateString() + userName + "discovery");
    const discoveries: Record<string, string[]> = {
      Tokyo: [
        `${timeGreeting}, ${userName}. Did you know the backstreets of Shimokitazawa have some of Tokyo's best vintage finds? Worth a wander if you have a free hour.`,
        `${timeGreeting}, ${userName}. The view from the free observation deck at Tokyo Metropolitan Government Building is stunning at sunset. Just saying.`,
        `${timeGreeting}, ${userName}. If you pass through Yanaka today, the old cemetery path is one of Tokyo's hidden gems — locals walk their cats there.`,
      ],
      Kyoto: [
        `${timeGreeting}, ${userName}. The torii gates at Fushimi Inari are magical at dawn — far fewer people than midday. Something to consider.`,
        `${timeGreeting}, ${userName}. There's a tiny tea house on the Philosopher's Path that most tourists walk right past. Ask for matcha and just sit.`,
        `${timeGreeting}, ${userName}. Kyoto's Nishiki Market opens early — the pickled vegetables and fresh mochi are worth arriving before 9am.`,
      ],
      Nikko: [
        `${timeGreeting}, ${userName}. The forest walk behind Toshogu Shrine is one of the most peaceful in Japan. Don't skip it for the gift shops.`,
        `${timeGreeting}, ${userName}. Lake Chuzenji is beautiful today — the Kegon Falls viewpoint is about a 10-minute walk from the bus stop.`,
      ],
      Karatsu: [
        `${timeGreeting}, ${userName}. Karatsu's pottery tradition goes back 400 years. The Nakazato kiln is one of the few still using traditional techniques.`,
        `${timeGreeting}, ${userName}. The pine grove along Karatsu beach is called Nijinomatsubara — locals say it's best just before sunset.`,
      ],
      Okayama: [
        `${timeGreeting}, ${userName}. Korakuen Garden is one of Japan's top three. The early morning light on the pond is something special.`,
        `${timeGreeting}, ${userName}. The Bizen pottery district is a short train ride from Okayama — worth it if you love ceramics.`,
      ],
    };
    const cityDiscoveries = discoveries[cityName];
    if (cityDiscoveries) {
      return cityDiscoveries[hash % cityDiscoveries.length];
    }
    const generics = [
      `${timeGreeting}, ${userName}. ${cityName} has surprises around every corner. Enjoy your wander.`,
      `${timeGreeting}, ${userName}. Take your time in ${cityName} — the best moments are the ones you don't plan.`,
      `${timeGreeting}, ${userName}. Hope today in ${cityName} brings something unexpected and good. Enjoy your wander.`,
    ];
    return generics[hash % generics.length];
  }

  return `${timeGreeting}, ${userName}. Enjoy your wander.`;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
