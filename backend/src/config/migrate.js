require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Démarrage de la migration...');

    await client.query(`
      -- Extension UUID
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- ========== UTILISATEURS ==========
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        prenom VARCHAR(100) NOT NULL,
        nom VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        numero_etudiant VARCHAR(50) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'etudiant' CHECK (role IN ('etudiant', 'admin')),
        avatar_initiales VARCHAR(5),
        matieres_difficiles TEXT[] DEFAULT '{}',
        langue_ia VARCHAR(20) DEFAULT 'fr',
        notifications_actives BOOLEAN DEFAULT TRUE,
        mode_pomodoro BOOLEAN DEFAULT FALSE,
        couleur_accent VARCHAR(20) DEFAULT '#3b82f6',
        streak_jours INTEGER DEFAULT 0,
        derniere_connexion TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== MATIÈRES ==========
      CREATE TABLE IF NOT EXISTS matieres (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nom VARCHAR(200) NOT NULL,
        emoji VARCHAR(10),
        couleur VARCHAR(20),
        coefficient INTEGER DEFAULT 1,
        heures_semaine INTEGER DEFAULT 2,
        enseignant VARCHAR(200),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== FICHES DE RÉVISION ==========
      CREATE TABLE IF NOT EXISTS fiches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        matiere_id UUID REFERENCES matieres(id) ON DELETE SET NULL,
        titre VARCHAR(300) NOT NULL,
        contenu JSONB NOT NULL,
        fichier_source_nom VARCHAR(300),
        fichier_source_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== EXERCICES ==========
      CREATE TABLE IF NOT EXISTS exercices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        matiere_id UUID REFERENCES matieres(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        choix JSONB,
        reponse_correcte VARCHAR(10),
        explication TEXT,
        niveau VARCHAR(20) DEFAULT 'moyen' CHECK (niveau IN ('facile', 'moyen', 'difficile')),
        type VARCHAR(30) DEFAULT 'qcm' CHECK (type IN ('qcm', 'vrai_faux', 'ouvert')),
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== RÉSULTATS EXERCICES ==========
      CREATE TABLE IF NOT EXISTS resultats_exercices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        exercice_id UUID REFERENCES exercices(id) ON DELETE CASCADE,
        reponse_donnee VARCHAR(10),
        correct BOOLEAN,
        temps_secondes INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== SOUMISSIONS COURS DU JOUR ==========
      CREATE TABLE IF NOT EXISTS soumissions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        date_cours DATE NOT NULL DEFAULT CURRENT_DATE,
        matieres_ids UUID[],
        statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'traitement', 'termine', 'erreur')),
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== FICHIERS SOUMIS ==========
      CREATE TABLE IF NOT EXISTS fichiers_cours (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        soumission_id UUID REFERENCES soumissions(id) ON DELETE CASCADE,
        matiere_id UUID REFERENCES matieres(id) ON DELETE CASCADE,
        nom_original VARCHAR(300),
        nom_stocke VARCHAR(300),
        type_mime VARCHAR(100),
        taille_bytes INTEGER,
        fiche_generee_id UUID REFERENCES fiches(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== HISTORIQUE CHAT IA ==========
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) CHECK (role IN ('user', 'assistant')),
        contenu TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== PROGRAMME DE RÉVISION ==========
      CREATE TABLE IF NOT EXISTS programme (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        matiere_id UUID REFERENCES matieres(id) ON DELETE CASCADE,
        date_revision DATE NOT NULL,
        duree_minutes INTEGER DEFAULT 30,
        type_activite VARCHAR(50),
        complete BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ========== PROGRESSION ==========
      CREATE TABLE IF NOT EXISTS progression (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        matiere_id UUID REFERENCES matieres(id) ON DELETE CASCADE,
        score INTEGER DEFAULT 0,
        fiches_count INTEGER DEFAULT 0,
        exercices_count INTEGER DEFAULT 0,
        exercices_reussis INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, matiere_id)
      );

      -- ========== INDEX ==========
      CREATE INDEX IF NOT EXISTS idx_fiches_user ON fiches(user_id);
      CREATE INDEX IF NOT EXISTS idx_fiches_matiere ON fiches(matiere_id);
      CREATE INDEX IF NOT EXISTS idx_exercices_matiere ON exercices(matiere_id);
      CREATE INDEX IF NOT EXISTS idx_resultats_user ON resultats_exercices(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_progression_user ON progression(user_id);
    `);

    console.log('✅ Tables créées avec succès');

    // Insérer les matières Ingé1 Kingsley
    const matieresExist = await client.query('SELECT COUNT(*) FROM matieres');
    if (parseInt(matieresExist.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO matieres (nom, emoji, couleur, coefficient, heures_semaine, enseignant) VALUES
        ('Algorithmique', '🔵', '#3b82f6', 3, 4, 'M. Nkodo Pierre'),
        ('Électromagnétisme', '🟣', '#8b5cf6', 4, 3, 'Mme Atangana Sophie'),
        ('Analyse II', '🟢', '#10b981', 4, 4, 'M. Fouda Jean-Baptiste'),
        ('Géométrie', '🟠', '#f97316', 3, 3, 'M. Fouda Jean-Baptiste'),
        ('IDFOR', '🩵', '#14b8a6', 2, 2, 'M. Bebey Thomas'),
        ('Atelier d''écriture', '🩷', '#ec4899', 2, 2, 'Mme Essama Rita'),
        ('Réflexion humaine', '🔴', '#ef4444', 2, 2, 'M. Manga Christophe'),
        ('Chimie', '🟡', '#f59e0b', 3, 3, 'Mme Owona Claire'),
        ('Anglais A2', '🌐', '#06b6d4', 2, 2, 'M. Biyong Samuel')
      `);
      console.log('✅ Matières Ingé1 insérées');
    }

    // Créer l'admin par défaut
    const adminExist = await client.query("SELECT COUNT(*) FROM users WHERE role='admin'");
    if (parseInt(adminExist.rows[0].count) === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'AdminKSA2025!', 12);
      await client.query(`
        INSERT INTO users (prenom, nom, email, password_hash, role, avatar_initiales)
        VALUES ('Admin', 'KSA', $1, $2, 'admin', 'AD')
      `, [process.env.ADMIN_EMAIL || 'admin@kingsley.edu', hash]);
      console.log('✅ Compte admin créé :', process.env.ADMIN_EMAIL);
    }

    console.log('🎉 Migration terminée avec succès !');
  } catch (err) {
    console.error('❌ Erreur migration:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
