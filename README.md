# PVZM Backend

A Deno-powered backend service for [Plants vs. Zombies: MODDED](https://github.com/roblnet13.pvz). This service provides APIs for uploading, downloading, listing, and rating user-created _I, Zombie_ levels.

## Features

- Level management (upload, download, listing)
- User tracking and author management
- Rating system for levels
- Content moderation using OpenAI (optional)
- CAPTCHA protection using Cloudflare Turnstile (optional)
- SSL support for secure connections
- CORS configuration for frontend integration

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

### SSL Configuration

For HTTPS support:

1. Set `USE_SSL=true` in your `.env` file
2. Generate SSL certificates:

```bash
chmod +x generate-ssl-certs.sh
./generate-ssl-certs.sh
```

This will generate self-signed certificates for development or for a server behind Cloudflare. For production, use properly signed certificates.

## API Documentation

### Base URL

All API endpoints are prefixed with `/api`.

### Authentication

Currently, the API doesn't require authentication, but it tracks users by IP address.

### Endpoints

#### Level Management

##### Create a Level

- **URL:** `/api/levels`
- **Method:** `POST`
- **Content Types:**
  - `application/json`
  - `application/octet-stream`
- **URL Params:** None
- **Query Params:** (for octet-stream)
  - `name`: Level name
  - `author`: Author name
  - `is_water`: Boolean flag for water levels ("true"/"false")
  - `sun`: Integer sun value
  - `version`: Level version (default: 1)
  - `turnstileResponse`: Captcha verification token (if enabled)
- **Request Body:** (for JSON)

  ```json
  {
  	"name": "Level Name",
  	"author": "Author Name",
  	"is_water": true,
  	"sun": 100,
  	"version": 1,
  	"level_data": "base64-encoded level data",
  	"turnstileResponse": "captcha-token"
  }
  ```

- **Success Response:**
  - **Code:** 201
  - **Content:**

  ```json
  {
  	"id": 123,
  	"name": "Level Name",
  	"author": "Author Name",
  	"created_at": 1714680000,
  	"is_water": 1,
  	"sun": 100,
  	"version": 1
  }
  ```

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
  - `version`: Filter by level version
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
  			"likes": 5,
  			"dislikes": 0,
  			"plays": 10,
  			"version": 1
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
  	"likes": 5,
  	"dislikes": 0,
  	"plays": 10,
  	"version": 1
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
  - **Content:** Binary file download with appropriate extension (.izl or .izl2)
- **Error Responses:**
  - **Code:** 400
  - **Content:** `{ "error": "Invalid level ID" }`
  - **Code:** 404
  - **Content:** `{ "error": "Level not found" }` or `{ "error": "Level file not found" }`
  - **Code:** 500
  - **Content:** `{ "error": "Failed to download level" }`

#### Level Rating

##### Rate a Level

- **URL:** `/api/levels/:id/rate`
- **Method:** `POST`
- **URL Params:**
  - `id`: Level ID
- **Request Body:**

  ```json
  {
    "rating": "like" or "dislike"
  }
  ```

- **Success Response:**
  - **Code:** 200
  - **Content:** `{ "success": true }` or `{ "success": true, "message": "Rating updated" }` or `{ "success": true, "message": "You've already rated this level" }`
- **Error Responses:**
  - **Code:** 400
  - **Content:** `{ "error": "Invalid level ID" }`
  - **Code:** 400
  - **Content:** `{ "error": "Rating must be 'like' or 'dislike'" }`
  - **Code:** 404
  - **Content:** `{ "error": "Level not found" }`
  - **Code:** 500
  - **Content:** `{ "error": "Failed to rate level" }`

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

| Variable              | Description                             | Default        |
| --------------------- | --------------------------------------- | -------------- |
| PORT                  | Server port                             | 3000           |
| DB_PATH               | Path to SQLite database                 | ./database.db  |
| DATA_FOLDER_PATH      | Path to level data storage              | ./data         |
| CREATE_DATA_FOLDER    | Create data folder if it doesn't exist  | true           |
| USE_SSL               | Enable SSL/HTTPS                        | false          |
| SSL_KEY_PATH          | Path to SSL key                         | ./ssl/key.pem  |
| SSL_CERT_PATH         | Path to SSL certificate                 | ./ssl/cert.pem |
| CORS_ENABLED          | Enable CORS                             | false          |
| ALLOWED_ORIGINS       | Comma-separated list of allowed origins |                |
| USE_TURNSTILE         | Enable Cloudflare Turnstile captcha     | false          |
| TURNSTILE_SECRET      | Turnstile secret key                    |                |
| TURNSTILE_SITE_KEY    | Turnstile site key                      |                |
| USE_OPENAI_MODERATION | Enable OpenAI content moderation        | false          |
| OPENAI_API_KEY        | OpenAI API key                          |                |

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
