const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

// GET /api/fiches
const getFiches = async (req, res) => {
  const { matiere_id } = req.query;
  try {
    let query = `
      SELECT f.*, m.nom as matiere_nom, m.emoji, m.couleur
      FROM fiches f
      LEFT JOIN matieres m ON f.matiere_id = m.id
      WHERE f.user_id = $1
    `;
    const params = [req.user.id];
    if (matiere_id) { query += ' AND f.matiere_id=$2'; params.push(matiere_id); }
    query += ' ORDER BY f.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/fiches/:id
const getFiche = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, m.nom as matiere_nom, m.emoji, m.couleur
       FROM fiches f LEFT JOIN matieres m ON f.matiere_id=m.id
       WHERE f.id=$1 AND f.user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Fiche introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/fiches/generate — génère une fiche via Claude à partir d'un texte extrait
const generateFiche = async (req, res) => {
  const { matiere_id, contenu_cours, titre } = req.body;
  if (!matiere_id || !contenu_cours)
    return res.status(400).json({ error: 'matiere_id et contenu_cours requis' });

  try {
    const matiereRes = await pool.query('SELECT nom FROM matieres WHERE id=$1', [matiere_id]);
    if (!matiereRes.rows.length) return res.status(404).json({ error: 'Matière introuvable' });
    const matiereName = matiereRes.rows[0].nom;

    const prompt = `Tu es un expert en ${matiereName}. Voici le contenu d'un cours :

---
${contenu_cours.slice(0, 8000)}
---

Génère une fiche de révision structurée au format JSON UNIQUEMENT (pas de markdown, pas de texte hors JSON) :
{
  "titre": "Titre du chapitre",
  "definition": "Définition principale ou concept central (2-3 phrases)",
  "points_cles": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "formules": ["formule 1 si applicable", "formule 2"],
  "exemples": ["exemple concret 1", "exemple 2"],
  "a_retenir": "Ce qu'il faut absolument retenir (1-2 phrases)",
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
    if (!response.ok) throw new Error(data.error?.message);

    const rawText = data.content?.map(b => b.text || '').join('');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Format JSON invalide retourné par l\'IA');

    const ficheContenu = JSON.parse(jsonMatch[0]);
    const ficheTitle = titre || ficheContenu.titre || 'Fiche sans titre';

    const result = await pool.query(
      `INSERT INTO fiches (user_id, matiere_id, titre, contenu)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, matiere_id, ficheTitle, JSON.stringify(ficheContenu)]
    );

    // Mettre à jour progression
    await pool.query(
      `INSERT INTO progression (user_id, matiere_id, fiches_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, matiere_id) DO UPDATE
       SET fiches_count = progression.fiches_count + 1, updated_at=NOW()`,
      [req.user.id, matiere_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('generateFiche error:', err);
    res.status(500).json({ error: err.message || 'Erreur génération fiche' });
  }
};

// DELETE /api/fiches/:id
const deleteFiche = async (req, res) => {
  try {
    await pool.query('DELETE FROM fiches WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { getFiches, getFiche, generateFiche, deleteFiche };
