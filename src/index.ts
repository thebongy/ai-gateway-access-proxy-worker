import { Hono, Context } from "hono";

/**
 * Define the environment variables the worker expects.
 * These must be configured in your wrangler.toml or the Cloudflare dashboard.
 *
 * CF_AI_GATEWAY_TOKEN: The secret bearer token for your Cloudflare AI Gateway.
 * GATEWAY_URL: The full URL of your AI Gateway endpoint.
 */
interface Bindings {
	CF_AI_GATEWAY_TOKEN: string;
	CF_AI_GATEWAY_URL: string;
}

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Handle all POST requests by acting as a secure proxy to the AI Gateway.
 */
app.post("*", async (c: Context<{ Bindings: Bindings }>) => {
	// 1. Extract the Cloudflare Access JWT from the request header.
	// Note: The default header from Access is 'cf-access-token'.
	// Adjust 'cf-access-token' if you are using the default.
	const token = c.req.header("cf-access-token");
	if (!token) {
		return c.json({ error: "Missing authentication token" }, { status: 401 });
	}

	let userEmail: string;
	try {
		// 2. Decode the JWT payload to extract the user's email.
		// This is a basic decoding and does not cryptographically verify the token.
		// For production, full JWT validation against your Access keys is recommended.
		const jwtParts = token.split('.');
		if (jwtParts.length < 2) throw new Error("Invalid JWT structure");

		const payload = JSON.parse(atob(jwtParts[1]));
		userEmail = payload.email;

		if (!userEmail) {
			throw new Error("Email not found in token payload");
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : "Unknown error";
		console.error("Failed to decode token:", errorMessage);
		return c.json({ error: "Invalid or malformed token" }, { status: 401 });
	}

	// 3. Proxy the request to the configured AI Gateway.
	try {
		// Prepare the headers for the AI Gateway request.
		const forwardHeaders = new Headers(c.req.raw.headers);

		// Set the Authorization header to authenticate the worker.
		forwardHeaders.set("Authorization", `Bearer ${c.env.CF_AI_GATEWAY_TOKEN}`);

		// Add the user's email as metadata for logging and analytics in AI Gateway.
		// The key 'user_id' is a common convention.
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
