const https = require('https');
const fs = require('fs');
const path = require('path');

// Create models directory if it doesn't exist
const modelsDir = path.join(__dirname, '..', '..', 'frontend', 'public', 'models');
if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
}

// Model files to download from CDN (more reliable for binary files)
const models = [
    // Use TinyFaceDetector instead of SSD MobileNet (more reliable)
    {
        name: 'tiny_face_detector_model-weights_manifest.json',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/tiny_face_detector_model-weights_manifest.json'
    },
    {
        name: 'tiny_face_detector_model-shard1',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/tiny_face_detector_model-shard1'
    },
    {
        name: 'face_landmark_68_model-weights_manifest.json',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/face_landmark_68_model-weights_manifest.json'
    },
    {
        name: 'face_landmark_68_model-shard1',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/face_landmark_68_model-shard1'
    },
    {
        name: 'face_recognition_model-weights_manifest.json',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/face_recognition_model-weights_manifest.json'
    },
    {
        name: 'face_recognition_model-shard1',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/face_recognition_model-shard1'
    },
    {
        name: 'face_recognition_model-shard2',
        url: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/face_recognition_model-shard2'
    }
];

// Function to download a file
function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(modelsDir, filename);

        // Always re-download to ensure we get fresh files
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Removed existing ${filename}`);
        }

        console.log(`Downloading ${filename}...`);

        const file = fs.createWriteStream(filePath);

        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    console.log(`✓ Downloaded ${filename}`);
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(filePath, () => { }); // Delete the file on error
                    reject(err);
                });
            } else if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirects
                const redirectUrl = response.headers.location;
                console.log(`Redirecting to: ${redirectUrl}`);
                downloadFile(redirectUrl, filename).then(resolve).catch(reject);
            } else {
                reject(new Error(`Failed to download ${filename}: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Download all models
async function downloadAllModels() {
    console.log('Starting face-api model download...');
    console.log(`Models will be saved to: ${modelsDir}`);

    try {
        for (const model of models) {
            await downloadFile(model.url, model.name);
        }

        console.log('\n✅ All models downloaded successfully!');
        console.log('\nModel files:');

        // List downloaded files with sizes
        const files = fs.readdirSync(modelsDir);
        files.forEach(file => {
            const filePath = path.join(modelsDir, file);
            const stats = fs.statSync(filePath);
            const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`  - ${file} (${sizeInMB} MB)`);
        });

    } catch (error) {
        console.error('❌ Error downloading models:', error.message);
        process.exit(1);
    }
}

// Run the download
downloadAllModels();