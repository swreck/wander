export interface City {
  id: string;
  name: string;
  tagline: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  sequenceOrder: number;
  arrivalDate: string | null;
  departureDate: string | null;
  _count?: { experiences: number; days: number };
}

export interface Day {
  id: string;
  tripId: string;
  cityId: string;
  date: string;
  explorationZone: string | null;
  notes: string | null;
  city: City;
  experiences: Experience[];
  reservations: Reservation[];
  accommodations: Accommodation[];
}

export interface RouteSegment {
  id: string;
  tripId: string;
  originCity: string;
  destinationCity: string;
  sequenceOrder: number;
  transportMode: string;
  departureDate: string | null;
  notes: string | null;
}

export interface ExperienceRating {
  id: string;
  platform: "google" | "yelp" | "foursquare";
  ratingValue: number;
  reviewCount: number;
}

export interface Experience {
  id: string;
  tripId: string;
  cityId: string;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  sourceText: string | null;
  locationStatus: "unlocated" | "pending" | "confirmed";
  latitude: number | null;
  longitude: number | null;
  placeIdGoogle: string | null;
  state: "possible" | "selected";
  dayId: string | null;
  routeSegmentId: string | null;
  timeWindow: string | null;
  transportModeToHere: string | null;
  priorityOrder: number;
  cloudinaryImageId: string | null;
  themes: string[];
  userNotes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  city?: City;
  day?: Day;
  routeSegment?: RouteSegment;
  ratings: ExperienceRating[];
}

export interface Accommodation {
  id: string;
  tripId: string;
  cityId: string;
  dayId: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  confirmationNumber: string | null;
  notes: string | null;
}

export interface Reservation {
  id: string;
  tripId: string;
  dayId: string;
  name: string;
  type: string;
  datetime: string;
  durationMinutes: number | null;
  latitude: number | null;
  longitude: number | null;
  confirmationNumber: string | null;
  notes: string | null;
  transportModeToHere: string | null;
}

export interface Trip {
  id: string;
  name: string;
  tagline: string | null;
  startDate: string;
  endDate: string;
  status: string;
  cities: City[];
  routeSegments: RouteSegment[];
  days: Day[];
  experiences?: Experience[];
  accommodations?: Accommodation[];
}

export interface ChangeLogEntry {
  id: string;
  tripId: string;
  userCode: string;
  userDisplayName: string;
  actionType: string;
  entityType: string;
  entityId: string;
  entityName: string;
  description: string;
  createdAt: string;
}
