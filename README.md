# PVZM Backend ![v0.3.0](https://img.shields.io/badge/version-v0.2.2-darklime)

> A Deno-powered backend service for [Plants vs. Zombies: MODDED](https://github.com/roblnet13/pvz). This service provides APIs for uploading, downloading, listing, favoriting, and reporting user-created _I, Zombie_ levels.

## Features

- Level management (upload, download, listing)
- Favorites (per-IP toggle)
- Reporting endpoint (optional; Discord webhook)
- User tracking and author management
- Content moderation using OpenAI (optional)
- CAPTCHA protection using Cloudflare Turnstile (optional, only required for level uploading)
- CORS configuration for frontend integration
- Admin dashboard for direct database management

## Admin Dashboard

The backend includes an admin dashboard for managing levels directly in the database:

- **Access**: Navigate to `/admin.html` or click the "Admin Dashboard" link on the main page
- **Features**:
    - View all levels with pagination
    - Search levels by name, author, or ID
    - Edit level properties (name, author, sun, water status, difficulty, statistics)
    - Delete levels (including related files and database entries) > Authentication: The admin UI supports optional GitHub OAuth. If `USE_GITHUB_AUTH=true`, users must sign in with GitHub and be included in `GITHUB_ALLOWED_USERS` to access admin endpoints. If `USE_GITHUB_AUTH=false`, the admin endpoints are not protected (not recommended in production). > The admin dashboard also supports one-time-token links for a single edit/delete action:
    - Edit: `/admin.html?token=...&action=edit&level=123`
    - Delete: `/admin.html?token=...&action=delete&level=123`
      After a successful token-based edit/delete, the page attempts to call `window.close()` (some browsers only allow this for windows opened by script).

## Getting Started

### Prerequisites

- [Deno](https://deno.com/)

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and configure the environment variables
3. Run the server:

```bash
deno task start
```

For development with auto-reload:

```bash
deno task dev
```

### SSL / HTTPS

This backend runs HTTP only. Terminate TLS/HTTPS in a reverse proxy such as Nginx.

## API Documentation

### Base URL

All API endpoints are prefixed with `/api`.

### MessagePack

The server automatically supports MessagePack encoding/decoding via middleware.

- To receive MessagePack responses, set `Accept: application/msgpack`.
- To send MessagePack requests, set `Content-Type: application.msgpack`.

### Authentication

Public API endpoints do not require authentication, but some behavior is based on client IP address (e.g. favorites).
Admin endpoints under `/api/admin/*` are protected when `USE_GITHUB_AUTH=true` (GitHub OAuth session). When GitHub auth is enabled, `PUT` and `DELETE` on `/api/admin/levels/:id` can alternatively be authorized via a one-time token using `?token=...`.

### Endpoints

#### Level Management

##### Create a Level

- **URL:** `/api/levels`
- **Method:** `POST`
- **Content Types:**
    - `application/octet-stream`
- **URL Params:** None
- **Query Params:** (for octet-stream)
    - `author`: Author name
    - `turnstileResponse`: Captcha verification token (if enabled)
- **Notes:** Only IZL3 is supported (v2 is deprecated).
- **Request Body:** Raw binary level data (`.izl3`), sent as the request body.
- **Success Response:**
    - **Code:** 201
    - **Content:**

```json
{
	"id": 123,
	"name": "Level Name",
	"author": "Author Name",
	"created_at": 1714680000,
	"sun": 100,
	"is_water": true,
	"version": 3
}
```

Note: `is_water` is stored as `0/1` in the database and is returned as `0/1` in list/detail endpoints.

- **Error Responses:**
    - **Code:** 400
    - **Content:** `{ "error": "Missing required fields" }`
    - **Code:** 400
    - **Content:** `{ "error": "Content contains inappropriate language or content" }`
    - **Code:** 400
    - **Content:** `{ "error": "Captcha verification required" }`
    - **Code:** 400
    - **Content:** `{ "error": "Invalid captcha" }`
    - **Code:** 500
    - **Content:** `{ "error": "Failed to upload level" }`

##### List Levels

- **URL:** `/api/levels`
- **Method:** `GET`
- **URL Params:** None
- **Query Params:**
    - `page`: Page number (default: 1)
    - `limit`: Results per page (default: 10)
    - `author`: Filter by author name (partial match)
    - `is_water`: Filter by water levels ("true"/"false")
    - `version`: Filter by level version (currently always `3`; reserved for future versions)
    - `sort`: Sorting mode. Default is by play count (`plays`). Use `recent` to sort by creation time (`created_at`) and `favorites` to sort by favorite count.
    - `reversed_order`: Reverse the sort order (`true` or `1`). By default, sorting is descending.
    - `token`: One-time token. If provided and valid, the response is filtered to the single level associated with that token (and pagination becomes `page=1`, `limit=1`). If the token is invalid, the endpoint returns `401`.
- **Success Response:**
    - **Code:** 200
    - **Content:**

```json
{
	"levels": [
		{
			"id": 123,
			"name": "Level Name",
			"author": "Author Name",
			"created_at": 1714680000,
			"sun": 100,
			"is_water": 1,
			"favorites": 5,
			"plays": 10,
			"difficulty": 7,
			"thumbnail": [[0, 10, 10, 40, 40, 1]],
			"version": 3
		}
	],
	"pagination": {
		"total": 50,
		"page": 1,
		"limit": 10,
		"pages": 5
	}
}
```

- **Error Response:**
    - **Code:** 401
    - **Content:** `{ "error": "Invalid token" }`
    - **Code:** 500
    - **Content:** `{ "error": "Failed to list levels" }`

##### Get Level Details

- **URL:** `/api/levels/:id`
- **Method:** `GET`
- **URL Params:**
    - `id`: Level ID
- **Success Response:**
    - **Code:** 200
    - **Content:**

```json
{
	"id": 123,
	"name": "Level Name",
	"author": "Author Name",
	"created_at": 1714680000,
	"sun": 100,
	"is_water": 1,
	"favorites": 5,
	"plays": 10,
	"difficulty": 7,
	"thumbnail": null,
	"version": 3
}
```

- **Error Responses:**
    - **Code:** 400
    - **Content:** `{ "error": "Invalid level ID" }`
    - **Code:** 404
    - **Content:** `{ "error": "Level not found" }`
    - **Code:** 500
    - **Content:** `{ "error": "Failed to get level" }`

##### Download Level

- **URL:** `/api/levels/:id/download`
- **Method:** `GET`
- **URL Params:**
    - `id`: Level ID
- **Success Response:**
    - **Code:** 200
    - **Content:** Binary file download with `.izl3` extension
- **Error Responses:**
    - **Code:** 400
    - **Content:** `{ "error": "Invalid level ID" }`
    - **Code:** 404
    - **Content:** `{ "error": "Level not found" }` or `{ "error": "Level file not found" }`
    - **Code:** 500
    - **Content:** `{ "error": "Failed to download level" }`

#### Favorites

##### Favorite a Level

- **URL:** `/api/levels/:id/favorite`
- **Method:** `POST`
- **URL Params:**
    - `id`: Level ID
- **Request Body:** None (this endpoint always toggles favorite on/off)
- **Success Response:**
    - **Code:** 200
    - **Content:** `{ "success": true, "level": { "id": 123, "favorites": 5, ... } }`
- **Error Responses:**
    - **Code:** 400
    - **Content:** `{ "error": "Invalid level ID" }`
    - **Code:** 404
    - **Content:** `{ "error": "Level not found" }`
    - **Code:** 500
    - **Content:** `{ "error": "Failed to favorite level" }`
      Note: Captcha verification is not required for favoriting.

#### Reporting

##### Report a Level

- **URL:** `/api/levels/:id/report`
- **Method:** `POST`
- **URL Params:**
    - `id`: Level ID
- **Request Body:**

    ```json
    {
    	"reason": "Brief description of the issue"
    }
    ```

- **Behavior:**
    - If `USE_REPORTING=false`, this endpoint returns 404.
    - If `DISCORD_REPORT_WEBHOOK_URL` is configured, the server sends the report to the Discord webhook (and attaches the level file if available).
    - If no webhook is configured, the server still accepts the report and returns success.
- **Success Response:**
    - **Code:** 200
    - **Content:** `{ "success": true }`
- **Error Responses:**
    - **Code:** 400
    - **Content:** `{ "error": "Invalid input" }`
    - **Code:** 404
    - **Content:** `{ "error": "Level not found" }`
    - **Code:** 500
    - **Content:** `{ "error": "Failed to report level" }`

#### Configuration

##### Get Frontend Configuration

- **URL:** `/api/config`
- **Method:** `GET`
- **Success Response:**
    - **Code:** 200
    - **Content:**

```json
{
	"turnstileEnabled": true,
	"turnstileSiteKey": "0x0000000000000000000000",
	"moderationEnabled": true
}
```

## Environment Variables

The server can be configured using the following environment variables in a `.env` file:

| Variable                   | Description                                                          | Default                                     |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| PORT                       | Server port                                                          | 3000                                        |
| DB_PATH                    | Path to SQLite database                                              | ./database.db                               |
| DATA_FOLDER_PATH           | Path to level data storage                                           | ./data                                      |
| CREATE_DATA_FOLDER         | Create data folder if it doesn't exist                               | true                                        |
| USE_PUBLIC_FOLDER          | Serve static files (e.g. `/index.html`, `/admin.html`)               | true                                        |
| PUBLIC_FOLDER_PATH         | Path to static files folder                                          | ./public                                    |
| CREATE_PUBLIC_FOLDER       | Create the public folder if it doesn't exist                         | true                                        |
| USE_TEST_UI                | Enable test UI route (`/index.html`)                                 | true                                        |
| USE_ADMIN_UI               | Enable admin UI route (`/admin.html`)                                | true                                        |
| GAME_URL                   | Game URL used in generated links (reports/uploads)                   | <https://pvzm.net>                          |
| BACKEND_URL                | Backend URL used in generated links (reports/uploads)                | <https://backend.pvzm.net>                  |
| CORS_ENABLED               | Enable CORS                                                          | true                                        |
| ALLOWED_ORIGINS            | Comma-separated list of allowed origins (no spaces)                  | `https://pvzm.net,https://backend.pvzm.net` |
| USE_GITHUB_AUTH            | Enable GitHub OAuth protection for admin routes                      | true                                        |
| GITHUB_CLIENT_ID           | GitHub OAuth client ID                                               |                                             |
| GITHUB_CLIENT_SECRET       | GitHub OAuth client secret                                           |                                             |
| GITHUB_ALLOWED_USERS       | Comma-separated GitHub usernames allowed to access admin (no spaces) |                                             |
| SESSION_SECRET             | Session secret (cookie/session encryption)                           | default-secret                              |
| USE_TURNSTILE              | Enable Cloudflare Turnstile captcha (upload endpoint)                | true                                        |
| TURNSTILE_SECRET           | Turnstile secret key                                                 |                                             |
| TURNSTILE_SITE_KEY         | Turnstile site key                                                   |                                             |
| TURNSTILE_TESTING          | Accept dummy Turnstile tokens (DO NOT USE IN PRODUCTION)             | false                                       |
| USE_OPENAI_MODERATION      | Enable OpenAI content moderation                                     | true                                        |
| OPENAI_API_KEY             | OpenAI API key                                                       |                                             |
| USE_REPORTING              | Enable reporting endpoint                                            | true                                        |
| USE_UPLOAD_LOGGING         | Send upload events to Discord webhook                                | true                                        |
| DISCORD_REPORT_WEBHOOK_URL | Discord webhook URL for reports                                      |                                             |
| DISCORD_UPLOAD_WEBHOOK_URL | Discord webhook URL for uploads                                      |                                             |
| DISCORD_MENTION_USER_IDS   | Comma-separated user IDs to mention in reports                       |                                             |

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
