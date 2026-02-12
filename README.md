# PVZM Backend ![v0.6.4](https://img.shields.io/badge/version-v0.6.4-darklime)

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

Full API documentation is available at [docs.pvzm.net/api](https://docs.pvzm.net/api).

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
| GAME_URL_SECRET            | Secret appended to game URL requests to bypass WAF/bot protection    |                                             |
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
