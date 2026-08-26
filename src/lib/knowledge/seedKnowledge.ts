import type { KnowledgeUnit } from "@/types/knowledge";

/**
 * Kuratiertes Seed-Korpus für die Wissensbasis: die kanonischen, gut
 * belegten Kernprinzipien des Hybrid-Trainings (Ausdauerverteilung,
 * Interferenz-Effekt, Kraftdosis, Fueling, Regeneration).
 *
 * Alle Einheiten verweisen auf reale Publikationen; Zusammenfassungen sind
 * bewusst konservativ formuliert. Das Seed-Korpus macht das RAG-Modul sofort
 * funktionsfähig – eigene PDFs ergänzen es via /api/kb/ingest.
 */

export interface SeedKnowledgeUnit extends KnowledgeUnit {
  /** Stabile ID → idempotentes Re-Seeden (Upsert). */
  id: string;
}

export const SEED_KNOWLEDGE_UNITS: SeedKnowledgeUnit[] = [
  {
    id: "seed--seiler-2010-polarized",
    title: "Polarisierte Intensitätsverteilung (80/20)",
    principle:
      "Der Großteil des Ausdauervolumens (ca. 75–80 %) wird wirklich leicht trainiert, eine kleine Menge gezielt hart – kaum Mittelzonen-Volumen.",
    summary:
      "Seiler beschreibt auf Basis von Längsschnitt- und Querschnittsstudien an Elite-Ausdauerathleten zwei dominante Intensitätsverteilungen: polarisiert (ca. 75–80 % der Trainingszeit unter der ersten Ventilationsschwelle, ca. 5 % im Schwellenbereich, 15–20 % hochintensiv über der zweiten Schwelle) und pyramidenförmig (mehr Schwellenvolumen). Ein rein schwellenlastiger Stil ('threshold-heavy') ist bei erfolgreichen Athleten kaum zu finden. Für Hybrid-Athleten folgt daraus: leichte Einheiten müssen konsequent leicht bleiben (Zone 1–2, Gesprächsniveau), damit die Qualitätseinheiten (VO2max/Schwellen) und Kraftsessions mit voller Intensität absolviert werden können.",
    keyFindings: [
      "Erfolgreiche Elite-Ausdauerathleten absolvieren typischerweise 70–90 % ihres Volumens im niedrigen Intensitätsbereich.",
      "Polarisierte Verteilung: ~75/5/20 (leicht/schwelle/hart) – alternativ pyramidenförmig mit moderatem Schwellenanteil.",
      "Zu viel Zeit in den mittleren Intensitätszonen erhöht die Belastung, ohne den spezifischen Adaptationsreiz harter Einheiten zu erzeugen.",
      "Die '80/20'-Faustregel gilt als pragmatische Umsetzung für die Wochenplanung.",
    ],
    practicalGuidelines: [
      "Leichte Ausdauereinheiten strikt auf Zone 1–2 begrenzen – auch wenn sich mehr feels better.",
      "Nur 2–3 Qualitätseinheiten pro Woche (Intervalle/Wettkampfspezifisch) einplanen und davor/danach echte Erholung lassen.",
      "Bei paralleler Kraftarbeit zuerst die harten Sessions terminieren und die Zonen-2-Läufe/-Rides als Füllvolumen drumherum legen.",
    ],
    citation: {
      authors: "Seiler, S.",
      year: 2010,
      title: "What is Best Practice for Training Intensity and Duration Distribution in Endurance Athletes?",
      journal: "International Journal of Sports Physiology and Performance",
    },
    topics: ["polarized training", "intensity distribution", "80/20 rule", "endurance", "zone 2", "pyramidal model"],
  },
  {
    id: "seed--stoggl-sperlich-2014-distribution",
    title: "Polarisiert vs. Schwellenorientiert bei trainierten Athleten",
    principle:
      "Bei bereits gut trainierten Athleten verbessert polarisierte Verteilung Ausdauerleistungsfähigkeit tendenziell stärker als schwellenbetonte Modelle.",
    summary:
      "Stöggl & Sperlich fassen Studien zur Trainingsintensitätsverteilung zusammen und zeigen, dass gut trainierte Läufer, Radfahrer und Triathleten auf polarisierte Blöcke (hohe Anteile Zone 1 + gezielte HIIT-Einheiten) mit größeren Verbesserungen von VO2max, Zeitfahrt- und Laufleistung reagierten als auf schwellenorientierte Programme mit hohem Mittelzonenumfang. Für Fortgeschrittene ist also nicht 'mehr mittelhart', sondern 'leichter leicht, härter hart' der wirksamere Hebel. Gleichzeitig betonen die Autoren individuelle Anpassungen und Blockperiodisierung als sinnvolle Werkzeuge.",
    keyFindings: [
      "9-wöchige polarisierte Blöcke führten bei gut Trainierten zu größeren Leistungszuwächsen als threshold-fokussierte Kontrolle.",
      "Hohes Mittelzonen-Volumen erzeugt Ermüdung ohne maximalen Adaptationsreiz für VO2max oder Wirtschaftlichkeit.",
      "Elite-Ausdauerathleten kombinieren über die Saison verteilt polare und pyramidale Phasen.",
    ],
    practicalGuidelines: [
      "Im fortgeschrittenen Stadium Intensität polarisieren statt Schwellentempo als Standard-Einheit zu fahren.",
      "Schwellenarbeiten gezielt als Block einsetzen (z. B. Wettkampfannahme), nicht permanent.",
    ],
    citation: {
      authors: "Stöggl, T.; Sperlich, B.",
      year: 2014,
      title: "The Training Intensity Distribution Among Well-Trained and Elite Endurance Athletes",
      journal: "Frontiers in Physiology",
    },
    topics: ["polarized vs threshold", "training intensity distribution", "endurance performance", "hiit"],
  },
  {
    id: "seed--helgerud-2007-vo2max-intervals",
    title: "4×4-Minuten-Intervalle für VO2max",
    principle:
      "Lange Intervalle bei 90–95 % HRmax (4×4 min, aktive Pause 3 min) steigern VO2max wirksamer als Dauerlauf oder Tempodauerlauf.",
    summary:
      "Helgerud et al. verglichen vier Laufprogramme (Dauerlauf ~70 % HRmax, Tempodauerlauf nahe der Schwelle, 15/15-Intervalle und 4×4 min bei 90–95 % HRmax; jeweils 3×/Woche über 8 Wochen). Nur die Intervallgruppen verbesserten VO2max signifikant – am meisten die 4×4-Gruppe (+7,2 %), begleitet von größerem Schlagvolumen. Die Übertragbarkeit auf Radfahren ist etabliert (gleiche Steuerung über Herzfrequenz bzw. Leistung). Für Hybrid-Athleten ist das 4×4-Format ein effizienter VO2max-Reiz, der sich gut neben einer Kraftroutine managen lässt, sofern der Abstand zum schweren Krafttraining ausreichend groß ist.",
    keyFindings: [
      "VO2max-Anstieg nach 8 Wochen: +7,2 % (4×4 min), +5,5 % (15/15), kein signifikanter Effekt in LSD- und Tempostruktur.",
      "Steuerung: 4 min bei 90–95 % HFmax, 3 min aktive Erholung bei ~60–70 % HFmax.",
      "Verbesserte Schlagvolumen- und Herzfunktion erklärt den Großteil des Effekts.",
    ],
    practicalGuidelines: [
      "1–2 VO2max-Sessions pro Woche als Intervallformat (z. B. 4×4 min Laufen oder Rad) planen.",
      "Aufwärmen vor den Intervallen nicht abkürzen (≥10 min locker + kurze Steigerungen).",
      "Mindestens 6 Stunden Abstand zu schweren Kniebeugen/Kraftsessions halten bzw. auf einen anderen Tag legen.",
    ],
    citation: {
      authors: "Helgerud, J.; Høydal, K.; Wang, E.; Karlsen, T.; Berg, P.; Bjerkaas, M.; Simonsen, T.; Helgesen, C.; Hjorth, N.; Bach, R.; Hoff, J.",
      year: 2007,
      title: "Aerobic High-Intensity Intervals Improve V̇O2max More Than Moderate Training",
      journal: "Medicine & Science in Sports & Exercise",
    },
    topics: ["vo2max", "hiit", "4x4 intervals", "interval training", "running", "cycling"],
  },
  {
    id: "seed--gibala-2012-low-volume-hiit",
    title: "Low-Volume-HIIT als zeiteffizienter Alternativreiz",
    principle:
      "Wenige kurze, sehr intensive Intervalle erzeugen viele mitochondriale Adaptationen vergleichbar deutlich längerem moderatem Ausdauertraining – bei drastisch geringerem Zeitaufwand.",
    summary:
      "Gibala et al. resümieren, dass niedrig-volumiges HIIT/SIT (z. B. 6–10 × 1 min intensiv oder wiederholte 30-s-Sprints) bei gesunden Personen und Patientengruppen ähnliche Verbesserungen der mitochondrialen Enzymkapazität, Glykogenresynthese und Ausdauerleistung erzielt wie klassisches kontinuierliches Training mit vielfach höherem Zeitaufwand. Für Hybrid-Athleten mit begrenzter Budgetierung ist HIIT daher ein Werkzeug gegen Zeitknappheit – aber kein vollständiger Ersatz für Grundlagenumfang, weil Gesamtvolumen und periphere Anpassungen (Kapillarisierung, Wirtschaftlichkeit) weiterhin volumenabhängig bleiben.",
    keyFindings: [
      "Vergleichbare Anstiege mitochondrialer Enzyme durch wenige intensive Intervalle trotz ~90 % weniger Trainingszeit.",
      "Sprint-Intervalltraining (30 s all-out) verbessert Insulinsensitivität und aerobe Kapazität effizient.",
      "Limitierend: geringeres absolutes Volumen → kleinere Effekte auf Wirtschaftlichkeit und Kapillardichte.",
    ],
    practicalGuidelines: [
      "In stressigen Wochen Qualität vor Quantität: 1 kurze HIIT-Session statt ausfallender langen Einheit.",
      "HIIT-Dosis gegenüber Kraftvolumen budgetieren – beide belasten die untere Extremität stark.",
    ],
    citation: {
      authors: "Gibala, M.J.; Little, J.P.; MacDonald, M.J.; Hawley, J.A.",
      year: 2012,
      title: "Physiological Adaptations to Low-Volume, High-Intensity Interval Training in Health and Disease",
      journal: "The Journal of Physiology",
    },
    topics: ["hiit", "sprint interval training", "mitochondrial adaptations", "time efficient training"],
  },
  {
    id: "seed--wilson-2012-interference-meta",
    title: "Interferenz-Effekt: Laufen stört mehr als Radfahren",
    principle:
      "Simultanes Ausdauertraining dämpft Kraft- und Hypertrophiezuwächse – am stärksten bei langem Laufen, kaum beim Radfahren und bei kurzen intensiven Intervallen.",
    summary:
      "Die Metaanalyse von Wilson et al. quantifiziert den Concurrent-Training-Interference-Effekt: Kombinierte Programme erzielten kleinere Kraft- und Hypertrophiezunahmen als reines Krafttraining. Die Störung wuchs mit Frequenz (>~3 Ausdauereinheiten/Woche) und Dauer (>20–30 min je Session) des Ausdauertrainings und war beim Laufen ausgeprägter als beim Radfahren. Kurz-hochintensive Intervalle störten weniger als lange gleichmäßige Belastungen. Praktisch heißt das für Hybrid-Athleten: Radfahren als bevorzugtes Ausdauermedium wählen, wenn Muskelzuwachs Priorität hat, Ausdauerfrequenz/-dauer dosieren und Kraftprioritäten in Phasen legen.",
    keyFindings: [
      "Interferenz ist dosisabhängig: mehr und längere Ausdauereinheiten → kleinerer Kraft-/Hypertrophieeffekt.",
      "Laufen interferiert signifikant stärker mit Kraftentwicklung als Radfahren.",
      "Hohe Ausdauerintensität mit kurzer Dauer stört weniger als lange niedrig-intensive Belastung.",
    ],
    practicalGuidelines: [
      "Wenn Muskelaufbau Priorität hat: Ausdauer primär als Radfahren und/oder kurze intensive Intervalle umsetzen.",
      "Laufumfang bei Hypertrophiephasen reduzieren oder auf Erhaltungsminima kappen.",
      "Maximal ~3 interferierende Ausdauereinheiten pro Woche während Kraftfokusblöcken.",
    ],
    citation: {
      authors: "Wilson, J.M.; Marin, P.J.; Rhea, M.R.; Wilson, S.M.; Loenneke, J.P.; Anderson, J.C.",
      year: 2012,
      title: "Concurrent Training: A Meta-Analysis Examining Interference of Aerobic and Resistance Exercises",
      journal: "Journal of Strength and Conditioning Research",
    },
    topics: ["concurrent training", "interference effect", "cycling vs hypertrophy", "running", "meta-analysis"],
  },
  {
    id: "seed--murach-bagley-2016-cycling-interference",
    title: "Radfahren minimiert Interferenz mit Muskelwachstum",
    principle:
      "Die Belege für einen Hypertrophie-Interferenz-Effekt sind schwächer als oft angenommen – insbesondere Radfahren zeigt kaum Abschwächung von Kraft- und Muskelzuwachs.",
    summary:
      "Murach & Bagley hinterfragen die verbreitete Annahme eines starken Interferenzeffekts kritisch: Viele Studien leiden unter Designschwächen (ungeübte Probanden, unrealistische Ausdauerdosen). Wo Ausdauertraining als Radfahren umgesetzt wurde, blieben Hypertrophie- und Kraftzuwäche weitgehend erhalten – teils sogar mit additiven Effekten auf Beinmuskulatur. Der Interferenz-Effekt ist demnach real, aber modality- und dosisabhängig deutlich kleiner als die Faustregel 'Ausdauer killt Muskeln' suggeriert.",
    keyFindings: [
      "Concurrent Cycling zeigte in mehreren Studien keine relevante Reduktion von Hypertrophie oder Maximalkraft.",
      "Interferenznachweise stammen überwiegend aus Langstreckenlauf-Protokollen mit hohem Umfang.",
      "Methodische Limitationen (Trainingserfahrung, Kalorienbilanz) erklären Teile der berichteten Effekte.",
    ],
    practicalGuidelines: [
      "Radfahren als Standard-Ausdauermodalität wählen, wenn Kraft/Masse erhalten oder aufgebaut werden soll.",
      "Kalorien- und Proteinzufuhr an erhöhten Gesamtbedarf anpassen – Interferenz verstärkt sich im Defizit.",
    ],
    citation: {
      authors: "Murach, K.A.; Bagley, J.R.",
      year: 2016,
      title: "Skeletal Muscle Hypertrophy With Concurrent Exercise Training: Contrary Evidence for an Interference Effect",
      journal: "Sports Medicine",
    },
    topics: ["interference effect", "cycling", "hypertrophy", "concurrent training"],
  },
  {
    id: "seed--coffey-hawley-2017-scheduling",
    title: "Session-Sequencing: ≥6 h Abstand zwischen Kraft und intensivem Ausdauer",
    principle:
      "Konkurrierende molekulare Signalwege (AMPK↔mTOR) lassen sich zeitlich entkoppeln: schweres Krafttraining und intensive Ausdauereinheiten möglichst ≥6 Stunden auseinanderlegen bzw. auf verschiedene Tage verteilen.",
    summary:
      "Coffey & Hawley diskutieren die akute molekulare Interferenz: Ausdaueraktivität aktiviert AMPK-PGC1α-Signale, Krafttraining primär mTOR-abhängige Proteinsynthese; starke gleichzeitige Aktivierung kann die adaptive Priorität verschieben. Die akute Beeinflussung ist abhängig von Modalität, Intensität und Dauer und lässt sich durch Sequenzierung mildern. Abgeleitete Praxis (auch konsistent mit Concurrent-Training-Reviews): Bei Kombination am selben Tag mindestens ~6 Stunden zwischen schwerer Krafteinheit (insbesondere tiefen Kniebeugen) und VO2max-Intervallen einplanen, die priorisierte Modalität zuerst trainieren und nach der Sekundär-Session ausreichend Kohlenhydrate und Protein zuführen. Noch sauberer: Trennung auf verschiedene Tage.",
    keyFindings: [
      "Akute Signalinterferenz ist kontextabhängig (Modalität, Intensität, Dauer) – kein pauschales 'Ausdauer blockiert Kraft'.",
      "Zeitliche Trennung der Modalitäten mildert die Konkurrenz um Adaptationswege.",
      "Trainingsreihenfolge sollte der Priorität folgen: Hauptziel zuerst, wenn beides am selben Tag nötig ist.",
    ],
    practicalGuidelines: [
      "Schwere Kniebeugen und VO2max-Intervalle niemals unmittelbar hintereinander – mind. 6 h Abstand oder verschiedene Tage.",
      "Priorisierte Disziplin in die tageszeitlich bessere/frischere Session legen.",
      "Nach der zweiten Session sofort refueln (CHO + Protein), um die Erholung nicht zu kappen.",
    ],
    citation: {
      authors: "Coffey, V.G.; Hawley, J.A.",
      year: 2017,
      title: "Concurrent Exercise Training: Do Opposites Interfere?",
      journal: "The Journal of Physiology",
    },
    topics: ["session spacing", "ampk mtor interference", "concurrent training scheduling", "squats vo2max spacing"],
  },
  {
    id: "seed--ronnestad-mujika-2014-strength-endurance",
    title: "Schweres Krafttraining verbessert Ausdauerökonomie",
    principle:
      "Zusätzliche low-volume, high-load-Krafteinheiten (≥~80 % 1RM, 2×/Woche) verbessern Lauf- und Radökonomie sowie Zeitfahrleistung, ohne Ausdaueranpassungen zu stören.",
    summary:
      "Rønnestad & Mujika fassen Studien zusammen, in denen Ausdauerathleten durch ergänzendes schweres/explosives Krafttraining ihre Ökonomie, Leistung bei kurzen langen Sprintentscheidungen und Zeitfahrleistungen verbesserten. Entscheidend sind geringes Volumen (wenige Übungen, 3–10 Wiederholungen hoher Last), Explosivität in der Konzentrik und Fortführung – in reduzierter Form auch im Wettkampfzeitraum – da die Effekte sonst rasch abklingen. Für Hybrid-Athleten ist Kraft ohnehin Zielgröße; hier bestätigt sich die Kompatibilität beider Ziele bei korrekter Dosis.",
    keyFindings: [
      "Heavy Resistance Training (2×/Woche, ~4–10 RM) verbesserte Bewegungsökonomie und Zeitfahrtleistung bei Radfahrern/Läufern.",
      "Effekte klingen ohne Erhaltungstraining innerhalb weniger Wochen ab.",
      "High-volume/light-load-Stütztraining zeigte kleinere Effekte als schwere Lasten.",
    ],
    practicalGuidelines: [
      "2×/Woche schwere Grundübungen (Kniebeuge, Kreuzheben, Ausfallschritte) auch in Ausdauerphasen halten.",
      "Im Wettkampfzeitraum auf 1×/Woche Erhaltungsvolumen reduzieren statt komplett streichen.",
    ],
    citation: {
      authors: "Rønnestad, B.R.; Mujika, I.",
      year: 2014,
      title: "Optimizing Strength Training for Running and Cycling Endurance Performance: A Review",
      journal: "Scandinavian Journal of Medicine & Science in Sports",
    },
    topics: ["strength training endurance", "running economy", "cycling economy", "heavy resistance training"],
  },
  {
    id: "seed--schoenfeld-2010-hypertrophy-mechanisms",
    title: "Progressive Overload & Hypertrophie-Mechanismen",
    principle:
      "Mechanische Spannung ist der Haupttreiber der Hypertrophie – Fortschritt erfordert systematisch steigende Belastung (Progressive Overload) über Gewicht, Wiederholungen, Sätze oder Frequenz.",
    summary:
      "Schoenfelds Review systematisiert die drei postulierten Hypertrophie-Mechanismen – mechanische Spannung, metabolischer Stress und Muskelschädigung – mit mechanischer Spannung als bestbelegtem Kern. Daraus leitet sich die Programmgestaltung ab: progressive Mehrbelastung, moderate bis hohe Volumina, Intensitätsbereiche von ~5 RM bis ~30 RM können bei Annäherung ans Muskelversagen wachsen, wobei schwere Lasten die Kraftentwicklung begünstigen. Ohne gesteigerten Reiz (mehr Last/Wdh./Sätze) stagniert die Adaption; ohne Regenerationsphasen droht Überlastung.",
    keyFindings: [
      "Mechanische Spannung gilt als dominanter Hypertrophie-Stimulus; metabolischer Stress wirkt unterstützend.",
      "Hypertrophie ist über breite Wiederholungsbereiche möglich, solange Sätze nahe am Versagen ausgeführt werden.",
      "Progressive Überlastung (Last, Volumen, Frequenz oder Range of Motion) ist Voraussetzung für anhaltende Anpassung.",
    ],
    practicalGuidelines: [
      "Pro Übung pro Woche messbaren Fortschritt anstreben (+1 Wiederholung oder +2,5 kg), Deload bei Plateau/Ermüdung.",
      "Compound-Lifts schwer (3–8 RM), Isolation moderater (8–15+ RM) – immer 0–3 RIR.",
      "Wochenvolumen schrittweise steigern, Sprünge >10 % vermeiden (Verletzungsrisiko).",
    ],
    citation: {
      authors: "Schoenfeld, B.J.",
      year: 2010,
      title: "The Mechanisms of Muscle Hypertrophy and Their Application to Resistance Training",
      journal: "Journal of Strength and Conditioning Research",
    },
    topics: ["progressive overload", "muscle hypertrophy", "mechanical tension", "resistance training programming"],
  },
  {
    id: "seed--schoenfeld-2017-volume-dose-response",
    title: "Wochen-Volumen-Dosis: ≥10 Sätze pro Muskelgruppe",
    principle:
      "Mehr wöchentliche Sätze pro Muskelgruppe (bis ~10–20+) führen dosisabhängig zu mehr Hypertrophie; <10 Sätze/Woche ist suboptimal für Aufbauziele.",
    summary:
      "Die Meta-Regression von Schoenfeld, Ogborn & Krieger zeigt einen dosisabhängigen Zusammenhang zwischen wöchentlichem Satzvolumen pro Muskelgruppe und Muskeldickenzuwachs: Höhere Volumina (>10 Sätze/Woche) erwiesen sich als überlegen gegenüber niedrigeren, mit Hinweisen auf weitere Vorteile bis in höhere Bereiche. Die praktische Übersetzung für Hybrid-Athleten: In Aufbauphasen mindestens ~10 harte Sätze pro Zielmuskelgruppe/Woche verteilt auf 2–3 Einheiten; in Erhaltungsphasen genügen deutlich weniger Sätze (~3–6), was mit hohem Ausdauervolumen vereinbar bleibt.",
    keyFindings: [
      "Dosis-Wirkungs-Beziehung: mehr Sätze/Woche → mehr Hypertrophie (bis zum individuellen Recovery-Limit).",
      "≥10 Sätze pro Muskelgruppe und Woche übertrafen niedrigere Dosen signifikant.",
      "Volumen auf mehrere Weekly-Sessions verteilen, um Qualität pro Satz zu sichern.",
    ],
    practicalGuidelines: [
      "Aufbau: 10–16 Sätze/Woche pro Zielmuskel, verteilt auf 2–3 Sessions.",
      "Erhalt während hoher Ausdauerblöcke: 3–6 Sätze/Woche pro Muskelgruppe reichen meist.",
    ],
    citation: {
      authors: "Schoenfeld, B.J.; Ogborn, D.; Krieger, J.W.",
      year: 2017,
      title: "Dose-Response Relationship Between Weekly Resistance Training Volume and Increases in Muscle Mass: A Systematic Review and Meta-Analysis",
      journal: "Journal of Sports Sciences",
    },
    topics: ["training volume", "sets per muscle per week", "hypertrophy dose response"],
  },
  {
    id: "seed--grgic-2018-rest-intervals",
    title: "Pausenzeiten: 2–3 Minuten bei Grundübungen",
    principle:
      "Längere Pausen (~2–3 min) bei Compound-Übungen erhalten Volumenqualität und führen zu mehr Kraft- und Hypertrophiezuwachs als kurze Pausen ≤1 Minute.",
    summary:
      "Systematische Übersichtsarbeiten zu Pausenintervallen zeigen, dass 1–3 (bzw. >3) Minuten Pause bei schweren Grundübungen die Gesamttrainingsvolumen- und Reproduzierbarkeit verbessern und zu stärkeren Zuwächsen an Kraft und Muskelmasse führen als sehr kurze Pausen, obwohl letztere mehr 'metabolischen Stress' erzeugen. Kurze Pausen bleiben für Isolationsübungen und Metabolik-Zusatzelemente (Dropsets) legitim. Hybrid-Athleten sollten Pausen nicht als Zeitverschwendung kappen, wenn Kraftaufbau Priorität hat – stattdessen Pausen mit Mobilitäts-/Übergangsarbeit füllen.",
    keyFindings: [
      "Rest 2–3 min > 60 s für Maximalkraft- und Hypertrophiezuwachs bei Compound-Lifts.",
      "Kurze Pausen reduzieren das absolvierte Volumen bei hohen Lasten deutlich.",
      "Isolationsübungen tolerieren kürzere Pausen ohne relevanten Qualitätsverlust.",
    ],
    practicalGuidelines: [
      "Kniebeuge/Kreuzheben/Bankdrücken: 2–3+ min Pause, Isolation: 45–90 s.",
      "Bei knapper Zeit lieber Übungen streichen als Pausen massiv verkürzen.",
    ],
    citation: {
      authors: "Grgic, J.; Lazinica, B.; Mikulic, P.; Krieger, J.W.; Schoenfeld, B.J.",
      year: 2018,
      title: "The Effects of Short Versus Long Rest Interval Durations in Resistance Training on Measures of Muscle Strength and Hypertrophy: A Systematic Review",
      journal: "European Journal of Sport Science",
    },
    topics: ["rest intervals", "resistance training", "strength hypertrophy"],
  },
  {
    id: "seed--morton-2018-protein",
    title: "Proteinbedarf: ~1,6 g/kg/Tag (Obergrenze ~2,2)",
    principle:
      "Für Maximaleffekt des Krafttrainings reicht eine tägliche Proteinzufuhr um ~1,6 g/kg Körpergewicht; deutlich darüber hinausgehende Mengen bringen keinen zusätzlichen Hypertrophieeffekt.",
    summary:
      "Morton et al. aggregieren RCTs zu Proteinsupplementation kombiniert mit Krafttraining: Die Zuwächse an fettfreier Masse und 1RM steigen mit der Proteinzufuhr bis zu einem Plateau bei im Schnitt ~1,62 g/kg/Tag (oberes 95 %-KI ~2,2 g/kg). Das Timing einzelner Portionen ist zweitrangig gegenüber der Tagesgesamtmenge; eine Aufnahme auf 3–4 Mahlzeiten mit je ~0,3–0,4 g/kg ist eine vernünftige Umsetzung. Hybrid-Athleten mit hohem Kalorienverbrauch sollten die Gesamtmenge zusätzlich gegen Energieverfügbarkeit abprüfen.",
    keyFindings: [
      "Plateau der Proteineffekte bei ~1,62 g/kg/Tag (95 %-KI-Obergrenze 2,2 g/kg).",
      "Gesamttagesmenge dominiert das Timing-Fenster um das Training.",
      "Verteilung über 3–4 Portionen à ~0,3–0,4 g/kg als pragmatisches Muster.",
    ],
    practicalGuidelines: [
      "Täglich 1,6–2,2 g/kg Eiweiß anpeilen, im Defizit eher am oberen Rand.",
      "Jede Hauptmahlzeit enthält eine Proteinquelle mit ~30–40 g.",
    ],
    citation: {
      authors: "Morton, R.W.; Murphy, K.T.; McKellar, S.R.; Schoenfeld, B.J.; Henselmans, M.; Helms, E.; Aragon, A.A.; Devries, M.C.; Banfield, L.; Krieger, J.W.; Phillips, S.M.",
      year: 2018,
      title: "A Systematic Review, Meta-Analysis and Meta-Regression of the Effect of Protein Supplementation on Resistance Training-Induced Gains in Muscle Mass and Strength",
      journal: "British Journal of Sports Medicine",
    },
    topics: ["protein intake", "1.6 g per kg", "nutrition periodization", "muscle protein synthesis"],
  },
  {
    id: "seed--impey-2018-fuel-for-work-required",
    title: "Kohlenhydrat-Periodisierung: Fuel for the Work Required",
    principle:
      "Kohlenhydratverfügbarkeit strategisch an die Session-Anforderungen koppeln: volle CHO-Vorräte für Qualitätseinheiten, selektive 'train-low'-Sessions als zusätzlicher Signalreiz – nie chronisch niedrig.",
    summary:
      "Impey et al. formulieren das Rahmenwerk 'Fuel for the Work Required': Die CHO-Zufuhr wird periodisiert – hoch vor/nach Schlüssel- und Intervallsessions, um Qualität und Adaptation zu sichern; ausgewählte leichte Einheiten mit reduzierter CHO-Verfügbarkeit durchgeführt, um mitochondriale Signalamplifikation (z. B. PGC-1α) zu nutzen. Chronisch niedrige Energieverfügbarkeit (RED-S-Risiko: Hormon-, Knochen-, Immunschäden) ist explizit nicht gemeint. Für Hybrid-Athleten heißt das: schwere Kraft- und VO2max-Tage carb-forward, lockere Zone-2-Einheiten gelegentlich nüchtern/low-CHO, Tagesbudget an Gesamtbelastung koppeln.",
    keyFindings: [
      "Selektives Trainieren mit niedriger CHO-Verfügbarkeit amplifiziert zellulare Trainingssignale.",
      "Qualitätssessions profitieren klar von vollen Glykogenspeichern – train-low nur an leichten Tagen einsetzen.",
      "Chronische Energieunterversorgung gefährdet Performance, Hormonstatus und Knochengesundheit (RED-S).",
    ],
    practicalGuidelines: [
      "Vor Intervallen und schweren Krafteinheiten ausreichend CHO (z. B. 1–2 g/kg in den 3–4 h davor).",
      "1–2 leichte Zone-2-Einheiten/Woche optional nüchtern oder CHO-reduziert – nie an Schlüsseltagen.",
      "Tägliches Energiebudget ≥ Bedarf an harten Tagen halten; Defizite nur geplant in Off-Weeks.",
    ],
    citation: {
      authors: "Impey, S.G.; Hearris, M.A.; Hammond, K.M.; Bartlett, J.D.; Louis, J.; Close, G.L.; Morton, J.P.",
      year: 2018,
      title: "Fuel for the Work Required: A Theoretical Framework for Endurance Sports Nutrition",
      journal: "Sports Medicine",
    },
    topics: ["carbohydrate periodization", "train low compete high", "fuel for the work required", "sports nutrition"],
  },
  {
    id: "seed--jeukendrup-2017-gut-training",
    title: "Darmtraining für höhere Fueling-Raten",
    principle:
      "Der GI-Trakt ist trainierbar: regelmäßige Exposition mit ~60–90 g CHO/h im Training erhöht die tolerierte Aufnahmerate und senkt Magen-Darm-Beschwerden.",
    summary:
      "Jeukendrup zeigt, dass Magenentleerung und intestinale Absorption (GLUT-Transporter) an die Zufuhr adaptieren. Athleten, die im Training systematisch Kohlenhydratraten von 60–90 g/h (Mischung Glukose:Fruktose ~2:1) üben, vertragen Wettkampfraten besser, leiden weniger unter GI-Problemen und können höhere Arbeitseffekte realisieren. Für Hybrid-Athleten releviert dies lange Rides/Läufe: Fueling ist Teil des Trainings, nicht nur der Renntaglogik. Hydration interagiert – Dehydrierung verschlimmert GI-Symptome.",
    keyFindings: [
      "Wiederholte CHO-Exposition im Training erhöht Malabsorptionsschwelle und Absorptionskapazität.",
      "Praktische Zielfenster: 60 g/h einfache Quellen; bis 90 g/h mit Glukose+Fruktose-Mix.",
      "GI-Beschwerden korrelieren mit Dehydrierung und ungeübten hohen Raten – beides trainierbar.",
    ],
    practicalGuidelines: [
      "In langen Ausdauereinheiten (>90 min) Fueling-Raten bewusst trainieren und steigern.",
      "Renntagsstrategie = exakt die im Training erprobte Strategie.",
    ],
    citation: {
      authors: "Jeukendrup, A.E.",
      year: 2017,
      title: "Training the Gut for Athletes",
      journal: "Sports Medicine",
    },
    topics: ["gut training", "carbohydrate intake", "fueling strategy", "gi distress"],
  },
  {
    id: "seed--gabbett-2016-acwr",
    title: "Load-Management: ACWR 0,8–1,3 als Schutzzone",
    principle:
      "Verletzungsrisiko steigt vor allem bei schnellen Belastungsspitzen: das Verhältnis akuter (7 Tage) zu chronischer (28 Tage) Wochenlast sollte grob 0,8–1,3 bleiben; Werte >1,5 gelten als Risikobereich.",
    summary:
      "Gabbetts 'Training-Injury Prevention Paradox': Nicht hohe chronische Last ist das Problem, sondern große Diskrepanz zwischen aktueller und gewohnter Belastung. Athleten mit hoher chronischer Workload tolerieren Spitzen besser; abrupte Steigerungen (ACWR >1,5) sind mit deutlich erhöhtem Verletzungsrisiko assoziiert. Für Hybrid-Athleten heißt das: Volumensteigerungen schrittweise (~≤10 %/Woche), regelmäßige Down-Wochen einbauen, und bei Garmin-ACWR-Warnungen die geplanten Qualitätssessions reduzieren statt das Volumen weiter zu pushen.",
    keyFindings: [
      "ACWR-Sweet Spot ~0,8–1,3; >1,5 assoziiert mit deutlich erhöhtem Verletzungsrisiko.",
      "Hohe chronische Workload wirkt protektiv gegenüber Spitzenbelastungen.",
      "Belastungsspitzen entstehen häufig durch Rückkehr nach Pause plus Sofort-Vollgas.",
    ],
    practicalGuidelines: [
      "Wochenvolumen max. ~10 % steigern; nach Ausfallwoche bei ~80 % des alten Niveaus wiedereinstiegen.",
      "Alle 3–4 Wochen eine Deload-Woche (-30–50 % Volumen, Intensität erhalten) einplanen.",
    ],
    citation: {
      authors: "Gabbett, T.J.",
      year: 2016,
      title: "The Training–Injury Prevention Paradox: Should Athletes be Training Smarter and Harder?",
      journal: "British Journal of Sports Medicine",
    },
    topics: ["acwr", "load management", "injury prevention", "progressive overload", "deload"],
  },
  {
    id: "seed--mujika-padilla-2003-tapering",
    title: "Tapering: Volumen raus, Intensität halten",
    principle:
      "Vor Wettkämpfen bringt eine 1–3-wöchige Reduktion des Volumens (~40–60 %) bei gehaltener Intensität und Frequenz ~2–3 % Leistungssteigerung.",
    summary:
      "Mujika & Padilla fassen die wissenschaftlichen Grundlagen des Tapers zusammen: Die entscheidenden Stellschrauben sind Volumenreduktion (progressiv oder exponentiell, typisch 40–60 %), beibehaltene Trainingsintensität und weitgehend gehaltene Frequenz (≥80 % der üblichen Sessions). Zu viel Intensitätsverlust oder komplette Ruhe führt zu Detraining statt Superkompensation. Hybrid-Athleten tapern idealerweise das Gesamtbudget (Kraft + Ausdauer): Kraftfrequenz halten bei reduzierten Sätzen, Ausdauerintensität kurz halten, Umfang deutlich senken.",
    keyFindings: [
      "Optimierter Taper verbessert Leistung um ~2–3 % (Zeitfahren, VO2max-Tests).",
      "Volumen -40–60 %, Intensität & Frequenz halten – klassische Fehler sind zu wenig Intensität oder zu langer Taper.",
      "Erholungsindikatoren (HRV, Stimmung, Muskelkater) normalisieren sich während korrekten Tapers.",
    ],
    practicalGuidelines: [
      "8–14 Tage vor Zielwettkampf Volumen stufenweise halbieren, kurze Intensitätselemente behalten.",
      "Letzte harte Session ≥3 Tage vor dem Wettkampf, davor nur lockere Aktivierung.",
    ],
    citation: {
      authors: "Mujika, I.; Padilla, S.",
      year: 2003,
      title: "Scientific Bases for Precompetition Tapering Strategies",
      journal: "Sports Medicine",
    },
    topics: ["tapering", "competition preparation", "supercompensation", "volume reduction"],
  },
  {
    id: "seed--meeusen-2013-overtraining",
    title: "Übertraining erkennen: FOR/NFOR/OTS-Spektrum",
    principle:
      "Leistungsabfall trotz weiterer Belastung ist ein Alarmsignal: funktionelle Überreichung (FOR) erholt sich in Tagen bis Wochen, nicht-funktionelle (NFOR) in Wochen bis Monaten, echtes Overtraining-Syndrom (OTS) dauert Monate – Prävention via Monitoring und Periodisierung.",
    summary:
      "Der ECSS/ACSM-Konsensus (Meeusen et al.) definiert das Kontinuum von geplanter Überreichung bis OTS und betont, dass die Diagnose primär klinisch-performanzbasiert ist: anhaltender Leistungsabfall, Stimmungsveränderungen, Schlaf- und Appetitstörungen nach ≥2 Wochen Erholung. Kein Einzelbiomarker ist hinreichend; hilfreich sind Trendbeobachtung von Performance, HRV/Ruhepuls, Schlaf und Stimmung. Für Hybrid-Athleten mit doppelter Belastungsachse ist die wichtigste Prävention strukturierte Periodisierung mit regelmäßigen Erholungswochen und konsequenter Reaktion auf Frühwarnzeichen.",
    keyFindings: [
      "Abgrenzung FOR → NFOR → OTS erfolgt über die Erholungsdauer, nicht über Einzelwerte.",
      "Stimmungsprofil, Leistungsabfall und Schlafstörungen sind die sensitivsten Praxismarker.",
      "Geplantes Overreaching (Tage) kann Leistung später verbessern – unbehandeltes NFOR/OTS nicht.",
    ],
    practicalGuidelines: [
      "Bei ≥2 Wochen stagnierender/fallender Performance trotz Erholung: Belastung drastisch senken und Ursachen prüfen (Energie, Schlaf, Eisen).",
      "Deload-Wochen und Schlafpriorität als feste Programmkomponenten, nicht als Notmaßnahmen.",
    ],
    citation: {
      authors: "Meeusen, R.; Duclos, M.; Foster, C.; Fry, A.; Gleeson, M.; Nieman, D.; Raglin, J.; Rietjens, G.; Steinacker, J.; Urhausen, A.",
      year: 2013,
      title: "Prevention, Diagnosis, and Treatment of the Overtraining Syndrome: Joint Consensus Statement of the European College of Sport Science and the American College of Sports Medicine",
      journal: "European Journal of Sport Science",
    },
    topics: ["overtraining syndrome", "functional overreaching", "recovery monitoring", "hrv"],
  },
  {
    id: "seed--fullagar-2015-sleep",
    title: "Schlaf als Regenerationsfundament",
    principle:
      "Schlafrestriktion beeinträchtigt Leistung, kognitive Funktionen, Glukosemetabolismus und Immunabwehr – Schlafverlängerung und Nickerchen sind wirksame Regenerationswerkzeuge.",
    summary:
      "Fullagar et al. resümieren, dass verkürzter oder fragmentierter Schlaf mit reduzierter Ausdauer- und Kraftleistung, schlechterer Reaktionsfähigkeit, eingeschränkter Glukosetoleranz und erhöhter Verletzungsanfälligkeit einhergeht. Schlafextension (Ziel ≥7–9 h für Athleten), strategische Nickerchen (20–30 min) und konsistente Schlafzeiten verbessern Erholung und Trainingsadaptation. Für Hybrid-Athleten gilt: Bei Schlafdefizit zuerst Schlaf reparieren, bevor zusätzliche Qualitätssessions ertragen werden sollen – Readiness-Daten (Garmin) spiegeln das direkt wider.",
    keyFindings: [
      "Schlaf <7 h verschlechtert Ausdauerleistung, Kraftausdauer und technische Präzision.",
      "Schlafmangel reduziert Glykogenresynthese und erhöht Entzündungsmarker.",
      "Schlafextension und kurze Mittagsschlaf-Nickerchen verbessern Leistung und Erholungswerte.",
    ],
    practicalGuidelines: [
      "Bei Readiness/Schlafscore deutlich unter Normalwert: Qualitätssession gegen lockere Zone-1-Einheit tauschen.",
      "Regelmäßige Schlafenszeiten priorisieren; vor harten Morgen-Sessions auf ≥7 h Schlaf achten.",
    ],
    citation: {
      authors: "Fullagar, H.H.K.; Skorski, S.; Duffield, R.; Hammes, D.; Coutts, A.J.; Meyer, T.",
      year: 2015,
      title: "Sleep and Athletic Performance: The Effects of Sleep on Exercise and Recovery",
      journal: "Sports Medicine",
    },
    topics: ["sleep recovery", "sleep restriction", "athlete sleep", "readiness"],
  },
];
