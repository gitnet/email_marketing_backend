const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROMIUM_DOWNLOAD_URL = "https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1095491/chrome-linux.zip";

const extract = require("extract-zip"); // install this: npm i extract-zip
const https = require("https");
const unzipPath = path.join(__dirname, "chromium");

if (!fs.existsSync(unzipPath)) {
  fs.mkdirSync(unzipPath);
}

const zipPath = path.join(unzipPath, "chrome-linux.zip");

const file = fs.createWriteStream(zipPath);
https.get(CHROMIUM_DOWNLOAD_URL, function (response) {
  response.pipe(file);
  file.on("finish", async () => {
    await extract(zipPath, { dir: unzipPath });
    fs.unlinkSync(zipPath);
    console.log("✅ Chromium downloaded and extracted.");
  });
});
