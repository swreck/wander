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
  hidden?: boolean;
  _count?: { experiences: number; days: number };
}

export interface ExperienceReactionGroup {
  emoji: string;
  count: number;
  travelers: string[];
}

export interface ExperienceNoteEntry {
  id: string;
  experienceId: string;
  travelerId: string;
  content: string;
  visibility: "group" | "private";
  createdAt: string;
  traveler: { displayName: string };
}

export interface PersonalItem {
  id: string;
  dayId: string;
  travelerId: string;
  content: string;
  timeWindow: string | null;
  createdAt: string;
}

export interface Day {
  id: string;
  tripId: string;
  cityId: string;
  date: string;
  dayNumber: number | null;
  dayType: string; // "free" | "guided"
  explorationZone: string | null;
  notes: string | null;
  city: City;
  experiences: Experience[];
  reservations: Reservation[];
  accommodations: Accommodation[];
  personalItems?: PersonalItem[];
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
  confirmationNumber: string | null;
  serviceNumber: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  departureStation: string | null;
  arrivalStation: string | null;
  seatInfo: string | null;
}

export interface ExperienceRating {
  id: string;
  platform: "google" | "yelp" | "foursquare" | "tabelog";
  ratingValue: number;
  reviewCount: number;
}

export interface CulturalNote {
  tip: string;
  category: "etiquette" | "practical" | "timing";
}

export interface ExperienceInterest {
  id: string;
  experienceId: string;
  tripId: string;
  userCode: string;
  displayName: string;
  note: string | null;
  createdAt: string;
  experience?: { id: string; name: string; cityId: string; dayId: string | null; state: string; city: { name: string } };
  reactions: InterestReaction[];
}

export interface InterestReaction {
  id: string;
  interestId: string;
  userCode: string;
  displayName: string;
  reaction: "interested" | "maybe" | "pass";
  note: string | null;
  createdAt: string;
}


export interface TransitRoute {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  transfers: number;
  fare: string | null;
  steps: TransitStep[];
}

export interface TransitStep {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  line: string;
  vehicle: string;
  departureStop: string;
  arrivalStop: string;
  numStops: number;
  headsign: string;
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
  state: "possible" | "selected" | "voting";
  dayId: string | null;
  routeSegmentId: string | null;
  timeWindow: string | null;
  transportModeToHere: string | null;
  priorityOrder: number;
  cloudinaryImageId: string | null;
  themes: string[];
  userNotes: string | null;
  createdBy: string;
  lastEditedBy: string | null;
  createdAt: string;
  updatedAt: string;
  city?: City;
  day?: Day;
  routeSegment?: RouteSegment;
  ratings: ExperienceRating[];
  culturalNotes?: CulturalNote[] | null;
  notes?: ExperienceNoteEntry[];
  sheetRowRef?: string | null;
  conditionalAssignment?: {
    fallbackDate: string;
    waitFor: string;
    ifInterested: string;
    ifNot: string;
  } | null;
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
  startDate: string | null;
  endDate: string | null;
  datesKnown: boolean;
  anchorDate: string | null;
  status: string;
  createdAt?: string;
  lastOpenedAt?: string | null;
  cities: City[];
  routeSegments: RouteSegment[];
  days: Day[];
  experiences?: Experience[];
  accommodations?: Accommodation[];
  sheetSyncConfig?: { lastSyncAt: string | null };
}

export interface TravelerProfile {
  id: string;
  tripId: string;
  userCode: string;
  displayName: string;
  documents: TravelerDocument[];
}

export interface TravelerDocument {
  id: string;
  profileId: string;
  type: "passport" | "visa" | "frequent_flyer" | "insurance" | "ticket" | "custom";
  label: string | null;
  data: Record<string, string>;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface DecisionVote {
  id: string;
  optionId: string | null;
  userCode: string;
  displayName: string;
  rank: number;
}

export interface Decision {
  id: string;
  tripId: string;
  cityId: string;
  dayId?: string | null;
  title: string;
  status: string;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string | null;
  city: { id: string; name: string };
  options: Experience[];
  votes: DecisionVote[];
}
