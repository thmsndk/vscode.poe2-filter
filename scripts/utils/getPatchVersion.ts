import * as net from "net";

export const servers = {
  poe1: { host: "patch.pathofexile.com", port: 12995, protocol: 0x06 },
  poe2: { host: "patch.pathofexile2.com", port: 13060, protocol: 0x07 },
};

export async function getPatchVersion(
  host: string,
  port: number,
  protocol: number = 0x06
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error("Connection timeout"));
    }, 5000); // 5 second timeout

    client.connect(port, host, () => {
      console.log(
        `Connected to ${host}:${port} with protocol 0x${protocol.toString(16)}`
      );
      client.write(Buffer.from([1, protocol]));
    });

    client.on("data", (data) => {
      try {
        console.log("Raw data length:", data.length);
        console.log("Raw data hex:", data.toString("hex"));

        const offset = 35;
        const length = data[34] * 2;
        const versionBuffer = data.slice(offset, offset + length);
        const versionUrl = versionBuffer.toString("utf16le");

        // Match any sequence of alphanumeric characters and dots between slashes
        const matches = versionUrl.match(/\/([a-zA-Z0-9.]+)\//);
        const version = matches ? matches[1] : "unknown";

        console.log("URL:", versionUrl);
        console.log("Extracted version:", version);

        clearTimeout(timeout);
        client.destroy();
        resolve(version);
      } catch (error) {
        console.error("Error parsing version:", error);
        client.destroy();
        reject(error);
      }
    });

    client.on("error", (error) => {
      console.error("Connection error:", error);
      clearTimeout(timeout);
      reject(error);
    });
  });
}
