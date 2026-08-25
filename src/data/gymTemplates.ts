import type { GymTemplate, EnduranceTemplate } from "@/types";

export const TEMPLATES_STORAGE_KEY = "hybrid-athlete-gym-templates";
export const ENDURANCE_TEMPLATES_KEY = "hybrid_athlete_endurance_templates";

export const DEFAULT_GYM_TEMPLATES: GymTemplate[] = [
  {
    id: "tpl-upper-push",
    name: "Upper Push",
    type: "gym",
    exercises: [
      { 
        id: "ex-bp",  
        name: "Bankdrücken",     
        sets: [
          { id: "bp-1", type: "working", targetReps: 8 },
          { id: "bp-2", type: "working", targetReps: 8 },
          { id: "bp-3", type: "working", targetReps: 8 },
          { id: "bp-4", type: "working", targetReps: 8 },
        ]
      },
      { 
        id: "ex-ohp", 
        name: "Schulterdrücken", 
        sets: [
          { id: "ohp-1", type: "working", targetReps: 8 },
          { id: "ohp-2", type: "working", targetReps: 8 },
          { id: "ohp-3", type: "working", targetReps: 8 },
        ]
      },
      { 
        id: "ex-dip", 
        name: "Dips",            
        sets: [
          { id: "dip-1", type: "working", targetReps: 10 },
          { id: "dip-2", type: "working", targetReps: 10 },
          { id: "dip-3", type: "working", targetReps: 10 },
        ]
      },
      { 
        id: "ex-lr",  
        name: "Seitheben",       
        sets: [
          { id: "lr-1", type: "working", targetReps: 15 },
          { id: "lr-2", type: "working", targetReps: 15 },
          { id: "lr-3", type: "working", targetReps: 15 },
        ]
      },
    ],
  },
  {
    id: "tpl-upper-pull",
    name: "Upper Pull",
    type: "gym",
    exercises: [
      {
        id: "ex-pu",
        name: "Klimmzüge",
        sets: [
          { id: "pu-1", type: "working", targetReps: 6 },
          { id: "pu-2", type: "working", targetReps: 6 },
          { id: "pu-3", type: "working", targetReps: 6 },
        ],
      },
      {
        id: "ex-row",
        name: "Langhantelrudern",
        sets: [
          { id: "row-1", type: "working", targetReps: 8 },
          { id: "row-2", type: "working", targetReps: 8 },
          { id: "row-3", type: "working", targetReps: 8 },
        ],
      },
      {
        id: "ex-fp",
        name: "Face Pulls",
        sets: [
          { id: "fp-1", type: "working", targetReps: 15 },
          { id: "fp-2", type: "working", targetReps: 15 },
          { id: "fp-3", type: "working", targetReps: 15 },
        ],
      },
      {
        id: "ex-bc",
        name: "Bizepscurls",
        sets: [
          { id: "bc-1", type: "working", targetReps: 10 },
          { id: "bc-2", type: "working", targetReps: 10 },
          { id: "bc-3", type: "working", targetReps: 10 },
        ],
      },
    ],
  },
  {
    id: "tpl-lower-body",
    name: "Lower Body",
    type: "gym",
    exercises: [
      { 
        id: "ex-sq",   
        name: "Kniebeugen",                    
        sets: [
          { id: "sq-1", type: "working", targetReps: 6 },
          { id: "sq-2", type: "working", targetReps: 6 },
          { id: "sq-3", type: "working", targetReps: 6 },
        ]
      },
      { 
        id: "ex-rdl",  
        name: "Rumänisches Kreuzheben",        
        sets: [
          { id: "rdl-1", type: "working", targetReps: 8 },
          { id: "rdl-2", type: "working", targetReps: 8 },
          { id: "rdl-3", type: "working", targetReps: 8 },
        ]
      },
      { 
        id: "ex-srdl", 
        name: "Einbeiniges Kreuzheben",        
        sets: [
          { id: "srdl-1", type: "working", targetReps: 8 },
          { id: "srdl-2", type: "working", targetReps: 8 },
        ]
      },
      { 
        id: "ex-cr",   
        name: "Wadenheben mit Ball",           
        sets: [
          { id: "cr-1", type: "working", targetReps: 15 },
          { id: "cr-2", type: "working", targetReps: 15 },
          { id: "cr-3", type: "working", targetReps: 15 },
        ]
      },
    ],
  },
  {
    id: "tpl-mobility-fullbody",
    name: "Full Body Mobility & Hüftöffner",
    type: "mobility",
    exercises: [
      { id: "mob-1", name: "Couch Stretch (Hüftbeuger)", sets: [{ id: "m1", type: "working", targetDuration: 60 }, { id: "m2", type: "working", targetDuration: 60 }] },
      { id: "mob-2", name: "Deep Squat Hold (Tiefe Kniebeuge)", sets: [{ id: "m3", type: "working", targetDuration: 90 }] },
      { id: "mob-3", name: "World's Greatest Stretch", sets: [{ id: "m4", type: "working", targetReps: 8 }, { id: "m5", type: "working", targetReps: 8 }] },
      { id: "mob-4", name: "90/90 Hip Flow", sets: [{ id: "m6", type: "working", targetReps: 10 }] },
    ],
  },
  {
    id: "tpl-postrun-stretch",
    name: "Post-Run Stretch & Faszien-Flow",
    type: "stretching",
    exercises: [
      { id: "str-1", name: "Wadendehnen an der Wand", sets: [{ id: "s1", type: "working", targetDuration: 60 }] },
      { id: "str-2", name: "Hamstring Floss (Beinbeuger)", sets: [{ id: "s2", type: "working", targetReps: 12 }] },
      { id: "str-3", name: "Fußsohlen-Mobilisation mit Ball", sets: [{ id: "s3", type: "working", targetDuration: 90 }] },
    ],
  },
];

export const DEFAULT_ENDURANCE_TEMPLATES: EnduranceTemplate[] = [
  {
    id: "tpl-end-ftp-4x4",
    name: "Rad: 4x4 Min Schwellen-Intervalle",
    type: "cycling",
    description: "4x 4 Min @ 95–105% FTP (Zone 4) mit 3 Min aktiver Kurbelpause. Gesamtdauer ca. 60 Min.",
    estimatedDuration: "60 Min",
  },
  {
    id: "tpl-end-z2-long",
    name: "Rad: Zone 2 Base Endurance Ride",
    type: "cycling",
    description: "2–4 Stunden aerobes Grundlagentraining @ 60–75% FTP. Optimiert Fettstoffwechsel & Mitochondriendichte.",
    estimatedDuration: "120–180 Min",
  },
  {
    id: "tpl-end-run-z2",
    name: "Lauf: Zone 2 Basislauf",
    type: "running",
    description: "45–60 Min lockerer Dauerlauf (Puls < 75% HFmax). Beibehaltung der aeroben Basis ohne ZNS-Ermüdung.",
    estimatedDuration: "45 Min",
  },
];
