import prisma from "./db.js";

/**
 * Normalize a name for fuzzy comparison:
 * lowercase, strip accents, collapse whitespace, remove common punctuation.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[''`".,!?()[\]{}\-–—:/]/g, " ")         // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two normalized names are fuzzy-equal:
 * - Exact match after normalization
 * - One contains the other (if the shorter one is >= 4 chars)
 */
function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  return false;
}

/**
 * Check if an experience name already exists in a trip (fuzzy match).
 * Returns the existing experience name if found, null if no duplicate.
 */
export async function findDuplicate(
  tripId: string,
  name: string,
  cityId?: string,
): Promise<string | null> {
  const norm = normalize(name);

  // Query existing experiences — scope to city if provided, otherwise whole trip
  const where: any = { tripId };
  if (cityId) where.cityId = cityId;

  const existing = await prisma.experience.findMany({
    where,
    select: { name: true },
  });

  for (const exp of existing) {
    if (fuzzyMatch(norm, normalize(exp.name))) {
      return exp.name;
    }
  }

  return null;
}
