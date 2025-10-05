const path = require('path');
const fs = require('fs-extra');
const fetch = require('node-fetch');

// --- SCRIPT CONFIGURATION ---
const START_ID = 1;
const END_ID = 23211;
const CONCURRENT_LIMIT = 15;

const ALLOWED_STATS = [
    'height', 'length', 'speed', 'inversions', 'drop', 'duration', 
    'verticalAngle', 'capacity', 'cost', 'year', 'country', 'closed',
    'name', 'park'
];

const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGE_DIR = path.join(PUBLIC_DIR, 'img');
const DATA_DIR = path.join(__dirname, 'data');
const LOG_DIR = path.join(__dirname, 'logs');
const SUCCESS_LOG_PATH = path.join(LOG_DIR, 'success.log');
const ERROR_LOG_PATH = path.join(LOG_DIR, 'error.log');
const DATA_LOG_PATH = path.join(LOG_DIR, 'data_saved.log');
const API_BASE_URL = 'https://rcdb-api.vercel.app/api/coasters/';

// Global state objects
const allStats = {};
const imageManifest = {};
const photographerCredits = {};

function logSuccess(message) {
    fs.appendFileSync(SUCCESS_LOG_PATH, `[${new Date().toISOString()}] SUCCESS: ${message}\n`);
}

function logError(message) {
    const logMessage = `[${new Date().toISOString()}] ERROR: ${message}\n`;
    console.error(`\n${logMessage}`);
    fs.appendFileSync(ERROR_LOG_PATH, logMessage);
}

function logDataEvent(message) {
    fs.appendFileSync(DATA_LOG_PATH, `[${new Date().toISOString()}] DATA: ${message}\n`);
}

async function initializeFiles() {
    await fs.ensureDir(LOG_DIR);
    await fs.ensureDir(DATA_DIR);
    await fs.ensureDir(IMAGE_DIR);

    const timestamp = new Date().toISOString();
    const header = `--- Log session started at ${timestamp} ---\n`;
    fs.writeFileSync(SUCCESS_LOG_PATH, header);
    fs.writeFileSync(ERROR_LOG_PATH, header);
    fs.writeFileSync(DATA_LOG_PATH, header);
    console.log(`   -> Log files created at ${LOG_DIR}`);

    for (const key of ALLOWED_STATS) {
        const filePath = path.join(DATA_DIR, `coaster-${key}.json`);
        await fs.writeFile(filePath, '{}');
    }
    console.log(`   -> Empty data files created in ${DATA_DIR}`);
}

async function downloadImage(url, id) {
    try {
        const fileExtension = path.extname(new URL(url).pathname) || '.jpg';
        const filename = `${id}${fileExtension}`;
        const filePath = path.join(IMAGE_DIR, filename);

        if (fs.existsSync(filePath)) {
            return { filename, skipped: true };
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image (status ${response.status})`);
        const buffer = await response.buffer();
        
        await fs.writeFile(filePath, buffer);
        return { filename, skipped: false }; 
    } catch (error) {
        logError(`Downloading image for ID ${id}: ${error.message}`);
        throw error;
    }
}

/**
 * --- MODIFIED: Now handles array values for stats ---
 */
function extractAndStoreStats(coasterData) {
    const { id, name, park, stats, status, country } = coasterData;

    const addStat = (statName, value) => {
        if (!allStats[statName]) allStats[statName] = {};
        allStats[statName][id] = value;
        logDataEvent(`Coaster ID ${id}: Found '${statName}' with value "${value}"`);
    };

    if (name) addStat('name', name);
    if (park?.name) addStat('park', park.name);

    if (stats) {
        for (const statName of Object.keys(stats)) {
            if (!ALLOWED_STATS.includes(statName)) continue;

            let value = stats[statName]; // Use 'let' to allow reassignment
            if (value == null) continue;

            // --- NEW: If the stat is an array (for dueling coasters), take the first value ---
            if (Array.isArray(value)) {
                value = value[0];
            }
            // --- END NEW ---

            if (statName === 'duration') {
                addStat(statName, value);
            } else {
                const numericValue = parseFloat(value);
                if (!isNaN(numericValue)) {
                    addStat(statName, numericValue);
                }
            }
        }
    }

    if (ALLOWED_STATS.includes('year') && status?.date?.opened) {
        const year = parseInt(status.date.opened.substring(0, 4), 10);
        if (!isNaN(year)) addStat('year', year);
    }
    if (ALLOWED_STATS.includes('closed') && status?.date?.closed) {
        const closedYear = parseInt(status.date.closed.substring(0, 4), 10);
        if (!isNaN(closedYear)) addStat('closed', closedYear);
    }
    if (ALLOWED_STATS.includes('country') && country) {
        addStat('country', country);
    }
}

async function processCoaster(id) {
    if (id > 0 && id % 100 === 0) {
        console.log(`\n[Progress] Processing coaster ID: ${id}...`);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${id}`);
        if (!response.ok) {
            if (response.status !== 404) logError(`API Warning for ID ${id}: ${response.statusText}`);
            process.stdout.write(`-`);
            return;
        }
        const data = await response.json();
        if (data && data.name && data.mainPicture?.url) {
            const downloadResult = await downloadImage(data.mainPicture.url, data.id);
            imageManifest[data.id] = downloadResult.filename;
            
            if (data.mainPicture.copyName) {
                photographerCredits[data.id] = data.mainPicture.copyName;
            }
            
            extractAndStoreStats(data);
            
            logSuccess(`Processed Coaster ID ${id} (${data.name})`);
            process.stdout.write(downloadResult.skipped ? `❌` : `✅`);
        } else {
            process.stdout.write(`.`);
        }
    } catch (error) {
        // Errors are already logged
    }
}

async function saveAllData() {
    console.log('\n\n💾 Saving all collected data to files...');
    logDataEvent("--- Starting final save process ---");
    
    const savePromises = [];

    for (const statName of ALLOWED_STATS) {
        const statData = allStats[statName];
        if (statData && Object.keys(statData).length > 0) {
            const filePath = path.join(DATA_DIR, `coaster-${statName}.json`);
            savePromises.push(fs.writeFile(filePath, JSON.stringify(statData, null, 2)));
        }
    }

    const manifestPath = path.join(DATA_DIR, 'image-manifest.json');
    savePromises.push(fs.writeFile(manifestPath, JSON.stringify(imageManifest, null, 2)));
    
    const creditsPath = path.join(DATA_DIR, 'photographer-credits.json');
    savePromises.push(fs.writeFile(creditsPath, JSON.stringify(photographerCredits, null, 2)));

    try {
        await Promise.all(savePromises);
        console.log(`   -> ✅ All data files saved successfully.`);
    } catch (error) {
        logError(`Failed during final save process: ${error.message}`);
    }
}

async function run() {
    console.log('🚀 Starting Coaster Data Scraper...');
    
    await initializeFiles();
    console.log('   -> All directories and files are initialized.');
    console.log(`   Fetching IDs from ${START_ID} to ${END_ID}.`);

    const allIds = Array.from({ length: END_ID - START_ID + 1 }, (_, i) => START_ID + i);

    console.log('\n📊 Progress: [-: Not Found, .: No Image, ✅: Success, ❌: Image Skipped]');

    for (let i = 0; i < allIds.length; i += CONCURRENT_LIMIT) {
        const batch = allIds.slice(i, i + CONCURRENT_LIMIT);
        await Promise.all(batch.map(id => processCoaster(id)));
    }

    await saveAllData();

    console.log('\n🎉 Scraping complete! Check the /public, /data, and /logs directories.');
}

run();