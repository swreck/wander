/**
 * A made-up plan file for the plan tool's tests (same shape as the private December plan; none of its content).
 * Five days, two cities in two countries, a stay that is confirmed, a stay that is planned, a stay for one person, two
 * legs that are confirmed and planned, a train, an untimed flight, and a day with commitments. It passes plan-check.
 * Mar 1 2027 is a Monday.
 */
export function fakePlan(): any {
  return {
    _about: ["A made-up plan for tests."],
    trip: { name: "A Trip", firstDay: "2027-03-01", lastDay: "2027-03-05", note: "Made up." },
    people: [
      { name: "Pat", family: 1, abroadFrom: "2027-03-01", abroadTo: "2027-03-05", status: "confirmed", source: "p1" },
      { name: "Sam", family: 1, abroadFrom: "2027-03-01", abroadTo: "2027-03-05", status: "confirmed", source: "p1" },
    ],
    cities: [
      { key: "city-a", name: "City A", country: "Vietnam", zone: "Asia/Ho_Chi_Minh", currency: "VND", arrive: "2027-03-01", leave: "2027-03-03" },
      { key: "city-b", name: "City B", country: "Japan", zone: "Asia/Tokyo", currency: "JPY", arrive: "2027-03-03", leave: "2027-03-05" },
    ],
    stays: [
      { key: "stay-a", city: "city-a", name: "Stay A Hotel", address: "1 Made Up Street, City A", phone: "+10000000001", checkIn: "2027-03-01", checkInTime: "3:00 pm", checkOut: "2027-03-03", checkOutTime: "12:00 pm",
        room: "A King Room, 1 room, 2 adults", forWhom: "Pat & Sam", status: "confirmed", from: "Pat's notes", source: "p2", read: "me" },
      { key: "stay-b", city: "city-b", name: "Stay B Inn", checkIn: "2027-03-03", checkOut: "2027-03-05", forWhom: "Everyone", status: "planned", from: "The tour company's itinerary", source: "p3", read: "me" },
    ],
    legs: [
      { key: "leg-1", date: "2027-03-01", who: "Pat, Sam", mode: "flight", service: "XY 123, operated by Z Air", cabin: "Business",
        from: "Home City (AAA)", depart: "11:45 am", departZone: "America/Los_Angeles", to: "City A Airport (BBB)", arrive: "5:40 pm", arriveDate: "2027-03-02", arriveZone: "Asia/Ho_Chi_Minh",
        status: "confirmed", fromWhom: "Pat's notes", source: "p4", read: "me" },
      { key: "leg-2", date: "2027-03-03", who: "Everyone", mode: "flight", service: "The tour company books it", from: "City A", to: "City B", note: "A morning flight, about 2 hours.",
        status: "planned", fromWhom: "The tour company's itinerary", source: "p5", read: "me" },
      { key: "leg-3", date: "2027-03-04", who: "Pat, Sam", mode: "train", service: "Fast Line 507", cabin: "Green Car", from: "City B Station", depart: "9:20 am", to: "City C", arrive: "10:44 am", zone: "Asia/Tokyo",
        status: "planned", fromWhom: "Pat's notes", source: "p6", read: "me", note: "Not booked." },
    ],
    days: [
      { date: "2027-03-01", weekday: "Mon", city: "city-a", zone: "America/Los_Angeles", country: "United States", who: "Pat, Sam", type: "travel", summary: "Fly at 11:45 am.", legs: ["leg-1"], stay: "stay-a" },
      { date: "2027-03-02", weekday: "Tue", city: "city-a", zone: "Asia/Ho_Chi_Minh", country: "Vietnam", who: "Pat, Sam", type: "free", stay: "stay-a" },
      { date: "2027-03-03", weekday: "Wed", city: "city-b", zone: "Asia/Tokyo", country: "Japan", who: "Everyone", type: "guided", summary: "Fly to City B and settle in.",
        cantMiss: ["9:00 am, The Lobby, Stay A Hotel. Bring walking shoes."], lines: ["Welcome walk, 1 hour", "Dinner together"], legs: ["leg-2"], stay: "stay-b", source: "p7" },
      { date: "2027-03-04", weekday: "Thu", city: "city-b", zone: "Asia/Tokyo", country: "Japan", who: "Pat, Sam", type: "free", summary: "A train day.", legs: ["leg-3"], stay: "stay-b" },
      { date: "2027-03-05", weekday: "Fri", city: "city-b", zone: "Asia/Tokyo", country: "Japan", who: "Pat, Sam", type: "free", summary: "Skiing." },
    ],
    ideas: [{ city: "city-a", items: ["A cooking class"], from: "Pat's notes", source: "p8", status: "planned", note: "Nothing booked." }],
    facts: [{ text: "A made-up fact.", source: "p9", from: "Pat's notes" }],
    pending: [{ what: "A change waiting on someone.", waitsOn: "the hotel", by: "soon", check: "a new copy" }],
    questions: [{ n: 1, for: "Pat", asked: null, text: "A made-up question about the private person named Quincy.", recommendation: "Wait." }],
    laterNotNow: ["A made-up later item."],
    neverShow: ["Quincy's cancelled flight to Nowhere Town: cancelled.", "The old hotel Grand Phantom: cancelled."],
  };
}
