# Office Tab UI Refinement Plan

## File in scope
`frontend/client-app/src/pages/Dashboard.jsx` — single file, no new components created.

## Hard constraints (carried through every step)
- Zero changes to: state variables, useEffect hooks, API calls, navigate() calls, conditional rendering guards, data filtering logic, event handlers, modal logic
- All style changes are inline style object modifications only
- Color palette: keep #6366f1, #22c55e, #0f172a — refine surfaces, shadows, gradients only
- Animations: CSS transition on color/shadow/opacity only. No transforms, no keyframe entrance effects, no motion

---

## Implementation Sequence

### STEP 1 — Global container + skeleton loader
**What changes:** page background, container padding, font-family, skeleton shimmer quality
**What stays:** Header import and render, loading conditional, all state declarations
**Risk:** None — purely wrapper-level styling
**Verify:** Page loads, Header renders, skeleton shows correctly

---

### STEP 2 — Page title + toast notification polish
**What changes:**
- Page title `h1`: font size, weight, letter-spacing, color refinement
- Toast: backdrop blur, border, shadow depth, positioning
**What stays:** `config?.pageTitle` data binding, `toast.type` conditional, `showToast` logic
**Risk:** None
**Verify:** Toast appears on any action, dismisses after 3s

---

### STEP 3 — Banner carousel visual upgrade
**What changes:**
- Banner container: border-radius `24px` → `20px` with subtle border, refined shadow
- Overlay circle decorations: improve opacity layering
- Title/subtitle typography: line-height, font-weight
- CTA button: refined surface color, border, focus ring
- Dot indicators: width/height, active dot color depth, transition on `width` only
**What stays:** `banners[currentBanner]` logic, `handleCtaClick`, auto-rotate `useEffect`, dot `onClick` handlers
**Risk:** Low — styling only inside existing conditional block
**Verify:** Dots switch banner, CTA navigates correctly, auto-rotate still works

---

### STEP 4 — Featured Plans grid cards
**What changes:**
- Card wrapper: refined `box-shadow` levels (resting vs. hover via `:hover` in a `<style>` block), border color
- Image container: `background` color refinement for empty state
- Video play overlay: opacity and sizing
- Plan title: font size, truncation
- Price label: color, font-weight
- Grid gap: `14px` → `12px` on mobile, `16px` on tablet+
**What stays:** `featuredPlans.slice()`, `getMediaDisplayUrl()`, `navigate(/plans/${plan.id})`, `isVideo` check, `onError` fallback
**Risk:** Low — no conditional logic touched
**Verify:** Plan cards click through to detail, images load/fallback correctly

---

### STEP 5 — See More Plans button
**What changes:**
- Gradient: slight angle and stop refinement
- Padding: `18px` → `16px 20px`
- Shadow: color-matched `rgba(99,102,241,0.30)` → `rgba(99,102,241,0.25)` 
- Hover: shadow transition only (no scale/transform)
**What stays:** `seeMoreSection.isEnabled`, `config?.seeMoreButtonConfig`, `linkType` check, `navigate()`
**Risk:** None
**Verify:** Button navigates to correct link type (internal/external)

---

### STEP 6 — Section header pattern (applied uniformly)
**What changes:** All 8 section headers (Featured, Pending, Commission, Active, Completed, Updates, Requirements, Promotions) receive consistent treatment:
- Section icon container: `20px` → consistent `22px` inline display
- Section title: `18px / 700` — unchanged
- Badge pills: refined background tints, border-radius `8px` → `6px`, padding `2px 10px` → `2px 8px`
- "View All →" links: color stays #6366f1, font-size stays 14px, add `opacity: 0.85` → `1` on hover transition
**What stays:** All `isEnabled` guards, all badge count values, all navigate() calls
**Risk:** Very low — purely typography/color on labels
**Verify:** All section headers display correctly, badges show correct counts

---

### STEP 7 — Task cards (Pending, Active, Completed — 3 card variants)
**What changes:**
- Card surface: `background: #fff` stays, border color `#f1f5f9` → `#eef2f7`
- `border-left` accent colors: unchanged (amber/green/slate) — just width `4px` stays
- Icon size container: consistent `44px × 44px` rounded container
- Title typography: unchanged
- Progress bar: height `6px` → `5px`, background `#e2e8f0` → `#eef2f7`, corner radius
- Progress fill color: unchanged `#22c55e`
- Status badge (Completed "Done"): padding refinement
- Hover: `box-shadow` transition only (no translateY)
**What stays:** `task.progress` binding, `navigate()`, `task.status` filters, all slice() limits
**Risk:** Low — inline style values only
**Verify:** Task cards click through, progress bars show correct %, pending count badge works

---

### STEP 8 — Commission earnings section
**What changes:**
- Stat cards: surface `#fff` + subtle top-border accent color (green for total, indigo for count)
- Value typography: `22px` stays, refined font-weight
- Recent earnings list: row `padding` refinement, amount badge alignment
- Section visibility stays conditional on `commissionData.overallTaskCount > 0`
**What stays:** All `commissionData` bindings, `.slice(0,5)` limit, `log.amount` display
**Risk:** None
**Verify:** Section only shows when commissions exist, amounts display correctly

---

### STEP 9 — Notice cards (Updates, Requirements, Promotions — 3 variants)
**What changes:**
- Icon container: `50px × 50px` → `44px × 44px`, border-radius `12px` — refined background tints per type
- Title: font-size/weight unchanged
- Badges (Pinned, Action Required, Responded): padding, border-radius refinement, color tints
- Border-left: width stays `4px`, colors unchanged (blue/priority-color/orange)
- Chevron icon: color refinement `#94a3b8` → `#cbd5e1`
- Empty state cards: icon size, text refinement
- Hover: shadow transition only
**What stays:** `handleViewNotice()`, `notice.isPinned`, `notice.hasResponded`, `notice.responseRequired`, priority conditional logic, all `isEnabled` section guards
**Risk:** Low
**Verify:** Notices open modal on click, pinned/responded badges display, empty states show

---

### STEP 10 — Notice detail modal (bottom sheet)
**What changes:**
- Backdrop: `rgba(0,0,0,0.5)` → `rgba(15,23,42,0.55)`
- Sheet: border-radius `24px 24px 0 0` stays, add subtle top border `1px solid #e2e8f0`
- Header: padding refinement, close button surface color
- Content area: line-height, `pre-wrap` text spacing
- Link button: surface refinement
- Response section (YES_NO, RATING, TEXT, FILE): button padding, border-radius consistency
- "Already responded" confirmation: surface tint
- Close button at bottom: surface refinement
**What stays:** ALL response handlers (`handleSubmitResponse`), `selectedNotice` state, `responding` guard, `responseValue` state, all `responseType` conditional branches, `env(safe-area-inset-bottom)` padding
**Risk:** Medium — modal has multiple response form branches. Each branch styled individually without touching conditional logic
**Verify:** All 4 response types work (YES_NO, RATING, TEXT, FILE), submit buttons fire correctly, modal closes

---

### STEP 11 — Mobile responsiveness pass (final sweep)
**What changes:** Add/refine `<style>` block at bottom of return (already exists in file):
- Banner aspect ratio on `< 640px`
- Plan grid: `repeat(2, 1fr)` → stays 2-col on mobile (cards are small enough), padding tightened
- Section padding: `20px` → `16px` on mobile
- Modal max-height: `92vh` on small screens
- Touch targets: all interactive elements verified at `min 44px` height
**What stays:** Existing `@media (max-width: 768px)` rule for `.banner-container` — only extended, not replaced
**Risk:** Very low — additive CSS rules only
**Verify:** Test at 375px, 390px, 414px viewport widths

---

## Build gate after each step
After EVERY step: check browser console for errors before proceeding to next step. If any error appears, revert that step's changes only.

## Rollback strategy
Each step modifies only inline `style={{}}` objects within its section block. If any step causes a regression, the exact style object from the current file can be restored. No logic changes means no data/navigation regressions are possible.

## What is NOT in scope
- OfficeCMS.jsx (admin panel) — not touched
- Header.jsx — not touched
- Any other page — not touched
- Backend routes — not touched
- services/api.js — not touched
