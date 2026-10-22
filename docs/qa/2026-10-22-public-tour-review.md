# Public tour review, 22 October

Public Plan now contains the travel and golf schedule, shirts and accommodation.
Operational information entries remain outside the public schedule, PDF and
results screens. Editable round notes were reduced to useful course/tee details;
organiser scoring and payout guidance remains in admin. The current PDF includes
saved shirt colours and room assignments.

The whole Home score card opens the current tour detail, with Overview, Results,
Teams and Leaderboard. The current tour leaderboard includes the pairs/singles
Stableford standings alongside historical-style matchplay results. Provisional
combined points reach both Home and the tour detail. The standalone competition
page uses the app header, rounded tabs, compact result cards, tee groups and
navigation cards. Public tables no longer require wide score sheets on a phone.
Plan tabs preserve rounded corners when selected. The narrow itinerary layout
places the time above the event card and gives the icon a separate column.

All six actual 2026 markets are held privately until explicitly opened. The
public endpoint exposes only concise minimum/cutoff metadata while selections
and bets in private markets remain hidden, including Sunday individuals. Draw
publication does not open a market. The dedicated publication transaction
requires a complete published draw, preserves market/option identities and
rejects opening past cutoff. Other tours retain existing rules.

Private live configuration retains captain-linked team names, shirt changes,
confirmed flights and the supplied nicknames. No fake production bets or scores
are used. Both supplied images are flight confirmations; a cash-prize image was
not included, so no prize amounts were inferred from them. Dinner details remain
pending. Personal configuration and the dated itinerary are retained privately.

Validation: 148 tests pass, including complete migration rehearsals, hidden
market metadata, explicit opening after publication, stable option identities,
whole-card navigation and compact projected standings. TypeScript/build and
visual live review are part of the deployment checks.
