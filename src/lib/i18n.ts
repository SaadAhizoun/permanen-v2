// French translations dictionary
export const fr = {
  // Auth
  auth: {
    signIn: "Se connecter",
    signUp: "Créer un compte",
    signOut: "Se déconnecter",
    email: "Email",
    password: "Mot de passe",
    fullName: "Nom complet",
    noAccount: "Pas encore de compte ?",
    hasAccount: "Déjà un compte ?",
    createAccount: "Créer un compte",
    signingIn: "Connexion en cours...",
    signingUp: "Création en cours...",
  },
  
  // Approval
  approval: {
    title: "Compte en attente de validation",
    description: "Votre compte est créé, mais doit être validé par un administrateur avant d'accéder à l'application.",
    checkAccess: "Re-vérifier l'accès",
    checking: "Vérification...",
  },
  
  // Navigation
  nav: {
    dashboard: "Tableau de bord",
    planning: "Planning",
    addDuty: "Ajouter permanence",
    team: "Équipe",
    holidays: "Jours fériés",
    import: "Import",
    insights: "Aide à la décision",
    history: "Historique",
    maintenance: "Maintenance",
    settings: "Paramètres",
  },
  
  // Dashboard
  dashboard: {
    title: "Tableau de bord",
    nextDuty: "Prochaine permanence",
    myNextDuty: "Ma prochaine permanence",
    teamNextDuty: "Équipe",
    totalDuties: "Permanences ce mois",
    fairness: "Score d'équité",
    conflicts: "Alertes",
    pendingApprovals: "Approbations en attente",
    upcomingDuties: "Prochaines permanences (30 jours)",
    quickActions: "Actions rapides",
    noDuties: "Aucune permanence programmée",
    noConflicts: "Aucun conflit détecté",
  },
  
  // Planning
  planning: {
    title: "Calendrier des permanences",
    monthView: "Vue mensuelle",
    addDuty: "Ajouter une permanence",
    dayDetails: "Détails du jour",
    noDuties: "Aucune permanence",
    autoPlan: "Auto-planification",
    conflicts: "Conflits",
  },
  
  // Duties
  duty: {
    add: "Ajouter une permanence",
    edit: "Modifier la permanence",
    delete: "Supprimer",
    date: "Date",
    type: "Type",
    member: "Membre",
    notes: "Notes",
    types: {
      Day: "Jour",
      Night: "Nuit",
      Weekend: "Week-end",
      Other: "Autre",
    },
    holidayWarning: "Attention: cette date est un jour férié",
    holidayOverride: "Assigner malgré le jour férié (admin uniquement)",
    duplicateError: "Ce membre est déjà assigné à cette date",
  },
  
  // Team
  team: {
    title: "Équipe",
    addMember: "Ajouter un membre",
    editMember: "Modifier",
    deleteMember: "Supprimer",
    fullName: "Nom complet",
    email: "Email",
    grade: "Grade / Titre",
    active: "Actif",
    inactive: "Inactif",
    monthDuties: "Mois",
    yearDuties: "Année",
    lastDuty: "Dernière permanence",
    noMembers: "Aucun membre dans l'équipe",
  },
  
  // Holidays
  holidays: {
    title: "Jours fériés",
    add: "Ajouter un jour férié",
    date: "Date",
    label: "Libellé",
    country: "Pays",
    seedMorocco: "Charger les jours fériés marocains",
    year: "Année",
    noHolidays: "Aucun jour férié configuré",
  },
  
  // Import
  import: {
    title: "Importer des permanences",
    upload: "Charger un fichier",
    preview: "Aperçu",
    mapping: "Correspondance des colonnes",
    options: "Options d'import",
    preset: "Préréglage",
    coordinationPreset: "COORDINATION PLANNING",
    customMapping: "Personnalisé",
    dateColumn: "Colonne date",
    memberColumn: "Colonne membre",
    typeColumn: "Colonne type (optionnel)",
    notesColumn: "Colonne notes (optionnel)",
    gradeColumn: "Colonne grade (optionnel)",
    createMembers: "Créer les membres manquants",
    skipMissing: "Ignorer les membres manquants",
    dryRun: "Mode simulation (validation uniquement)",
    startImport: "Lancer l'import",
    results: "Résultats",
    inserted: "Insérées",
    skipped: "Ignorées",
    errors: "Erreurs",
    downloadErrors: "Télécharger les erreurs",
  },
  
  // Insights
  insights: {
    title: "Aide à la décision",
    filters: "Filtres",
    dateRange: "Période",
    dutyDistribution: "Répartition par membre",
    monthlyTrend: "Évolution mensuelle",
    typeDistribution: "Types de permanences",
    fairnessPanel: "Analyse d'équité",
    max: "Maximum",
    min: "Minimum",
    avg: "Moyenne",
    stdDev: "Écart-type",
    fairnessScore: "Score d'équité",
    fairnessExcellent: "Excellent",
    fairnessGood: "Bon",
    fairnessModerate: "À améliorer",
    fairnessPoor: "Déséquilibré",
    recommendations: "Recommandations",
    underAssigned: "Membres sous-assignés",
    overAssigned: "Membres sur-assignés",
    heatmap: "Charge par jour",
  },
  
  // Auto-plan
  autoPlan: {
    title: "Auto-planification",
    description: "Générer automatiquement des affectations équitables",
    dateRange: "Période",
    startDate: "Date de début",
    endDate: "Date de fin",
    dutyType: "Type de permanence",
    peoplePerDay: "Personnes par jour",
    includeWeekends: "Inclure les week-ends",
    excludeHolidays: "Exclure les jours fériés",
    excludeMembers: "Exclure des membres",
    strategy: "Stratégie d'équité",
    strategies: {
      leastInRange: "Moins assigné sur la période",
      leastThisMonth: "Moins assigné ce mois",
      roundRobin: "Tour à tour",
    },
    maxPerWeek: "Max par semaine (optionnel)",
    generate: "Générer le planning",
    preview: "Aperçu du planning proposé",
    apply: "Appliquer le planning",
    noConflicts: "Aucun conflit",
    conflicts: "Conflits détectés",
  },
  
  // History / Audit
  history: {
    title: "Historique des actions",
    action: "Action",
    table: "Table",
    recordId: "ID",
    user: "Utilisateur",
    date: "Date",
    actions: {
      INSERT: "Création",
      UPDATE: "Modification",
      DELETE: "Suppression",
      approve_user: "Approbation utilisateur",
      change_role: "Changement de rôle",
    },
  },
  
  // Maintenance
  maintenance: {
    title: "Maintenance",
    pendingApprovals: "Utilisateurs en attente",
    approve: "Approuver",
    userRoles: "Rôles utilisateurs",
    makeAdmin: "Promouvoir Admin",
    removeAdmin: "Rétrograder",
    cleanup: "Nettoyage des données",
    purgeAudit: "Purger l'historique",
    daysToKeep: "Jours à conserver",
    purge: "Purger",
    seedHolidays: "Jours fériés marocains",
    noUsers: "Aucun utilisateur en attente",
  },
  
  // Common
  common: {
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    add: "Ajouter",
    search: "Rechercher",
    filter: "Filtrer",
    loading: "Chargement...",
    noData: "Aucune donnée",
    confirm: "Confirmer",
    confirmDelete: "Confirmer la suppression",
    deleteWarning: "Cette action est irréversible.",
    success: "Succès",
    error: "Erreur",
    today: "Aujourd'hui",
    all: "Tous",
    active: "Actif",
    inactive: "Inactif",
    approved: "Approuvé",
    pending: "En attente",
    admin: "Admin",
    user: "Utilisateur",
  },
  
  // Errors
  errors: {
    generic: "Une erreur est survenue",
    unauthorized: "Accès non autorisé",
    notFound: "Non trouvé",
    validation: "Erreur de validation",
    duplicate: "Doublon détecté",
    holiday: "Jour férié détecté",
  },
};

export type TranslationKey = keyof typeof fr;
