# Rosen Air Airports Visited

Interactive map of the airports in Larry Rosen's airport log, 1985 onward.
Live at https://rosen-air-airports.netlify.app

- `index.html` — the map page (219 original airports embedded; uses `d3.min.js` v7.9.0, served locally)
- `RosenAir_Airports_Visited.xlsx` — cleaned airport list (sheet 1) plus the original log (sheet 2); the base for downloads

## Add airport (v1.3)

- **Add airport** button (next to the download link) opens a popup: airport ID, date first visited, PIN.
  The ID is resolved against the OurAirports database (fetched at request time), shown for confirmation, then saved.
- Added airports live in Netlify Blobs (store `added-airports`, one key per ID) and merge into the map on load.
  Button-added airports show a **Remove** link in the details panel; original airports can't be removed.
- **Download** (`/api/download`) serves the base workbook with added airports merged into the Airports sheet in date order.
- PIN: Netlify env var `AIRPORT_PIN` (case-insensitive). Change it in Netlify and redeploy.

Functions: `netlify/functions/airports.mts` (`/api/airports`), `netlify/functions/download.mts` (`/api/download`).
Names, cities and coordinates from the OurAirports database.
