import { getPatchVersion, servers } from "./utils/getPatchVersion";

async function main() {
  for (const server of Object.values(servers)) {
    try {
      console.log(`\n\nTrying ${server.host}:${server.port}...`);
      const version = await getPatchVersion(
        server.host,
        server.port,
        server.protocol
      );
      console.log(`Success! Version from ${server.host}: ${version}`);
    } catch (error: any) {
      console.error(
        `Failed for ${server.host}:${server.port}:`,
        error?.message || "Unknown error"
      );
    }
  }
}

main().catch((error: any) =>
  console.error("Main error:", error?.message || "Unknown error")
);
