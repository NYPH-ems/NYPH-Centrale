const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");const path = require("path");
const app = express();const PORT = process.env.PORT || 8080;

app.use(express.json());
// Sert le dossier publicapp.use(express.static(path.join(__dirname, "public")));
// Page principaleapp.get("/", (req, res) => {res.sendFile(path.join(__dirname, "index.html"));})
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});


/* =========================================================
   CONFIGURATION DISCORD
========================================================= */


const DISCORD = {
  CLIENT_ID:
    process.env.DISCORD_CLIENT_ID || "1536167878959825038",


  CLIENT_SECRET:
    process.env.DISCORD_CLIENT_SECRET || "ze0Qj2ScjBAns6aB4XQg0ZloXAlPycSt",


  REDIRECT_URI:
    process.env.DISCORD_REDIRECT_URI ||
    "https://lsmc-centrale.up.railway.app/auth/discord/callback",


  SERVER_ID: "1468459512313680040",


  EMS_ROLE_ID: "1468461862822744115",


  DIRECTOR_ROLE_ID: "1468461658195230760",


  // Rôle "citoyen" : accès limité à l'espace Services (Rendez-vous / Candidature)
  CITIZEN_ROLE_ID: "1536691503085129769"
};


/* =========================================================
   EXPRESS
========================================================= */


// Le champ image (base64) des interventions peut être assez lourd,
// on augmente donc la limite du body JSON (100kb par défaut).
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));


app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "CHANGE-ME-EMS-SESSION-SECRET",


    resave: false,


    saveUninitialized: false,


    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);


app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   DATABASE
========================================================= */


const db = new Database("/data/database.db");


db.pragma("journal_mode = WAL");


db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    is_ems INTEGER DEFAULT 0,
    is_director INTEGER DEFAULT 0,
    job TEXT,
    grade TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );


  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date TEXT,
    sex TEXT,
    phone TEXT,
    emergency_contact TEXT,
    blood_type TEXT,
    height TEXT,
    weight TEXT,
    allergies TEXT,
    status TEXT DEFAULT 'Patient',
    notes TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    title TEXT NOT NULL,
    comments TEXT,
    care_items TEXT,
    free_billing TEXT,
    total REAL DEFAULT 0,
    is_official INTEGER DEFAULT 0,
    location TEXT,
    status TEXT DEFAULT 'Terminée',
    image TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    updated_by INTEGER,
    FOREIGN KEY(patient_id) REFERENCES patients(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    slot1 TEXT,
    slot2 TEXT,
    confirmed_slot TEXT,
    phone TEXT,
    motif TEXT,
    status TEXT DEFAULT 'A traiter',
    assigned_to INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(assigned_to) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    first_name TEXT,
    last_name TEXT,
    birth_date TEXT,
    phone TEXT,
    medical_experience TEXT,
    motivation TEXT,
    status TEXT DEFAULT 'Nouvelle',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    reason TEXT,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service TEXT NOT NULL,
    matricule TEXT,
    motif TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );


  CREATE TABLE IF NOT EXISTS document_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    updated_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );
`);


/* =========================================================
   MIGRATIONS (ajout de colonnes sur bases existantes)
========================================================= */


function ensureColumn(table, column, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(c => c.name);


  if (!columns.includes(column)) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}


ensureColumn("users", "job", "TEXT");
ensureColumn("users", "grade", "TEXT");
// Pseudo utilisé sur le serveur Discord (nickname du membre), affiché
// partout à la place du "vrai" nom d'utilisateur Discord.
ensureColumn("users", "nickname", "TEXT");
// Rôle "citoyen" : accès restreint à l'espace Services.
ensureColumn("users", "is_citizen", "INTEGER DEFAULT 0");
// Jetons Discord conservés pour pouvoir revérifier les rôles du membre
// périodiquement (déconnexion automatique en cas de retrait d'un rôle).
ensureColumn("users", "discord_access_token", "TEXT");
ensureColumn("users", "discord_refresh_token", "TEXT");
ensureColumn("users", "discord_token_expires_at", "TEXT");


ensureColumn("patients", "sex", "TEXT");
ensureColumn("patients", "emergency_contact", "TEXT");
ensureColumn("patients", "height", "TEXT");
ensureColumn("patients", "weight", "TEXT");
ensureColumn("patients", "allergies", "TEXT");
ensureColumn("patients", "status", "TEXT DEFAULT 'Patient'");


ensureColumn("interventions", "comments", "TEXT");
ensureColumn("interventions", "care_items", "TEXT");
ensureColumn("interventions", "free_billing", "TEXT");
ensureColumn("interventions", "total", "REAL DEFAULT 0");
ensureColumn("interventions", "is_official", "INTEGER DEFAULT 0");
ensureColumn("interventions", "image", "TEXT");
ensureColumn("interventions", "updated_at", "TEXT");
ensureColumn("interventions", "updated_by", "INTEGER");


ensureColumn("appointments", "phone", "TEXT");


// Remboursement d'une note de frais, coché par la Direction et visible
// par l'employé concerné dans son onglet Frais & Factures.
ensureColumn("expenses", "refunded", "INTEGER DEFAULT 0");


// Couleur d'accent (bandeaux, titre) utilisée lors du rendu d'un
// modèle de document. Modifiable par le Directeur, par modèle.
ensureColumn("document_templates", "accent_color", "TEXT DEFAULT '#e5352b'");


db.prepare(`
  UPDATE patients
  SET status = 'Patient'
  WHERE status IS NULL
`).run();


db.prepare(`
  UPDATE services
  SET duration = 0
  WHERE duration IS NULL
`).run();


/*
  Si un ancien service possède une date de fin mais une durée
  vide ou incorrecte, on recalcule sa durée.
*/


const oldServices = db.prepare(`
  SELECT id, started_at, ended_at, duration
  FROM services
  WHERE ended_at IS NOT NULL
`).all();


const updateDuration = db.prepare(`
  UPDATE services
  SET duration = ?
  WHERE id = ?
`);


for (const service of oldServices) {
  const start = new Date(service.started_at);
  const end = new Date(service.ended_at);


  if (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime())
  ) {
    const calculated = Math.max(
      0,
      Math.floor((end - start) / 1000)
    );


    if (
      !Number.isFinite(service.duration) ||
      service.duration !== calculated
    ) {
      updateDuration.run(
        calculated,
        service.id
      );
    }
  }
}


/* =========================================================
   RÉGLAGES DU SITE (logo de l'établissement, etc.)


   Table clé/valeur à une seule ligne par clé. Le logo est stocké en
   base64 (PNG) et utilisé sur tous les documents générés. Modifiable
   uniquement par le Directeur, depuis Direction > Modèles.
========================================================= */


db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);


function getAppSetting(key) {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}


function setAppSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}


/* =========================================================
   MODÈLES DE DOCUMENTS PAR DÉFAUT


   Syntaxe des paramètres dans le contenu d'un modèle :
     {{cle}}                        -> champ texte libre
     {{cle|Option A;Option B}}      -> menu déroulant (-- Sélectionner --)
     {{signature}}                  -> emplacement réservé pour une image
                                        de signature (upload PNG)
     Une ligne contenant uniquement ---PAGE--- démarre une nouvelle page.


   Insérés une seule fois, uniquement si la table est vide (pour ne
   jamais écraser des modèles déjà créés/modifiés par la Direction).
   Le Directeur peut ensuite les modifier ou les supprimer librement
   depuis l'onglet Direction > Modèles.
========================================================= */


const DEFAULT_DOCUMENT_TEMPLATES = [
  {
    title: "Attestation médicale",
    accent_color: "#e5352b",
    content: `ATTESTATION MÉDICALE

Je soussigné(e), Dr. {{nom_medecin}}, certifie que :

Nom et prénom : {{nom_patient}}
Date de naissance : {{date_naissance}}

a été examiné(e) le {{date_examen}}.

Après examen, il est constaté que {{nom_patient}} présente un état de santé :
{{etat_sante|Apte;Inapte}} {{aptitude_ou_non|est apte;n'est pas apte}} à la pratique de {{activite}}.

Commentaires (facultatif) :
{{commentaires}}

En foi de quoi, je délivre la présente attestation pour servir et valoir ce que de droit.

Fait à New York, le {{date_delivrance}}
Signature du médecin,
{{signature}}`
  },
  {
    title: "Certificat médical",
    accent_color: "#e5352b",
    content: `CERTIFICAT MÉDICAL

Je soussigné(e), Dr. {{nom_medecin}}, certifie que :

Nom et prénom : {{nom_patient}}
Date de naissance : {{date_naissance}}

a été examiné(e) le {{date_examen}} et présente un état de santé nécessitant un {{type_arret|Arrêt de travail;Arrêt de sport;Dispense}} pour une durée de {{duree}}.

Diagnostic : {{diagnostic}}

Restrictions éventuelles : {{restrictions}}

Ce certificat est délivré à la demande du patient pour servir et valoir ce que de droit.

Fait à New York, le {{date_delivrance}}
Signature du médecin,
{{signature}}`
  },
  {
    title: "Acte de naissance",
    accent_color: "#e5352b",
    content: `ACTE DE NAISSANCE

En ma qualité de médecin, j'atteste Dr. {{nom_medecin}} que les informations suivantes concernant la naissance de l'enfant sont exactes et vérifiées. Ce document constitue un acte officiel consignant les éléments relatifs à cette naissance.

INFORMATIONS SUR L'ENFANT
Nom complet : {{nom_enfant}}
Date de naissance : {{date_naissance_enfant}}
Heure de naissance : {{heure_naissance}}
Lieu de naissance : NEW YORK - PRESBYTERIAN HOSPITAL
Sexe : {{sexe_enfant|Masculin;Féminin}}

INFORMATIONS SUR LES PARENTS
Nom complet du père : {{nom_pere}}
Date de naissance du père : {{date_naissance_pere}}
Lieu de naissance du père : {{lieu_naissance_pere}}
Nom complet de la mère : {{nom_mere}}
Date de naissance de la mère : {{date_naissance_mere}}
Lieu de naissance de la mère : {{lieu_naissance_mere}}

NATIONALITÉ(S)
Enfant : Américaine
Père : {{nationalite_pere}}
Mère : {{nationalite_mere}}

INFORMATIONS ADMINISTRATIVES
Date de rédaction de l'acte : {{date_redaction}}

Signature du médecin,
{{signature}}`
  },
  {
    title: "Acte de décès",
    accent_color: "#e5352b",
    content: `ACTE DE DÉCÈS

Je soussigné(e), Dr. {{nom_medecin}}, Médecin de NEW YORK - PRESBYTERIAN HOSPITAL,

Certifie que :

Nom et Prénom du défunt : {{nom_defunt}}
Date de naissance : {{date_naissance}}
Lieu de naissance : {{lieu_naissance}}
Couleur de peau : {{couleur_peau}}
Date et Heure du décès : {{date_heure_deces}}
Lieu du décès : NEW YORK - PRESBYTERIAN HOSPITAL
Cause du décès : {{cause_deces}}

Fait à New York le, {{date_delivrance}}
Signature du médecin,
{{signature}}`
  },
  {
    title: "Consultation gynécologique",
    accent_color: "#e5352b",
    content: `CONSULTATION GYNÉCOLOGIQUE

Nom et Prénom : {{nom_patiente}}
Date de naissance : {{date_naissance}}

MOTIF DE LA CONSULTATION
(symptômes rapportés : nausées, douleurs, fatigue…)
{{motif_consultation}}

ANTÉCÉDENTS MÉDICAUX ET OBSTÉTRICAUX
Grossesses précédentes : {{grossesses_precedentes|Oui;Non}}
Antécédents gynécologiques : {{antecedents_gyneco}}
Antécédents familiaux : {{antecedents_familiaux}}

EXAMEN CLINIQUE
Tension artérielle : {{tension_arterielle}} mmHg
Fréquence cardiaque : {{frequence_cardiaque}} bpm
Observations générales : {{observations_generales}}

EXAMENS RÉALISÉS
Echographie obstétricale : {{echographie|Réalisée;Non réalisée}}
Prise de sang : {{prise_de_sang|Réalisée;Non réalisée}}
Autres : {{autres_examens}}
---PAGE---
DIAGNOSTIC ET SUIVI

Terme estimé : {{terme_estime}} semaines
État général de la grossesse : {{etat_grossesse|Normal;À surveiller;Pathologique}}
Recommandations : {{recommandations}}

SUIVI
Prochain rendez-vous : {{prochain_rdv}} semaines
Conseils : {{conseils}}

Signature du médecin,
{{signature}}`
  },
  {
    title: "Kinésithérapie",
    accent_color: "#e5352b",
    content: `KINÉSITHÉRAPIE

Praticien : Dr. {{nom_medecin}}

INFORMATIONS GÉNÉRALES
Nom : {{nom_patient}}
Prénom : {{prenom_patient}}
Date de naissance : {{date_naissance}}
Date de la prise en charge : {{date_prise_en_charge}}

MOTIF DE CONSULTATION
{{motif_consultation}}

ÉTAT INITIAL
Douleur : {{douleur_initiale}}/10
Mobilité : {{mobilite_initiale}}
Observations : {{observations_initiales}}

INTERVENTION RÉALISÉE
{{intervention_realisee}}

RÉSULTATS IMMÉDIATS
Douleur après séance : {{douleur_finale}}/10
Mobilité : {{mobilite_finale}}

ORDONNANCE ET RECOMMANDATIONS
Repos : {{repos}}
Suivi : {{suivi}}
Médication (si besoin) : {{medication}}

Signature du médecin Kinésithérapie,
{{signature}}`
  },
  {
    title: "Rapport de consultation psychologique",
    accent_color: "#e5352b",
    content: `RAPPORT DE CONSULTATION PSYCHOLOGIQUE

Patient : {{nom_patient}}
Date : {{date_consultation}}

MOTIF DE LA CONSULTATION
Demandeur de la consultation : {{demandeur_consultation|Le patient lui-même;Un proche;Les services d'urgence;La justice}}
{{motif_consultation}}

IDENTIFICATION
Quel âge avez-vous ? {{age}}
Quelle est votre situation familiale ? {{situation_familiale}}
Travaillez-vous actuellement ? {{travaille_actuellement|Oui;Non}}
---PAGE---
ANTÉCÉDENTS PSYCHOLOGIQUES ET PSYCHIATRIQUES
Avez-vous déjà consulté un psychologue ou un psychiatre ? {{deja_consulte_psy|Oui;Non}}
Avez-vous reçu des diagnostics ? {{diagnostics_recus|Oui;Non}}
Avez-vous déjà suivi un traitement ? {{traitement_suivi|Oui;Non}}

ANTÉCÉDENTS MÉDICAUX
Avez-vous des maladies chroniques ou des blessures importantes ? {{maladies_chroniques|Oui;Non}}
Avez-vous été hospitalisé auparavant ? {{hospitalise_avant|Oui;Non}}
Prenez-vous actuellement des médicaments pour d'autres problèmes de santé ? {{medicaments_actuels|Oui;Non}}

HISTOIRE PERSONNELLE
{{histoire_personnelle}}

ANTÉCÉDENTS JUDICIAIRES
Avez-vous déjà eu des démêlés avec la justice ? {{demeles_justice|Oui;Non}}
Si oui, circonstances : {{circonstances_judiciaires}}
---PAGE---
ÉVÉNEMENTS STRESSANTS DE LA VIE
Avez-vous vécu des événements marquants ou stressants récemment ou dans le passé ? {{evenements_stressants|Oui;Non}}
Comment avez-vous réagi émotionnellement à ces événements ? {{reaction_emotionnelle}}

OBSERVATIONS COMPORTEMENTALES ET PROBLÈMES ÉNONCÉS
Apparence générale : {{apparence}}
Attitude : {{attitude}}
Raisonnement : {{raisonnement}}
Jugement : {{jugement}}
Humeur : {{humeur}}

CONCLUSIONS ET TRAITEMENTS RECOMMANDÉS
{{conclusions}}

Signature Médecin traitant,
{{signature}}`
  },
  {
    title: "Rendez-vous bilan",
    accent_color: "#e5352b",
    content: `RENDEZ-VOUS BILAN

Nom complet : {{nom_patient}}
Date de naissance : {{date_naissance}}
Date du bilan : {{date_bilan}}

MOTIF DU RENDEZ-VOUS
Motif principal : {{motif_principal}}
Symptômes rapportés : {{symptomes}}

EXAMEN CLINIQUE
Tension artérielle : {{tension_arterielle}}
Fréquence cardiaque : {{frequence_cardiaque}}
Fréquence respiratoire : {{frequence_respiratoire}}
Saturation en oxygène : {{saturation}}
Observations générales : {{observations}}

Prise de sang : {{prise_de_sang|Réalisée;Non réalisée}}
Analyse des urines : {{analyse_urines|Réalisée;Non réalisée}}

PLAN DE SUIVI
Traitement proposé : {{traitement}}
Recommandations : {{recommandations}}
Prochain rendez-vous : {{prochain_rdv}}

Fait le {{date_bilan}} par le Dr. {{nom_medecin}}
Signature du médecin,
{{signature}}`
  },
  {
    title: "Visite médicale",
    accent_color: "#e5352b",
    content: `VISITE MÉDICALE

INFORMATIONS DU PATIENT
Patient : {{nom_patient}}
Date : {{date_visite}}
Date de naissance : {{date_naissance}}
Alcool : {{alcool|Oui;Non}}
Tabac : {{tabac|Oui;Non}}
Stupéfiants : {{stupefiants|Oui;Non}}
Allergie : {{allergie}}
Diabète : {{diabete|Oui;Non}}
Asthme : {{asthme|Oui;Non}}
Pathologie cardiaque : {{pathologie_cardiaque|Oui;Non}}
Épilepsie : {{epilepsie|Oui;Non}}
Traitement en cours : {{traitement_en_cours}}

ANTÉCÉDENTS MÉDICAUX
{{antecedents_medicaux}}

SUIVI PSYCHOLOGIQUE/PSYCHIATRIQUE
{{suivi_psy|Oui;Non}}
---PAGE---
EXAMEN CLINIQUE
Tension artérielle : {{tension_arterielle}}
Fréquence cardiaque : {{frequence_cardiaque}}
Fréquence respiratoire : {{frequence_respiratoire}}
Saturation en oxygène : {{saturation}}
Température corporelle : {{temperature}}
Observations générales : {{observations}}

EXAMEN PHYSIQUE (IMC)
Poids : {{poids}}
Taille : {{taille}}
IMC : {{imc}}

TESTS VISUELS ET AUDITIFS
Oeil Droite : {{oeil_droite}}/10
Oeil Gauche : {{oeil_gauche}}/10
Oreille Droite : {{oreille_droite}}/10
Oreille Gauche : {{oreille_gauche}}/10
---PAGE---
CONCLUSION MÉDICALE
État général : {{etat_general}}
Recommandations spécifiques : {{recommandations}}

CERTIFICAT D'APTITUDE
Je soussigné, Dr. {{nom_medecin}}, certifie que le patient a passé avec succès sa visite médicale.

Fait le {{date_visite}}
Signature du médecin,
{{signature}}`
  },
  {
    title: "Certificat d'aptitude médicale",
    accent_color: "#e5352b",
    content: `CERTIFICAT D'APTITUDE MÉDICALE

Je soussigné Dr. {{nom_medecin}},

Confirme avoir examiné {{nom_patient}} né(e) le {{date_naissance}} à {{lieu_naissance}}.

Atteste qu'il n'y a pas de contre-indication psychique et physique pour exercer quelconque discipline et/ou métier.

Pour faire valoir ce que de droit.

Fait à New York, le {{date_delivrance}}
Signature du médecin,
{{signature}}

Ce document, une fois signé, devient un document officiel. En signant ce document, vous êtes légalement responsable de son contexte et acceptez toutes les conséquences juridiques qu'il peut engendrer. Chaque copie de ce document a une valeur égale à son original.`
  },
  {
    title: "Compte-rendu d'analyses de sang",
    accent_color: "#e5352b",
    content: `COMPTE-RENDU D'ANALYSES DE SANG

Patient : {{nom_patient}}
Date : {{date_analyse}}

Laboratoire de New York - Presbyterian Hospital

RÉSULTATS
{{resultats_analyses}}

CONCLUSION
{{conclusion}}

Certifié par le laboratoire de New York - Presbyterian Hospital
Fait à New York le, {{date_analyse}}
Signature du médecin,
{{signature}}
---PAGE---
CONSEILS PRATIQUES SUITE AUX ANALYSES

Médecin : Dr. {{nom_medecin}}

Résultats des analyses : {{synthese_resultats}}

Alimentation : {{conseil_alimentation}}
Activité physique : {{conseil_activite_physique}}
Habitudes de vie : {{conseil_habitudes}}
Surveillance : {{conseil_surveillance}}

Fait à New York le, {{date_analyse}}
Signature du médecin,
{{signature}}`
  },
  {
    title: "Compte-rendu d'analyses urinaires",
    accent_color: "#e5352b",
    content: `COMPTE-RENDU D'ANALYSES URINAIRES

Patient : {{nom_patient}}
Date : {{date_analyse}}

Laboratoire de New York - Presbyterian Hospital

RÉSULTATS
{{resultats_analyses}}

CONCLUSION
{{conclusion}}

Certifié par le laboratoire de New York - Presbyterian Hospital
Fait à New York le, {{date_analyse}}
Signature du médecin,
{{signature}}
---PAGE---
CONSEILS PRATIQUES SUITE AUX ANALYSES

Médecin : Dr. {{nom_medecin}}

Résultats des analyses : {{synthese_resultats}}

Alimentation : {{conseil_alimentation}}
Activité physique : {{conseil_activite_physique}}
Habitudes de vie : {{conseil_habitudes}}
Surveillance : {{conseil_surveillance}}

Fait à New York le, {{date_analyse}}
Signature du médecin,
{{signature}}`
  }
];


const existingTemplateCount = db.prepare(`
  SELECT COUNT(*) AS count FROM document_templates
`).get().count;


if (existingTemplateCount === 0) {
  const insertTemplate = db.prepare(`
    INSERT INTO document_templates (title, content, accent_color)
    VALUES (?, ?, ?)
  `);

  const insertAllTemplates = db.transaction(templates => {
    for (const t of templates) {
      insertTemplate.run(t.title, t.content, t.accent_color || "#e5352b");
    }
  });

  insertAllTemplates(DEFAULT_DOCUMENT_TEMPLATES);
}



/* =========================================================
   SOINS COMMUNS (catalogue de tarifs)
========================================================= */


const CARE_CATALOG = [
  { key: "Soins simple", price: 500 },
  { key: "Réanimation", price: 800 },
  { key: "Chirurgie", price: 1000 },
  { key: "Plâtre ou attelle", price: 150 },
  { key: "Fauteuil", price: 150 },
  { key: "Radiographie", price: 200 },
  { key: "Scanner", price: 250 },
  { key: "IRM", price: 300 },
  { key: "Analyse Laboratoire", price: 300 },
  { key: "Visite Médicale", price: 600 },
  { key: "Rééducation", price: 600 },
  { key: "Psychologie", price: 600 },
  { key: "Kinésithérapie", price: 600 },
  { key: "Gynécologie", price: 600 },
  { key: "Ophtalmologie", price: 600 },
  { key: "Pédiatrie", price: 600 },
  { key: "Coroner", price: 1500 },
  { key: "Déplacement", price: 150 }
];


/* =========================================================
   HELPERS
========================================================= */


function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Non authentifié."
    });
  }


  next();
}


function requireEMS(req, res, next) {
  if (!req.session.user?.is_ems) {
    return res.status(403).json({
      error: "Accès LSMC requis."
    });
  }


  next();
}


function requireDirector(req, res, next) {
  if (!req.session.user?.is_director) {
    return res.status(403).json({
      error: "Accès Directeur requis."
    });
  }


  next();
}


function isoNow() {
  return new Date().toISOString();
}


function calculateDuration(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);


  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0;
  }


  return Math.max(
    0,
    Math.floor((end - start) / 1000)
  );
}


/*
  Retourne le lundi de la semaine correspondant à une date.


  Format :
  YYYY-MM-DD
*/


function getWeekStart(dateInput = new Date()) {
  const date = new Date(dateInput);


  if (Number.isNaN(date.getTime())) {
    return null;
  }


  const day = date.getDay();


  const diff =
    day === 0
      ? -6
      : 1 - day;


  date.setHours(0, 0, 0, 0);
  date.setDate(
    date.getDate() + diff
  );


  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");


  const dayNumber = String(
    date.getDate()
  ).padStart(2, "0");


  return `${year}-${month}-${dayNumber}`;
}


function getWeekEnd(weekStart) {
  const date = new Date(
    `${weekStart}T00:00:00`
  );


  date.setDate(
    date.getDate() + 7
  );


  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");


  const day = String(
    date.getDate()
  ).padStart(2, "0");


  return `${year}-${month}-${day}`;
}


/*
  Convertit une année + un numéro de semaine ISO (1-53) en date
  du lundi de cette semaine, au format YYYY-MM-DD.
*/


function isoWeekToMonday(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay();
  const monday = new Date(simple);


  if (dayOfWeek <= 4) {
    monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - dayOfWeek);
  }


  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");


  return `${y}-${m}-${d}`;
}


/*
  Numéro de semaine ISO courant (utilisé pour générer la liste des
  semaines disponibles dans l'onglet Service, à partir de la semaine 33).
*/


function getISOWeekNumber(dateInput = new Date()) {
  const date = new Date(Date.UTC(
    dateInput.getFullYear(),
    dateInput.getMonth(),
    dateInput.getDate()
  ));


  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);


  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);


  return { year: date.getUTCFullYear(), week };
}


/*
  Calcule correctement le temps d'un service à l'intérieur
  d'une semaine.
*/


function durationInsidePeriod(
  startedAt,
  endedAt,
  periodStart,
  periodEnd
) {
  const start = new Date(startedAt);
  const end = endedAt
    ? new Date(endedAt)
    : new Date();


  const from = new Date(periodStart);
  const to = new Date(periodEnd);


  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0;
  }


  const actualStart =
    start > from ? start : from;


  const actualEnd =
    end < to ? end : to;


  if (actualEnd <= actualStart) {
    return 0;
  }


  return Math.floor(
    (actualEnd - actualStart) / 1000
  );
}


function buildWeekStats(userId, weekStart) {
  const weekEnd = getWeekEnd(weekStart);


  const services = db.prepare(`
    SELECT
      id,
      started_at,
      ended_at,
      duration
    FROM services
    WHERE user_id = ?
      AND started_at < ?
      AND (
        ended_at IS NULL
        OR ended_at >= ?
      )
    ORDER BY started_at ASC
  `).all(
    userId,
    `${weekEnd}T00:00:00`,
    `${weekStart}T00:00:00`
  );


  let totalSeconds = 0;


  for (const service of services) {
    totalSeconds += durationInsidePeriod(
      service.started_at,
      service.ended_at,
      `${weekStart}T00:00:00`,
      `${weekEnd}T00:00:00`
    );
  }


  return {
    weekStart,
    weekEnd,
    totalSeconds,
    services
  };
}


function parseJsonSafe(value, fallback) {
  if (!value) return fallback;


  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}


function serializeIntervention(row) {
  return {
    ...row,
    care_items: parseJsonSafe(row.care_items, []),
    free_billing: parseJsonSafe(row.free_billing, []),
    is_official: Boolean(row.is_official)
  };
}


/*
  Met en forme une note de frais pour le front : le champ
  "refunded" (0/1 en base) devient un booléen JS.
*/


function serializeExpense(row) {
  return {
    ...row,
    refunded: Boolean(row.refunded)
  };
}


function displayName(user) {
  if (!user) return null;
  return user.nickname || user.username;
}


/* =========================================================
   DISCORD
========================================================= */


async function discordRequest(
  url,
  options = {}
) {
  const response = await fetch(
    url,
    options
  );


  if (!response.ok) {
    const text =
      await response.text();


    throw new Error(
      `Discord API ${response.status}: ${text}`
    );
  }


  return response.json();
}


/*
  Rafraîchit un access_token Discord expiré à partir du refresh_token
  stocké pour l'utilisateur. Met à jour la base au passage.
*/


async function refreshDiscordToken(user) {
  const response = await fetch(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: DISCORD.CLIENT_ID,
        client_secret: DISCORD.CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: user.discord_refresh_token
      })
    }
  );


  const token = await response.json();


  if (!token.access_token) {
    throw new Error("Impossible de rafraîchir le token Discord.");
  }


  const expiresAt = new Date(
    Date.now() + (token.expires_in || 0) * 1000
  ).toISOString();


  db.prepare(`
    UPDATE users
    SET
      discord_access_token = ?,
      discord_refresh_token = ?,
      discord_token_expires_at = ?
    WHERE id = ?
  `).run(
    token.access_token,
    token.refresh_token || user.discord_refresh_token,
    expiresAt,
    user.id
  );


  return {
    ...user,
    discord_access_token: token.access_token,
    discord_refresh_token: token.refresh_token || user.discord_refresh_token,
    discord_token_expires_at: expiresAt
  };
}


/*
  Récupère les rôles actuels d'un membre sur le serveur Discord, en
  rafraîchissant son token si besoin. Utilisé pour la vérification
  périodique des accès (retrait de rôle en direct).
*/


async function fetchCurrentMemberRoles(user) {
  let freshUser = user;


  const expiresAt = user.discord_token_expires_at
    ? new Date(user.discord_token_expires_at).getTime()
    : 0;


  if (!user.discord_access_token || Date.now() >= expiresAt - 5000) {
    if (!user.discord_refresh_token) {
      throw new Error("Session Discord expirée.");
    }
    freshUser = await refreshDiscordToken(user);
  }


  const member = await discordRequest(
    `https://discord.com/api/users/@me/guilds/${DISCORD.SERVER_ID}/member`,
    {
      headers: {
        Authorization: `Bearer ${freshUser.discord_access_token}`
      }
    }
  );


  return { roles: member.roles || [], freshUser };
}


/* =========================================================
   AUTH DISCORD
========================================================= */


app.get(
  "/auth/discord",
  (req, res) => {
    const params =
      new URLSearchParams({
        client_id:
          DISCORD.CLIENT_ID,


        redirect_uri:
          DISCORD.REDIRECT_URI,


        response_type: "code",


        scope:
          "identify guilds.members.read"
      });


    res.redirect(
      `https://discord.com/oauth2/authorize?${params.toString()}`
    );
  }
);


app.get(
  "/auth/discord/callback",
  async (req, res) => {
    try {
      const { code } = req.query;


      if (!code) {
        return res
          .status(400)
          .send(
            "Code OAuth manquant."
          );
      }


      const tokenResponse =
        await fetch(
          "https://discord.com/api/oauth2/token",
          {
            method: "POST",


            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },


            body:
              new URLSearchParams({
                client_id:
                  DISCORD.CLIENT_ID,


                client_secret:
                  DISCORD.CLIENT_SECRET,


                grant_type:
                  "authorization_code",


                code,


                redirect_uri:
                  DISCORD.REDIRECT_URI
              })
          }
        );


      const token =
        await tokenResponse.json();


      if (!token.access_token) {
        console.error(
          "Discord OAuth:",
          token
        );


        return res
          .status(400)
          .send(
            "Authentification Discord impossible."
          );
      }


      const discordUser =
        await discordRequest(
          "https://discord.com/api/users/@me",
          {
            headers: {
              Authorization:
                `Bearer ${token.access_token}`
            }
          }
        );


      const member =
        await discordRequest(
          `https://discord.com/api/users/@me/guilds/${DISCORD.SERVER_ID}/member`,
          {
            headers: {
              Authorization:
                `Bearer ${token.access_token}`
            }
          }
        );


      const roles =
        member.roles || [];


      const isEMS =
        roles.includes(
          DISCORD.EMS_ROLE_ID
        );


      const isDirector =
        roles.includes(
          DISCORD.DIRECTOR_ROLE_ID
        );


      const isCitizen =
        roles.includes(
          DISCORD.CITIZEN_ROLE_ID
        );


      // Pseudo utilisé sur le serveur (surnom défini par le membre sur
      // le Discord). On retombe sur le nom global / username Discord
      // seulement si aucun pseudo serveur n'est défini.
      const nickname =
        member.nick ||
        discordUser.global_name ||
        discordUser.username;


      // Accès refusé si le membre n'a ni le rôle LSMC, ni le rôle
      // citoyen (les citoyens n'ont accès qu'à l'espace Services).
      if (!isEMS && !isCitizen) {
        return res.status(403).send(`
          <!doctype html>
          <html lang="fr">
          <head>
            <meta charset="UTF-8">
            <title>Accès refusé</title>
          </head>
          <body style="
            margin:0;
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#080808;
            color:white;
            font-family:Arial;
            text-align:center;
          ">
            <div>
              <h1 style="color:#e50914">
                Accès refusé
              </h1>


              <p>
                Tu ne possèdes pas le rôle requis pour accéder à cet espace.
              </p>


              <a
                href="/"
                style="color:#fff"
              >
                Retour
              </a>
            </div>
          </body>
          </html>
        `);
      }


      const expiresAt = new Date(
        Date.now() + (token.expires_in || 0) * 1000
      ).toISOString();


      let user =
        db.prepare(`
          SELECT *
          FROM users
          WHERE discord_id = ?
        `).get(
          discordUser.id
        );


      if (!user) {
        const result =
          db.prepare(`
            INSERT INTO users
            (
              discord_id,
              username,
              nickname,
              avatar,
              is_ems,
              is_director,
              is_citizen,
              discord_access_token,
              discord_refresh_token,
              discord_token_expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            discordUser.id,
            discordUser.username,
            nickname,
            discordUser.avatar || null,
            isEMS ? 1 : 0,
            isDirector ? 1 : 0,
            isCitizen ? 1 : 0,
            token.access_token,
            token.refresh_token || null,
            expiresAt
          );


        user =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(
            result.lastInsertRowid
          );
      } else {
        db.prepare(`
          UPDATE users
          SET
            username = ?,
            nickname = ?,
            avatar = ?,
            is_ems = ?,
            is_director = ?,
            is_citizen = ?,
            discord_access_token = ?,
            discord_refresh_token = ?,
            discord_token_expires_at = ?
          WHERE id = ?
        `).run(
          discordUser.username,
          nickname,
          discordUser.avatar || null,
          isEMS ? 1 : 0,
          isDirector ? 1 : 0,
          isCitizen ? 1 : 0,
          token.access_token,
          token.refresh_token || null,
          expiresAt,
          user.id
        );


        user =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(user.id);
      }


      req.session.user = user;


      res.redirect("/");
    } catch (error) {
      console.error(
        "Erreur Discord :",
        error
      );


      res
        .status(500)
        .send(
          "Erreur pendant la connexion Discord."
        );
    }
  }
);


app.get(
  "/auth/logout",
  (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  }
);


/* =========================================================
   VÉRIFICATION PÉRIODIQUE DE SESSION (rôles Discord en direct)


   Appelée régulièrement par le front (toutes les ~20s). Revérifie
   auprès de Discord que l'utilisateur possède toujours le rôle qui
   lui donne accès (LSMC / Directeur / Citoyen). Si un rôle a été
   retiré sur Discord depuis la connexion, la session est détruite
   immédiatement et le site se déconnecte tout seul, sans attendre
   qu'une action déclenche une nouvelle requête protégée.
========================================================= */


app.get(
  "/api/session/check",
  requireLogin,
  async (req, res) => {
    try {
      const dbUser =
        db.prepare(`SELECT * FROM users WHERE id = ?`).get(
          req.session.user.id
        );


      if (!dbUser) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session invalide." });
      }


      const { roles, freshUser } = await fetchCurrentMemberRoles(dbUser);


      const isEMS = roles.includes(DISCORD.EMS_ROLE_ID);
      const isDirector = roles.includes(DISCORD.DIRECTOR_ROLE_ID);
      const isCitizen = roles.includes(DISCORD.CITIZEN_ROLE_ID);


      // Plus aucun rôle donnant accès : on coupe la session tout de suite.
      if (!isEMS && !isCitizen) {
        req.session.destroy(() => {});
        return res.status(403).json({
          error: "Rôle d'accès retiré sur Discord.",
          roleChanged: true
        });
      }


      const roleChanged =
        Boolean(dbUser.is_ems) !== isEMS ||
        Boolean(dbUser.is_director) !== isDirector ||
        Boolean(dbUser.is_citizen) !== isCitizen;


      db.prepare(`
        UPDATE users
        SET is_ems = ?, is_director = ?, is_citizen = ?
        WHERE id = ?
      `).run(isEMS ? 1 : 0, isDirector ? 1 : 0, isCitizen ? 1 : 0, dbUser.id);


      const updatedUser = {
        ...freshUser,
        is_ems: isEMS ? 1 : 0,
        is_director: isDirector ? 1 : 0,
        is_citizen: isCitizen ? 1 : 0
      };


      req.session.user = updatedUser;


      res.json({ ok: true, roleChanged });
    } catch (error) {
      console.error("Vérification de session :", error);
      // En cas d'erreur ponctuelle (Discord indisponible, etc.), on ne
      // déconnecte pas la personne : on retentera au prochain intervalle.
      res.json({ ok: true, roleChanged: false });
    }
  }
);


/* =========================================================
   UTILISATEUR
========================================================= */


app.get(
  "/api/me",
  requireLogin,
  (req, res) => {
    const user =
      db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
      `).get(
        req.session.user.id
      );


    res.json({
      user
    });
  }
);


/*
  Modifier son propre profil (métier / grade). Réservé au Directeur :
  personne d'autre ne peut modifier ces informations, y compris les
  siennes, en dehors du Directeur (cf. onglet Direction).
*/


app.put(
  "/api/me",
  requireLogin,
  (req, res) => {
    if (!req.session.user?.is_director) {
      return res.status(403).json({
        error: "Seul le Directeur peut modifier le métier et le grade."
      });
    }


    const { job, grade } = req.body;


    db.prepare(`
      UPDATE users
      SET job = ?, grade = ?
      WHERE id = ?
    `).run(
      (job || "").trim() || null,
      (grade || "").trim() || null,
      req.session.user.id
    );


    const user =
      db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
      `).get(
        req.session.user.id
      );


    req.session.user = user;


    res.json({
      success: true,
      user
    });
  }
);


/* =========================================================
   SERVICE ACTUEL
========================================================= */


app.get(
  "/api/service/current",
  requireEMS,
  (req, res) => {
    const service =
      db.prepare(`
        SELECT *
        FROM services
        WHERE user_id = ?
          AND ended_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `).get(
        req.session.user.id
      );


    res.json({
      service: service || null
    });
  }
);


/* =========================================================
   PRENDRE SERVICE
========================================================= */


app.post(
  "/api/service/start",
  requireEMS,
  (req, res) => {
    const existing =
      db.prepare(`
        SELECT *
        FROM services
        WHERE user_id = ?
          AND ended_at IS NULL
        LIMIT 1
      `).get(
        req.session.user.id
      );


    if (existing) {
      return res.status(400).json({
        error:
          "Tu es déjà en service."
      });
    }


    const startedAt =
      isoNow();


    const result =
      db.prepare(`
        INSERT INTO services
        (
          user_id,
          started_at,
          ended_at,
          duration
        )
        VALUES (?, ?, NULL, 0)
      `).run(
        req.session.user.id,
        startedAt
      );


    const service =
      db.prepare(`
        SELECT *
        FROM services
        WHERE id = ?
      `).get(
        result.lastInsertRowid
      );


    res.json({
      success: true,
      service
    });
  }
);


/* =========================================================
   FIN DE SERVICE
========================================================= */


app.post(
  "/api/service/stop",
  requireEMS,
  (req, res) => {
    const service =
      db.prepare(`
        SELECT *
        FROM services
        WHERE user_id = ?
          AND ended_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `).get(
        req.session.user.id
      );


    if (!service) {
      return res.status(400).json({
        error:
          "Tu n'es pas en service."
      });
    }


    const endedAt =
      new Date();


    const duration =
      calculateDuration(
        service.started_at,
        endedAt.toISOString()
      );


    const result =
      db.prepare(`
        UPDATE services
        SET
          ended_at = ?,
          duration = ?
        WHERE id = ?
          AND ended_at IS NULL
      `).run(
        endedAt.toISOString(),
        duration,
        service.id
      );


    if (result.changes !== 1) {
      return res.status(500).json({
        error:
          "Impossible d'enregistrer la fin du service."
      });
    }


    const updated =
      db.prepare(`
        SELECT *
        FROM services
        WHERE id = ?
      `).get(
        service.id
      );


    res.json({
      success: true,
      service: updated,
      duration
    });
  }
);


/* =========================================================
   DIRECTION — SUPPRIMER UN SERVICE
========================================================= */


app.delete(
  "/api/director/services/:id",
  requireDirector,
  (req, res) => {
    const serviceId =
      Number(req.params.id);


    if (!Number.isInteger(serviceId)) {
      return res.status(400).json({
        error: "ID de service invalide."
      });
    }


    const service =
      db.prepare(`
        SELECT
          s.*,
          u.username
        FROM services s
        INNER JOIN users u
          ON u.id = s.user_id
        WHERE s.id = ?
      `).get(serviceId);


    if (!service) {
      return res.status(404).json({
        error: "Service introuvable."
      });
    }


    db.prepare(`
      DELETE FROM services
      WHERE id = ?
    `).run(serviceId);


    res.json({
      success: true,
      deletedService: service
    });
  }
);


/* =========================================================
   STATISTIQUES PERSONNELLES (fusionnées dans "Service")
========================================================= */


app.get(
  "/api/stats",
  requireEMS,
  (req, res) => {
    const userId =
      req.session.user.id;


    const total =
      db.prepare(`
        SELECT
          COALESCE(
            SUM(duration),
            0
          ) AS seconds
        FROM services
        WHERE user_id = ?
          AND ended_at IS NOT NULL
      `).get(userId);


    const currentWeek =
      getWeekStart();


    const week =
      buildWeekStats(
        userId,
        currentWeek
      );


    const services =
      db.prepare(`
        SELECT
          id,
          started_at,
          ended_at,
          duration
        FROM services
        WHERE user_id = ?
        ORDER BY started_at DESC
      `).all(userId);


    res.json({
      totalSeconds:
        Number(total.seconds || 0),


      weekSeconds:
        week.totalSeconds,


      currentWeek,


      weekEnd:
        week.weekEnd,


      services
    });
  }
);


/*
  Statistiques de service pour une semaine ISO précise
  (utilisé par les menus déroulants "Semaine 33", "Semaine 34", ...
  dans l'onglet Service). On part de la semaine 33.
*/


app.get(
  "/api/stats/week",
  requireEMS,
  (req, res) => {
    const year =
      Number(req.query.year) || new Date().getFullYear();


    const week =
      Number(req.query.week);


    if (!Number.isInteger(week) || week < 1 || week > 53) {
      return res.status(400).json({
        error: "Numéro de semaine invalide."
      });
    }


    const weekStart = isoWeekToMonday(year, week);
    const stats = buildWeekStats(req.session.user.id, weekStart);


    res.json({
      year,
      week,
      weekStart: stats.weekStart,
      weekEnd: stats.weekEnd,
      totalSeconds: stats.totalSeconds,
      services: stats.services
    });
  }
);


/*
  Liste des semaines disponibles pour le sélecteur, à partir de la
  semaine 33 de l'année en cours jusqu'à la semaine actuelle.
*/


app.get(
  "/api/stats/weeks",
  requireEMS,
  (req, res) => {
    const now = getISOWeekNumber();
    const weeks = [];


    const startYear = now.year;
    const startWeek = 33;


    if (now.week >= startWeek) {
      for (let w = startWeek; w <= now.week; w++) {
        weeks.push({ year: startYear, week: w });
      }
    } else {
      // Semaine courante avant la 33 (nouvelle année) :
      // on affiche la semaine 33 à 53 de l'année précédente,
      // puis 1 à la semaine courante de l'année en cours.
      for (let w = startWeek; w <= 53; w++) {
        weeks.push({ year: startYear - 1, week: w });
      }
      for (let w = 1; w <= now.week; w++) {
        weeks.push({ year: startYear, week: w });
      }
    }


    res.json({ weeks, current: now });
  }
);


/* =========================================================
   DASHBOARD
========================================================= */


app.get(
  "/api/dashboard",
  requireEMS,
  (req, res) => {
    const members =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
        WHERE is_ems = 1
      `).get();


    const patients =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM patients
      `).get();


    const interventions =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM interventions
      `).get();


    const services =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM services
      `).get();


    const active =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM services
        WHERE ended_at IS NULL
      `).get();


    /* Activité par semaine : interventions des 7 derniers jours */


    const weekRows =
      db.prepare(`
        SELECT
          created_at
        FROM interventions
        WHERE created_at >= datetime('now', '-6 days')
      `).all();


    const dayLabels = [
      "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"
    ];


    const weekly = [];


    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);


      const key = d.toISOString().slice(0, 10);


      const jsDay = d.getDay();
      const label = dayLabels[(jsDay + 6) % 7];


      const count = weekRows.filter(row =>
        (row.created_at || "").slice(0, 10) === key
      ).length;


      weekly.push({ label, count });
    }


    /* Interventions de la semaine (lundi -> dimanche) du service */


    const currentWeekStart = getWeekStart();
    const currentWeekEnd = getWeekEnd(currentWeekStart);


    const weekInterventions =
      db.prepare(`
        SELECT
          i.id,
          i.care_items,
          COALESCE(u.nickname, u.username) AS creator
        FROM interventions i
        LEFT JOIN users u
          ON u.id = i.created_by
        WHERE i.created_at >= ?
          AND i.created_at < ?
      `).all(
        `${currentWeekStart}T00:00:00`,
        `${currentWeekEnd}T00:00:00`
      );


    const weeklyInterventionsCount = weekInterventions.length;


    /* Répartition par employé du service, pour la semaine en cours */
    /* (se réactualise automatiquement chaque semaine)                */


    const employeeMap = {};


    weekInterventions.forEach(row => {
      const name = row.creator || "Inconnu";
      employeeMap[name] = (employeeMap[name] || 0) + 1;
    });


    const employeeDistribution = Object.entries(employeeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);


    /*
      Soins / actes les plus réalisés par le service (top 10),
      toutes interventions confondues.
    */


    const allCareRows =
      db.prepare(`
        SELECT care_items
        FROM interventions
      `).all();


    const careCountMap = {};


    allCareRows.forEach(row => {
      const items = parseJsonSafe(row.care_items, []);
      items.forEach(key => {
        careCountMap[key] = (careCountMap[key] || 0) + 1;
      });
    });


    const topCareItems = Object.entries(careCountMap)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);


    res.json({
      members:
        Number(members.count),


      patients:
        Number(patients.count),


      interventions:
        Number(interventions.count),


      services:
        Number(services.count),


      activeServices:
        Number(active.count),


      weeklyActivity: weekly,


      weeklyInterventionsCount,


      employeeDistribution,


      topCareItems,


      currentWeekStart,
      currentWeekEnd
    });
  }
);


/* =========================================================
   MEMBRES LSMC (utilisé pour l'assignation des rendez-vous,
   accessible à tout le personnel — pas seulement au Directeur)
========================================================= */


app.get(
  "/api/staff-members",
  requireEMS,
  (req, res) => {
    const users =
      db.prepare(`
        SELECT
          id,
          discord_id,
          username,
          nickname
        FROM users
        WHERE is_ems = 1 OR is_director = 1
        ORDER BY username ASC
      `).all();


    res.json({ users });
  }
);


/* =========================================================
   DIRECTION — MEMBRES
========================================================= */


app.get(
  "/api/director/users",
  requireDirector,
  (req, res) => {
    const users =
      db.prepare(`
        SELECT
          u.id,
          u.discord_id,
          u.username,
          u.nickname,
          u.avatar,
          u.is_ems,
          u.is_director,
          u.job,
          u.grade,
          u.created_at,


          COALESCE(
            (
              SELECT SUM(s.duration)
              FROM services s
              WHERE s.user_id = u.id
                AND s.ended_at IS NOT NULL
            ),
            0
          ) AS total_seconds,


          (
            SELECT COUNT(*)
            FROM services s2
            WHERE s2.user_id = u.id
          ) AS service_count,


          EXISTS (
            SELECT 1
            FROM services s3
            WHERE s3.user_id = u.id
              AND s3.ended_at IS NULL
          ) AS currently_online


        FROM users u
        WHERE u.is_ems = 1 OR u.is_director = 1


        ORDER BY
          total_seconds DESC,
          u.username ASC
      `).all();


    const currentWeek =
      getWeekStart();


    const result =
      users.map(user => {


        const week =
          buildWeekStats(
            user.id,
            currentWeek
          );


        return {
          ...user,


          total_seconds:
            Number(
              user.total_seconds || 0
            ),


          week_seconds:
            week.totalSeconds,


          currently_online:
            Boolean(
              user.currently_online
            )
        };
      });


    res.json({
      users: result,
      currentWeek
    });
  }
);


/*
  DIRECTION — Mettre à jour le profil (métier / grade) d'un
  employé. Réservé au Directeur (contrairement à PUT /api/me qui
  ne permet à chacun de modifier que son propre profil).
*/


app.put(
  "/api/director/users/:id",
  requireDirector,
  (req, res) => {
    const { job, grade } = req.body;


    const user =
      db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).get(req.params.id);


    if (!user) {
      return res.status(404).json({
        error: "Membre introuvable."
      });
    }


    db.prepare(`
      UPDATE users
      SET job = ?, grade = ?
      WHERE id = ?
    `).run(
      (job || "").trim() || null,
      (grade || "").trim() || null,
      req.params.id
    );


    const updated =
      db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).get(req.params.id);


    res.json({
      success: true,
      user: updated
    });
  }
);


/* =========================================================
   DIRECTION — ARCHIVES DE SERVICES D'UN MEMBRE
========================================================= */


app.get(
  "/api/director/services/:discordId",
  requireDirector,
  (req, res) => {
    const user =
      db.prepare(`
        SELECT *
        FROM users
        WHERE discord_id = ?
      `).get(req.params.discordId);


    if (!user) {
      return res.status(404).json({
        error: "Membre introuvable."
      });
    }


    const services =
      db.prepare(`
        SELECT
          id,
          started_at,
          ended_at,
          duration
        FROM services
        WHERE user_id = ?
        ORDER BY started_at DESC
      `).all(user.id);


    res.json({
      user,
      services
    });
  }
);


/* =========================================================
   PATIENTS
========================================================= */


app.get(
  "/api/patients",
  requireEMS,
  (req, res) => {
    const patients =
      db.prepare(`
        SELECT *
        FROM patients
        ORDER BY id DESC
      `).all();


    res.json({
      patients
    });
  }
);


app.post(
  "/api/patients",
  requireEMS,
  (req, res) => {
    const {
      first_name,
      last_name,
      birth_date,
      sex,
      phone,
      emergency_contact,
      blood_type,
      height,
      weight,
      allergies,
      notes
    } = req.body;


    if (
      !first_name ||
      !last_name
    ) {
      return res.status(400).json({
        error:
          "Prénom et nom obligatoires."
      });
    }


    const result =
      db.prepare(`
        INSERT INTO patients
        (
          first_name,
          last_name,
          birth_date,
          sex,
          phone,
          emergency_contact,
          blood_type,
          height,
          weight,
          allergies,
          status,
          notes,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Patient', ?, ?)
      `).run(
        first_name.trim(),
        last_name.trim(),
        birth_date || null,
        sex || null,
        phone || null,
        emergency_contact || null,
        blood_type || null,
        height || null,
        weight || null,
        allergies || null,
        notes || null,
        req.session.user.id
      );


    const patient =
      db.prepare(`
        SELECT *
        FROM patients
        WHERE id = ?
      `).get(
        result.lastInsertRowid
      );


    res.json({
      success: true,
      patient
    });
  }
);


/*
  Modification des informations de base uniquement.
  Le statut (Patient / Mort) se change via une route dédiée.
*/


app.put(
  "/api/patients/:id",
  requireEMS,
  (req, res) => {
    const patient =
      db.prepare(`
        SELECT * FROM patients WHERE id = ?
      `).get(req.params.id);


    if (!patient) {
      return res.status(404).json({
        error: "Patient introuvable."
      });
    }


    const {
      first_name,
      last_name,
      birth_date,
      sex,
      phone,
      emergency_contact,
      blood_type,
      height,
      weight,
      allergies,
      notes
    } = req.body;


    if (!first_name || !last_name) {
      return res.status(400).json({
        error: "Prénom et nom obligatoires."
      });
    }


    db.prepare(`
      UPDATE patients
      SET
        first_name = ?,
        last_name = ?,
        birth_date = ?,
        sex = ?,
        phone = ?,
        emergency_contact = ?,
        blood_type = ?,
        height = ?,
        weight = ?,
        allergies = ?,
        notes = ?
      WHERE id = ?
    `).run(
      first_name.trim(),
      last_name.trim(),
      birth_date || null,
      sex || null,
      phone || null,
      emergency_contact || null,
      blood_type || null,
      height || null,
      weight || null,
      allergies || null,
      notes || null,
      req.params.id
    );


    const updated =
      db.prepare(`
        SELECT * FROM patients WHERE id = ?
      `).get(req.params.id);


    res.json({
      success: true,
      patient: updated
    });
  }
);


/*
  Changement de statut (Patient <-> Mort), accessible
  depuis la vue "Voir les détails".
*/


app.patch(
  "/api/patients/:id/status",
  requireEMS,
  (req, res) => {
    const { status } = req.body;


    if (!["Patient", "Mort"].includes(status)) {
      return res.status(400).json({
        error: "Statut invalide."
      });
    }


    const patient =
      db.prepare(`
        SELECT * FROM patients WHERE id = ?
      `).get(req.params.id);


    if (!patient) {
      return res.status(404).json({
        error: "Patient introuvable."
      });
    }


    db.prepare(`
      UPDATE patients
      SET status = ?
      WHERE id = ?
    `).run(status, req.params.id);


    const updated =
      db.prepare(`
        SELECT * FROM patients WHERE id = ?
      `).get(req.params.id);


    res.json({
      success: true,
      patient: updated
    });
  }
);


app.get(
  "/api/patients/:id",
  requireEMS,
  (req, res) => {
    const patient =
      db.prepare(`
        SELECT *
        FROM patients
        WHERE id = ?
      `).get(
        req.params.id
      );


    if (!patient) {
      return res.status(404).json({
        error:
          "Patient introuvable."
      });
    }


    const interventions =
      db.prepare(`
        SELECT
          i.*,
          COALESCE(u.nickname, u.username) AS creator
        FROM interventions i
        LEFT JOIN users u
          ON u.id = i.created_by
        WHERE i.patient_id = ?
        ORDER BY i.id DESC
      `).all(
        req.params.id
      ).map(serializeIntervention);


    res.json({
      patient,
      interventions
    });
  }
);


/*
  DIRECTION — Supprimer un dossier patient, en cas de doublon
  par exemple. Réservé au Directeur, comme la suppression des
  interventions et des services. Les interventions liées sont
  supprimées avec le dossier pour ne pas laisser d'entrées
  orphelines dans l'historique.
*/


app.delete(
  "/api/patients/:id",
  requireDirector,
  (req, res) => {
    const patient =
      db.prepare(`SELECT * FROM patients WHERE id = ?`).get(req.params.id);


    if (!patient) {
      return res.status(404).json({
        error: "Patient introuvable."
      });
    }


    db.prepare(`DELETE FROM interventions WHERE patient_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM patients WHERE id = ?`).run(req.params.id);


    res.json({
      success: true,
      deletedPatient: patient.id
    });
  }
);


/* =========================================================
   INTERVENTIONS
========================================================= */


app.get(
  "/api/care-catalog",
  requireEMS,
  (req, res) => {
    res.json({
      catalog: CARE_CATALOG
    });
  }
);


app.get(
  "/api/interventions",
  requireEMS,
  (req, res) => {
    const interventions =
      db.prepare(`
        SELECT
          i.*,


          p.first_name,
          p.last_name,


          COALESCE(u.nickname, u.username) AS creator


        FROM interventions i


        LEFT JOIN patients p
          ON p.id = i.patient_id


        LEFT JOIN users u
          ON u.id = i.created_by


        ORDER BY i.created_at DESC
      `).all()
      .map(serializeIntervention);


    res.json({
      interventions
    });
  }
);


app.get(
  "/api/interventions/:id",
  requireEMS,
  (req, res) => {
    const intervention =
      db.prepare(`
        SELECT
          i.*,
          p.first_name,
          p.last_name,
          COALESCE(u.nickname, u.username) AS creator,
          COALESCE(eu.nickname, eu.username) AS updater
        FROM interventions i
        LEFT JOIN patients p
          ON p.id = i.patient_id
        LEFT JOIN users u
          ON u.id = i.created_by
        LEFT JOIN users eu
          ON eu.id = i.updated_by
        WHERE i.id = ?
      `).get(req.params.id);


    if (!intervention) {
      return res.status(404).json({
        error: "Intervention introuvable."
      });
    }


    res.json({
      intervention: serializeIntervention(intervention)
    });
  }
);


app.post(
  "/api/interventions",
  requireEMS,
  (req, res) => {
    const {
      patient_id,
      title,
      comments,
      care_items,
      free_billing,
      is_official,
      location,
      status,
      image
    } = req.body;


    if (!title) {
      return res.status(400).json({
        error:
          "Titre obligatoire."
      });
    }


    if (
      patient_id &&
      !db.prepare(`
        SELECT id
        FROM patients
        WHERE id = ?
      `).get(patient_id)
    ) {
      return res.status(400).json({
        error:
          "Patient introuvable."
      });
    }


    if (
      typeof comments === "string" &&
      comments.length > 10000
    ) {
      return res.status(400).json({
        error:
          "Le commentaire dépasse la limite autorisée (10000 caractères)."
      });
    }


    if (
      typeof image === "string" &&
      image.length > 8_000_000
    ) {
      return res.status(400).json({
        error:
          "L'image est trop lourde."
      });
    }


    const careList = Array.isArray(care_items)
      ? care_items
      : [];


    const billingList = Array.isArray(free_billing)
      ? free_billing
      : [];


    let total = 0;


    for (const item of careList) {
      const found = CARE_CATALOG.find(
        c => c.key === item
      );


      if (found) {
        total += found.price;
      }
    }


    for (const line of billingList) {
      const amount = Number(line.amount);


      if (Number.isFinite(amount)) {
        total += amount;
      }
    }


    // La date/heure et l'auteur (créateur) sont posées
    // automatiquement côté serveur : created_at (DEFAULT
    // CURRENT_TIMESTAMP) et created_by (utilisateur connecté).
    const result =
      db.prepare(`
        INSERT INTO interventions
        (
          patient_id,
          title,
          comments,
          care_items,
          free_billing,
          total,
          is_official,
          location,
          status,
          image,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        patient_id || null,
        title.trim(),
        comments || "",
        JSON.stringify(careList),
        JSON.stringify(billingList),
        total,
        is_official ? 1 : 0,
        location || "",
        status || "Terminée",
        image || null,
        req.session.user.id
      );


    const intervention =
      db.prepare(`
        SELECT
          i.*,
          p.first_name,
          p.last_name,
          COALESCE(u.nickname, u.username) AS creator
        FROM interventions i
        LEFT JOIN patients p ON p.id = i.patient_id
        LEFT JOIN users u ON u.id = i.created_by
        WHERE i.id = ?
      `).get(
        result.lastInsertRowid
      );


    res.json({
      success: true,
      intervention: serializeIntervention(intervention)
    });
  }
);


/*
  Modifier une intervention existante. Le titre, les soins, la
  facturation, les commentaires et l'image peuvent être modifiés.
  La date de création et le créateur d'origine sont conservés ;
  on trace simplement la dernière modification.
*/


app.put(
  "/api/interventions/:id",
  requireEMS,
  (req, res) => {
    const existing =
      db.prepare(`
        SELECT * FROM interventions WHERE id = ?
      `).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Intervention introuvable."
      });
    }


    const {
      patient_id,
      title,
      comments,
      care_items,
      free_billing,
      is_official,
      location,
      status,
      image
    } = req.body;


    if (!title) {
      return res.status(400).json({
        error: "Titre obligatoire."
      });
    }


    if (
      patient_id &&
      !db.prepare(`SELECT id FROM patients WHERE id = ?`).get(patient_id)
    ) {
      return res.status(400).json({
        error: "Patient introuvable."
      });
    }


    if (
      typeof comments === "string" &&
      comments.length > 10000
    ) {
      return res.status(400).json({
        error:
          "Le commentaire dépasse la limite autorisée (10000 caractères)."
      });
    }


    const careList = Array.isArray(care_items) ? care_items : [];
    const billingList = Array.isArray(free_billing) ? free_billing : [];


    let total = 0;


    for (const item of careList) {
      const found = CARE_CATALOG.find(c => c.key === item);
      if (found) total += found.price;
    }


    for (const line of billingList) {
      const amount = Number(line.amount);
      if (Number.isFinite(amount)) total += amount;
    }


    // Si aucune nouvelle image n'est envoyée (champ absent), on
    // conserve l'image existante. Envoyer image: null retire l'image.
    const nextImage =
      image === undefined
        ? existing.image
        : image;


    db.prepare(`
      UPDATE interventions
      SET
        patient_id = ?,
        title = ?,
        comments = ?,
        care_items = ?,
        free_billing = ?,
        total = ?,
        is_official = ?,
        location = ?,
        status = ?,
        image = ?,
        updated_at = ?,
        updated_by = ?
      WHERE id = ?
    `).run(
      patient_id || null,
      title.trim(),
      comments || "",
      JSON.stringify(careList),
      JSON.stringify(billingList),
      total,
      is_official ? 1 : 0,
      location || existing.location || "",
      status || existing.status || "Terminée",
      nextImage,
      isoNow(),
      req.session.user.id,
      req.params.id
    );


    const updated =
      db.prepare(`
        SELECT
          i.*,
          p.first_name,
          p.last_name,
          COALESCE(u.nickname, u.username) AS creator
        FROM interventions i
        LEFT JOIN patients p ON p.id = i.patient_id
        LEFT JOIN users u ON u.id = i.created_by
        WHERE i.id = ?
      `).get(req.params.id);


    res.json({
      success: true,
      intervention: serializeIntervention(updated)
    });
  }
);


/*
  Supprimer une intervention. Réservé au Directeur, comme pour la
  suppression des services, afin de garder une trace fiable du
  dossier médical par défaut.
*/


app.delete(
  "/api/interventions/:id",
  requireDirector,
  (req, res) => {
    const existing =
      db.prepare(`
        SELECT * FROM interventions WHERE id = ?
      `).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Intervention introuvable."
      });
    }


    db.prepare(`
      DELETE FROM interventions WHERE id = ?
    `).run(req.params.id);


    res.json({
      success: true,
      deletedIntervention: existing.id
    });
  }
);


/* =========================================================
   RENDEZ-VOUS (espace citoyen + gestion staff)
========================================================= */


/*
  Liste des rendez-vous :
   - Citoyen : uniquement ses propres rendez-vous ("Mes rendez-vous")
   - LSMC / Directeur : tous les rendez-vous (utilisé par "Gestion RDV"
     et par l'onglet "Rendez-vous" désormais accessible au personnel)
*/


app.get(
  "/api/appointments",
  requireLogin,
  (req, res) => {
    const isStaff =
      req.session.user.is_ems || req.session.user.is_director;


    if (isStaff) {
      const appointments =
        db.prepare(`
          SELECT
            a.*,
            COALESCE(u.nickname, u.username) AS requester,
            COALESCE(au.nickname, au.username) AS assignee
          FROM appointments a
          LEFT JOIN users u ON u.id = a.user_id
          LEFT JOIN users au ON au.id = a.assigned_to
          ORDER BY a.created_at DESC
        `).all();


      return res.json({ appointments });
    }


    const appointments =
      db.prepare(`
        SELECT *
        FROM appointments
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(req.session.user.id);


    res.json({ appointments });
  }
);


/*
  Un citoyen (ou n'importe quel membre connecté) prend rendez-vous.
*/


app.post(
  "/api/appointments",
  requireLogin,
  (req, res) => {
    const { slot1, slot2, phone, motif } = req.body;


    if (!slot1) {
      return res.status(400).json({
        error: "Le créneau 1 est obligatoire."
      });
    }


    const result =
      db.prepare(`
        INSERT INTO appointments
        (user_id, slot1, slot2, phone, motif, status)
        VALUES (?, ?, ?, ?, ?, 'A traiter')
      `).run(
        req.session.user.id,
        slot1,
        slot2 || null,
        phone || null,
        motif || null
      );


    const appointment =
      db.prepare(`
        SELECT * FROM appointments WHERE id = ?
      `).get(result.lastInsertRowid);


    res.json({ success: true, appointment });
  }
);


/*
  Traitement d'un rendez-vous par le staff : créneau confirmé,
  membre assigné, statut. Le statut peut désormais être : "A traiter",
  "Traité", ainsi que les statuts complémentaires "En cours",
  "RDV fait", "Ne s'est pas présenté", "Annulé" et "Reporté".
*/


app.put(
  "/api/appointments/:id",
  requireEMS,
  (req, res) => {
    const existing =
      db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Rendez-vous introuvable."
      });
    }


    const { confirmed_slot, assigned_to, status } = req.body;


    db.prepare(`
      UPDATE appointments
      SET
        confirmed_slot = ?,
        assigned_to = ?,
        status = ?
      WHERE id = ?
    `).run(
      confirmed_slot !== undefined ? (confirmed_slot || null) : existing.confirmed_slot,
      assigned_to !== undefined ? (assigned_to || null) : existing.assigned_to,
      status !== undefined ? status : existing.status,
      req.params.id
    );


    const updated =
      db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);


    res.json({ success: true, appointment: updated });
  }
);


/*
  DIRECTION — Supprimer un rendez-vous. Réservé au Directeur, comme
  les autres suppressions de données (services, interventions,
  dossiers patients, candidatures).
*/


app.delete(
  "/api/appointments/:id",
  requireDirector,
  (req, res) => {
    const existing =
      db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Rendez-vous introuvable."
      });
    }


    db.prepare(`DELETE FROM appointments WHERE id = ?`).run(req.params.id);


    res.json({
      success: true,
      deletedAppointment: existing.id
    });
  }
);


/* =========================================================
   NOTES DE FRAIS
========================================================= */


/*
  Liste des notes de frais du membre connecté.
*/


app.get(
  "/api/expenses",
  requireEMS,
  (req, res) => {
    const expenses =
      db.prepare(`
        SELECT *
        FROM expenses
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(req.session.user.id)
      .map(serializeExpense);


    res.json({ expenses });
  }
);


app.post(
  "/api/expenses",
  requireEMS,
  (req, res) => {
    const { category, reason, amount } = req.body;


    if (!category) {
      return res.status(400).json({
        error: "Catégorie obligatoire."
      });
    }


    const numericAmount = Number(amount);


    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Montant invalide."
      });
    }


    const result =
      db.prepare(`
        INSERT INTO expenses (user_id, category, reason, amount)
        VALUES (?, ?, ?, ?)
      `).run(
        req.session.user.id,
        category,
        reason || null,
        numericAmount
      );


    const expense =
      db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(result.lastInsertRowid);


    res.json({ success: true, expense: serializeExpense(expense) });
  }
);


/*
  DIRECTION — Marquer une note de frais comme remboursée ou non
  (case à cocher dans l'onglet Direction > Notes de frais). Le
  statut est ensuite visible par l'employé concerné dans son
  propre onglet Frais & Factures, sous "Remboursés".
*/


app.patch(
  "/api/expenses/:id",
  requireDirector,
  (req, res) => {
    const expense =
      db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(req.params.id);


    if (!expense) {
      return res.status(404).json({
        error: "Note de frais introuvable."
      });
    }


    const { refunded } = req.body;


    db.prepare(`
      UPDATE expenses
      SET refunded = ?
      WHERE id = ?
    `).run(refunded ? 1 : 0, req.params.id);


    const updated =
      db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(req.params.id);


    res.json({
      success: true,
      expense: serializeExpense(updated)
    });
  }
);


/*
  Suppression d'une note de frais : le membre peut supprimer les
  siennes, le Directeur peut supprimer celles de n'importe qui.
*/


app.delete(
  "/api/expenses/:id",
  requireEMS,
  (req, res) => {
    const expense =
      db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(req.params.id);


    if (!expense) {
      return res.status(404).json({
        error: "Note de frais introuvable."
      });
    }


    if (
      expense.user_id !== req.session.user.id &&
      !req.session.user.is_director
    ) {
      return res.status(403).json({
        error: "Tu ne peux supprimer que tes propres notes de frais."
      });
    }


    db.prepare(`DELETE FROM expenses WHERE id = ?`).run(req.params.id);


    res.json({
      success: true,
      deletedExpense: expense.id
    });
  }
);

app.get(
  "/api/director/expenses",
  requireDirector,
  (req, res) => {
    const expenses =
      db.prepare(`
        SELECT
          e.*,
          COALESCE(u.nickname, u.username) AS employee
        FROM expenses e
        LEFT JOIN users u
          ON u.id = e.user_id
        ORDER BY e.created_at DESC
      `).all()
      .map(serializeExpense);

    res.json({ expenses });
  }
);


/* =========================================================
   FACTURES LSMC
========================================================= */


/*
  Liste des factures du membre connecté.
*/


app.get(
  "/api/invoices",
  requireEMS,
  (req, res) => {
    const invoices =
      db.prepare(`
        SELECT *
        FROM invoices
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(req.session.user.id);


    res.json({ invoices });
  }
);


/*
  Création d'une ou plusieurs factures en un seul envoi
  (sélection multiple des motifs côté front, "items": [...]).
  Compatibilité conservée avec l'ancien format à un seul
  motif/montant si "items" n'est pas fourni.
*/


app.post(
  "/api/invoices",
  requireEMS,
  (req, res) => {
    const { service, matricule, items } = req.body;


    if (!service) {
      return res.status(400).json({
        error: "Service destinataire obligatoire."
      });
    }


    const lines =
      Array.isArray(items) && items.length
        ? items
        : [{ motif: req.body.motif, amount: req.body.amount }];


    const cleanLines = lines
      .map(l => ({
        motif: (l.motif || "").trim(),
        amount: Number(l.amount)
      }))
      .filter(l => l.motif && Number.isFinite(l.amount) && l.amount > 0);


    if (!cleanLines.length) {
      return res.status(400).json({
        error: "Sélectionne au moins un motif avec un montant valide."
      });
    }


    const insert =
      db.prepare(`
        INSERT INTO invoices (user_id, service, matricule, motif, amount)
        VALUES (?, ?, ?, ?, ?)
      `);


    const insertedIds = [];


    const insertAll = db.transaction(rows => {
      for (const row of rows) {
        const result = insert.run(
          req.session.user.id,
          service,
          matricule || null,
          row.motif,
          row.amount
        );


        insertedIds.push(result.lastInsertRowid);
      }
    });


    insertAll(cleanLines);


    const invoices =
      db.prepare(`
        SELECT * FROM invoices
        WHERE id IN (${insertedIds.map(() => "?").join(",")})
      `).all(...insertedIds);


    res.json({ success: true, invoices });
  }
);


/*
  Suppression d'une facture : le membre peut supprimer les
  siennes, le Directeur peut supprimer celles de n'importe qui.
*/


app.delete(
  "/api/invoices/:id",
  requireEMS,
  (req, res) => {
    const invoice =
      db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);


    if (!invoice) {
      return res.status(404).json({
        error: "Facture introuvable."
      });
    }


    if (
      invoice.user_id !== req.session.user.id &&
      !req.session.user.is_director
    ) {
      return res.status(403).json({
        error: "Tu ne peux supprimer que tes propres factures."
      });
    }


    db.prepare(`DELETE FROM invoices WHERE id = ?`).run(req.params.id);


    res.json({
      success: true,
      deletedInvoice: invoice.id
    });
  }
);


/*
  DIRECTION — Toutes les factures enregistrées par le personnel LSMC.
*/


app.get(
  "/api/director/invoices",
  requireDirector,
  (req, res) => {
    const invoices =
      db.prepare(`
        SELECT
          i.*,
          COALESCE(u.nickname, u.username) AS employee
        FROM invoices i
        LEFT JOIN users u
          ON u.id = i.user_id
        ORDER BY i.created_at DESC
      `).all();


    res.json({ invoices });
  }
);


/* =========================================================
   MODÈLES DE DOCUMENTS (attestations, certificats médicaux...)


   Le contenu d'un modèle peut contenir des paramètres au format
   {{nom_du_parametre}}, détectés et remplacés côté front au moment
   de générer le document. Seul le Directeur peut créer/modifier/
   supprimer un modèle ; tout le personnel LSMC peut les utiliser.
========================================================= */


/*
  Réglages globaux liés aux documents : logo de l'établissement
  (image PNG en base64), utilisé sur l'en-tête de chaque document
  généré. Modifiable uniquement par le Directeur.
*/


app.get(
  "/api/app-settings",
  requireEMS,
  (req, res) => {
    res.json({
      logo_image: getAppSetting("document_logo")
    });
  }
);


app.put(
  "/api/app-settings",
  requireDirector,
  (req, res) => {
    const { logo_image } = req.body;


    if (typeof logo_image === "string" && logo_image.length > 4_000_000) {
      return res.status(400).json({
        error: "Le logo est trop lourd (max ~3 Mo)."
      });
    }


    setAppSetting("document_logo", logo_image || "");


    res.json({ success: true, logo_image: logo_image || "" });
  }
);


app.get(
  "/api/document-templates",
  requireEMS,
  (req, res) => {
    const templates =
      db.prepare(`
        SELECT
          t.*,
          COALESCE(u.nickname, u.username) AS creator
        FROM document_templates t
        LEFT JOIN users u
          ON u.id = t.created_by
        ORDER BY t.title ASC
      `).all();


    res.json({ templates });
  }
);


app.post(
  "/api/document-templates",
  requireDirector,
  (req, res) => {
    const { title, content, accent_color } = req.body;


    if (!title || !title.trim()) {
      return res.status(400).json({
        error: "Titre obligatoire."
      });
    }


    if (!content || !content.trim()) {
      return res.status(400).json({
        error: "Contenu obligatoire."
      });
    }


    const result =
      db.prepare(`
        INSERT INTO document_templates (title, content, accent_color, created_by)
        VALUES (?, ?, ?, ?)
      `).run(
        title.trim(),
        content,
        accent_color || "#e5352b",
        req.session.user.id
      );


    const template =
      db.prepare(`SELECT * FROM document_templates WHERE id = ?`).get(result.lastInsertRowid);


    res.json({ success: true, template });
  }
);


app.put(
  "/api/document-templates/:id",
  requireDirector,
  (req, res) => {
    const existing =
      db.prepare(`SELECT * FROM document_templates WHERE id = ?`).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Modèle introuvable."
      });
    }


    const { title, content, accent_color } = req.body;


    if (!title || !title.trim()) {
      return res.status(400).json({
        error: "Titre obligatoire."
      });
    }


    if (!content || !content.trim()) {
      return res.status(400).json({
        error: "Contenu obligatoire."
      });
    }


    db.prepare(`
      UPDATE document_templates
      SET title = ?, content = ?, accent_color = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(
      title.trim(),
      content,
      accent_color || existing.accent_color || "#e5352b",
      isoNow(),
      req.session.user.id,
      req.params.id
    );


    const updated =
      db.prepare(`SELECT * FROM document_templates WHERE id = ?`).get(req.params.id);


    res.json({ success: true, template: updated });
  }
);


app.delete(
  "/api/document-templates/:id",
  requireDirector,
  (req, res) => {
    const existing =
      db.prepare(`SELECT * FROM document_templates WHERE id = ?`).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Modèle introuvable."
      });
    }


    db.prepare(`DELETE FROM document_templates WHERE id = ?`).run(req.params.id);


    res.json({
      success: true,
      deletedTemplate: existing.id
    });
  }
);


/* =========================================================
   CANDIDATURES (espace citoyen -> reçues en Direction)
========================================================= */


app.post(
  "/api/applications",
  requireLogin,
  (req, res) => {
    const {
      first_name,
      last_name,
      birth_date,
      phone,
      medical_experience,
      motivation
    } = req.body;


    if (!first_name || !last_name) {
      return res.status(400).json({
        error: "Nom et prénom obligatoires."
      });
    }


    if (
      (medical_experience && medical_experience.length > 3000) ||
      (motivation && motivation.length > 3000)
    ) {
      return res.status(400).json({
        error: "Un des champs dépasse la limite de 3000 caractères."
      });
    }


    const result =
      db.prepare(`
        INSERT INTO applications
        (user_id, first_name, last_name, birth_date, phone, medical_experience, motivation, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Nouvelle')
      `).run(
        req.session.user.id,
        first_name.trim(),
        last_name.trim(),
        birth_date || null,
        phone || null,
        medical_experience || null,
        motivation || null
      );


    const application =
      db.prepare(`SELECT * FROM applications WHERE id = ?`).get(result.lastInsertRowid);


    res.json({ success: true, application });
  }
);


/*
  Liste des candidatures reçues, réservée au Directeur (onglet
  Direction, avec séparation par rapport au reste de la page).
*/


app.get(
  "/api/applications",
  requireDirector,
  (req, res) => {
    const applications =
      db.prepare(`
        SELECT *
        FROM applications
        ORDER BY created_at DESC
      `).all();


    res.json({ applications });
  }
);


/*
  Supprimer une candidature individuellement, réservé au Directeur.
*/


app.delete(
  "/api/applications/:id",
  requireDirector,
  (req, res) => {
    const existing =
      db.prepare(`SELECT * FROM applications WHERE id = ?`).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: "Candidature introuvable."
      });
    }


    db.prepare(`
      DELETE FROM applications WHERE id = ?
    `).run(req.params.id);


    res.json({
      success: true,
      deletedApplication: existing.id
    });
  }
);


/* =========================================================
   ROUTE FRONTEND
========================================================= */


/*
  Express 5 n'accepte pas app.get("*").
  On utilise donc app.use() pour le fallback.
*/


app.use(
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);


/* =========================================================
   DÉMARRAGE
========================================================= */


app.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "================================="
    );
    console.log(
      " NEWYORK - PRESBYTERIAN HOSPITAL — LSMC DASHBOARD"
    );
    console.log(
      "================================="
    );
    console.log(
      `http://localhost:${PORT}`
    );
    console.log("");
    console.log(
      "Base SQLite : database.db"
    );
    console.log(
      "Patients enrichis : OK"
    );
    console.log(
      "Interventions (CRUD + image) : OK"
    );
    console.log(
      "Direction : OK"
    );
    console.log(
      "Rendez-vous + Candidatures (espace citoyen) : OK"
    );
    console.log(
      "Frais & Factures LSMC (CRUD) : OK"
    );
    console.log("");
  }
);
