# TODO

## High Priority

- [x] **Separate Test UI and Admin UI Controls**: There should be a way to disable the test UI without also disabling the admin UI
    - Add `USE_TEST_UI` environment variable to control access to `/index.html` test interface
    - Keep `USE_PUBLIC_FOLDER` for admin UI but add conditional routing for test interface
    - This would allow production deployments to disable testing while keeping admin functionality

- [x] _(Removed in favor of NGINX)_ ~~**Fix SSL/HTTPS Implementation**: The current SSL implementation is incomplete and non-functional~~
    - The SSL certificate and key are read but not actually used to create an HTTPS server
    - Need to implement proper HTTPS server with Express.js or migrate to native Deno HTTPS
    - Add proper SSL error handling and validation

## Medium Priority

- [x] **Environment Configuration Management**
    - Create a `.env.example` file with all available environment variables
    - Add environment variable validation on startup
    - Document all configuration options in README.md

- [x] **API Security Improvements**
    - Implement API key authentication for programmatic access
    - Add request size limits for file uploads
    - Consider adding CSRF protection for admin endpoints
    - _(Handled by Cloudflare)_ ~~Add rate limiting for API endpoints (especially `/api/levels` POST)~~

- [ ] **Database Improvements**
    - Add database migrations system for schema changes
    - Implement database connection pooling
    - Add database backup/restore functionality
    - Add indexes for better query performance (author, created_at, etc.)

- [ ] **Error Handling & Logging**
    - Implement structured logging (JSON format)
    - Add error tracking/monitoring integration
    - Improve error messages for better debugging
    - Add request/response logging middleware

## Low Priority

- [x] **Code Quality & Maintenance**
    - Split main.ts into separate modules (routes, middleware, database, etc.)
    - Add TypeScript strict mode configuration
    - Implement unit tests for core functionality
    - _(Decided against: API should not be public. README.md has instructions for the API.)_ ~~Add API documentation (OpenAPI/Swagger)~~

- [ ] **Feature Enhancements**
    - Add level search by tags/categories
    - Implement level comments/reviews system
    - Add user profiles and level collections
    - Add level statistics and analytics dashboard

- [ ] **Performance Optimizations**
    - Implement response caching for level listings
    - Add CDN support for static files
    - Optimize database queries with prepared statements
    - Add pagination limits and validation

- [ ] **Deployment & DevOps**
    - Add Docker containerization
    - Create deployment scripts
    - Add health check endpoint (`/api/health`)
    - Implement graceful shutdown handling
