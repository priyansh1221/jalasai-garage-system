# AI Instagram Agent: One-Shot Build Plan

## Goal

Build a low-cost, mostly autonomous system that creates and posts content for a synthetic Instagram persona.

The system should:

- Keep the same AI person visually consistent across posts.
- Generate 2 photo posts per day.
- Generate 1 short Reel-style video per day, starting with cheap animated image videos.
- Write organic, curiosity-driven captions and hashtags.
- Publish through the official Instagram Graph API.
- Track post performance and improve the strategy weekly.
- Run from one dashboard with minimum human interaction.
- Use local hardware where useful: M4 MacBook Air as control center, RTX 3060 Windows laptop as generation worker.

The first version should prefer reliability and low cost over perfect full-video generation.

## Core Strategy

The account should feel like a real niche creator, not a random AI image feed. Growth depends on a consistent persona, repeatable formats, natural posting rhythm, and analytics-driven iteration.

Recommended positioning:

```txt
Virtual girl. Real taste.
AI-made daily fits, reels, and tiny chaos.
```

Content should be clickable without being deceptive. Use curiosity, contrast, and simple comment hooks, but avoid fake claims, impersonation, celebrity bait, medical/financial claims, or misleading "real person exposed" framing.

Good caption hooks:

```txt
She said casual coffee and arrived like this.
Not real. Still overdressed.
This outfit made the comments weirdly divided.
Black fit or white fit?
Nobody agreed on the shoes.
```

Bad caption hooks:

```txt
Real girl exposed.
Celebrity girlfriend leaked.
You will not believe what happened next.
This real model is hiding something.
```

## Recommended MVP

Start with a semi-autonomous system:

- Generate posts automatically.
- Auto-post only when quality scores are high.
- Ask for approval only when content is uncertain.
- Log performance and learn weekly.

Then gradually move toward full automation after the visual identity stabilizes.

## Hardware Roles

### M4 MacBook Air, 24 GB

Use the Mac as the control center:

- Dashboard
- Backend API
- Database
- Scheduler
- Instagram publishing
- Analytics collection
- Caption and hashtag generation
- Quality checks
- Cheap Reel assembly with ffmpeg
- Monitoring and alerts

### RTX 3060 Windows Laptop

Use the Windows laptop as the local generation worker:

- ComfyUI
- SDXL or Flux image generation
- IP-Adapter / PuLID / InstantID style face consistency
- ControlNet pose guidance
- LoRA training for the AI person
- Batch image generation
- Optional local image-to-video experiments

If the RTX 3060 has limited VRAM, prefer SDXL workflows first. Use Flux only if the machine can run it comfortably.

## Cost-Minimum Stack

Use this stack for the first production version:

```txt
Dashboard: Next.js
Backend: Next.js API routes or FastAPI
Database: SQLite first, Supabase later
Storage: Local storage first, Cloudflare R2 or Supabase Storage for posting
Scheduler: Local cron or GitHub Actions
Image generation: Local ComfyUI worker on RTX 3060
Caption generation: Gemini/OpenAI/Claude API, with local fallback optional
Video generation: ffmpeg animated Reels first
Posting: Instagram Graph API
Analytics: Instagram Graph API
```

Use API video generation later only after image posts and cheap Reels show traction.

## System Architecture

```txt
Dashboard
  |
  | create plan / approve / monitor
  v
Backend API
  |
  | reads persona, strategy, queue, analytics
  v
Database
  |
  | generation jobs
  v
Generation Worker
  |
  | images from ComfyUI, videos from ffmpeg
  v
Quality Gate
  |
  | approve automatically or request review
  v
Publisher
  |
  | Instagram Graph API
  v
Analytics Collector
  |
  | weekly learning loop
  v
Strategy Updater
```

## Main Screens

### 1. Dashboard Home

Show:

- Today's generated posts
- Scheduled post times
- Approval status
- Publishing status
- Quality scores
- Recent errors
- Follower growth summary

### 2. Persona

Controls:

- Upload reference face images
- Define name, age range, niche, city vibe, fashion taste, personality
- Define caption voice
- Define forbidden content
- Define visual consistency rules
- Define recurring story arcs

Example persona fields:

```yaml
name: "Mira"
type: "virtual influencer"
age_range: "early 20s"
location_vibe: "Mumbai / Delhi urban lifestyle"
style: "streetwear, cafe fits, clean glam, occasional luxury"
personality: "confident, playful, slightly dramatic, warm"
caption_voice: "short, witty, curiosity-driven, not spammy"
disclosure: "virtual creator"
forbidden:
  - fake real-person claims
  - celebrity impersonation
  - sexualized minor-coded content
  - hate or harassment
  - medical or financial claims
```

### 3. Generate

Actions:

- Generate today's content pack
- Regenerate one image
- Regenerate caption
- Change outfit
- Change pose
- Change background
- Create extra backup candidates

### 4. Queue

Show:

- Draft posts
- Approved posts
- Scheduled posts
- Posted posts
- Failed posts
- Rejected posts

Each item should include:

- Preview
- Caption
- Hashtags
- Scheduled time
- Face consistency score
- Artifact score
- Organic score
- Approval controls

### 5. Calendar

Show:

- Daily content plan
- Weekly themes
- Seasonal moments
- Repeated format balance

### 6. Analytics

Track:

- Reach
- Likes
- Comments
- Saves
- Shares
- Follows gained
- Engagement rate
- Best posting times
- Best hook styles
- Best locations
- Best outfits
- Best content formats

### 7. Strategy Brain

Show weekly recommendations:

- What to repeat
- What to stop
- Best Reel style
- Best photo style
- Best caption pattern
- Best posting windows
- Next week's theme plan

### 8. Settings

Configure:

- Instagram account ID
- Meta access token
- Storage provider
- AI API keys
- ComfyUI worker URL
- Posting windows
- Automation mode
- Safety thresholds

## Automation Modes

### Manual Approval

Generate everything, but never post without approval.

Use this for the first few days.

### Smart Approval

Auto-post if all checks pass. Ask for approval only if something is uncertain.

Recommended default.

### Full Auto

Generate, check, schedule, post, and analyze without asking.

Use only after the account style and quality gates are reliable.

## Daily Workflow

```txt
1. Load persona and account strategy.
2. Generate 8 to 12 candidate post ideas.
3. Score ideas for novelty, niche fit, and engagement potential.
4. Pick 2 photo ideas and 1 Reel idea.
5. Generate 10 to 20 image candidates on the RTX worker.
6. Run quality checks.
7. Select best 2 images.
8. Create 1 cheap animated Reel from the best image or a generated Reel image.
9. Generate captions and hashtags.
10. Randomize posting times inside natural windows.
11. Add posts to queue.
12. Auto-approve only if scores pass.
13. Publish through Instagram Graph API.
14. Collect analytics after 1h, 6h, 24h, and 72h.
15. Log results for weekly strategy updates.
```

Recommended posting windows:

```txt
Morning photo: 9:05 AM to 10:20 AM
Evening photo: 6:15 PM to 7:50 PM
Night Reel: 9:10 PM to 10:45 PM
```

Use the user's local timezone unless the target audience is different.

## Weekly Workflow

```txt
1. Pull analytics for all posts from the last 7 days.
2. Rank posts by follows gained, reach, saves, shares, and comments.
3. Identify winning patterns.
4. Identify weak patterns.
5. Update strategy weights.
6. Generate next week's content themes.
7. Recommend changes to posting windows, captions, outfits, and Reel formats.
```

## Organic Growth Rules

The agent should:

- Use varied poses, outfits, backgrounds, and lighting.
- Avoid posting at the exact same minute every day.
- Avoid repeating the same caption structure too often.
- Use 3 to 8 relevant hashtags, not 30 generic tags.
- Prefer questions that are easy to answer.
- Use short captions.
- Mix polished posts with casual posts.
- Create story continuity.
- Keep an AI/virtual-persona disclosure in bio or recurring tags.

The agent should not:

- Auto-DM strangers.
- Use follow/unfollow automation.
- Auto-comment on random accounts.
- Pretend the AI person is a real human.
- Impersonate celebrities or real people.
- Use misleading scandal bait.
- Post obviously broken generated images.

## Content Formats

Use rotating formats:

```txt
Mirror selfie outfit check
Cafe candid
Streetwear walking shot
Elevator fit photo
Flash photo at night
Soft morning room photo
Festival or seasonal look
Outfit A vs outfit B carousel
Phone camera close-up
Gym or athleisure look
Airport look
Date outfit
Workday outfit
Rainy day outfit
```

Reel formats:

```txt
Outfit transition
Slow zoom with caption overlay
Before/after outfit change
Black vs white outfit choice
POV caption loop
Day in the life micro-story
Follower chose the outfit
Rate the fit
AI girl in real city vibe
```

## Quality Gate

Each generated asset should receive scores:

```txt
face_consistency_score: 0 to 100
image_quality_score: 0 to 100
hands_artifact_score: 0 to 100
caption_safety_score: 0 to 100
organic_score: 0 to 100
duplicate_risk_score: 0 to 100
posting_readiness_score: 0 to 100
```

Suggested thresholds:

```txt
Auto-approve if:
- face_consistency_score >= 82
- image_quality_score >= 78
- hands_artifact_score >= 70
- caption_safety_score >= 95
- organic_score >= 75
- duplicate_risk_score <= 35
- posting_readiness_score >= 82

Require manual approval if:
- any score is close to threshold
- face looks inconsistent
- hands are visible and artifact score is low
- caption makes a factual or real-person claim
- visual repeats recent content too closely

Reject automatically if:
- caption safety score < 90
- face consistency score < 70
- image quality score < 65
- duplicate risk score > 70
```

## Database Tables

Use SQLite for the MVP.

Tables:

```txt
personas
reference_images
content_ideas
generation_jobs
assets
posts
post_metrics
strategy_weights
system_events
settings
```

Important post statuses:

```txt
draft
generated
needs_review
approved
scheduled
publishing
posted
failed
rejected
```

## Local Worker Contract

The Mac dashboard/backend should call the RTX laptop worker over HTTP.

Example endpoints:

```txt
GET  /health
POST /generate/image
POST /generate/batch
POST /train/lora
GET  /jobs/:id
GET  /jobs/:id/assets
```

Example image generation request:

```json
{
  "persona_id": "mira",
  "prompt": "virtual fashion creator, mirror selfie, black streetwear, cafe restroom lighting",
  "negative_prompt": "deformed hands, bad anatomy, extra fingers, wrong face, celebrity, watermark",
  "reference_image_ids": ["ref_001", "ref_002"],
  "pose": "mirror selfie",
  "aspect_ratio": "4:5",
  "num_candidates": 12,
  "seed_strategy": "random"
}
```

## Instagram Publishing

Use official Instagram Graph API only.

Requirements:

- Instagram professional account
- Connected Facebook Page
- Meta developer app
- Long-lived access token
- Required publishing permissions
- Publicly accessible media URLs

Publishing flow:

```txt
1. Upload media to public storage.
2. Create Instagram media container.
3. Poll until container is ready.
4. Publish media container.
5. Save Instagram media ID.
6. Pull metrics later.
```

Do not use browser bots for posting.

## Repository Structure

Recommended implementation structure:

```txt
ai-instagram-agent/
  README.md
  .env.example
  persona.example.yaml
  package.json
  next.config.js
  src/
    app/
      page.tsx
      persona/
      generate/
      queue/
      calendar/
      analytics/
      settings/
    components/
    lib/
      db/
      instagram/
      generation/
      quality/
      captions/
      scheduler/
      storage/
      analytics/
      strategy/
    server/
      jobs/
      workers/
  scripts/
    daily-run.ts
    collect-metrics.ts
    weekly-review.ts
    create-reel.ts
  data/
    app.db
    outputs/
      images/
      videos/
      previews/
  comfy-worker/
    README.md
    server.py
    workflows/
      sdxl-face-consistent.json
```

## Environment Variables

```txt
DATABASE_URL=
APP_BASE_URL=
PUBLIC_MEDIA_BASE_URL=
STORAGE_PROVIDER=local
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
COMFYUI_WORKER_URL=
INSTAGRAM_ACCOUNT_ID=
META_ACCESS_TOKEN=
META_APP_ID=
META_APP_SECRET=
TIMEZONE=Asia/Kolkata
AUTO_POST_MODE=smart
```

## Build Phases

### Phase 1: Dashboard and Local Content Packs

Build:

- Dashboard shell
- Persona editor
- Content idea generator
- Caption generator
- SQLite database
- Queue screen
- Local output folders
- Manual approval

Success condition:

- Can generate a daily content plan and save it as draft posts.

### Phase 2: Local Image Worker

Build:

- ComfyUI worker integration
- Batch generation jobs
- Asset import back into dashboard
- Basic image quality scoring
- Manual image selection

Success condition:

- Dashboard can request image candidates from the RTX laptop and store selected images.

### Phase 3: Cheap Reels

Build:

- ffmpeg image-to-video script
- Text overlay templates
- Slow zoom/pan
- 5 to 8 second loop
- Reel preview in dashboard

Success condition:

- One Reel-style video can be generated from an approved image.

### Phase 4: Instagram Publishing

Build:

- Storage upload
- Instagram media container creation
- Publish endpoint
- Post status tracking
- Error logging

Success condition:

- One approved image post can be published through the official API.

### Phase 5: Scheduling and Smart Approval

Build:

- Daily job
- Randomized posting windows
- Auto-approval thresholds
- Notifications or dashboard warnings

Success condition:

- System can generate, approve, schedule, and publish posts with minimal input.

### Phase 6: Analytics and Weekly Learning

Build:

- Metrics collection
- Weekly analysis
- Strategy weights
- Recommendations page
- Automatic content mix updates

Success condition:

- System learns which formats and hooks perform best.

## One-Shot Build Prompt

Use this prompt when asking Codex to build the first complete MVP in one pass.

```txt
You are Codex acting as a senior full-stack engineer. Build a low-cost AI Instagram automation MVP in this repository.

Goal:
Create a dashboard-driven app that generates, queues, previews, schedules, and monitors AI Instagram content for a synthetic virtual persona. The app should support 2 photo posts per day and 1 cheap animated Reel per day. It should use local generation hooks for an RTX 3060 Windows laptop, while the Mac runs the dashboard, backend, scheduler, database, and Instagram publishing.

Important constraints:
- Do not use browser automation for Instagram.
- Use the official Instagram Graph API integration shape, but make it safe to run without real credentials.
- Keep the first version low-cost.
- Use local SQLite for the MVP.
- Use local filesystem storage first.
- Include Cloudflare R2/Supabase-style storage interfaces as replaceable modules, but do not require them for local dev.
- Build the system so API keys are read from environment variables.
- Include .env.example.
- Do not hardcode secrets.
- Add clear status and error logging.
- Add guardrails against misleading captions, celebrity impersonation, real-person claims, and spammy automation.
- The account should be transparent as AI/virtual persona.

Tech preference:
- Use Next.js with TypeScript for the dashboard and API routes unless the repository already has a stronger existing stack.
- Use SQLite for the database.
- Use a small job runner script for daily generation, metrics collection, and weekly strategy review.
- Use ffmpeg for cheap image-to-video Reels if available, and degrade gracefully if missing.
- Expose a clean HTTP client for a ComfyUI/RTX worker but provide a mock worker so the dashboard works without the Windows laptop.

Build these screens:
1. Dashboard Home
   - Today's queue
   - Status counts
   - Next scheduled posts
   - Recent errors
   - Follower/reach summary placeholders

2. Persona
   - Edit persona name, niche, style, personality, caption voice, disclosure, forbidden topics
   - Add/list reference image metadata
   - Save to SQLite

3. Generate
   - Generate a daily content pack
   - Create 8 to 12 ideas
   - Pick 2 photo ideas and 1 Reel idea
   - Generate captions and hashtags
   - Use mock image assets if real generation is unavailable

4. Queue
   - Show draft/generated/needs_review/approved/scheduled/posted/failed/rejected posts
   - Preview image/video path
   - Approve/reject/regenerate caption
   - Show quality scores

5. Calendar
   - Show upcoming scheduled posts grouped by date

6. Analytics
   - Show placeholder metrics and stored post metrics
   - Show best-performing hooks once data exists

7. Settings
   - Configure posting windows, automation mode, ComfyUI worker URL, Instagram env status, storage mode

Core modules to implement:
- lib/db: SQLite schema, migrations/init, typed query helpers
- lib/persona: persona loading/saving and default persona seed
- lib/captions: caption and hashtag generator with local template fallback
- lib/ideas: content idea generator with rotating formats
- lib/generation: worker client, mock generator, asset records
- lib/quality: scoring functions and approval thresholds
- lib/reels: ffmpeg Reel creator with fallback mock video record
- lib/scheduler: randomized posting windows and queue scheduling
- lib/instagram: official Graph API client interface with dry-run mode
- lib/analytics: metric collection interface and weekly analysis
- lib/safety: caption/content safety checks
- scripts/daily-run.ts: generate daily content pack and schedule it
- scripts/collect-metrics.ts: collect or mock metrics for posted items
- scripts/weekly-review.ts: analyze performance and update recommendations

Database tables:
- personas
- reference_images
- content_ideas
- generation_jobs
- assets
- posts
- post_metrics
- strategy_weights
- system_events
- settings

Post statuses:
- draft
- generated
- needs_review
- approved
- scheduled
- publishing
- posted
- failed
- rejected

Quality scoring:
Each post should have:
- face_consistency_score
- image_quality_score
- hands_artifact_score
- caption_safety_score
- organic_score
- duplicate_risk_score
- posting_readiness_score

Auto-approval rules:
- Auto-approve only when all important scores pass.
- Require review when near threshold.
- Reject when safety or quality is clearly bad.
- Make thresholds configurable.

Daily workflow:
1. Load persona and settings.
2. Generate 8 to 12 ideas.
3. Pick 2 photo ideas and 1 Reel idea.
4. Generate or mock assets.
5. Score assets and captions.
6. Generate captions and hashtags.
7. Randomize post times inside configured windows.
8. Add posts to queue.
9. Auto-approve only if mode and thresholds allow.
10. In dry-run mode, do not publish to Instagram.

Instagram publishing:
- Implement the create-container and publish-container flow shape.
- Use env vars INSTAGRAM_ACCOUNT_ID and META_ACCESS_TOKEN.
- Include dry-run mode by default.
- Store returned Instagram media IDs when real publishing succeeds.
- Handle and log failures clearly.

UI requirements:
- Make it usable immediately.
- Avoid marketing landing pages.
- First screen should be the operational dashboard.
- Keep layout stable and responsive.
- Use clean tables, status badges, previews, and action buttons.
- No purple/blue-purple dominant gradient theme.
- No cards inside cards.
- Keep button radius 8px or less.

Deliverables:
- Working app that runs locally.
- .env.example
- README.md with setup, commands, and workflow.
- Seed default persona.
- Mock generation path so the app works without API keys or ComfyUI.
- Dry-run Instagram publishing path.
- Scripts for daily run, metrics collection, and weekly review.
- Basic tests or validation scripts for critical modules if the repo test setup exists.

Implementation approach:
1. Inspect the existing repository before editing.
2. Choose the least disruptive structure.
3. Add the app in a dedicated folder if the existing repo is unrelated.
4. Keep changes scoped.
5. Verify the app builds or at least run TypeScript/lint checks if available.
6. Start the dev server if appropriate and provide the local URL.

After finishing, summarize:
- Files created
- How to run
- What works in mock/dry-run mode
- What credentials are needed for real posting
- Next steps for connecting the RTX ComfyUI worker
```

## First Real Implementation Recommendation

Do not begin by wiring every expensive AI provider. Start with:

```txt
1. Dashboard
2. SQLite
3. Mock generation
4. Caption templates
5. Queue and approval
6. ffmpeg cheap Reels
7. Instagram dry-run publishing
```

Then connect:

```txt
1. ComfyUI worker
2. Real storage
3. Real Instagram publishing
4. Analytics
5. Weekly optimizer
6. Optional API video generation
```

This path keeps investment low while still building the full control system.

