# Changelog

## __0.6.0__

- ⭐ Add thumbnails to Discord and Bluesky posts for new levels
- 🛠️ Fixed issue where levels with no logging data couldn't be deleted
- 📜 Create OpenAPI schema
- 📜 Create `CHANGELOG.md`

## 0.5.3

- ⭐ Add PostHog analytics
- ⭐ Add OpenTelemetry logging (for use with PostHog logs)

## 0.5.2

- 🛠️ Improve database structure for logging
- ⭐ Add feature logging to Bluesky logging provider

## 0.5.1

- ⭐ Add auto-publishing to Discord messages posted in announcement channels

## __0.5.0__

- 🛠️ Refactored logging system to be modular
- ⭐ Added Bluesky logging provider

## 0.4.2

- 🛠️ Fix zombie decoding

## 0.4.1

- ⭐ Add current version to `/api/health`

## __0.4.0__

- ⭐ Support for new zombie picker
- ⭐ Add profanity filter (via `bad-words`)

## __0.3.0__

- ⭐ Add new Featured sort

## __0.2.0__

- 🛠️ Fix a bug where when an admin changes some level metadata (e.g. sun) the level data doesn't reflect the change
- 🛠️ Fix erroneous login prompt on admin dashboard when authentication is disabled
- 🛠️ Fix incorrect plants map
- 🛠️ Refactor level encoder/decoder
