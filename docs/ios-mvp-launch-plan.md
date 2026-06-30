# iOS MVP Launch Plan

## Product Direction

Goal: release a free iOS vocabulary app with local personalization, simple deck sharing, and very low operating cost.

Recommended positioning:

- Free app.
- No required account.
- No server database for MVP.
- User-owned vocabulary decks.
- Optional BYO AI key for deck generation.
- Ads only after the core learning loop feels stable.

## Minimal MVP

Keep only these first-launch features:

1. Study cards
   - Show word.
   - Reveal meaning/example.
   - Mark correct/wrong.
   - Re-ask recently correct words once more.

2. Local personalized storage
   - Save words, examples, tags, notes, correct/wrong counts, next review date.
   - Store on device first.
   - No login required.

3. Deck import/export
   - Export a deck as JSON.
   - Import a deck JSON from another user.
   - Include deck title, description, creator nickname, level, words, created date, app schema version.
   - Do not include API keys or private study history in shared deck files.

4. Speaking-level deck generation
   - Use the app's 9급~1급 learning ladder.
   - Show OPIc/TOEIC Speaking labels as learning references, not official score conversion.
   - Generate a deck for a selected level.

5. Backup
   - Export all personal data.
   - Import personal backup.
   - Keep this separate from public deck sharing.

## Not In MVP

Avoid these until the app has real users:

- Accounts.
- Cloud sync.
- In-app public deck marketplace.
- Likes, comments, follows, rankings.
- Server-side AI proxy.
- Push notifications.
- Too many quiz modes.

## Sharing Model

Use file-based deck sharing first.

Shared deck file:

```json
{
  "type": "vocab-routine-deck",
  "schemaVersion": 1,
  "title": "OPIc IM2 여행 답변 단어",
  "description": "여행/장소 묘사용 표현",
  "level": {
    "grade": "6급",
    "opic": "IM2",
    "toeicSpeaking": "Intermediate Mid"
  },
  "creator": {
    "nickname": "optional"
  },
  "words": [
    {
      "word": "memorable",
      "meaning": "기억에 남는",
      "example": "It was a memorable trip.",
      "tag": "6급 여행",
      "note": "경험 답변에서 쓰기 좋음"
    }
  ],
  "createdAt": "2026-06-30T00:00:00.000Z"
}
```

Why this is best for MVP:

- No hosting cost.
- No moderation workload.
- Users can share through KakaoTalk, AirDrop, iCloud Drive, Google Drive, email, or communities.
- App Review risk is lower than user-generated public feeds.

Later upgrade path:

- Add optional cloud sync.
- Add curated official deck packs.
- Add community deck directory only after moderation/reporting is ready.

## Monetization

Best order:

1. Launch without ads or with a very restrained placeholder.
2. Add small banner ads only after retention is proven.
3. Add optional rewarded ad for extra AI convenience if it does not block core study.
4. Keep local study and user-owned decks free.

Avoid:

- Full-screen ads during quizzes.
- Ads before every answer.
- Ads that make the app feel worse than subscription apps.

Possible ad placements:

- Bottom banner on deck list/settings.
- Not on the active study card screen for MVP.
- Optional rewarded ad before bulk AI deck generation only if needed later.

## iOS Implementation Path

Recommended path from current web app:

1. Stabilize the PWA as MVP logic.
2. Wrap with Capacitor for iOS.
3. Use iOS local storage or SQLite only if browser storage becomes limiting.
4. Use native share sheet for deck export/import.
5. Add AdMob only after launch-readiness checks.

Why Capacitor:

- Reuses current HTML/CSS/JS.
- Faster than rewriting in SwiftUI now.
- Good enough for local-first MVP.

SwiftUI rewrite can come later if the app proves demand.

## App Store Risk Checklist

- Privacy policy required if ads/analytics/API keys are involved.
- Explain that user API keys stay on device.
- Do not export API keys in deck or backup files.
- If community features are added later, moderation/report/block/report abuse flows become necessary.
- If ads are added, App Store privacy nutrition labels and ad network tracking disclosures must be handled.

## Recommendation

Build the first public iOS version as:

> A free local-first speaking vocabulary app where users can create, study, import, and export level-based word decks.

The app should feel intentionally small:

- Study
- Decks
- AI/Level
- Backup/Share

Everything else waits.

## Key Product Decisions

### Personalization

Yes, personalized decks are feasible without a server.

Use local device storage for:

- Saved decks
- Study history
- Correct/wrong counts
- Next review dates
- Speaking target level
- Imported deck metadata

For iOS MVP, local-first is the right default. Add cloud sync later only if users clearly need multi-device sync.

### Sharing

Yes, users can share decks without running a community server.

MVP sharing should be:

- Export deck file
- Import deck file
- Use iOS share sheet
- Share through KakaoTalk, AirDrop, iCloud Drive, Google Drive, email, or communities

Avoid an in-app public deck feed for the first release. A public feed turns shared decks into user-generated content, which means moderation, reporting, blocking, abuse handling, and support work.

### Ads

Ads can help offset costs, but they should not be in the first tiny learning loop.

Recommended ad timing:

1. Launch without ads.
2. Measure whether people actually return.
3. Add a small non-intrusive banner outside the quiz flow.
4. Consider rewarded ads only for optional convenience features.

Do not put ads between question and answer. That would make the app feel like the subscription apps this project is trying to avoid.

### Operating Cost

The lowest-cost MVP has almost no backend cost:

- No account server
- No database server
- No hosted deck marketplace
- No developer-paid AI calls
- User brings their own AI API key if they want AI generation

Main recurring cost:

- Apple Developer Program membership
- Optional domain/privacy-policy hosting
- Optional ad SDK/legal/privacy tooling later

### Minimal App Tabs

For App Store MVP, keep only four areas:

- Study
- Decks
- Level/AI
- Backup/Share

The current prototype has enough experimental AI controls. Before App Store work, reduce the visible interface to these essentials.
