# Preloader System Design

## PART 1 — Architecture: Two-Layer Preloader

### Layer 1: Static HTML Preloader (index.html)
- **Where:** Inside `<div id="root">` in `frontend/admin-panel/index.html` (and `frontend/client-app/index.html`)
- **When:** Instant on page load. Visible from byte-zero until React mounts and replaces `#root` innerHTML
- **What it shows:** A centered CSS spinner + "Go Viral Ads" text (hardcoded defaults)
- **Why:** This is the ONLY way to eliminate the blank white screen. No JavaScript required. React's `createRoot().render()` automatically replaces the content inside `#root`.
- **No admin control needed** — this is a fallback that only shows for 200ms-3s while JS loads

### Layer 2: React Branded Preloader (App.jsx)
- **Where:** New component wrapping the Router inside `AuthProvider`, in `App.jsx`
- **When:** After React mounts but BEFORE any route renders. Shows while fetching `/public/branding`
- **What it shows:** Admin-configured logo (from `branding.logoUrl`) + app name + accent-colored spinner
- **Duration:** Until branding fetch completes (or times out after 2s)
- **Then:** Fades out and reveals the actual route (login or dashboard)

### Flow Timeline:
```
Browser loads HTML
  -> Layer 1: Static spinner visible instantly (CSS only)
  -> JS bundle downloads + parses
  -> React mounts, replaces #root content
  -> Layer 2: Branded preloader shows (logo + spinner)
  -> /public/branding API returns (or 2s timeout)
  -> Auth check runs (already happening in parallel via AuthProvider)
  -> Preloader fades out
  -> Route renders (Login or Dashboard)
```

## PART 2 — Admin Control

### Existing infrastructure (no new fields needed):
- **Storage:** `User.branding.logoUrl` field already exists in `src/models/User.js` line 73
- **API:** `GET /public/branding` already exists in `src/server.js` line 338 — returns `logoUrl`, `appName`, `accentColor` (no auth required)
- **Admin UI:** Profile page likely has branding settings (where `appName`/`logoUrl` are set)

### No new backend field required.
The preloader logo IS the branding logo. One logo, used in:
1. Preloader screen
2. Login page header
3. (Future) anywhere branding is needed

If admin has not set a logo, the preloader shows a default gradient icon (same as current LoginForm fallback).

## PART 3 — Detailed Flow

```
1. User opens app
2. index.html renders static preloader (Layer 1) — NO white screen
3. Vite JS bundle loads
4. React mounts App -> AuthProvider -> BrandedPreloader
5. BrandedPreloader calls GET /public/branding (same endpoint LoginForm already uses)
6. AuthProvider simultaneously checks localStorage for token
7. Branding response arrives (or 2s timeout fires)
8. BrandedPreloader stores branding in React context
9. Preloader fades out (300ms CSS transition)
10. If not logged in -> /login renders (LoginForm reads branding from context, no duplicate fetch)
11. If logged in -> /dashboard renders
```

## PART 4 — Safety Guarantees

| Risk | Mitigation |
|---|---|
| White screen on cold load | Layer 1 (static HTML) eliminates this completely |
| Slow network / JS fails to load | Layer 1 stays visible indefinitely (CSS only, no JS dependency) |
| Branding API fails | 2-second timeout, falls back to hardcoded defaults |
| Double loading flicker | Layer 1 -> Layer 2 transition is seamless (both centered spinners, same background color `#f8fafc`) |
| Routing breaks | Preloader is ABOVE the Router, does not interfere with routes |
| Preloader never disappears | Hard timeout of 2s ensures it always resolves |
| LoginForm double-fetches branding | Store branding in context; LoginForm reads from context instead of calling API again |

## PART 5 — Files to Change

### Frontend (admin-panel):
1. `index.html` — Add static HTML preloader inside `<div id="root">`
2. `App.jsx` — Add `BrandingProvider` context + `BrandedPreloader` component wrapping Router
3. `LoginForm.jsx` — Remove its own `/public/branding` fetch, read from BrandingProvider context instead

### Frontend (client-app):
4. `client-app/index.html` — Same static preloader treatment
5. `client-app/App.jsx` — Same BrandingProvider pattern (if applicable)

### Backend:
6. **NO backend changes.** `GET /public/branding` and `User.branding` already exist and work.

### Risks:
- **Low risk:** All changes are additive. Static HTML preloader is replaced by React on mount (standard React behavior). BrandingProvider is a new context wrapper — does not modify existing auth flow.
- **One concern:** The `BrandedPreloader` adds ~200ms-2s before routes render. On fast networks with cached branding, this should be under 300ms. The 2s timeout prevents worst-case delays.
