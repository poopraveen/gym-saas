/**
 * Gym workout plan templates and exercise guides.
 * Templates: 7 days (0=Sunday .. 6=Saturday). Labels fill the weekly plan.
 * Guides: suggested exercises per workout type for user guidance.
 */

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  /** Day labels for Sun(0) .. Sat(6) */
  days: string[];
}

export interface ExerciseItem {
  name: string;
  sets?: string;
  notes?: string;
}

/** Predefined plan templates – choose one to fill the weekly plan. */
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'custom',
    name: 'Custom',
    description: 'Set your own days manually.',
    days: ['', '', '', '', '', '', ''],
  },
  {
    id: 'ppl-6',
    name: 'Push / Pull / Legs (6-day)',
    description: 'Classic PPL: Push, Pull, Legs, repeat. Sunday rest.',
    days: ['Rest', 'Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
  },
  {
    id: 'ppl-5',
    name: 'Push / Pull / Legs (5-day)',
    description: 'PPL with two rest days (e.g. Wed & Sun).',
    days: ['Rest', 'Push', 'Pull', 'Rest', 'Legs', 'Push', 'Pull'],
  },
  {
    id: 'upper-lower-4',
    name: 'Upper / Lower (4-day)',
    description: 'Upper body, Lower body, repeat. 3 rest days.',
    days: ['Rest', 'Upper', 'Lower', 'Rest', 'Upper', 'Lower', 'Rest'],
  },
  {
    id: 'full-body-3',
    name: 'Full Body (3-day)',
    description: 'Full body Mon, Wed, Fri. Rest or light cardio other days.',
    days: ['Rest', 'Full Body', 'Rest', 'Full Body', 'Rest', 'Full Body', 'Rest'],
  },
  {
    id: 'beginner-3',
    name: 'Beginner (3-day)',
    description: 'Simple 3-day split: A, B, A. Rest between.',
    days: ['Rest', 'Workout A', 'Rest', 'Workout B', 'Rest', 'Workout A', 'Rest'],
  },
  {
    id: 'bro-split',
    name: 'Bro Split (5-day)',
    description: 'Chest, Back, Shoulders, Arms, Legs. Weekend rest.',
    days: ['Rest', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Rest'],
  },
];

/** Exercise guides by workout type – what to do on each day. */
export const WORKOUT_GUIDE: Record<string, ExerciseItem[]> = {
  Push: [
    { name: 'Bench Press', sets: '3–4 × 8–10', notes: 'Flat or incline' },
    { name: 'Overhead Press', sets: '3 × 8–10', notes: 'Barbell or dumbbell' },
    { name: 'Incline Dumbbell Press', sets: '3 × 10–12' },
    { name: 'Lateral Raises', sets: '3 × 12–15', notes: 'Side delts' },
    { name: 'Tricep Pushdowns', sets: '3 × 10–12' },
    { name: 'Tricep Dips or Skull Crushers', sets: '2–3 × 10–12' },
  ],
  Pull: [
    { name: 'Barbell or T-Bar Row', sets: '3–4 × 8–10', notes: 'Horizontal pull' },
    { name: 'Pull-ups or Lat Pulldown', sets: '3 × 8–12', notes: 'Vertical pull' },
    { name: 'Cable or DB Row', sets: '3 × 10–12' },
    { name: 'Face Pulls', sets: '3 × 15–20', notes: 'Rear delts' },
    { name: 'Barbell or EZ Bar Curl', sets: '3 × 10–12' },
    { name: 'Hammer Curls', sets: '2–3 × 10–12' },
  ],
  Legs: [
    { name: 'Squat (Barbell or Leg Press)', sets: '3–4 × 8–10' },
    { name: 'Romanian Deadlift', sets: '3 × 10–12', notes: 'Hamstrings' },
    { name: 'Leg Curl', sets: '3 × 10–12' },
    { name: 'Leg Extension', sets: '3 × 10–12' },
    { name: 'Calf Raises', sets: '3 × 15–20' },
  ],
  Upper: [
    { name: 'Bench Press', sets: '3 × 8–10' },
    { name: 'Row (any)', sets: '3 × 8–10' },
    { name: 'Overhead Press', sets: '3 × 8–10' },
    { name: 'Pull-down or Pull-up', sets: '3 × 8–12' },
    { name: 'Bicep Curl', sets: '2 × 10–12' },
    { name: 'Tricep Pushdown', sets: '2 × 10–12' },
  ],
  Lower: [
    { name: 'Squat', sets: '3–4 × 8–10' },
    { name: 'Romanian Deadlift', sets: '3 × 10–12' },
    { name: 'Leg Press', sets: '3 × 10–12' },
    { name: 'Leg Curl', sets: '2 × 10–12' },
    { name: 'Calf Raises', sets: '3 × 15' },
  ],
  'Full Body': [
    { name: 'Squat', sets: '3 × 8–10' },
    { name: 'Bench Press', sets: '3 × 8–10' },
    { name: 'Row', sets: '3 × 8–10' },
    { name: 'Overhead Press', sets: '2 × 8–10' },
    { name: 'Romanian Deadlift', sets: '2 × 10–12' },
    { name: 'Curls / Tricep (optional)', sets: '2 × 10' },
  ],
  'Workout A': [
    { name: 'Squat', sets: '3 × 8–10' },
    { name: 'Bench Press', sets: '3 × 8–10' },
    { name: 'Row', sets: '3 × 8–10' },
    { name: 'Plank', sets: '2 × 30–60s' },
  ],
  'Workout B': [
    { name: 'Romanian Deadlift', sets: '3 × 10–12' },
    { name: 'Overhead Press', sets: '3 × 8–10' },
    { name: 'Lat Pulldown or Pull-up', sets: '3 × 8–12' },
    { name: 'Leg Curl', sets: '2 × 10–12' },
    { name: 'Plank', sets: '2 × 30–60s' },
  ],
  Chest: [
    { name: 'Bench Press', sets: '4 × 8–10' },
    { name: 'Incline DB Press', sets: '3 × 10–12' },
    { name: 'Cable or DB Flye', sets: '3 × 12–15' },
    { name: 'Dips (chest focus)', sets: '2 × 10–12' },
  ],
  Back: [
    { name: 'Deadlift or Rack Pull', sets: '3 × 6–8' },
    { name: 'Pull-ups or Lat Pulldown', sets: '3 × 8–12' },
    { name: 'Barbell Row', sets: '3 × 8–10' },
    { name: 'Cable Row', sets: '2 × 10–12' },
  ],
  Shoulders: [
    { name: 'Overhead Press', sets: '3–4 × 8–10' },
    { name: 'Lateral Raises', sets: '3 × 12–15' },
    { name: 'Face Pulls', sets: '3 × 15–20' },
    { name: 'Rear Delt Flye', sets: '2 × 12–15' },
  ],
  Arms: [
    { name: 'Barbell Curl', sets: '3 × 10–12' },
    { name: 'Tricep Pushdown', sets: '3 × 10–12' },
    { name: 'Hammer Curl', sets: '2 × 10–12' },
    { name: 'Overhead Tricep Extension', sets: '2 × 10–12' },
  ],
  Cardio: [
    { name: 'Treadmill / Run', sets: '20–30 min', notes: 'Steady or intervals' },
    { name: 'Cycling', sets: '20–30 min' },
    { name: 'Rower', sets: '15–20 min' },
  ],
  Rest: [],
};
