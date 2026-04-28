const pool = require('../config/db');

// GET /api/exercices?matiere_id=&niveau=
const getExercices = async (req, res) => {
  const { matiere_id, niveau } = req.query;
  try {
    let query = `
      SELECT e.*, m.nom as matiere_nom, m.emoji, m.couleur
      FROM exercices e LEFT JOIN matieres m ON e.matiere_id=m.id
      WHERE (e.user_id=$1 OR e.user_id IS NULL)
    `;
    const params = [req.user.id];
    if (matiere_id) { query += ` AND e.matiere_id=$${params.length+1}`; params.push(matiere_id); }
    if (niveau) { query += ` AND e.niveau=$${params.length+1}`; params.push(niveau); }
    query += ' ORDER BY e.created_at DESC LIMIT 20';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/exercices/generate
const generateExercices = async (req, res) => {
  const { matiere_id, fiche_id, niveau = 'moyen', nombre = 5 } = req.body;
  if (!matiere_id) return res.status(400).json({ error: 'matiere_id requis' });

  try {
    const matiereRes = await pool.query('SELECT nom FROM matieres WHERE id=$1', [matiere_id]);
    if (!matiereRes.rows.length) return res.status(404).json({ error: 'Matière introuvable' });
    const matiereName = matiereRes.rows[0].nom;

    let contexte = '';
    if (fiche_id) {
      const ficheRes = await pool.query('SELECT contenu FROM fiches WHERE id=$1', [fiche_id]);
      if (ficheRes.rows.length) contexte = `\nContexte de la fiche : ${JSON.stringify(ficheRes.rows[0].contenu)}`;
    }

    const prompt = `Tu es un professeur de ${matiereName} en 1ère année d'ingénierie.${contexte}

Génère exactement ${nombre} QCM de niveau "${niveau}" sur ${matiereName}.
Réponds UNIQUEMENT en JSON valide, sans texte hors JSON :
{
  "exercices": [
    {
      "question": "La question",
      "choix": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "reponse_correcte": "B",
      "explication": "Explication détaillée de la bonne réponse"
    }
  ]
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
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message);

    const rawText = data.content?.map(b => b.text || '').join('');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Format JSON invalide');

    const parsed = JSON.parse(jsonMatch[0]);
    const inserted = [];

    for (const ex of parsed.exercices) {
      const result = await pool.query(
        `INSERT INTO exercices (matiere_id, user_id, question, choix, reponse_correcte, explication, niveau)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [matiere_id, req.user.id, ex.question, JSON.stringify(ex.choix), ex.reponse_correcte, ex.explication, niveau]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json(inserted);
  } catch (err) {
    console.error('generateExercices error:', err);
    res.status(500).json({ error: err.message || 'Erreur génération exercices' });
  }
};

// POST /api/exercices/:id/repondre
const repondre = async (req, res) => {
  const { reponse, temps_secondes } = req.body;
  try {
    const exRes = await pool.query('SELECT * FROM exercices WHERE id=$1', [req.params.id]);
    if (!exRes.rows.length) return res.status(404).json({ error: 'Exercice introuvable' });

    const ex = exRes.rows[0];
    const correct = reponse?.toUpperCase() === ex.reponse_correcte?.toUpperCase();

    await pool.query(
      `INSERT INTO resultats_exercices (user_id, exercice_id, reponse_donnee, correct, temps_secondes)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, ex.id, reponse, correct, temps_secondes || null]
    );

    // Mettre à jour progression
    await pool.query(
      `INSERT INTO progression (user_id, matiere_id, exercices_count, exercices_reussis)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, matiere_id) DO UPDATE
       SET exercices_count = progression.exercices_count + 1,
           exercices_reussis = progression.exercices_reussis + $3,
           updated_at=NOW()`,
      [req.user.id, ex.matiere_id, correct ? 1 : 0]
    );

    res.json({ correct, reponse_correcte: ex.reponse_correcte, explication: ex.explication });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { getExercices, generateExercices, repondre };
