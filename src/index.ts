import { Hono, Context } from "hono";
import { Jwt } from "hono/utils/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";

/**
 * Define the environment variables the worker expects.
 * These must be configured in your wrangler.toml or the Cloudflare dashboard.
 *
 * CF_AI_GATEWAY_TOKEN: The secret bearer token for your Cloudflare AI Gateway.
 * GATEWAY_URL: The full URL of your AI Gateway endpoint.
 * CF_ACCESS_TEAM_NAME: Your Cloudflare Access team name for JWKS endpoint.
 */
interface Bindings {
	CF_AI_GATEWAY_TOKEN: string;
	CF_AI_GATEWAY_URL: string;
	CF_ACCESS_TEAM_NAME: string;
}

const app = new Hono<{ Bindings: Bindings }>();

// Cache for JWKS public keys
let cachedKeys: HonoJsonWebKey[] | null = null;
let cacheExpiration = 0;

/**
 * Retry helper for network requests with exponential backoff.
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	delays: number[] = [5000, 10000]
): Promise<T> {
	let lastError: Error;
	const maxAttempts = delays.length + 1;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt < delays.length) {
				const delay = delays[attempt];
				console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError!;
}

/**
 * Fetch and cache JWKS public keys from Cloudflare Access.
 * Keys are cached for 1 hour to minimize external requests.
 */
async function getPublicKeys(teamName: string): Promise<HonoJsonWebKey[]> {
	const now = Date.now();
	if (cachedKeys && now < cacheExpiration) {
		return cachedKeys;
	}

	const certsUri = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;

	const keys = await withRetry(async () => {
		const response = await fetch(certsUri);
		if (!response.ok) {
			throw new Error(`Failed to fetch JWKS: ${response.status}`);
		}

		const data = await response.json() as { keys: HonoJsonWebKey[] };
		return data.keys;
	});

	cachedKeys = keys;
	cacheExpiration = now + 3600 * 1000; // 1 hour
	return cachedKeys;
}

/**
 * Handle all POST requests by acting as a secure proxy to the AI Gateway.
 */
app.post("*", async (c: Context<{ Bindings: Bindings }>) => {
	// 1. Extract the Cloudflare Access JWT from the request header.
	const token = c.req.header("cf-access-token");
	if (!token) {
		return c.json({ error: "Missing authentication token" }, { status: 401 });
	}

	// 2. Verify JWT cryptographically using JWKS from Cloudflare Access.
	let payload: { email?: string };
	try {
		const keys = await getPublicKeys(c.env.CF_ACCESS_TEAM_NAME);
		payload = await Jwt.verifyWithJwks(token, { keys }) as { email?: string };
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : "Unknown error";
		console.error("JWT verification failed:", errorMessage);
		return c.json({ error: "Invalid or malformed token" }, { status: 401 });
	}

	const userEmail = payload.email;
	if (!userEmail) {
		return c.json({ error: "Email not found in token payload" }, { status: 401 });
	}

	// 3. Proxy the request to the configured AI Gateway.
	try {
		// Prepare the headers for the AI Gateway request.
		const forwardHeaders = new Headers(c.req.raw.headers);

		// Set the Authorization header to authenticate the worker.
		forwardHeaders.set("Authorization", `Bearer ${c.env.CF_AI_GATEWAY_TOKEN}`);

		// Add the user's email as metadata for logging and analytics in AI Gateway.
		forwardHeaders.set("cf-aig-metadata", JSON.stringify({ user_id: userEmail }));

		// Create and send the proxied request.
		const proxyResponse = await fetch(c.env.CF_AI_GATEWAY_URL, {
			method: c.req.method,
			headers: forwardHeaders,
			body: c.req.raw.body, // Forward the original request body as a stream.
		});

		// Return the response from the AI Gateway directly to the client.
		// This supports streaming responses.
		return proxyResponse;

	} catch (error) {
		console.error('Failed to proxy request to AI Gateway:', error);
		return c.json({ error: "Failed to connect to the upstream service" }, { status: 502 });
	}
});

export default app;
