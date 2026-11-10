// Hostnames a phone on the same Wi-Fi can use to reach this Mac's dev server.
// CommonJS so next.config.js can require it as well as the .mjs scripts.

const { execFileSync } = require("node:child_process");
const { networkInterfaces } = require("node:os");

function isPrivateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
  );
}

/** Private IPv4 addresses plus the macOS Bonjour name (`<LocalHostName>.local`), without ports. */
function localNetworkHostnames() {
  const hosts = new Set();

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && isPrivateIpv4(address.address)) {
        hosts.add(address.address);
      }
    }
  }

  if (process.platform === "darwin") {
    try {
      const localHostName = execFileSync("scutil", ["--get", "LocalHostName"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      if (localHostName) {
        hosts.add(`${localHostName}.local`);
      }
    } catch {
      // The private IP remains available when the Bonjour name cannot be read.
    }
  }

  return Array.from(hosts);
}

module.exports = { localNetworkHostnames };
