# عدة Claude Code — بناء منصة "دوري الحلقات"

> **متى تستخدمها:** بعد ما يخلص التصميم. الملف فيه 5 أجزاء: (1) تجهيز المجلد، (2) ملف `CLAUDE.md` تحطه في جذر المشروع، (3) برومبت الانطلاق، (4) برومبتات مهام المرحلة الأولى بمعايير قبول، (5) بيانات الدوري الأول كـ Seed.
>
> **القاعدة الذهبية:** مهمة واحدة لكل جلسة، اطلب خطة قبل التنفيذ، ولا تنتقل للمهمة التالية قبل نجاح الاختبارات والتجربة على شاشة موبايل.

---

## الجزء 1 — تجهيز المجلد قبل أول أمر

```
league-platform/
├── CLAUDE.md                     ← من الجزء 2
├── docs/
│   ├── spec.md                   ← نسخة من league-platform-spec.md
│   ├── design/                   ← تصدير Claude Design (صور الشاشات + ملف الرموز tokens + أي HTML/React)
│   └── seed/first-league.json    ← من الجزء 5
└── .env.example                  ← أسماء المتغيرات فقط بدون قيم
```

قبل البدء أنشئ مشروع Supabase ومشروع Vercel ومستودع GitHub فارغًا. لا تضع أي مفاتيح أو كلمات مرور في المحادثة مع Claude Code؛ ضعها في `.env.local` بنفسك.

---

## الجزء 2 — `CLAUDE.md` (انسخه كما هو إلى جذر المشروع)

```markdown
# دوري الحلقات — Halaqat League Platform

## What this is
Mobile-first Arabic (RTL) PWA for running community football leagues end to end:
league setup wizard, fixture generation + approval, live match console, standings,
power cards, social feed with moderation, side competitions, multi-league, public pages.
Full spec: docs/spec.md (Arabic). Design: docs/design/. First real league data: docs/seed/first-league.json.

## Stack (do not change without asking)
- Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS, shadcn/ui (RTL), Serwist (PWA)
- Supabase: Postgres + RLS, Auth, Realtime, Storage, Edge Functions; pg_cron for schedules
- TanStack Query (server state), Zustand (live console state), Zod (all inputs), Dexie (offline queue)
- Tests: Vitest (unit), Playwright (e2e, mobile viewport 390x844)
- Deploy: Vercel (auto from GitHub main; previews per PR). Repo: GitHub.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npm run test` (vitest) / `npm run e2e` (playwright)
- `npm run db:reset` (supabase db reset + seed) / `npm run db:types` (regenerate DB types)

## Non-negotiable rules
1. Arabic RTL first. All UI strings live in `/messages/ar.json` (no hardcoded strings) so English can be added later. Numerals are Latin (0-9).
2. Mobile first: every screen must work at 390px width before desktop. Touch targets >= 48px.
3. Security: every table has RLS. Mutations go through Server Actions that re-check role + state
   (e.g. only an assigned recorder can insert match_events, and only while match.status = 'live').
4. Dates: store UTC `timestamptz`; display in `Africa/Cairo`. Every match has a logical `match_day`
   (date) separate from `scheduled_at` — matches after midnight belong to the previous evening's match_day.
5. Score is derived from events: `match_events.value` (default 1) — never store a score that cannot be
   recomputed from events (power cards like "double goal" set value = 2).
6. Standings are a computed table rebuilt by one function (`rebuild_standings(stage_id)`) with
   configurable tie-breakers; point adjustments live in `standing_adjustments`.
7. Pure engines with unit tests, zero DB imports: `lib/scheduling/`, `lib/standings/`, `lib/cards/`.
8. Every sensitive change writes to `audit_log` (who, what, before, after).
9. Roles are per league (`league_members.roles[]`), never global, except platform super admin.
10. No secrets in code or chat. Read `.env.example` for variable names.

## Design tokens
Use the tokens from docs/design/ (CSS variables in `app/globals.css`). Dark theme = public/player/live
surfaces; light theme = admin desktop. Do not invent new colors; extend tokens if truly needed.

## Workflow for every task
1. Read the relevant spec section + design screen first. 2. Write a short plan and list files to touch.
3. Implement. 4. Add/extend tests. 5. Run lint + typecheck + tests. 6. Verify at 390px with Playwright
screenshot. 7. Summarize what changed and what is NOT done yet. Commit with a conventional message.

## Definition of done (per task)
Tests pass · works on mobile viewport · RLS policy exists for every new table · Arabic strings in
messages file · audit_log written for sensitive mutations · no TODOs left without an issue.
```

---

## الجزء 3 — برومبت الانطلاق (المرحلة 0 — الأساس)

```
اقرأ CLAUDE.md ثم docs/spec.md كاملًا (خاصة الأقسام 3، 7، 8، 14) ثم تصفح docs/design/.
بعدها اكتب لي خطة من 10 خطوات لتأسيس المشروع ولا تنفذ شيئًا قبل موافقتي.

المطلوب في هذه المرحلة فقط:
1. تهيئة Next.js 15 + TypeScript strict + Tailwind + shadcn/ui مع RTL (dir="rtl" وlang="ar") والخطوط العربية من التصميم.
2. نقل رموز التصميم (الألوان، الخطوط، المسافات، نصف الأقطار، الظلال) من docs/design/ إلى CSS Variables في globals.css لثيمين: dark (افتراضي) وlight (للأدمن).
3. Supabase: migrations أولية لجداول القسم 7 في المواصفات (الحسابات والعضوية، الفرق، الملاعب، هيكل البطولة والجدول، الترتيب) مع RLS على كل جدول، وتوليد أنواع TypeScript.
4. المصادقة باسم مستخدم + كلمة مرور فوق Supabase Auth (username → بريد داخلي)، مع إعادة تعيين كلمة المرور من الأدمن.
5. هيكل المجلدات: app/(public) app/(me) app/(team) app/(officiate) app/(admin) components/ lib/{scheduling,standings,cards,permissions} server/ supabase/ tests/.
6. التخطيط الأساسي للموبايل: الشريط السفلي (الرئيسية، المباريات، الترتيب، المجتمع، أنا) والتبويبات المشروطة بالدور، والتخطيط الديسكتوبي للأدمن.
7. PWA: manifest + service worker + شاشة تثبيت.
8. سكربت seed يقرأ docs/seed/first-league.json ويُنشئ الدوري والفرق واللاعبين الوهميين والجدول كما هو.
9. Vitest + Playwright (مشروع موبايل 390×844) + GitHub Actions (lint, typecheck, test).
10. README بخطوات التشغيل المحلي والنشر على Vercel وربط Supabase.

معيار القبول: `npm run db:reset && npm run dev` يفتح الرئيسية بالعربية RTL على 390px ويعرض "دوري الحلقات — صيف 2026" ومباريات ليلة 21/8 من الـ seed، وتسجيل الدخول يعمل، والـ CI أخضر.
```

---

## الجزء 4 — برومبتات المرحلة الأولى (MVP) — مهمة لكل جلسة

> ابدأ كل جلسة بـ: "اقرأ CLAUDE.md وملخص آخر commit، ثم نفّذ المهمة التالية:" والصق المهمة.

**T1 — محرك الجدولة (lib/scheduling) — بدون واجهة**
```
ابنِ دالة نقية generateScenarios(config) تُرجع 3–5 سيناريوهات. المدخلات: الفرق (أو المجموعات)، النظام (دوري/مجموعات/كأس، عدد الدورات)، أيام اللعب، الفترات، الملاعب مع إتاحتها (دائمة أو بتواريخ محددة)، القيود (أقصى مباريات للفريق في اليوم، أقل فجوة بالفترات بين مباراتَي نفس الفريق، أقل أيام راحة، مباريات مثبتة). المخرجات: قائمة مباريات بـ match_day وslot وvenue، ومقاييس لكل سيناريو (أيام اللعب، تاريخ النهاية، متوسط الراحة، توازن الأرض/الضيف، استغلال الملاعب، التعارضات). استخدم Circle Method للدوري وبذرة عشوائية قابلة للتكرار.
اختبارات إلزامية: (أ) 12 فريقًا ذهاب = 66 مباراة و11 جولة؛ (ب) أعداد فردية مع Bye؛ (ج) حالة الدوري الأول من docs/seed/first-league.json: 10 فرق في مجموعتين، 6 فترات × 20 دقيقة، ملعب 1 دائمًا + ملعب 2 يوم 2026-09-04 في فترتَي 23:40 و00:00 فقط، فريق يلعب مرتين بحد أقصى في الليلة بفجوة فترة واحدة على الأقل → يجب أن يُنتج جدولًا صالحًا في 3 ليالٍ للمجموعات بلا أي تعارض؛ (د) لا يُنتج أبدًا مباراتين لنفس الفريق في فترتين متتاليتين عندما تكون الفجوة المطلوبة 1.
```

**T2 — محرك الترتيب وكسر التعادل (lib/standings + دالة SQL)**
```
ابنِ computeStandings(matches, events, adjustments, rules) نقية مع معايير كسر التعادل القابلة للترتيب (النقاط، المواجهات المباشرة، فارق الأهداف، الأهداف المسجلة، اللعب النظيف، القرعة) وتحديد المتأهلين (أول N من كل مجموعة + أفضل الثوالث). ثم دالة Postgres rebuild_standings(stage_id) تُستدعى بـ trigger عند اعتماد/تعديل نتيجة. اختبارات لكل معيار ولحالة "أفضل الثوالث" ولحالة التعديل بالنقاط.
```

**T3 — معالج إنشاء الدوري (ديسكتوب) + حاسبة النظام**
```
نفّذ المعالج بخطواته التسع من القسم 4.2 بحفظ مسودة في كل خطوة، وشاشة "حاسبة النظام" التي تستدعي lib/scheduling بوضع التقدير لعرض المقارنة. اتبع تصميم docs/design/ للخطوات الثلاث المصممة وطبّق نفس النمط على الباقي. اختبار e2e: إنشاء دوري مطابق للدوري الأول في أقل من 15 دقيقة تفاعل (سجّل الخطوات).
```

**T4 — الفرق واللاعبون والدعوات**
```
إنشاء الفرق (يدوي + استيراد CSV)، تعيين القائد بكود دعوة، انضمام اللاعب بالكود، ملف الفريق والملف الشخصي، رموز المجموعات (group_teams.code مثل A1)، قيود: لا لاعب في فريقين بنفس الدوري، حد اللاعبين. RLS: القائد يعدّل فريقه فقط.
```

**T5 — القرعة ومولد الجدول والاعتماد (ديسكتوب)**
```
شاشة القرعة (فورية + متحركة للعرض)، ثم الشاشات الأربع: مقارنة السيناريوهات → المعاينة (جولة/ليلة/ملعب) مع تنبيهات التعارض → محرر السحب والإفلات مع تثبيت مباريات وإعادة التوليد للباقي → الاعتماد والنشر (قفل + إشعار + ICS). بعد الاعتماد: تأجيل مباراة مفردة مع اقتراح أقرب فترة متاحة. كل تغيير بعد الاعتماد يُكتب في audit_log.
```

**T6 — الصفحات العامة (SSR/ISR)**
```
الرئيسية، صفحة الدوري، المباريات (تجميع باليوم المنطقي + المباريات المتوازية)، النتائج، الترتيب، شجرة الكأس، الفريق، اللاعب، الإحصائيات، اللائحة — كلها بدون تسجيل دخول وبصور معاينة OG لكل مباراة وفريق. ISR يُعاد توليده عند اعتماد نتيجة.
```

**T7 — شاشة التسجيل المباشر (Live Console) — أهم مهمة**
```
نفّذ /match/{id}/console طبقًا للقسم 4.7 وحالات التصميم الاثنتي عشرة: الساعة والفترات، لوحتا اللاعبين، شريط الأحداث، تسجيل أي حدث في ضغطتين، تراجع 5 ثوانٍ، تعديل/حذف بسبب، تبديلات، إنذار ثانٍ = طرد تلقائي، أحداث الفريق، تعليق سريع، نهاية المباراة → نجم المباراة → اعتماد الحكم بـ PIN → قفل وإعادة بناء الترتيب وحساب الإيقافات.
أوفلاين: الأحداث تُكتب أولًا في Dexie ثم تُزامَن بترتيبها مع معرّفات idempotent. الصلاحيات: المسجّل المُسنَد فقط وبحالة live. Realtime: بث الأحداث لصفحة المباراة العامة خلال ثانيتين.
اختبار e2e على 390px: تسجيل هدف وإنذار وتبديل وإنهاء واعتماد، ثم التحقق من الترتيب. اختبار أوفلاين: قطع الشبكة وتسجيل 3 أحداث ثم الاستئناف.
```

**T8 — إسناد الطاقم والانضباط والاعتمادات (أدمن)**
```
إسناد الحكم/المسجّل لكل مباراة مع تحذير التعارض (لاعب في نفس المباراة أو مباراة متزامنة) وقبول/اعتذار، قائمة النتائج المنتظرة للاعتماد، إعادة فتح مباراة، الإيقافات التلقائية من الكروت وفق إعدادات الدوري، وتعديل النقاط مع سبب.
```

**T9 — الإشعارات داخل التطبيق + تذكيرات**
```
جدول notifications + تفضيلات، تذكير قبل 24 ساعة وقبل ساعة عبر pg_cron، إشعار الأهداف والنتائج وتغيير المواعيد والإسناد. Web Push يُؤجَّل للمرحلة الثانية لكن جهّز push_subscriptions.
```

**T10 — مولد الجرافيكس (نسخة أولى)**
```
توليد صور من HTML على السيرفر: بوستر الجدول الكامل (بروح docs/design/ وبيانات الدوري)، كارت نتيجة مباراة، كارت ترتيب المجموعة — بمقاسَي 9:16 و1:1 وزر مشاركة على واتساب.
```

> **المرحلة الثانية** (المجتمع والإشراف، الرسائل والطلبات، Push، وضع TV) **والمرحلة الثالثة** (محرك كروت القوة، المسابقات والجوائز، التوقعات، الشارات) تُكتب بنفس الأسلوب بعد تشغيل أول دوري على المرحلة الأولى. ملاحظة مهمة لكروت القوة من الآن: `match_events.value` و`standing_adjustments` و`card_usages.effect_snapshot` موجودة في المخطط منذ المرحلة 0 حتى لا نعيد بناء شيء لاحقًا.

---

## الجزء 5 — `docs/seed/first-league.json`

> الأوقات بعد منتصف الليل تحمل تاريخ اليوم التالي لكن `match_day` هو ليلة الجمعة. مدة المباراة افتراض (2×8) — عدّلها للقيمة الحقيقية.

```json
{
  "league": {
    "slug": "halaqat-summer-2026",
    "name": "دوري الحلقات — صيف 2026",
    "slogan": "التحدي يبدأ .. والبطولة لنا",
    "timezone": "Africa/Cairo",
    "theme": { "bg": "#070E24", "surface": "#0F1B3F", "gold": "#E0B24A", "shield": "#1E40AF" },
    "rules": {
      "points": { "win": 3, "draw": 1, "loss": 0 },
      "halves": 2, "half_minutes": 8, "slot_minutes": 20, "_note": "المدة افتراض — عدّلها",
      "final_duration_override_minutes": 30,
      "substitutions": "unlimited",
      "tiebreakers": ["points", "head_to_head", "goal_difference", "goals_for", "fair_play", "draw"],
      "yellow_cards_for_suspension": 2, "red_card_suspension_matches": 1
    },
    "features": { "power_cards": true, "social": true, "competitions": true, "fans": false }
  },
  "venues": [
    { "name": "ملعب 1", "availability": "all_slots" },
    { "name": "ملعب 2", "availability": [ { "date": "2026-09-04", "slots": ["23:40", "00:00"] } ] }
  ],
  "match_days": ["2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11"],
  "slots": ["23:00", "23:20", "23:40", "00:00", "00:20", "00:40"],
  "format": {
    "stages": [
      { "type": "groups", "groups": 2, "legs": 1, "qualify_per_group": 2 },
      { "type": "knockout", "legs": 1, "third_place": true,
        "semis": [ { "home": "1A", "away": "2B" }, { "home": "1B", "away": "2A" } ] }
    ]
  },
  "teams": [
    { "group": "A", "code": "A1", "name": "فؤش" },
    { "group": "A", "code": "A2", "name": "زيد" },
    { "group": "A", "code": "A3", "name": "غراب" },
    { "group": "A", "code": "A4", "name": "لوكاكو" },
    { "group": "A", "code": "A5", "name": "أحمد طارق" },
    { "group": "B", "code": "B1", "name": "صعيدي" },
    { "group": "B", "code": "B2", "name": "جدو" },
    { "group": "B", "code": "B3", "name": "نعمان" },
    { "group": "B", "code": "B4", "name": "الشيوخ" },
    { "group": "B", "code": "B5", "name": "سلامة" }
  ],
  "players_per_team_placeholder": 7,
  "fixtures": [
    { "match_day": "2026-08-21", "slot": "23:00", "venue": "ملعب 1", "home": "A1", "away": "A2" },
    { "match_day": "2026-08-21", "slot": "23:20", "venue": "ملعب 1", "home": "B1", "away": "B2" },
    { "match_day": "2026-08-21", "slot": "23:40", "venue": "ملعب 1", "home": "A1", "away": "A3" },
    { "match_day": "2026-08-21", "slot": "00:00", "venue": "ملعب 1", "home": "B1", "away": "B3" },
    { "match_day": "2026-08-21", "slot": "00:20", "venue": "ملعب 1", "home": "A4", "away": "A5" },
    { "match_day": "2026-08-21", "slot": "00:40", "venue": "ملعب 1", "home": "B4", "away": "B5" },

    { "match_day": "2026-08-28", "slot": "23:00", "venue": "ملعب 1", "home": "A2", "away": "A3" },
    { "match_day": "2026-08-28", "slot": "23:20", "venue": "ملعب 1", "home": "B2", "away": "B3" },
    { "match_day": "2026-08-28", "slot": "23:40", "venue": "ملعب 1", "home": "A2", "away": "A4" },
    { "match_day": "2026-08-28", "slot": "00:00", "venue": "ملعب 1", "home": "B2", "away": "B4" },
    { "match_day": "2026-08-28", "slot": "00:20", "venue": "ملعب 1", "home": "A1", "away": "A5" },
    { "match_day": "2026-08-28", "slot": "00:40", "venue": "ملعب 1", "home": "B1", "away": "B5" },

    { "match_day": "2026-09-04", "slot": "23:00", "venue": "ملعب 1", "home": "A1", "away": "A4" },
    { "match_day": "2026-09-04", "slot": "23:20", "venue": "ملعب 1", "home": "B1", "away": "B4" },
    { "match_day": "2026-09-04", "slot": "23:40", "venue": "ملعب 1", "home": "A3", "away": "A4" },
    { "match_day": "2026-09-04", "slot": "23:40", "venue": "ملعب 2", "home": "A2", "away": "A5" },
    { "match_day": "2026-09-04", "slot": "00:00", "venue": "ملعب 1", "home": "B3", "away": "B4" },
    { "match_day": "2026-09-04", "slot": "00:00", "venue": "ملعب 2", "home": "B2", "away": "B5" },
    { "match_day": "2026-09-04", "slot": "00:20", "venue": "ملعب 1", "home": "A3", "away": "A5" },
    { "match_day": "2026-09-04", "slot": "00:40", "venue": "ملعب 1", "home": "B3", "away": "B5" },

    { "match_day": "2026-09-11", "slot": "23:00", "venue": "ملعب 1", "stage": "semi_1", "home": "1A", "away": "2B" },
    { "match_day": "2026-09-11", "slot": "23:00", "venue": "ملعب 2", "stage": "semi_2", "home": "1B", "away": "2A", "_note": "البوستر يضع النصفين في نفس الوقت — يفترض ملعبين، عدّل لو غير ذلك" },
    { "match_day": "2026-09-11", "slot": "00:00", "venue": "ملعب 1", "stage": "third_place", "home": "L_semi_1", "away": "L_semi_2" },
    { "match_day": "2026-09-11", "slot": "00:30", "venue": "ملعب 1", "stage": "final", "home": "W_semi_1", "away": "W_semi_2", "duration_override_minutes": 30 }
  ],
  "power_cards": [
    { "name": "الهدف بهدفين", "effect_type": "goal_multiplier", "params": { "multiplier": 2, "scope": "next_goal" }, "usage_window": "live", "rarity": "rare" },
    { "name": "وقت إضافي", "effect_type": "extra_time", "params": { "minutes": 3 }, "usage_window": "live", "rarity": "common" },
    { "name": "الدرع", "effect_type": "shield", "params": { "cancels": "yellow_card" }, "usage_window": "live", "rarity": "common" },
    { "name": "تبديل إضافي", "effect_type": "extra_substitution", "params": { "count": 1 }, "usage_window": "live", "rarity": "common" }
  ],
  "slogans": ["فريق واحد .. هدف واحد", "شغف لا ينتهي", "روح المنافسة"]
}
```

---

## نصائح سريعة للعمل مع Claude Code على هذا المشروع
- اطلب دائمًا "خطة + قائمة الملفات" قبل التنفيذ، واعترض مبكرًا لو الخطة تتجاوز نطاق المهمة.
- بعد كل مهمة اطلب لقطة شاشة Playwright على 390px قبل أن تقبلها.
- حدّث `CLAUDE.md` كلما اتخذت قرارًا جديدًا (مثل تغيير مدة المباراة أو إضافة نوع حدث) — هو ذاكرة المشروع.
- استخدم فروعًا: `feat/T7-live-console` مثلًا، ودع Vercel ينشئ معاينة لكل فرع لتجربته من الموبايل فعلًا.
- لو كبرت المحادثة ثقلت: ابدأ جلسة جديدة بـ "اقرأ CLAUDE.md وآخر 3 commits" بدل الاستمرار في جلسة طويلة.
