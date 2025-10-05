const fs = require('fs');
const path = require('path');

// --- HELPER FUNCTIONS ---

const loadJsonData = (filename) => {
    try {
        const filePath = path.join(process.cwd(), 'data', filename);
        if (!fs.existsSync(filePath)) {
            console.warn(`Data file not found: ${filename}`);
            return {};
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        return {};
    }
};

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];


// --- API LOGIC ---

// Load all stat data and the new image manifest into memory
const allStatsData = {
    height: loadJsonData('coaster-height.json'),
    length: loadJsonData('coaster-length.json'),
    speed: loadJsonData('coaster-speed.json'),
    inversions: loadJsonData('coaster-inversions.json'),
    drop: loadJsonData('coaster-drop.json'),
    duration: loadJsonData('coaster-duration.json'),
    verticalAngle: loadJsonData('coaster-verticalAngle.json'),
    capacity: loadJsonData('coaster-capacity.json'),
    cost: loadJsonData('coaster-cost.json'),
    year: loadJsonData('coaster-year.json'),
    country: loadJsonData('coaster-country.json'),
};
const imageManifest = loadJsonData('image-manifest.json'); // <-- NEW: Load the image manifest

const allCoasterIds = [
    ...new Set(Object.values(allStatsData).flatMap(data => Object.keys(data)))
];


/**
 * The main serverless function that handles all requests.
 */
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    const { id, stat } = req.query;

    if (allCoasterIds.length === 0) {
        return res.status(500).json({ error: 'No coaster data found. Did you place the JSON files in the /data directory?' });
    }
    
    // Route logic remains the same...
    if (req.url.includes('/random')) {
        const randomId = getRandomElement(allCoasterIds);
        return fetchAndCombineCoasterData(randomId, res);
    }

    if (stat) {
        const statData = allStatsData[stat];
        if (!statData || Object.keys(statData).length === 0) {
            return res.status(404).json({ error: `No data found for the stat: '${stat}'` });
        }
        const randomIdWithStat = getRandomElement(Object.keys(statData));
        return fetchAndCombineCoasterData(randomIdWithStat, res);
    }

    if (id) {
        if (!allCoasterIds.includes(id)) {
            return res.status(404).json({ error: `Coaster with ID ${id} not found in our dataset.` });
        }
        return fetchAndCombineCoasterData(id, res);
    }
    
    return res.status(400).json({ 
        error: 'Invalid request. Please use a valid endpoint.'
    });
};

/**
 * Fetches data and combines it with local stats and a generated image URL.
 */
const fetchAndCombineCoasterData = async (id, res) => {
    try {
        const rcdbApiUrl = `https://rcdb-api.vercel.app/api/coasters/${id}`;
        const response = await fetch(rcdbApiUrl);

        if (!response.ok) {
            return res.status(response.status).json({ error: `Failed to fetch from RCDB API for ID ${id}.` });
        }

        const liveCoasterData = await response.json();
        
        const localStats = {};
        for (const statName in allStatsData) {
            if (allStatsData[statName][id] !== undefined) {
                localStats[statName] = allStatsData[statName][id];
            }
        }
        
        // --- NEW: Construct the image URL ---
        const imageName = imageManifest[id];
        const imageUrl = imageName ? `/img/${imageName}` : (liveCoasterData.mainPicture?.url || null);
        
        // Combine everything into the final response object
        const combinedData = { 
            ...liveCoasterData, 
            imageUrl: imageUrl, // Add the new top-level property
            stats: localStats 
        };
        
        return res.status(200).json(combinedData);

    } catch (error) {
        console.error(`Internal server error for ID ${id}:`, error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};