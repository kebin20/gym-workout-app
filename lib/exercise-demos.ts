export type ExerciseDemoVariant = {
  label: string;
  gif: string;
  cues: readonly string[];
  note?: string;
};

export type ExerciseDemo = {
  variants: readonly ExerciseDemoVariant[];
};

const gifRoot =
  'https://raw.githubusercontent.com/mohamedatef90/exercise-library/main/gifs';

export const exerciseDemoSource =
  'https://github.com/mohamedatef90/exercise-library';

function variant(
  label: string,
  gif: string,
  cues: readonly string[],
  note?: string,
): ExerciseDemoVariant {
  return { label, gif: `${gifRoot}/${gif}`, cues, note };
}

const exerciseDemos: Record<string, ExerciseDemo> = {
  'Back Squat or Hack Squat': {
    variants: [
      variant('Back squat', 'iYzB0Cz.gif', [
        'Brace before you descend and keep your ribs stacked over your pelvis.',
        'Let your knees track in the same direction as your toes.',
        'Drive through your whole foot and keep the bar path controlled.',
      ]),
      variant('Hack squat', 'Qa55kX1.gif', [
        'Keep your back and hips supported by the pad throughout the rep.',
        'Lower only as far as you can without your pelvis lifting.',
        'Push through your whole foot without snapping the knees straight.',
      ]),
    ],
  },
  'Bench Press or Machine Chest Press': {
    variants: [
      variant('Bench press', 'EIeI8Vf.gif', [
        'Set your shoulder blades back and down before you unrack.',
        'Lower with control toward mid-chest while keeping your feet planted.',
        'Press smoothly without letting your shoulders roll forward.',
      ]),
      variant('Machine chest press', 'wDN97Ca.gif', [
        'Set the seat so the handles begin around mid-chest height.',
        'Keep your shoulder blades against the pad as you press.',
        'Finish with control rather than forcefully locking your elbows.',
      ]),
    ],
  },
  'Lat Pulldown': {
    variants: [
      variant('Lat pulldown', 'eYnzaCm.gif', [
        'Start by drawing your shoulders down away from your ears.',
        'Pull your elbows toward your sides while keeping your chest tall.',
        'Return the bar slowly until your lats are lengthened.',
      ]),
    ],
  },
  'Seated Leg Curl': {
    variants: [
      variant(
        'Leg curl pattern',
        'C5jncD2.gif',
        [
          'Keep your hips still and line your knee up with the machine pivot.',
          'Curl through a comfortable range without lifting from the seat.',
          'Control the return instead of letting the weight stack drop.',
        ],
        'The animation shows the same knee-curl pattern from a standing machine. Use your seated-machine setup as programmed.',
      ),
    ],
  },
  'Dumbbell or Cable Lateral Raise': {
    variants: [
      variant('Dumbbell lateral raise', 'DsgkuIt.gif', [
        'Keep a soft bend in your elbows and lead with them.',
        'Raise to around shoulder height without shrugging.',
        'Lower slowly and avoid swinging the dumbbells.',
      ]),
      variant('Cable lateral raise', 'goJ6ezq.gif', [
        'Stand tall with the cable pulling across your body.',
        'Lead with your elbow and keep your shoulder away from your ear.',
        'Use a smooth arc and control the cable back to the start.',
      ]),
    ],
  },
  'Cable Crunch': {
    variants: [
      variant('Cable crunch', 'WW95auq.gif', [
        'Keep your hips mostly fixed as your rib cage curls toward your pelvis.',
        'Move through your trunk rather than pulling with your arms.',
        'Pause briefly in the shortened position and return under control.',
      ]),
    ],
  },
  'Romanian Deadlift (DB, barbell or Smith)': {
    variants: [
      variant('Romanian deadlift', 'wQ2c4XD.gif', [
        'Keep a small knee bend and send your hips backward.',
        'Keep the load close to your legs and your spine steady.',
        'Stop when your hamstrings limit the hinge, then drive the hips forward.',
      ]),
    ],
  },
  'Machine or Dumbbell Shoulder Press': {
    variants: [
      variant('Machine shoulder press', '67n3r98.gif', [
        'Set the seat so the handles start close to shoulder height.',
        'Keep your ribs down and your back supported.',
        'Press upward smoothly without shrugging at the top.',
      ]),
      variant('Dumbbell shoulder press', 'znQUdHY.gif', [
        'Stack your wrists over your elbows at the bottom.',
        'Keep your trunk braced instead of leaning back.',
        'Press smoothly overhead and lower with control.',
      ]),
    ],
  },
  'Seated Cable Row': {
    variants: [
      variant('Seated cable row', 'fUBheHs.gif', [
        'Sit tall and keep your torso quiet as you begin the pull.',
        'Drive your elbows back and gently squeeze your shoulder blades.',
        'Reach forward under control without rounding aggressively.',
      ]),
    ],
  },
  'Leg Press': {
    variants: [
      variant('Leg press', '2Qh2J1e.gif', [
        'Keep your hips and lower back supported by the pad.',
        'Lower until you reach a stable, comfortable depth.',
        'Push through your whole foot and avoid locking out forcefully.',
      ]),
    ],
  },
  'Incline Dumbbell or Machine Chest Press': {
    variants: [
      variant('Incline dumbbell press', 'ns0SIbU.gif', [
        'Set your shoulder blades against the bench before pressing.',
        'Keep your forearms roughly vertical at the bottom.',
        'Press up and slightly inward without bouncing out of the stretch.',
      ]),
    ],
  },
  'Dumbbell or Cable Biceps Curl': {
    variants: [
      variant('Dumbbell curl', 'BU15nH4.gif', [
        'Keep your upper arms close to your sides.',
        'Curl without swinging your torso or driving the elbows forward.',
        'Squeeze briefly, then lower through the full range.',
      ]),
      variant('Cable curl', 'G08RZcQ.gif', [
        'Stand tall and keep your elbows fixed near your sides.',
        'Curl against the cable without leaning backward.',
        'Control the return until the elbows are comfortably extended.',
      ]),
    ],
  },
  'Bulgarian Split Squat or Hack Squat': {
    variants: [
      variant('Bulgarian split squat', 'qx4fgX7.gif', [
        'Set a stance that lets your front foot stay flat throughout.',
        'Lower the back knee while keeping the front knee tracking over the toes.',
        'Drive through the front leg and keep your hips level.',
      ]),
      variant('Hack squat', 'Qa55kX1.gif', [
        'Keep your back and hips supported by the pad throughout the rep.',
        'Lower only as far as you can without your pelvis lifting.',
        'Push through your whole foot without snapping the knees straight.',
      ]),
    ],
  },
  'Machine Chest Press or Dumbbell Bench': {
    variants: [
      variant('Machine chest press', 'wDN97Ca.gif', [
        'Set the seat so the handles begin around mid-chest height.',
        'Keep your shoulder blades against the pad as you press.',
        'Finish with control rather than forcefully locking your elbows.',
      ]),
      variant('Dumbbell bench press', 'SpYC0Kp.gif', [
        'Plant your feet and set your shoulder blades against the bench.',
        'Lower the dumbbells with your wrists stacked over your elbows.',
        'Press smoothly while keeping your shoulders stable.',
      ]),
    ],
  },
  'Assisted Pull-Up or Lat Pulldown': {
    variants: [
      variant('Assisted pull-up', 'kiJ4Z2K.gif', [
        'Begin from a long-arm position with your shoulders controlled.',
        'Pull your elbows down toward your sides instead of reaching your chin.',
        'Lower slowly to regain the full starting position.',
      ]),
      variant('Lat pulldown', 'eYnzaCm.gif', [
        'Start by drawing your shoulders down away from your ears.',
        'Pull your elbows toward your sides while keeping your chest tall.',
        'Return the bar slowly until your lats are lengthened.',
      ]),
    ],
  },
  'Hip Thrust or Glute Drive': {
    variants: [
      variant(
        'Hip thrust pattern',
        'qg2PGl6.gif',
        [
          'Keep your upper back supported and your chin gently tucked.',
          'Drive through your feet until your hips reach a comfortable lockout.',
          'Finish with the glutes rather than overextending your lower back.',
        ],
        'The animation uses a bench-supported glute bridge, which demonstrates the same hip-extension pattern.',
      ),
    ],
  },
  'Face Pull or Reverse Pec Deck': {
    variants: [
      variant('Reverse pec deck', 'xiHiJcA.gif', [
        'Set the handles around shoulder height and keep your chest supported.',
        'Move from the shoulders while keeping a soft bend in your elbows.',
        'Squeeze the rear shoulders, then return without letting the stack drop.',
      ]),
    ],
  },
  'Cable Triceps Pressdown': {
    variants: [
      variant('Cable pressdown', 'dU605di.gif', [
        'Keep your upper arms close to your sides.',
        'Extend your elbows without rocking your torso.',
        'Control the cable upward while keeping tension on the triceps.',
      ]),
    ],
  },
  Plank: {
    variants: [
      variant(
        'Front plank',
        'VBAWRPG.gif',
        [
          'Brace as if preparing for a punch and keep breathing.',
          'Keep your head, rib cage, pelvis, and heels in one long line.',
          'End the set when your hips sag or your lower back takes over.',
        ],
        'The animation includes added load. Perform the bodyweight version unless your program calls for progression.',
      ),
    ],
  },
};

const aliases: readonly [string, string][] = [
  ['bulgarian split squat', 'Bulgarian Split Squat or Hack Squat'],
  ['hack squat', 'Back Squat or Hack Squat'],
  ['back squat', 'Back Squat or Hack Squat'],
  ['bench press', 'Bench Press or Machine Chest Press'],
  ['chest press', 'Machine Chest Press or Dumbbell Bench'],
  ['lat pulldown', 'Lat Pulldown'],
  ['leg curl', 'Seated Leg Curl'],
  ['lateral raise', 'Dumbbell or Cable Lateral Raise'],
  ['cable crunch', 'Cable Crunch'],
  ['romanian deadlift', 'Romanian Deadlift (DB, barbell or Smith)'],
  ['shoulder press', 'Machine or Dumbbell Shoulder Press'],
  ['cable row', 'Seated Cable Row'],
  ['leg press', 'Leg Press'],
  ['incline dumbbell', 'Incline Dumbbell or Machine Chest Press'],
  ['biceps curl', 'Dumbbell or Cable Biceps Curl'],
  ['pull-up', 'Assisted Pull-Up or Lat Pulldown'],
  ['pull up', 'Assisted Pull-Up or Lat Pulldown'],
  ['hip thrust', 'Hip Thrust or Glute Drive'],
  ['glute drive', 'Hip Thrust or Glute Drive'],
  ['face pull', 'Face Pull or Reverse Pec Deck'],
  ['reverse pec', 'Face Pull or Reverse Pec Deck'],
  ['triceps pressdown', 'Cable Triceps Pressdown'],
  ['tricep pressdown', 'Cable Triceps Pressdown'],
  ['plank', 'Plank'],
] as const;

export function exerciseDemoFor(name: string): ExerciseDemo | null {
  const exact = exerciseDemos[name];
  if (exact) return exact;

  const normalizedName = name.toLowerCase();
  const matchedKey = aliases.find(([alias]) =>
    normalizedName.includes(alias),
  )?.[1];
  return matchedKey ? exerciseDemos[matchedKey] : null;
}
