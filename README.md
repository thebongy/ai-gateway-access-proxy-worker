# AI Proxy Worker

A secure Cloudflare Worker that acts as an authenticated proxy between users and AI Gateway services. This worker integrates with Cloudflare Access for authentication and forwards requests to your AI Gateway with proper user identification and logging.

## Overview

This worker provides a secure bridge between client applications and AI services by:

1. **Authentication**: Validates user identity through Cloudflare Access JWT tokens
2. **Authorization**: Ensures only authenticated users can access AI services
3. **Proxying**: Forwards requests to your AI Gateway with proper authentication
4. **Logging**: Includes user metadata for request tracking and analytics

## Architecture Flow

```
User Request → Cloudflare Access → Worker (JWT Validation) → AI Gateway → AI Provider
```

### Detailed Flow

1. **User Access**: A user attempts to access your AI application endpoint (Cloudflare Worker URL)
2. **Authentication Challenge**: Cloudflare Access intercepts the request and challenges the user to authenticate through a configured identity provider (Google, GitHub, one-time passcode, etc.)
3. **JWT Generation**: Upon successful authentication, Access generates a JSON Web Token (JWT) containing the user's identity and forwards the request to the Worker with the JWT as a header
4. **JWT Validation**: The Worker validates the JWT to ensure the request is legitimate
5. **Request Proxying**: The Worker extracts the user's email from the JWT and constructs a new request to your AI Gateway endpoint, including:
   - The user's original query
   - User email in request metadata for logging
   - Authentication to the AI Gateway using a secret bearer token
6. **AI Processing**: The AI Gateway receives the request, logs it, and forwards it to the appropriate downstream AI provider using configured API keys
7. **Response**: The response flows back through the same chain to the user

## Prerequisites

- Cloudflare Workers account
- Cloudflare Access configured with identity providers
- AI Gateway configured in Cloudflare
- Node.js and npm/yarn for development

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd ai-proxy-worker
npm install
```

### 2. Configure Environment Variables

Set the following secrets in your Cloudflare Worker:

```bash
# Your AI Gateway bearer token
wrangler secret put CF_AI_GATEWAY_TOKEN

# Your AI Gateway endpoint URL
wrangler secret put CF_AI_GATEWAY_URL
```

Example values:
- `CF_AI_GATEWAY_TOKEN`: Your secret bearer token for authenticating with the AI Gateway
- `CF_AI_GATEWAY_URL`: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_slug}/workers-ai/`

### 3. Configure Cloudflare Access

1. Set up Cloudflare Access for your domain
2. Configure identity providers (Google, GitHub, etc.)
3. Create access policies for your AI endpoint
4. Ensure the JWT header is configured (default: `cf-access-token`)

**Note**: If using the default Access JWT header, update line 24 in `src/index.ts`:
```typescript
const token = c.req.header("cf-access-token"); // This is the correct header
```

### 4. Deploy

```bash
npm run deploy
```

## Development

### Local Development

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Type Generation

Generate TypeScript types for Cloudflare bindings:

```bash
npm run cf-typegen
```

## Configuration

### Worker Configuration

The worker expects the following environment variables:

- `CF_AI_GATEWAY_TOKEN`: Bearer token for AI Gateway authentication
- `CF_AI_GATEWAY_URL`: Full URL of your AI Gateway endpoint

### Wrangler Configuration

Key settings in `wrangler.jsonc`:

```jsonc
{
  "name": "ai-proxy-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-08-21",
  "observability": {
    "enabled": true
  }
}
```

## Security Features

- **JWT Validation**: Validates Cloudflare Access JWTs (basic validation included, full cryptographic verification recommended for production)
- **Bearer Token Authentication**: Secures communication with AI Gateway
- **User Identification**: Extracts and forwards user email for logging and analytics
- **Error Handling**: Proper error responses for authentication failures

## API Usage

### Request Format

Send POST requests to your Worker endpoint with:

```bash
curl -X POST "https://your-worker.your-domain.workers.dev/" \
  -H "Content-Type: application/json" \
  -H "cf-access-token: <your-jwt-token>" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "model": "@cf/meta/llama-2-7b-chat-int8"
  }'
```

### Response

The worker returns responses directly from the AI Gateway, supporting:
- Standard JSON responses
- Streaming responses
- Error handling

## Monitoring and Logging

- Enable observability in `wrangler.jsonc` for built-in monitoring
- User emails are logged in AI Gateway metadata as `user_id`
- Request/response logging available through Cloudflare Analytics
- Error logging for debugging authentication and proxy issues

## Production Recommendations

1. **Full JWT Validation**: Implement cryptographic JWT verification against your Access keys
2. **Rate Limiting**: Add rate limiting per user
3. **Request Validation**: Validate request payloads before proxying
4. **Error Monitoring**: Set up alerts for authentication failures
5. **Audit Logging**: Enhanced logging for security compliance

## Troubleshooting

### Common Issues

**Authentication Errors**:
- Verify Cloudflare Access is properly configured
- Check JWT header name matches your Access configuration
- Ensure user has proper access policies

**Gateway Connection Errors**:
- Verify `CF_AI_GATEWAY_TOKEN` and `CF_AI_GATEWAY_URL` are set correctly
- Check AI Gateway configuration and permissions
- Validate network connectivity

**Development Issues**:
- Run `wrangler login` if authentication fails
- Use `wrangler dev` for local testing
- Check `wrangler.jsonc` configuration

### Logs

View Worker logs:
```bash
wrangler tail
```

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]