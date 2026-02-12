# Workout Plan – Business Analysis

## 1. Executive Summary

**Feature:** A dedicated **Workout Plan** tab where gym members can define their weekly workout schedule and **track completion** in the same screen. The goal is to increase consistency and accountability by giving members one place to see “what I planned” and “what I did.”

**Stakeholders:** Gym members (primary); gym staff/trainers (secondary – future: view member adherence).

**Success criteria:** Members can create a weekly plan, log completed workouts with minimal friction, and see their plan + recent activity in a single view without switching tabs.

---

## 2. Problem Statement

- Members often forget what they planned to do or lose track of consistency.
- Tracking is scattered (notes, spreadsheets) or not done at all.
- The app already has Nutrition AI and Medical History; adding **Workout Plan + Track** completes a “member wellness” hub (nutrition, health, training).

---

## 3. Scope (MVP)

| In scope | Out of scope (later) |
|----------|----------------------|
| One plan per member (e.g. weekly template) | Multiple plans, templates library |
| Define plan by “day of week” + label (e.g. Mon: Push, Tue: Pull) | Exercise-level detail (sets/reps) |
| Log “I did this workout on this date” + optional notes/duration | Charts, streaks, social |
| View plan + log form + recent logs in **one window** | Trainer-assigned plans, reminders |

---

## 4. User Stories & Acceptance Criteria

**US1 – Create/Edit Plan**  
As a member, I can set my weekly workout plan (e.g. Mon = Push, Tue = Pull, Wed = Rest) so I know what to do each day.

- AC1: I can see a form/card for “My weekly plan” with one row per day (Mon–Sun).
- AC2: Each day has a label (e.g. “Push”, “Pull”, “Rest”, “Cardio”). Default can be “Rest” or empty.
- AC3: I can save the plan; it persists and is shown when I return.
- AC4: I can edit the plan anytime; changes apply to future weeks.

**US2 – Log a Workout**  
As a member, I can log that I completed a workout on a given date so I have a history.

- AC1: I can select a date (default today) and pick “which workout” (from my plan labels or free text).
- AC2: I can add optional notes and optional duration (minutes).
- AC3: Submitting creates a log entry and it appears in the list below.
- AC4: I can do this in the same window as my plan (no navigation away).

**US3 – See Plan and Activity Together**  
As a member, I can see my plan and my recent logs in one view so I stay on track.

- AC1: The screen shows: (1) my current weekly plan, (2) a “Log workout” form, (3) a list of recent log entries (e.g. last 14 days or last 20 entries).
- AC2: Logs show date, workout label, notes, duration (if any).
- AC3: Optional: show “Today: [label from plan]” so I know what’s planned for today.

---

## 5. Data Model

**WorkoutPlan (one per user)**  
- `tenantId`, `userId` – scope  
- `name` – optional plan name (e.g. “4-day split”)  
- `days` – array of `{ dayOfWeek: number, label: string }`  
  - `dayOfWeek`: 0 = Sunday, 1 = Monday, … 6 = Saturday (or 1–7; frontend can map)  
  - `label`: e.g. “Push”, “Pull”, “Rest”, “Cardio”  
- `updatedAt`

**WorkoutLog (many per user)**  
- `tenantId`, `userId` – scope  
- `date` – ISO date string (YYYY-MM-DD)  
- `workoutLabel` – string (what they did; can match plan or be free text)  
- `notes` – optional string  
- `durationMinutes` – optional number  
- `createdAt`

---

## 6. Flows

1. **First visit:** “My weekly plan” is empty or default (e.g. all “Rest”). User fills days, saves. “Log workout” form is available; “Recent activity” is empty.
2. **Log workout:** User selects date (default today), chooses or types workout label, optionally adds notes/duration, submits. New row appears in “Recent activity.”
3. **Return visit:** Plan is loaded; “Today: [label]” can be shown; user can log today or a past date; recent logs listed below.
4. **Edit plan:** User changes labels for days, saves. Existing logs are unchanged; only future “planned” view uses the new plan.

---

## 7. Non-Functional Notes

- **Performance:** List logs with a sensible limit (e.g. last 30 days or 50 entries); no pagination in MVP.
- **Security:** All endpoints scoped by `tenantId` + `userId` from JWT; members see only their own plan and logs.
- **Mobile:** Same window must work on small screens (stack form, scrollable table).

---

## 8. Implementation Checklist

- [ ] Backend: WorkoutPlan and WorkoutLog schemas (MongoDB)
- [ ] Backend: GET/PUT plan, GET/POST logs, optional DELETE log
- [ ] Frontend: Workout Plan page (plan card + log form + logs table in one view)
- [ ] Frontend: Route and nav item for members
- [ ] Optional: “Today: [label]” from plan; CSV export of logs (later)
