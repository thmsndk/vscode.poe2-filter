import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { getPatchVersion, servers } from "./utils/getPatchVersion";

const dataDir = path.join(__dirname, "../data");
const configPath = path.join(dataDir, "config.json");

interface Config {
  patch: string;
  tables: Array<{
    name: string;
    columns: string[];
  }>;
  translations: string[];
}

async function updateData() {
  try {
    console.log("Checking for new PoE2 patch version...");

    // Get current version from PoE2 servers
    const currentVersion = await getPatchVersion(
      servers.poe2.host,
      servers.poe2.port,
      servers.poe2.protocol
    );

    console.log(`Latest PoE2 version: ${currentVersion}`);

    // Read current config
    const configContent = fs.readFileSync(configPath, "utf8");
    const config: Config = JSON.parse(configContent);

    console.log(`Current config version: ${config.patch}`);

    // Compare versions (simple string comparison should work for semantic versions)
    if (currentVersion !== config.patch) {
      console.log("New version detected! Updating config.json...");

      // Update the patch version in config
      config.patch = currentVersion;

      // Write updated config back to file
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(`Config updated to version: ${currentVersion}`);
    } else {
      console.log("No new version available.");
      process.exit();
    }

    // Run data synchronization
    console.log("Running data synchronization...");
    execSync("pathofexile-dat", {
      cwd: dataDir,
      stdio: "inherit",
    });

    console.log("Data update completed successfully!");
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error updating data:", error.message);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

// Run the update
updateData();
