// ─── Wger Exercise & Muscle Anatomy Service ──────────────────────────────────

export interface MuscleGroupInfo {
  id: string;
  nameGerman: string;
  nameLatin: string;
  category: "upper_body" | "lower_body" | "core";
  description: string;
  primaryExercises: string[];
}

export interface ExerciseDetail {
  id: string;
  name: string;
  category: "chest" | "back" | "legs" | "shoulders" | "arms" | "core";
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: "barbell" | "dumbbell" | "cable" | "bodyweight" | "machine";
  executionTips: string[];
  commonMistakes: string[];
  hybridFocus: string;
}

export const MUSCLE_GROUPS: MuscleGroupInfo[] = [
  {
    id: "chest",
    nameGerman: "Brustmuskulatur",
    nameLatin: "Pectoralis Major & Minor",
    category: "upper_body",
    description: "Hauptverantwortlich für horizontale Drückbewegungen und Schulteradduktion.",
    primaryExercises: ["Bankdrücken (Flach & Schräg)", "Dips", "Kabelzug-Flys", "Liegestütze"],
  },
  {
    id: "back_lats",
    nameGerman: "Breiter Rückenmuskel",
    nameLatin: "Latissimus Dorsi",
    category: "upper_body",
    description: "Zieht die Oberarme nach hinten-unten. Essentiell für V-Form und Haltung.",
    primaryExercises: ["Klimmzüge", "Latzug", "Langhantelrudern", "Kurzhantelrudern"],
  },
  {
    id: "quads",
    nameGerman: "Vordere Oberschenkelmuskeln",
    nameLatin: "Quadriceps Femoris",
    category: "lower_body",
    description: "Kniestreckung. Hauptmuskel für Kniebeugen, Antritte beim Laufen und Rad-Druckphase.",
    primaryExercises: ["Kniebeugen (Back/Front)", "Beinpresse", "Ausfallschritte", "Beinstrecker"],
  },
  {
    id: "hamstrings",
    nameGerman: "Hintere Oberschenkel / Beinbeuger",
    nameLatin: "Ischiokrurale Muskulatur (Hamstrings)",
    category: "lower_body",
    description: "Kniebeugung und Hüftstreckung. Schlüsselmuskel für Sprintgeschwindigkeit und Verletzungsprophylaxe.",
    primaryExercises: ["Rumänisches Kreuzheben (RDL)", "Beinbeuger liegend/sitzend", "Nordic Curls", "Good Mornings"],
  },
  {
    id: "shoulders",
    nameGerman: "Schultermuskeln",
    nameLatin: "Deltoideus (Vorder-, Mittel-, Hinterteil)",
    category: "upper_body",
    description: "Armabduktion und Überkopfdrücken. Stabilisiert den Schultergürtel.",
    primaryExercises: ["Military Press / Schulterdrücken", "Seitheben", "Face Pulls", "Reverse Flys"],
  },
  {
    id: "glutes",
    nameGerman: "Gesäßmuskulatur",
    nameLatin: "Gluteus Maximus & Medius",
    category: "lower_body",
    description: "Stärkster Hüftstrecker im Körper. Maximiert Vortrieb beim Sprinten und Radfahren.",
    primaryExercises: ["Hip Thrusts", "Kreuzheben", "Bulgarian Split Squats", "Kabelzug-Kickbacks"],
  },
];

export const EXERCISE_DATABASE: ExerciseDetail[] = [
  {
    id: "bench_press",
    name: "Langhantel-Bankdrücken",
    category: "chest",
    primaryMuscles: ["Pectoralis Major", "Trizeps"],
    secondaryMuscles: ["Vordere Schulter (Deltoideus Anterior)", "Serratus Anterior"],
    equipment: "barbell",
    executionTips: [
      "Schulterblätter zusammen und nach unten ziehen (Retraktion).",
      "Leichtes Hohlkreuz (Brücke) und feste Fußstellung für stabile Kraftübertragung.",
      "Stange kontrolliert bis zum unteren Brustbein absenken und kraftvoll nach oben drücken.",
    ],
    commonMistakes: [
      "Ellenbogen im 90°-Winkel abspreizen (belastet die Rotatorenmanschette).",
      "Abfedern der Hantel auf dem Brustkorb.",
    ],
    hybridFocus: "Entwickelt maximale Oberkörper-Druckkraft ohne die aerobe Beinerholung zu beeinträchtigen.",
  },
  {
    id: "squat",
    name: "Langhantel-Kniebeuge (Back Squat)",
    category: "legs",
    primaryMuscles: ["Quadriceps", "Gluteus Maximus"],
    secondaryMuscles: ["Adduktoren", "Unterer Rücken (Erector Spinae)", "Bauchmuskeln"],
    equipment: "barbell",
    executionTips: [
      "Füße etwas mehr als schulterbreit, Zehen leicht nach außen gedreht.",
      "Brust aufrecht halten, Bauchwand anspannen (Valsalva-Manöver).",
      "Hüfte nach hinten-unten führen, bis die Oberschenkel mindestens parallel zum Boden sind.",
    ],
    commonMistakes: [
      "Knie knicken nach innen ein (Valgus-Kollaps).",
      "Fersen heben vom Boden ab.",
    ],
    hybridFocus: "Erzeugt enorme neuronale Rekrutierung und Beinkraft für Antritte und Bergauf-Passagen.",
  },
  {
    id: "deadlift",
    name: "Kreuzheben (Deadlift)",
    category: "back",
    primaryMuscles: ["Hamstrings", "Gluteus Maximus", "Unterer Rücken"],
    secondaryMuscles: ["Latissimus", "Trapez", "Unterarme (Griffkraft)", "Quadrizeps"],
    equipment: "barbell",
    executionTips: [
      "Stange eng an den Schienbeinen halten.",
      "Rücken gerade halten, Lats anspannen ('Schulterblätter in die Hosentasche').",
      "Durch die Fersen drücken und Hüfte nach vorne schieben.",
    ],
    commonMistakes: [
      "Runder Rücken (erhöht Bandscheibendruck).",
      "Hantel zu weit vom Körper entfernt heben.",
    ],
    hybridFocus: "Baut eine kugelsichere posteriore Kette auf, die Läufer vor Knie- und Rückenschmerzen schützt.",
  },
  {
    id: "pull_up",
    name: "Klimmzüge (Pull-Ups)",
    category: "back",
    primaryMuscles: ["Latissimus Dorsi", "Bizeps"],
    secondaryMuscles: ["Rhomboiden", "Trapez (unterer Teil)", "Brachialis"],
    equipment: "bodyweight",
    executionTips: [
      "Aus dem vollen Hängen starten (Dead Hang) und die Schulterblätter aktiv nach unten ziehen.",
      "Brust zur Stange ziehen, bis das Kinn über der Stange ist.",
      "Kontrolliert und ohne Schwung absenken.",
    ],
    commonMistakes: [
      "Unvollständige Bewegungsamplitude (kein voller Lockout unten).",
      "Kippen / Schwingen mit den Beinen.",
    ],
    hybridFocus: "Optimiert das relative Kraft-zu-Körpergewicht-Verhältnis für Kletter- und Laufökonomie.",
  },
];
