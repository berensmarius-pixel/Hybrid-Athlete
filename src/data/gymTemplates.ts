import type { GymTemplate } from "@/types";

export const TEMPLATES_STORAGE_KEY = "hybrid-athlete-gym-templates";

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
];
