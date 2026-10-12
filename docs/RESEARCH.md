# Research notes (October 2026)

These notes summarise five research passes behind the design decisions for streaks, ranked play, the
backend choice, the Mind Check-in and the Reasoning Test. Sources are linked inline. Numbers marked
*(design choice)* are our own starting values and should be tuned with real data.

## 1. Streaks (implemented in `js/progress.js`)

**Evidence**
- **Streak Freeze cap.** Duolingo raised the cap from 1 to 2 and daily active learners rose 0.38%.
  - Streak animations raised 7-day retention by 1.7%.
  - Learners who reach a 7-day streak are 3.6× more likely to finish their course.
  - [Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
- **Friend Streaks.** Learners with one are 22% more likely to finish their daily lesson. [Duolingo](https://blog.duolingo.com/friend-streak/)
- **Rest helps.** Weekend rest lifted weekly return by 4%. Bingeing predicted quitting. [Duolingo](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)
- **Seeing a broken streak lowers engagement.** The drop is worse when people blame themselves, and smaller when the streak can be repaired. Silverman & Barasch, *JCR* 2023: [summary](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions)
- **"Emergency reserve" skip days beat strict goals.** Sharif & Shu: [summary](https://anderson-review.ucla.edu/emergency-reserves/)
- **One missed day doesn't derail habit formation.** Lally et al. 2010.

**Rules we ship**
- A finished daily or ranked puzzle (win or lose) counts for the day.
- 2 automatic rest days per Mon–Sun week.
- Freezes: +1 per 7 days played, plus bonuses at the 7/30/100 milestones. Max 3.
- Free repair: play 2 puzzles within 3 days of a break. Once per 30 days.
- "Days played" never resets.
- Milestones at 3/7/14/30/50/100/200/365 days, then every 100.
- XP: 10 for finishing, +5 for solving, +0–5 for accuracy, +5 for the first puzzle of the day. Practice earns 0 XP.
- Daily goals: Gentle 10 / Steady 25 / Focused 45 XP. The streak only ever needs one puzzle.
- Copy is kind. No guilt, no sad mascots, no countdown pressure.

## 2. Ranked play (implemented)

- **Same puzzle for everyone.** It is seeded per game per day, separately from the curated daily puzzle.
- **One attempt.** The attempt is claimed at the countdown, and leaving mid-race is a DNF.
- **Timing.** The board stays hidden until 3-2-1. The clock runs from "go" to the player's final input, so finishing animations aren't counted.
- **Ranking.** Time first, accuracy as the tiebreak. Echo ranks by sequence length, then time.
- **Leaderboard research.** Leaderboards are the game element most often linked to negative effects for lower-ranked players. When leagues ship, we'll use small matched groups, show nearby neighbours by default, and make opt-out easy. ([review](https://www.emerald.com/insight/content/doi/10.1108/intr-12-2021-0897/full/html))

## 3. Backend for accounts, leaderboards and friends (not yet chosen)

| Rank | Option | Why |
|---|---|---|
| 1 | **Cloudflare Workers + D1** | Free and never pauses. No card needed. Every write goes through server code, so it can reject impossible times. A coding assistant can set up almost everything with the `wrangler` command-line tool after one login. 100k requests/day, 5 GB storage. |
| 2 | Supabase | Excellent built-in features, but free projects pause after 7 days of low activity, and restoring one is a manual step. |
| 3 | Firebase | Works, but score checking needs Cloud Functions (paid Blaze plan), and it locks you in more than the others. |

Not suitable:
- Appwrite: projects pause, and are deleted after 90 days paused.
- PocketHost: no free tier any more.
- JSONBin/Pantry: no write protection.

Prices and limits were checked in Oct 2026; see the agent report for links.

## 4. Mind Check-in: research-backed, legal, not a diagnosis (planned)

**What we can't use or claim**
- MMSE, MoCA, SAGE, Mini-Cog, AD8 and TICS are all copyrighted, with terms that bar consumer digital use.
- Claiming to detect MCI or dementia would make the app an FDA Class II device ([21 CFR 882.1470](https://www.law.cornell.edu/cfr/text/21/882.1470)).
- The FTC fined Lumosity $2M over brain-health claims.
- What we can do: original tasks built on the underlying research paradigms (copyright doesn't cover methods), positioned as a "mental acuity" wellness feature.

**Planned tasks** (~5 min), each based on a well-supported paradigm:
1. **Word list learning.** 2 trials of 10 words. Based on RAVLT/CERAD.
2. **Symbol–digit coding.** Measures processing speed.
3. **Trails A/B.** The Trail Making Test is public domain.
4. **Object–location pairs.** Based on the PAL/ORCA-LLT learning paradigm.
5. **Delayed recall and recognition with similar lures.** Delayed recall is the strongest single predictor in the research.

**Tracking change, not judging one score**
- **Run-in:** 2 practice sessions, excluded from scoring.
- **Baseline:** 6 weekly sessions, then every 2 weeks. Rebuild the baseline at about 3 months to absorb practice gains.
- **Context check:** before each session, ask about sleep, mood, stress, illness, alcohol and medication. Flagged sessions are excluded from the baseline and from any decision.
- **Device:** touch and mouse sessions are scored separately.
- **Change score:** compare the last 3 sessions against the personal baseline, as a composite z-score.
  - Baseline spread uses a shrunk SD with a floor.
  - Formula: z = (recent mean − baseline mean) / (s* · √(1/k + 1/n)).
  - A "talk to a doctor" message appears only after the score stays at z ≤ −2.0 for 6 weeks or more.
- **Messages:** tiers T0–T4. They never use "decline", "impairment" or "dementia", always mention treatable causes (sleep, mood, B12, thyroid, medications, hearing), and are always non-diagnostic.
- Sources: practice-effect meta-analyses ([Scharfen 2018](https://www.gwern.net/doc/iq/2018-scharfen.pdf)); Cogstate run-in ([Collie 2003](https://www.cogstate.com/publication/practice-effects-associated-repeated-assessment-cognitive-function-using-cogstate-battery-10-minute-one-week-one-month-test-retest-intervals/)); high-frequency assessment ([Sliwinski 2018](https://pubmed.ncbi.nlm.nih.gov/27084835/)).
- Results stay on the device only. Under the FTC Health Breach Notification Rule, no third-party scripts may see them.

## 5. Reasoning Test: honest "IQ-style" puzzles (planned)

**Why we write our own items and show no IQ number**
- No open item bank (ICAR, Hagen, MaRs-IB, Sandia) clearly allows public display in a consumer app. Raven's, WAIS and the Mensa tests are proprietary.
- An unproctored short test can't honestly give an IQ number:
  - no representative norms
  - unproctored scores run about 0.2 SD high
  - the uncertainty is about ±11 points

**The design**
- **Items:** our own generator for 3×3 matrices, built on Carpenter/Just/Shell rules (progression, distribution of three, arithmetic, XOR overlay).
- **Answer choices:** 8 options, balanced so the right answer can't be found by elimination without reading the matrix (the I-RAVEN fix).
- **Length:** 20 items over 5 difficulty levels.
- **Scoring:** a Rasch estimate.
- **Results:** a percentile among Well Played players' first attempts, shown with a likely range, and only once 500 or more first attempts exist. Always labelled "not an IQ score".
- **Retakes:** at most every 30 days, since retest gains are 0.23–0.42 SD.
