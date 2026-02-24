/**
 * Validates URLs before server-side fetching to prevent SSRF attacks.
 * Blocks private IP ranges, metadata services, and non-HTTP protocols.
 */

const BLOCKED_HOSTNAMES = [
  "localhost",
  "0.0.0.0",
  "169.254.169.254", // AWS/GCP metadata
  "metadata.google.internal",
  "[::1]",
];

const PRIVATE_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // class B private
  /^192\.168\./, // class C private
  /^169\.254\./, // link-local
  /^0\./, // current network
];

export function isValidFetchUrl(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  // Only allow http and https
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return false;
  }

  // Block private IP ranges
  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return false;
  }

  // Block URLs with credentials
  if (url.username || url.password) {
    return false;
  }

  return true;
}

export function assertValidFetchUrl(urlString: string): void {
  if (!isValidFetchUrl(urlString)) {
    throw new Error(
      "Invalid URL: must be a public HTTP/HTTPS URL (private IPs and metadata services are blocked)"
    );
  }
}
