export type TrainingDay = 'A' | 'B' | 'C';

export type RoutineExercise = {
  day: TrainingDay;
  order: number;
  name: string;
  targetSets: number;
  repRange: string;
  rest: string;
  muscles: string;
  alternative: string;
};

export const routine: RoutineExercise[] = [
  { day: 'A', order: 1, name: 'Back Squat or Hack Squat', targetSets: 3, repRange: '6–8', rest: '2–3 min', muscles: 'Quads / glutes / core', alternative: 'Leg press' },
  { day: 'A', order: 2, name: 'Bench Press or Machine Chest Press', targetSets: 3, repRange: '6–10', rest: '2–3 min', muscles: 'Chest / triceps', alternative: 'Dumbbell bench press' },
  { day: 'A', order: 3, name: 'Lat Pulldown', targetSets: 3, repRange: '8–12', rest: '2 min', muscles: 'Lats / biceps', alternative: 'Assisted pull-up' },
  { day: 'A', order: 4, name: 'Seated Leg Curl', targetSets: 2, repRange: '10–15', rest: '60–90 sec', muscles: 'Hamstrings', alternative: 'Lying leg curl' },
  { day: 'A', order: 5, name: 'Dumbbell or Cable Lateral Raise', targetSets: 2, repRange: '12–15', rest: '60–90 sec', muscles: 'Side delts', alternative: 'Machine lateral raise' },
  { day: 'A', order: 6, name: 'Cable Crunch', targetSets: 2, repRange: '10–15', rest: '60 sec', muscles: 'Core', alternative: 'Dead bug' },
  { day: 'B', order: 1, name: 'Romanian Deadlift (DB, barbell or Smith)', targetSets: 3, repRange: '6–10', rest: '2–3 min', muscles: 'Hamstrings / glutes / back', alternative: 'Hip hinge machine / back extension' },
  { day: 'B', order: 2, name: 'Machine or Dumbbell Shoulder Press', targetSets: 3, repRange: '6–10', rest: '2 min', muscles: 'Shoulders / triceps', alternative: 'Barbell overhead press' },
  { day: 'B', order: 3, name: 'Seated Cable Row', targetSets: 3, repRange: '8–12', rest: '2 min', muscles: 'Upper back / biceps', alternative: 'Chest-supported row' },
  { day: 'B', order: 4, name: 'Leg Press', targetSets: 3, repRange: '8–12', rest: '2 min', muscles: 'Quads / glutes', alternative: 'Hack squat' },
  { day: 'B', order: 5, name: 'Incline Dumbbell or Machine Chest Press', targetSets: 2, repRange: '8–12', rest: '90 sec', muscles: 'Upper chest / triceps', alternative: 'Flat chest press' },
  { day: 'B', order: 6, name: 'Dumbbell or Cable Biceps Curl', targetSets: 2, repRange: '10–15', rest: '60–90 sec', muscles: 'Biceps', alternative: 'Machine curl' },
  { day: 'C', order: 1, name: 'Bulgarian Split Squat or Hack Squat', targetSets: 3, repRange: '8–12 / leg', rest: '2 min', muscles: 'Quads / glutes', alternative: 'Leg press' },
  { day: 'C', order: 2, name: 'Machine Chest Press or Dumbbell Bench', targetSets: 3, repRange: '8–12', rest: '2 min', muscles: 'Chest / triceps', alternative: 'Bench press' },
  { day: 'C', order: 3, name: 'Assisted Pull-Up or Lat Pulldown', targetSets: 3, repRange: '8–12', rest: '2 min', muscles: 'Lats / biceps', alternative: 'Neutral-grip pulldown' },
  { day: 'C', order: 4, name: 'Hip Thrust or Glute Drive', targetSets: 2, repRange: '8–12', rest: '90 sec', muscles: 'Glutes / hamstrings', alternative: 'Back extension' },
  { day: 'C', order: 5, name: 'Face Pull or Reverse Pec Deck', targetSets: 2, repRange: '12–15', rest: '60–90 sec', muscles: 'Rear delts / upper back', alternative: 'Cable reverse fly' },
  { day: 'C', order: 6, name: 'Cable Triceps Pressdown', targetSets: 2, repRange: '10–15', rest: '60–90 sec', muscles: 'Triceps', alternative: 'Machine dip' },
  { day: 'C', order: 7, name: 'Plank', targetSets: 2, repRange: '30–60 sec', rest: '60 sec', muscles: 'Core', alternative: 'Dead bug' },
];

export const days: TrainingDay[] = ['A', 'B', 'C'];

export function targetLabel(exercise: RoutineExercise) {
  return `${exercise.targetSets} × ${exercise.repRange}`;
}

export function workingSetsForWeek(exercise: RoutineExercise, week: number) {
  return week <= 2 ? Math.min(2, exercise.targetSets) : exercise.targetSets;
}
