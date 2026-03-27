interface Interest {
  keywords: string[];
  placeTypes: string[];
  nudges: string[];
}

interface TravelerProfile {
  interests: Interest[];
}

// Contributor colors — consistent across the app
export const TRAVELER_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  Ken:     { bg: "#f5ebe0", text: "#6b5d4a", dot: "#8a7a62", border: "#d4c5b0" },
  Larisa:  { bg: "#fce4ec", text: "#8e3a4a", dot: "#c06070", border: "#f0b8c0" },
  Andy:    { bg: "#e8f5e9", text: "#3a6840", dot: "#5a9060", border: "#b8d8b8" },
  Julie:   { bg: "#e3f2fd", text: "#2a5480", dot: "#4888c0", border: "#a0c8e8" },
};

// Fallback for unknown travelers or imports
const DEFAULT_COLOR = { bg: "#f0ece5", text: "#6b5d4a", dot: "#a89880", border: "#d4c5b0" };
const IMPORT_COLOR  = { bg: "#f5f5f5", text: "#757575", dot: "#9e9e9e", border: "#d0d0d0" };

/**
 * Get the color scheme for a contributor by their access code or display name.
 * Access codes map to display names in the auth system.
 */
export function getContributorColor(createdBy: string): typeof DEFAULT_COLOR {
  // Direct name match
  if (TRAVELER_COLORS[createdBy]) return TRAVELER_COLORS[createdBy];
  // Check if createdBy is an access code — map common codes to names
  // The app stores createdBy as the access code, not the display name
  for (const [name, color] of Object.entries(TRAVELER_COLORS)) {
    if (createdBy.toLowerCase().includes(name.toLowerCase())) return color;
  }
  // System imports
  if (createdBy === "system" || createdBy === "import") return IMPORT_COLOR;
  return DEFAULT_COLOR;
}

/**
 * Get display initial for a contributor (first letter of their name).
 */
export function getContributorInitial(createdBy: string): string {
  for (const name of Object.keys(TRAVELER_COLORS)) {
    if (createdBy.toLowerCase().includes(name.toLowerCase())) return name[0];
  }
  if (createdBy === "system" || createdBy === "import") return "B";
  return createdBy[0]?.toUpperCase() || "?";
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
        keywords: ["ocean", "sea", "marine", "coral", "reef", "coast", "beach", "harbor", "port", "fishing", "aquarium", "whale", "dolphin", "tide pool", "seashore", "bay", "waterfront"],
        placeTypes: ["aquarium", "natural_feature"],
        nudges: [
          "Andy, this stretch of coast has some of the clearest water in the region. Locals say the fishing communities here have been working to keep it that way.",
          "Andy, there's a marine conservation effort near here — the local fishermen partner with researchers on reef restoration.",
          "Andy, I noticed a harbor nearby where the fishing cooperative runs a sustainable catch program. The waterfront is worth a walk.",
          "Andy, this coastline has a cleanup volunteer program that welcomes visitors. Just mentioning it in case it connects.",
          "Andy, the ocean views from here are supposed to be something. The area has stayed clean because the community protects it.",
        ],
      },
      {
        keywords: ["hiking", "trail", "mountain", "forest", "park", "nature", "garden", "outdoor", "walk", "waterfall", "river", "lake", "gorge", "valley", "wilderness", "camping"],
        placeTypes: ["park", "national_park", "campground"],
        nudges: [
          "Andy, there's a trail near here that locals use — not a tourist path, just a good walk through the trees.",
          "Andy, this park is known for pulling people outside. The kind of place where you just start walking and don't want to stop.",
          "Andy, I noticed a nature reserve nearby. The trails are maintained by volunteers from the community.",
          "Andy, the outdoor access here is the real thing — forests, water, quiet. Thought you'd want to know it's close.",
          "Andy, this area has a community trail system that was built and maintained by locals who wanted to share the land.",
        ],
      },
      {
        keywords: ["volunteer", "community", "nonprofit", "charity", "service", "local", "cooperative", "social enterprise", "help", "give back", "foundation"],
        placeTypes: ["community_center"],
        nudges: [
          "Andy, there's a community project near here that welcomes visiting hands. They work with local families.",
          "Andy, I noticed a social enterprise nearby — they train locals and reinvest everything back into the neighborhood.",
          "Andy, this area has a cooperative that does good work. Some travelers have stopped by to see what they're building.",
        ],
      },
      {
        keywords: ["temple", "shrine", "buddhism", "buddhist", "zen", "meditation", "monastery", "dharma", "mindfulness", "pagoda", "torii", "prayer"],
        placeTypes: ["buddhist_temple", "hindu_temple", "place_of_worship"],
        nudges: [
          "Andy, there's a temple nearby that's been practicing Zen for centuries. The garden alone is worth the walk.",
          "Andy, I noticed a Buddhist temple close by — the morning meditation sessions are open to visitors.",
          "Andy, this shrine has a quiet courtyard that most people pass right by. The monks keep it immaculate.",
          "Andy, the temple here sits at the edge of a forest trail. The path between nature and practice is literal.",
        ],
      },
      {
        keywords: ["technology", "tech", "innovation", "robotics", "electronics", "AI", "digital", "science", "engineering", "maker", "lab", "startup"],
        placeTypes: ["electronics_store", "museum"],
        nudges: [
          "Andy, there's a tech space nearby where local makers build and share projects. It's the kind of place that sparks ideas.",
          "Andy, I noticed an innovation hub close by — they do open demos and welcome curious visitors.",
          "Andy, this area has a science museum that goes deep on robotics and engineering. Hands-on, not just displays.",
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

// ── Pre-trip document nudges & destination teasers ──────────────────

interface DocLike {
  type: string;
  data: Record<string, string>;
}

interface TripLike {
  name: string;
  startDate: string;
  cities: { name: string; country: string | null }[];
}

/**
 * Before the trip starts, gently nudge travelers about missing documents.
 * Once documents are reasonably complete, switch to destination teasers
 * personalized to each traveler's interests.
 */
export function getPreTripNudge(
  userName: string,
  documents: DocLike[],
  trip: TripLike,
): string | null {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const hasPassport = documents.some((d) => d.type === "passport");
  const hasInsurance = documents.some((d) => d.type === "insurance");
  const hasFreqFlyer = documents.some((d) => d.type === "frequent_flyer");

  // Document nudges — gentle, one at a time, rotating by day
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

  if (!hasPassport && dayOfYear % 3 === 0) {
    return `${timeGreeting}, ${userName}. Quick thought — have you added your passport details to Wander yet? You can just tell me in the chat or tap your name on the home screen.`;
  }
  if (hasPassport && !hasInsurance && dayOfYear % 3 === 1) {
    return `${timeGreeting}, ${userName}. Your passport's on file — nice. Travel insurance is worth adding too, so it's at your fingertips if you need it.`;
  }
  if (hasPassport && !hasFreqFlyer && dayOfYear % 3 === 2) {
    return `${timeGreeting}, ${userName}. Got your passport, got your plans — want to add your frequent flyer numbers so they're handy at check-in?`;
  }

  // Documents reasonably complete — switch to destination teasers
  const profile = profiles[userName];
  const cities = trip.cities?.map((c) => c.name) || [];
  const hash = simpleHash(new Date().toDateString() + userName + "teaser");

  // Personalized teasers based on interests and destinations
  const teasers: string[] = [];

  if (cities.some((c) => /nagoya|arita|karatsu|tokoname|bizen|mashiko/i.test(c))) {
    if (profile?.interests.some((i) => i.keywords.some((k) => /ceramic|pottery|kiln/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Did you know the first kilns in Nagoya date back to the 8th century? The local clay has a character you can feel in the finished pieces.`,
        `${timeGreeting}, ${userName}. In Arita, they say the porcelain tradition started when a Korean potter discovered kaolin stone on Izumiyama in 1616. Four hundred years later, the kilns are still firing.`,
        `${timeGreeting}, ${userName}. Karatsu ware is known as "the pottery of daily use" — potters there believe a piece isn't complete until someone drinks tea from it.`,
      );
    }
  }

  if (cities.some((c) => /tokyo|kyoto|nikko|osaka/i.test(c))) {
    if (profile?.interests.some((i) => i.keywords.some((k) => /temple|zen|meditation|shrine/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Kyoto has over 2,000 temples and shrines. The ones tucked into residential neighborhoods, with no tour buses outside, are often the most moving.`,
        `${timeGreeting}, ${userName}. Nikko's Toshogu Shrine took 15,000 artisans over two years to build. The "see no evil" monkeys are just the beginning.`,
      );
    }
    if (profile?.interests.some((i) => i.keywords.some((k) => /food|cooking|culinary/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. In Tokyo's Tsukiji outer market, the vendors have been selling to the same families for generations. The tamago (egg omelet) stalls open at 5am.`,
        `${timeGreeting}, ${userName}. Kyoto's kaiseki tradition treats each dish as a small artwork. The best meals follow the season down to the garnish.`,
      );
    }
    if (profile?.interests.some((i) => i.keywords.some((k) => /ocean|sea|marine|coast|harbor/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Tokyo Bay has a surprising amount of marine life. The city's waterfront communities have been working on restoration for years — the water is cleaner than it's been in decades.`,
        `${timeGreeting}, ${userName}. Osaka's port area has a deep fishing heritage. The local cooperative still runs the morning auction the old way, and the waterfront is one of the most honest parts of the city.`,
      );
    }
    if (profile?.interests.some((i) => i.keywords.some((k) => /hiking|trail|mountain|forest|outdoor|nature/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Kyoto's Higashiyama hills have walking trails that most visitors never find. The bamboo forests thin out into views that make you stop and breathe.`,
        `${timeGreeting}, ${userName}. Tokyo has more green space than people realize. Meiji Shrine's forest was planted a hundred years ago by volunteers from across Japan — 100,000 trees, all donated.`,
      );
    }
    if (profile?.interests.some((i) => i.keywords.some((k) => /volunteer|community|service|cooperative/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Osaka has a history of mutual aid that runs deep. The city's community kitchens and neighborhood cooperatives are part of the fabric, not tourist attractions.`,
      );
    }
    if (profile?.interests.some((i) => i.keywords.some((k) => /technology|tech|innovation|robotics|electronics/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Akihabara started as a black market for radio parts after the war. Now it's six floors of everything electronic — but the maker spirit is still the same.`,
        `${timeGreeting}, ${userName}. Kyoto's tech scene is quieter than Tokyo's but deeper. Nintendo, Omron, and Kyocera all started here. The local maker spaces carry that same precision.`,
      );
    }
    if (profile?.interests.some((i) => i.keywords.some((k) => /sweet|pastry|matcha|bakery|dessert|mochi/i.test(k)))) {
      teasers.push(
        `${timeGreeting}, ${userName}. Japan takes its seasonal sweets seriously — wagashi in spring are shaped like cherry blossoms, and the matcha served with them is whisked to order.`,
        `${timeGreeting}, ${userName}. The melon pan in Japan is nothing like what you'd expect. Crispy cookie shell, soft bread inside. Some bakeries serve them warm.`,
      );
    }
  }

  // Generic teasers if nothing matched interests
  if (teasers.length === 0) {
    const genericDestination = cities[hash % cities.length] || trip.name;
    teasers.push(
      `${timeGreeting}, ${userName}. ${trip.name} is getting closer. Something good is waiting in ${genericDestination}.`,
      `${timeGreeting}, ${userName}. The best travel moments are the ones you can't plan for. ${genericDestination} will have a few of those.`,
    );
  }

  return teasers[hash % teasers.length];
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
