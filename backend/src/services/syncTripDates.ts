import prisma from "./db.js";

/**
 * Recalculate trip.startDate / trip.endDate from actual Day records.
 * Call after any operation that creates, deletes, or moves days.
 */
export async function syncTripDates(tripId: string): Promise<void> {
  const agg = await prisma.day.aggregate({
    where: { tripId },
    _min: { date: true },
    _max: { date: true },
  });

  if (!agg._min.date || !agg._max.date) return; // no days → leave trip dates alone

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      startDate: agg._min.date,
      endDate: agg._max.date,
    },
  });
}
