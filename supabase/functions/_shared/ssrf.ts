// Guards for fetching user-supplied URLs: only public http(s) destinations.

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

export function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export function isIPLiteral(host: string): "v4" | "v6" | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "v4";
  if (host.includes(":")) return "v6";
  return null;
}

/** Checks the URL shape. DNS results must be checked separately. */
export function checkUrlShape(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid link" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "Only http and https links are allowed" };
  if (url.username || url.password) return { ok: false, reason: "Links with passwords are not allowed" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "Unusual ports are not allowed" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !host.includes(":")) {
    return { ok: false, reason: "Private addresses are not allowed" };
  }
  const lit = isIPLiteral(host);
  if (lit === "v4" && isPrivateIPv4(host)) return { ok: false, reason: "Private addresses are not allowed" };
  if (lit === "v6" && isPrivateIPv6(host)) return { ok: false, reason: "Private addresses are not allowed" };
  return { ok: true, url };
}
