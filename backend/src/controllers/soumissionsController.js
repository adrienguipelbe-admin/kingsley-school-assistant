const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// POST /api/soumissions — créer une soumission avec fichiers
const creerSoumission = async (req, res) => {
  const { matieres_ids, date_cours } = req.body;
  const files = req.files || [];

  if (!matieres_ids) return res.status(400).json({ error: 'matieres_ids requis' });

  let ids;
  try { ids = JSON.parse(matieres_ids); } catch { ids = [matieres_ids]; }

  try {
    const soumission = await pool.query(
      `INSERT INTO soumissions (user_id, matieres_ids, date_cours, statut)
       VALUES ($1, $2, $3, 'traitement') RETURNING *`,
      [req.user.id, ids, date_cours || new Date().toISOString().split('T')[0]]
    );
    const soumissionId = soumission.rows[0].id;

    // Enregistrer chaque fichier
    for (const file of files) {
      const matiereId = req.body[`matiere_${file.fieldname}`] || ids[0];
      await pool.query(
        `INSERT INTO fichiers_cours (soumission_id, matiere_id, nom_original, nom_stocke, type_mime, taille_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [soumissionId, matiereId, file.originalname, file.filename, file.mimetype, file.size]
      );
    }

    // Lancer la génération de fiches en arrière-plan
    genererFichesEnBackground(soumissionId, req.user.id, ids, files);

    res.status(201).json({ soumission_id: soumissionId, statut: 'traitement' });
  } catch (err) {
    console.error('creerSoumission error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Génération asynchrone des fiches pour chaque matière
async function genererFichesEnBackground(soumissionId, userId, matiereIds, files) {
  try {
    for (const matiereId of matiereIds) {
      const matiereRes = await pool.query('SELECT nom FROM matieres WHERE id=$1', [matiereId]);
      if (!matiereRes.rows.length) continue;
      const matiereName = matiereRes.rows[0].nom;

      // Contenu par défaut si pas de fichier lisible automatiquement
      const contenuCours = `Cours de ${matiereName} — soumission du ${new Date().toLocaleDateString('fr-FR')}. Génère une fiche de révision générale sur les concepts fondamentaux de cette matière pour un étudiant Ingé1.`;

      const prompt = `Tu es un expert en ${matiereName}. ${contenuCours}

Génère une fiche de révision structurée au format JSON UNIQUEMENT :
{
  "titre": "Titre du chapitre",
  "definition": "Définition principale (2-3 phrases)",
  "points_cles": ["point 1", "point 2", "point 3", "point 4"],
  "formules": ["formule 1 si applicable"],
  "exemples": ["exemple concret 1"],
  "a_retenir": "Ce qu'il faut absolument retenir",
  "mots_cles": ["mot1", "mot2", "mot3"]
}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const rawText = data.content?.map(b => b.text || '').join('');
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const ficheContenu = JSON.parse(jsonMatch[0]);

      const ficheResult = await pool.query(
        `INSERT INTO fiches (user_id, matiere_id, titre, contenu)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [userId, matiereId, ficheContenu.titre || `Fiche ${matiereName}`, JSON.stringify(ficheContenu)]
      );

      // Mettre à jour le fichier associé
      await pool.query(
        `UPDATE fichiers_cours SET fiche_generee_id=$1
         WHERE soumission_id=$2 AND matiere_id=$3`,
        [ficheResult.rows[0].id, soumissionId, matiereId]
      );

      // Mettre à jour progression
      await pool.query(
        `INSERT INTO progression (user_id, matiere_id, fiches_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (user_id, matiere_id) DO UPDATE
         SET fiches_count = progression.fiches_count + 1, updated_at=NOW()`,
        [userId, matiereId]
      );
    }

    await pool.query(
      "UPDATE soumissions SET statut='termine' WHERE id=$1", [soumissionId]
    );
  } catch (err) {
    console.error('genererFichesEnBackground error:', err);
    await pool.query(
      "UPDATE soumissions SET statut='erreur' WHERE id=$1", [soumissionId]
    );
  }
}

// GET /api/soumissions/:id/statut
const getStatut = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, statut, created_at FROM soumissions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Soumission introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { creerSoumission, getStatut };
