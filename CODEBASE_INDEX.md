# PSOTS Ecosystem: Project Index

This document provides a clean, categorized map of the entire PSOTS project codebase, including its transition to a modular Cloudflare Worker architecture.

## 1. Core Source Code (ES Modules)
The backend was recently modularized from a 2,000+ line monolith into clean modules located in `src/`:

| File | Purpose | Key Responsibilities |
| :--- | :--- | :--- |
| **`src/index.js`** | **Primary Router** | Handles all API requests, Telegram webhooks, and routing logic. |
| **`src/templates.js`** | **UI Engine** | Contains all HTML/JavaScript templates for the Dashboard, Marketplace, and Member Handbook. |
| **`src/store.js`** | **KV Data Layer** | Managed all interactions with Cloudflare KV storage (keywords, violations, settings, resident ledger). |
| **`src/telegram.js`** | **Bot API Wrapper** | Standardized methods for communicating with the Telegram Bot API (`sendMessage`, `deleteMessage`, etc.). |

## 2. Configuration & Deployment
Foundational files that manage the project environment and edge deployment.

*   **`wrangler.toml`**: Cloudflare Workers configuration file. Defines KV bindings (`VIOLATIONS`, `AUDIT_LOG`) and routing.
*   **`package.json`**: Project manifest. Scripts included: `npm run dev` (Local simulation) and `npm run deploy` (Live push).
*   **`.env.example`**: Template for required environment variables (Google Client IDs, Bot Tokens).
*   **`.gitignore`**: Prevents sensitive credentials and local build files from reaching version control.

## 3. Society Handbooks & Documentation
Human-readable guides for administrators and residents.

*   **`README.md`**: Project overview and installation prerequisites.
*   **`ADMIN_GUIDE.md`**: Tactical manual for managing the moderation bot and resident verification.
*   **`MEMBER_GUIDE.md`**: Community guidelines and "Dos and Don'ts" for PSOTS residents.
*   **`ARCHITECTURE_AND_ROADMAP.md`**: Theoretical design document for the resident-led transition.
*   **`BOT_DOCUMENTATION.md`**: Technical specification of the bot's features (Global strike system, marketplace keywords).

## 4. Legal & Compliance Assets (PDFs)
Official society documentation pulled from the Prestige Song of the South (PSOTS) governing body.

*   **`PSOTS_RulesofResidency_Final.pdf`**: The official residency rulebook.
*   **`PSOTS-DODByelaws.pdf`**: Society bylaws and constitutional framework.
*   **`PSOTS TG Owners Group Etiquettes.pdf`**: Specific digital conduct rules for Telegram.
*   **`OC_PHASE_1.pdf` & `OC_PHASE_2.pdf`**: Phase-wise Occupancy Certificates.
*   **`ListofPenalties.pdf`**: Official society-approved financial penalties for violations.

## 5. Media & Assets (Gallery)
Photographic evidence and society-specific branding materials.

*   **`IMG_20260322_*.jpg`**: Collection of ~20 high-resolution images of PSOTS facilities, parks, and clubhouses used to populate the Handbook and Marketplace UI.
*   **`logo.svg`**: PSOTS vector branding.

---
*Created on: 2026-04-12*  
*Status: Modularization Complete | RBAC Tiles Implemented | Multi-Group Live*
