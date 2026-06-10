# Roegusta Tour UI Direction

## Purpose

This document is the design source of truth for the Roegusta Tour app public UI and admin icon language. It exists to correct the PR #16 UI regression and prevent future redesigns from drifting into a rival-app clone or an over-designed shell.

The app should feel like a premium, private golf-tour companion: mobile-first, matchplay-driven, competitive, clear, and easy to use during the tour.

## Core principles

1. **Bottom navigation only**
   - The bottom navigation is the primary navigation.
   - Do not add a duplicate top scrolling tab bar.
   - The public mobile nav should be visible, compact and always easy to use.

2. **Utility before decoration**
   - The app is used during a golf trip, often quickly, between holes or in the clubhouse.
   - Cards must be tappable and information must be legible at a glance.
   - Avoid large decorative cards with little functional value.

3. **Roegusta identity, not rival-app copying**
   - Use the rival screenshots as a lesson in structure only, not a visual template.
   - Do not copy their exact tabs, red/blue scoreboard design, photo-heavy teams, or trophy layout.
   - Use Roegusta’s crest, colour palette, team split, matchplay ledger styling, and private-tour tone.

4. **Clear page roles**
   - Overview = tour command centre and quick links.
   - Results = round-by-round matchplay ledger.
   - Teams = current tour squads.
   - Players = simple player directory.
   - Stats = standings, player drilldown and head-to-head.
   - Bet Punto = social stake/pick log.
   - Handbook = tour details, itinerary, kit and rules; reachable via cards/footer, not bottom nav.
   - Admin = control room/admin-only workflows.

5. **No photos by default**
   - Use initials badges and names.
   - Player photos are not required.
   - The app should still feel personal through names, team colours, nicknames, captains and history.

## Palette

Use the existing Roegusta palette. Approximate values:

- Deep green: `#062B22`
- Secondary green: `#0A3E34`
- Cream: `#F6F2EA`
- Gold: `#C9A24A`
- Team red / burgundy: `#7A1E1E`
- Success green: `#2E7046`
- Charcoal / ink: `#1D1B17`
- Muted text: `#6F6A5D`

### Colour usage

- Deep green: main app background, nav, dark cards.
- Cream: primary content cards and readable data surfaces.
- Gold: accents, active states, dividers, key labels, selected nav.
- Team red/burgundy: second-team identity when required.
- Success green: completed/won states where appropriate.
- Do not put low-contrast cream text on cream cards.
- On cream cards, headings should generally be deep green or charcoal.

## Typography

- Headings: elegant serif feel, already broadly in use.
- Body/UI: clean sans-serif, readable on mobile.
- Avoid tiny decorative all-caps for important information.
- Use small uppercase/gold eyebrow labels only for section context, never for critical data.
- Result rows and player names must be legible without zooming.

## Logo rules

- Use existing files in `public/brand` and `public/icons`.
- Do not redesign the logo or monogram in code.
- Do not show the logo as a visible square image block.
- Present the mark in a circular/roundel container:
  - `border-radius: 50%`
  - `overflow: hidden`
  - gold ring/border if useful
  - image fitted cleanly
- Use landscape logo sparingly; it should not create cramped mobile headers.

## Public navigation

Bottom nav items:

1. Overview → `/`
2. Results → `/matches`
3. Teams → `/teams`
4. Players → `/players`
5. Stats → `/stats`
6. Bet Punto → `/betting`

Notes:

- `/info` Handbook remains available but should not be in bottom nav.
- `/score` can remain route-compatible but does not need a bottom nav item.
- Admin link should remain subtle, preferably in Handbook/footer or available directly at `/admin`.

## Icon language

Use consistent line icons or inline SVG components. Avoid mixed emoji-like icons.

Public icons:

- Overview: home / clubhouse
- Results: flag
- Teams: group / pairs
- Players: person
- Stats: bar chart
- Bet Punto: diamond / coin
- Handbook: book / info

Admin icons:

- Admin home / control room: shield or cog
- Tour setup: calendar
- Squads & teams: users/group
- Rounds & tee times: flag / tee
- Matches & pairings: scorecard / crossed clubs
- Result entry: pencil / scorecard
- Bet Punto admin: coin / stake slip
- Handbook/admin content: book
- Settings/security: cog / lock

## Page direction

### 1. Overview / Home

Purpose: command centre.

Must show:

- Compact branded tour header:
  - round logo mark
  - Roegusta Tour 2026
  - location
  - dates
- No persistent metadata chips like “30 players / 4 rounds / 1 courses / 2 teams”.
- Strong overall team score card with clear split between both teams.
- Next round / next tee card.
- Latest result card.
- Open Bet Punto card.
- Remaining points card.
- Teams / Players / Results quick-access cards.

Behaviour:

- Cards must be interactive.
- Tapping cards routes to the relevant page or expands meaningful detail.
- Include clear chevrons or affordance.

Team score card:

- Use actual team colours where available.
- Default team colour split if no data:
  - side 1: deep green/gold
  - side 2: burgundy/cream
- Team names and points are the main information.
- Avoid a generic blended score card where both teams look the same.

### 2. Results

Purpose: round-by-round matchplay ledger.

Must show:

- Compact title section.
- Round filter and format filter.
- Format options:
  - All formats
  - Singles
  - Better ball
  - Foursomes
  - Scramble
  - Custom
- Round cards with:
  - round number/name
  - format
  - course
  - round score if available
  - match rows

Match row:

- Left side players
- Central result text (`3&2`, `1UP`, `AS`, or points available)
- Right side players
- Winner/halved visual indication
- Tee time if useful

Mobile layout:

- Compact and legible.
- Avoid huge empty title cards.
- Avoid tiny washed-out text.
- Prefer a tight 3-column match row where practical.
- Do not make every player a large token if that makes results too tall.

### 3. Teams

Purpose: current tour squads.

Must show:

- One card per team.
- Team name.
- Captain.
- Initials badges and names.
- Team colours clearly applied.
- No photos.

Tone:

- Premium team-room / captain-board feel.
- Not a clone of photo-grid rival app teams.

### 4. Players

Purpose: player directory only.

Must show:

- Search/filter if useful.
- Players grouped by current tour team where available.
- Initials badge.
- Display name.
- Nickname if available.
- Captain marker if applicable.
- Team assignment/current attendance if available.

Must not show:

- Player profile expansion.
- Stats sorting.
- Head-to-head.
- Recent match history.

Those belong on Stats.

### 5. Stats

Purpose: performance area.

Must include:

- Standings/overall stats.
- Sorting by points, win %, matches, A–Z/Z–A.
- Player drilldown inline on mobile.
- Collapsed recent matches by default.
- Head-to-head comparison.

Must preserve:

- No visible Scramble stat tile for player profile.
- No Tour Wins tile until historic winning-team membership is reliable.
- Head-to-head must be easy to find and use.

Suggested tabs inside Stats only:

- Standings
- Player detail
- Head-to-head

### 6. Bet Punto

Purpose: social stake/pick log.

Must show:

- Open markets.
- Closed/settled markets.
- User name entry.
- Stakes as £ amounts only.
- Clear no-wallet/no-payment disclaimer.

Tone:

- Fun but clean.
- “Markets front and centre”.
- Avoid making it look like a real bookmaker/payment product.

### 7. Handbook

Purpose: useful tour guide.

Reach via:

- Overview card.
- Footer/subtle link.
- Direct route `/info`.

Must show:

- Details.
- Courses/rounds.
- Itinerary.
- Kit/colour notes.
- Rules.
- Admin link in footer if needed.

## Admin UI direction

Admin is not part of the immediate corrective public UI patch unless icons/navigation are touched, but future admin UI should use the same design language.

Admin tone:

- Control room.
- Clear, practical, mobile-friendly.
- Same palette but less decorative.
- Strong save/validation states.

Admin sections:

- Overview / Control room
- Tour setup
- Squads & teams
- Rounds & tee times
- Matches & pairings
- Result entry
- Bet Punto admin
- Handbook content
- Settings/security

## Corrective patch priorities after PR #16

1. Remove duplicate top nav.
2. Remove header metadata chips.
3. Fix logo roundel presentation.
4. Restore Players as directory only.
5. Restore Stats as stats/head-to-head area.
6. Add Stats back to bottom nav.
7. Make Overview cards interactive.
8. Improve team colour separation on Overview.
9. Fix Results mobile layout and contrast.
10. Tighten typography and spacing.

## Do not do in the corrective UI patch

- Do not change Supabase schema.
- Do not change backend functions unless absolutely necessary.
- Do not change admin auth/session.
- Do not implement result entry.
- Do not implement historic import.
- Do not implement Tour PIN gate.
- Do not add player photos.
- Do not reintroduce mock/fallback data.
