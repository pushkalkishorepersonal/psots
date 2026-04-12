## Project Overview
PSOTS is a residential society community portal for Prestige Song of the South, Bangalore. It is a pure static HTML/JS/CSS site that provides emergency contacts, community guidelines, resident registration, and an admin dashboard for moderation. The project uses Firebase (Auth and Firestore) for backend services and Cloudflare Pages for hosting.

## File Index

### admin.html
- **Purpose:** Admin panel entry point for moderators.
- **Exports:** N/A
- **Imports:** `/css/tokens.css`, `/css/base.css`, `/css/components.css`, `/css/layout.css`, `/js/pages/admin/index.js`.
- **Notes:** Contains UI for login screen and the main admin app structure with multiple tabs.

### guide.html
- **Purpose:** Comprehensive community guide for society rules and amenities.
- **Exports:** N/A
- **Imports:** Google Fonts.
- **Notes:** Self-contained styles and logic for a searchable guide.

### index.html
- **Purpose:** Main public portal and landing page for the society.
- **Exports:** N/A
- **Imports:** Google Fonts.
- **Notes:** Acts as a SPA for public content using DOM-based page switching.

### profile.html
- **Purpose:** User profile page for registered residents.
- **Exports:** N/A
- **Imports:** `/css/tokens.css`, `/css/base.css`, `/css/components.css`, `/css/layout.css`, `/js/pages/profile/index.js`.

### residents.html
- **Purpose:** Entry point for resident registration and access.
- **Exports:** N/A
- **Imports:** `/css/tokens.css`, `/css/base.css`, `/css/components.css`, `/css/layout.css`, `/js/pages/residents/index.js`.

### css/base.css
- **Purpose:** Global base styles, resets, and typography.
- **Imports:** `./tokens.css`.

### css/components.css
- **Purpose:** UI component library (buttons, cards, forms, badges, alerts).
- **Notes:** Uses design tokens for consistent themed styling.

### css/layout.css
- **Purpose:** Structural styles for navigation, page wrappers, and admin dashboard.

### css/tokens.css
- **Purpose:** Central design tokens (colors, spacing, shadows, typography).
- **Notes:** The single source of truth for all visual variables.

### js/config/constants.js
- **Purpose:** Global config, tower maps, rejection reasons, and timing constants.
- **Exports:** `TOWERS`, `VALID_TOWERS`, `COLLECTIONS`, `ACCOUNT_STATUSES`, `SKIPPED_FLOORS`, `ESCALATION_DAYS`, `MAX_RESIDENTS_PER_FLAT`, `REJECTION_REASONS`, `WORKER_URL`, `SUPER_ADMIN`.

### js/core/auth.js
- **Purpose:** Session management and auth state logic (route guards).
- **Exports:** `session (default)`.
- **Imports:** `./firebase.js`, `./cache.js`, `../config/constants.js`.

### js/core/cache.js
- **Purpose:** 3-tier caching (Memory -> SessionStorage -> Firestore).
- **Exports:** `cache` (default).

### js/core/firebase.js
- **Purpose:** Firebase app initialization and service exports.
- **Exports:** `app`, `auth`, `db`.

### js/core/logger.js
- **Purpose:** Centralized logging, error mapping, and audit logging.
- **Exports:** `logger` (default).

### js/services/admin.service.js
- **Purpose:** Moderator operations (approvals, rejections, admin management).
- **Exports:** `adminService (default)`.
- **Imports:** `../core/firebase.js`, `../core/cache.js`, `../core/logger.js`.

### js/services/flat.service.js
- **Purpose:** Flat number parsing, validation, and records.
- **Exports:** `flatService (default)`.
- **Imports:** `../core/firebase.js`, `../config/constants.js`.

### js/services/rateLimit.service.js
- **Purpose:** Registration attempt rate limiting per user.
- **Exports:** `rateLimitService (default)`.
- **Imports:** `../core/firebase.js`, `../config/constants.js`.

### js/services/resident.service.js
- **Purpose:** Resident data operations (create, update, appeals).
- **Exports:** `residentService (default)`.
- **Imports:** `../core/firebase.js`, `../core/cache.js`, `../core/logger.js`.

### js/components/resident/FlatSelector.js
- **Purpose:** Flat number input with live validation.
- **Exports:** `FlatSelector`.
- **Imports:** `../../services/flat.service.js`.

### js/components/shared/Modal.js
- **Purpose:** Reusable modal dialog component.
- **Exports:** `Modal`.

### js/components/shared/Steps.js
- **Purpose:** Step indicator for registration flow.
- **Exports:** `Steps`.

### js/components/shared/Toast.js
- **Purpose:** Non-blocking notification system.
- **Exports:** `Toast`.

### js/pages/admin/index.js
- **Purpose:** Orchestrator for the Moderator dashboard.
- **Imports:** `../../services/admin.service.js`, `../../core/auth.js`.

### js/pages/residents/index.js
- **Purpose:** Orchestrator for the resident registration flow.
- **Imports:** `../../services/resident.service.js`, `../../core/auth.js`, `../../services/flat.service.js`.

### js/pages/profile/index.js
- **Purpose:** Orchestrator for the user profile page.
- **Imports:** `../../services/resident.service.js`, `../../core/auth.js`.

## Architecture Summary
- **How auth works:** Firebase Auth handles sign-in (Google/Phone/Telegram). Pages use `session.onChange()` for reactive auth state handling and route guarding.
- **How routing/navigation works:** Navigation between apps via root HTML files; SPA logic within `index.html` via DOM toggling.
- **How Firebase is used:** Firestore stores residents, flats, and logs. Auth manages identities. SDKs loaded via ESM.
- **How the module system works:** Strict ES modules. Relative imports are used for internal files; URLs for Firebase SDKs.

## Known Patterns
- **Export style used:** Defaults for singletons (Services/Core); Named for UI components.
- **CSS class naming conventions:** Functional naming (e.g., `.btn`, `.btn-jade`, `.field-input`).
- **How pages are structured:** HTML shell links to a specific page orchestrator JS file.
