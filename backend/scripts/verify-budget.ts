import "dotenv/config";
import prisma from "../src/services/db.js";

async function main() {
  const cities = await prisma.city.findMany({
    where: { tripId: "cmnobsbng00008oemedi46f50" },
    orderBy: { sequenceOrder: "asc" },
  });

  console.log("=== CITY BUDGET DATA ===\n");
  for (const c of cities) {
    console.log(`${c.name} (${c.arrivalDate?.toISOString().split("T")[0]} → ${c.departureDate?.toISOString().split("T")[0]})`);
    if (c.costEstimate) {
      const cost = c.costEstimate as any;
      console.log(`  Budget J/A: $${cost.budgetJA || "—"}  |  K/L: $${cost.budgetKL || "—"}`);
      console.log(`  Hotel rate: ${cost.hotelDailyRate || "—"}  |  Total J/A: $${cost.hotelTotalJA || "—"}  K/L: $${cost.hotelTotalKL || "—"}`);
      console.log(`  Meals: ${cost.mealsDailyDesc || "—"}  |  J/A: $${cost.mealsBudgetJA || "—"}  K/L: $${cost.mealsBudgetKL || "—"}`);
    } else {
      console.log("  (no budget data)");
    }
    console.log();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
