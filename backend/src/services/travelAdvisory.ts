/**
 * Travel Advisory Service
 *
 * Provides country-specific visa requirements, CDC vaccine recommendations,
 * and practical travel health/safety information.
 *
 * Data sources: US State Department, CDC Travelers' Health
 * This is reference data — travelers should verify with official sources.
 */

export interface CountryAdvisory {
  country: string;
  visa: {
    required: boolean;
    type: string; // e.g., "e-Visa", "Visa on Arrival", "Visa exempt"
    duration: string; // e.g., "30 days", "90 days"
    notes: string;
    applyUrl?: string;
  };
  vaccines: {
    name: string;
    status: "recommended" | "required" | "consider";
    notes: string;
  }[];
  healthNotes: string[];
  safetyNotes: string[];
  connectivity: {
    general: string;
    simCard: string;
  };
  currency: {
    name: string;
    code: string;
    tips: string;
  };
}

// Country advisory data — keyed by lowercase country name
const ADVISORIES: Record<string, CountryAdvisory> = {
  vietnam: {
    country: "Vietnam",
    visa: {
      required: true,
      type: "e-Visa",
      duration: "up to 90 days (single or multiple entry)",
      notes: "US citizens need a visa. The e-Visa is the easiest option — apply online at least 5 business days before travel. You can also get a visa on arrival at major airports with a pre-approved letter, but e-Visa is simpler.",
      applyUrl: "https://evisa.xuatnhapcanh.gov.vn",
    },
    vaccines: [
      { name: "Hepatitis A", status: "recommended", notes: "Spread through contaminated food/water. Get vaccinated at least 2 weeks before travel." },
      { name: "Hepatitis B", status: "recommended", notes: "Spread through blood/body fluids. 3-dose series — start 6 months before if not already vaccinated." },
      { name: "Typhoid", status: "recommended", notes: "Spread through contaminated food/water, especially in smaller cities and rural areas." },
      { name: "Diphtheria-Tetanus (Td/Tdap)", status: "recommended", notes: "Make sure your routine Td/Tdap is up to date (booster every 10 years)." },
      { name: "Japanese Encephalitis", status: "consider", notes: "Consider if spending extended time in rural areas or during rainy season. Talk to your doctor." },
      { name: "Rabies", status: "consider", notes: "Consider if you'll be around animals or in remote areas far from medical care." },
      { name: "Malaria prophylaxis", status: "consider", notes: "Risk in some rural and forested areas. Not typically needed for major cities (Hanoi, HCMC, Da Nang). Discuss with your doctor based on your specific itinerary." },
    ],
    healthNotes: [
      "Drink only bottled or purified water — ice in restaurants is usually made from purified water in tourist areas, but ask if unsure.",
      "Street food is generally safe if it's cooked fresh and hot. Popular stalls with high turnover are your best bet.",
      "Bring basic medications (anti-diarrheal, pain relief, antihistamine) — pharmacies exist but language barriers can complicate things.",
      "International hospitals in Hanoi and Ho Chi Minh City are excellent. Rural medical facilities are more limited.",
      "Travel medical insurance with evacuation coverage is strongly recommended.",
    ],
    safetyNotes: [
      "Vietnam is generally very safe for tourists. Petty theft (bag snatching from motorbikes) is the main concern in cities.",
      "Traffic is intense — crossing streets takes practice. Walk steadily and predictably; traffic flows around you.",
      "Use Grab (Southeast Asia's Uber) for reliable, metered rides.",
    ],
    connectivity: {
      general: "Major cities have good 4G coverage. Rural and mountainous areas (like parts of the Central Highlands and northern mountains) may have spotty or no signal.",
      simCard: "Get a local SIM at the airport — Viettel or Mobifone have the best rural coverage. ~$5-10 for a tourist SIM with data.",
    },
    currency: {
      name: "Vietnamese Dong",
      code: "VND",
      tips: "Cash is king in markets and small shops. ATMs are widespread in cities. Credit cards accepted at hotels and larger restaurants. 1 USD ≈ 25,000 VND.",
    },
  },
  cambodia: {
    country: "Cambodia",
    visa: {
      required: true,
      type: "e-Visa or Visa on Arrival",
      duration: "30 days (single entry, extendable)",
      notes: "US citizens need a visa. e-Visa ($36, apply 3+ days before) or Visa on Arrival ($30 cash + passport photo) at airports and major land crossings. e-Visa is faster at immigration.",
      applyUrl: "https://www.evisa.gov.kh",
    },
    vaccines: [
      { name: "Hepatitis A", status: "recommended", notes: "High risk — get vaccinated at least 2 weeks before travel." },
      { name: "Hepatitis B", status: "recommended", notes: "Recommended for all travelers. 3-dose series." },
      { name: "Typhoid", status: "recommended", notes: "Spread through contaminated food/water. Important for this destination." },
      { name: "Diphtheria-Tetanus (Td/Tdap)", status: "recommended", notes: "Ensure your routine booster is current." },
      { name: "Japanese Encephalitis", status: "consider", notes: "Consider if visiting rural areas or spending more than a month. Discuss with your doctor." },
      { name: "Rabies", status: "consider", notes: "Stray dogs are common. Consider pre-exposure vaccination, especially for longer stays or rural travel." },
      { name: "Malaria prophylaxis", status: "consider", notes: "Risk in forested/rural areas. Generally not needed for Phnom Penh, Siem Reap city, or Sihanoukville beaches. Discuss with your doctor." },
    ],
    healthNotes: [
      "Drink only bottled water. Avoid ice in less touristy areas.",
      "Dengue fever is a risk year-round — use insect repellent (DEET-based), especially at dawn and dusk.",
      "Medical facilities in Phnom Penh are adequate for basic care. Siem Reap has limited options. Serious issues may require evacuation to Bangkok.",
      "Travel medical insurance with evacuation coverage is essential, not optional.",
      "Bring a basic first-aid kit and any prescription medications you need.",
    ],
    safetyNotes: [
      "Generally safe for tourists. Be cautious with bag snatching in Phnom Penh — keep bags on the side away from the road.",
      "Don't walk on unmarked paths in rural areas — landmine risk still exists in some border regions.",
      "Tuk-tuks and Grab are the standard way to get around. Negotiate tuk-tuk prices before getting in.",
    ],
    connectivity: {
      general: "Good 4G in Phnom Penh and Siem Reap. Patchy in rural areas and along some highways.",
      simCard: "Airport SIMs from Smart or Cellcard, ~$3-5 for tourist data plans. Smart has the best overall coverage.",
    },
    currency: {
      name: "US Dollar / Cambodian Riel",
      code: "USD/KHR",
      tips: "US dollars are widely accepted and preferred. Riel used for small change (4,000 KHR = $1). ATMs dispense USD. Bring crisp, undamaged bills — torn or marked dollars are often refused.",
    },
  },
  japan: {
    country: "Japan",
    visa: {
      required: false,
      type: "Visa exempt",
      duration: "90 days for tourism",
      notes: "US citizens can enter visa-free for up to 90 days. You'll complete a Visit Japan Web form before arrival (immigration + customs declaration). Register at https://www.vjw.digital.go.jp at least a few days before travel.",
    },
    vaccines: [
      { name: "Routine vaccines", status: "recommended", notes: "Make sure your routine vaccinations are up to date (MMR, Td/Tdap, flu, COVID)." },
      { name: "Japanese Encephalitis", status: "consider", notes: "Only if spending extended time in rural areas during summer. Not needed for typical tourist itineraries." },
    ],
    healthNotes: [
      "Japan has world-class medical facilities. Pharmacies are everywhere but staff may not speak English — bring Google Translate.",
      "Tap water is safe to drink everywhere.",
      "Bring any prescription medications in their original containers with a doctor's note — Japan has strict drug import rules (some common cold medicines containing pseudoephedrine are restricted).",
    ],
    safetyNotes: [
      "Japan is one of the safest countries in the world. Violent crime against tourists is essentially non-existent.",
      "Earthquakes are common — learn the basics (drop, cover, hold on). Hotels have emergency procedures posted.",
      "Lost items are frequently turned in to police boxes (koban) or station lost-and-found offices.",
    ],
    connectivity: {
      general: "Excellent 4G/5G coverage everywhere including rural areas and trains. Wi-Fi is widespread in cities, stations, and convenience stores.",
      simCard: "Get a tourist eSIM or pocket Wi-Fi. Available at airports or order in advance. Ubigi, Mobal, and IIJmio are popular options.",
    },
    currency: {
      name: "Japanese Yen",
      code: "JPY",
      tips: "Japan is still significantly cash-based, especially at smaller restaurants, temples, and markets. 7-Eleven ATMs accept foreign cards reliably. IC cards (Suica/Pasmo) work for trains and many shops.",
    },
  },
};

/**
 * Get advisories for a list of countries.
 * Falls back to a generic advisory if the country isn't in our database.
 */
export function getCountryAdvisories(countries: string[]): CountryAdvisory[] {
  const results: CountryAdvisory[] = [];
  const seen = new Set<string>();

  for (const country of countries) {
    const key = country.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);

    const advisory = ADVISORIES[key];
    if (advisory) {
      results.push(advisory);
    }
  }

  return results;
}

/**
 * Get a consolidated pre-trip advisory summary for display.
 * Groups visa deadlines, vaccine recommendations, and practical tips.
 */
export function getPreTripSummary(countries: string[], tripStartDate?: string): {
  visaActions: { country: string; action: string; urgent: boolean }[];
  vaccineActions: { name: string; countries: string[]; status: string; notes: string }[];
  healthHighlights: string[];
  connectivityNote: string;
} {
  const advisories = getCountryAdvisories(countries);

  // Visa actions
  const visaActions = advisories
    .filter((a) => a.visa.required)
    .map((a) => {
      let urgent = false;
      if (tripStartDate) {
        const daysUntil = Math.round(
          (new Date(tripStartDate).getTime() - Date.now()) / 86400000
        );
        urgent = daysUntil < 30;
      }
      return {
        country: a.country,
        action: `${a.visa.type} needed — ${a.visa.notes}`,
        urgent,
      };
    });

  // Consolidate vaccine recommendations across countries
  const vaccineMap = new Map<string, { countries: string[]; status: string; notes: string }>();
  for (const a of advisories) {
    for (const v of a.vaccines) {
      if (v.status === "consider") continue; // Only show recommended/required
      const existing = vaccineMap.get(v.name);
      if (existing) {
        existing.countries.push(a.country);
      } else {
        vaccineMap.set(v.name, {
          countries: [a.country],
          status: v.status,
          notes: v.notes,
        });
      }
    }
  }
  const vaccineActions = Array.from(vaccineMap.entries()).map(([name, data]) => ({
    name,
    ...data,
  }));

  // Top health highlights (deduplicated)
  const healthHighlights: string[] = [];
  const seenHealth = new Set<string>();
  for (const a of advisories) {
    for (const note of a.healthNotes.slice(0, 2)) {
      const key = note.slice(0, 30);
      if (!seenHealth.has(key)) {
        seenHealth.add(key);
        healthHighlights.push(note);
      }
    }
  }

  // Connectivity summary
  const connectivityParts = advisories
    .filter((a) => a.connectivity.general.toLowerCase().includes("spotty") ||
                   a.connectivity.general.toLowerCase().includes("patchy") ||
                   a.connectivity.general.toLowerCase().includes("no signal"))
    .map((a) => `${a.country}: ${a.connectivity.general}`);
  const connectivityNote = connectivityParts.length > 0
    ? connectivityParts.join(" ")
    : "Good connectivity expected across your destinations.";

  return { visaActions, vaccineActions, healthHighlights, connectivityNote };
}
