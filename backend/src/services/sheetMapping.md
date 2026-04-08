# Spreadsheet ↔ Wander Data Mapping

## Spreadsheet Structure
- **ID**: Configurable (stored in env/settings)
- **Service Account**: wander-sheets@actionmgr.iam.gserviceaccount.com

## Tab: Japan-Oct'26-Itinerary
### Structure
- Row 0: Headers (33 columns)
- Column layout: [J/A Budget, K/L Budget, Date, Chk Out, Nights, Description, From, To, Depart, Arrive, Flight Time, Airport Layover, Site Layover, Time, To, Time, Total, $ J/A, $ K/L, Hotel (Daily Rate), $ J/A, $ K/L, cancellation date, Notes, Meals, $ J/A, $K/L, Time, Time Zone, Hi, Lo, Precip, Notes]
- City sections: A row with just the city name in column C (Date column) marks the start of a city section
- Date rows: Rows with a date in column C belong to the current city section
- Budget rows: Columns A-B have budget values; columns Q-R have running totals

### City Detection
- Parse column C (index 2). If it contains a recognizable city name without a date pattern → new city section
- Skip "Kanchanaburi" and any rows below it until the next valid Japan city
- City names found: San Francisco, Osaka, Okayama, Hakata or Karatsu, Nagoya, Tokyo, Backroads sections, Kyoto

### Data Extraction Per City Section
- **City name**: Column C of the city header row
- **Arrival date**: Column C of the first date row after city header
- **Departure date**: Column D (Chk Out) of the first date row
- **Nights**: Column E
- **Hotel name**: Column T (Hotel Daily Rate)
- **Hotel cost J/A**: Column U
- **Hotel cost K/L**: Column V  
- **Cancellation date**: Column W
- **Notes**: Column X
- **Daily meal budget**: Column Y (description), Z (J/A), AA (K/L)
- **Weather**: Columns AB-AE (Time, Time Zone, Hi, Lo, Precip)

### Day Extraction
- Each row with a date in column C within a city section → one Day
- Description (column F) becomes day notes
- Budget data is NOT synced to Wander

## Tab: Tokyo Hotel Template / Kyoto Hotel Template
### Structure  
- Rows 0-2: Instructions
- Row 3: Headers — columns L-O are voting columns, columns Q-Y are hotel data
- Rows 4+: One hotel per row

### Column Mapping (0-indexed)
- [11] Julie's Top 3 ranking
- [12] Larisa's Top 3 ranking  
- [13] Ken's Top 3 ranking
- [14] Andy's Top 3 ranking
- [16] Hotel name → Decision option name / Accommodation name
- [17] Location/Metro Distance → description field
- [18] Rating → stored in notes
- [19] Sq Footage → stored in notes
- [20] Daily Rate → stored in notes
- [21] Total cost → stored in notes
- [22] Other Criteria → stored in notes
- [23] URL → sourceUrl
- [24] AI Notes → description (appended)

### Wander Mapping
- Each hotel template tab → one Decision (title: "Tokyo Hotel" / "Kyoto Hotel")
- Each hotel row → one Experience (state: "voting", linked to decision)
- Ranking values (1/2/3) → DecisionVote per user
- Also create Accommodation record for the hotel (if it has enough data)

## Tab: Activities Template
### Structure
- Rows 0-6: Instructions
- Row 7: City group headers (Osaka, Tokyo, Kyoto in specific columns)
- Row 8: Column headers — A=Julie, B=Andy, C=Larisa, D=Ken, E=Activity section/name, F=blank or activity name, G=neighborhood, H=Comment, I=URL, J-W=Date columns
- Rows 9+: Activity data

### Section Detection
- Column E (index 4) contains section headers: "Tokyo - Activities", "Tokyo - Tours/Day Trips", "Tokyo - Restaurants", "Kyoto - Activities", etc.
- Actual activities have the name in column F (index 5) and optionally interest marks in columns A-D

### Column Mapping  
- [0] Julie interest (X or empty)
- [1] Andy interest (X or empty)
- [2] Larisa interest (X or empty)
- [3] Ken interest (X or empty)
- [4] Section header OR empty
- [5] Activity name
- [6] Neighborhood/area
- [7] Comment
- [8] URL
- [9-22] Date columns for day-specific assignment

### City Assignment
- Activities under "Tokyo - *" → assigned to Tokyo city
- Activities under "Kyoto - *" → assigned to Kyoto city
- Activities under "Osaka - *" → assigned to Osaka city

### Wander Mapping
- Each activity → Experience (state: "possible")
- X marks → ExperienceInterest records
- Date column checks → promote to "selected" with dayId
- Neighborhood → explorationZoneAssociation
- Comment → userNotes
- URL → sourceUrl

## Sync Rules
1. **Spreadsheet wins on conflict** (last-write-wins with spreadsheet tiebreaker)
2. **Log all conflicts** for Ken to review
3. **Fuzzy name matching** for dedup (Jaro-Winkler, threshold 0.85)
4. **New rows in spreadsheet** → new records in Wander
5. **New records in Wander** → new rows in spreadsheet (appended to appropriate section)
6. **Budget/weather data** → NOT synced (spreadsheet-only)
7. **Wander-only data** (cultural notes, ratings, map data, travel times) → NOT synced to spreadsheet
8. **Backroads days** → dayType: "guided"
