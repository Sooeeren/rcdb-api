# Roller Coaster Data API

This API serves curated roller coaster data, combining information from the public RCDB API with pre-scraped statistics for fast and reliable access.

## API Endpoints

The base URL will be your Vercel deployment URL.

### 1. Get a Random Coaster
Retrieves the complete data for a single, random roller coaster from the dataset.
- **URL:** `/api/coasters/random`
- **Method:** `GET`

### 2. Get a Specific Coaster by ID
Retrieves the complete data for a coaster by its unique ID.
- **URL:** `/api/coasters/{id}`
- **Method:** `GET`
- **Example:** `/api/coasters/36`

### 3. Get a Random Coaster with a Specific Stat
Retrieves a random coaster that is guaranteed to have a value for the specified statistic.
- **URL:** `/api/coasters/stat/{statName}`
- **Method:** `GET`
- **Example:** `/api/coasters/stat/height`
- **Valid Stats:** `height`, `length`, `speed`, `inversions`, `drop`, `duration`, `verticalAngle`, `capacity`, `cost`, `year`, `country`.