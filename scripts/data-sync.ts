import { execSync } from "child_process";
import path from "path";

const dataDir = path.join(__dirname, "../data");

try {
  execSync("pathofexile-dat", {
    cwd: dataDir,
    stdio: "inherit",
  });
} catch (error) {
  if (error instanceof Error) {
    console.error("Error extracting data:", error.message);
  } else {
    console.error("An unknown error occurred");
  }
  process.exit(1);
}
