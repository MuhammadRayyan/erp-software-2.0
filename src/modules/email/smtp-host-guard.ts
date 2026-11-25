import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Business administrators choose their own SMTP host. Without a guard that
 * setting can be pointed at loopback, the VM's private network, or the cloud
 * metadata service, and the connection errors returned by "Send test email"
 * become an internal port scanner. Only public addresses are allowed unless the
 * operator opts in with ERP_SMTP_ALLOW_PRIVATE_HOSTS=true (e.g. a local relay).
 */

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export class SmtpHostNotAllowedError extends Error {}

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

/**
 * Resolves a business SMTP host once and returns the public address to
 * connect to. Connecting by the resolved address (with the original name as
 * TLS servername) prevents a DNS answer from changing between check and use.
 */
export async function resolvePublicSmtpHost(host: string): Promise<{ address: string; servername: string }> {
  const trimmed = host.trim();
  if (process.env.ERP_SMTP_ALLOW_PRIVATE_HOSTS === "true") {
    return { address: trimmed, servername: trimmed };
  }
  let addresses: { address: string }[];
  try {
    addresses = isIP(trimmed) ? [{ address: trimmed }] : await lookup(trimmed, { all: true, verbatim: true });
  } catch {
    throw new SmtpHostNotAllowedError(`SMTP host "${trimmed}" could not be resolved.`);
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SmtpHostNotAllowedError(
      "SMTP host must be a public mail server; private, loopback, and link-local addresses are not allowed.",
    );
  }
  return { address: addresses[0].address, servername: trimmed };
}
