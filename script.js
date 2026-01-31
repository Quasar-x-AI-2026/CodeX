const fs = require("fs");
const { execSync } = require("child_process");

const TOTAL_COMMITS = 2000;
const DELAY_MS = 300;
const FILE = "commits.txt";

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, "");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  for (let i = 1; i <= TOTAL_COMMITS; i++) {
    fs.appendFileSync(FILE, ".\n");

    execSync(`git add ${FILE}`);
    execSync(`git commit -m "commit ${i}/995"`);

    console.log(`✔ Commit ${i}/995`);
    await sleep(DELAY_MS);
  }

  console.log("🎉 Done! 995 commits created.");
})();
