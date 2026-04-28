# 🎓 KSA — Kingsley School Assistant

Assistant académique intelligent pour les étudiants Ingé1 de Kingsley School, Yaoundé.

---

## 📁 Structure du projet

```
ksa-project/
├── backend/                    # API Node.js + Express
│   ├── src/
│   │   ├── server.js           # Point d'entrée principal
│   │   ├── config/
│   │   │   ├── db.js           # Connexion PostgreSQL
│   │   │   └── migrate.js      # Création des tables + données initiales
│   │   ├── controllers/
│   │   │   ├── authController.js       # Inscription, connexion, profil
│   │   │   ├── chatController.js       # Chat IA (Claude API)
│   │   │   ├── fichesController.js     # Fiches de révision
│   │   │   ├── exercicesController.js  # Exercices QCM
│   │   │   ├── soumissionsController.js # Cours du jour
│   │   │   ├── progressionController.js # Stats étudiant
│   │   │   └── adminController.js      # Dashboard admin
│   │   ├── middlewares/
│   │   │   ├── auth.js         # JWT auth + admin guard
│   │   │   └── upload.js       # Multer fichiers (PDF/vidéo)
│   │   └── routes/
│   │       └── index.js        # Toutes les routes API
│   ├── uploads/                # Fichiers soumis (ignoré par git)
│   ├── package.json
│   └── .env.example            # Template variables d'environnement
│
├── frontend/
│   └── index.html              # App complète (SPA HTML/CSS/JS)
│
├── render.yaml                 # Config déploiement Render
└── README.md
```

---

## 🛠️ Installation locale

### 1. Prérequis

- Node.js >= 18
- PostgreSQL installé et démarré
- Un compte [Anthropic](https://console.anthropic.com) pour la clé API

### 2. Backend

```bash
cd backend

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
# Édite .env et remplis toutes les valeurs

# Créer la base de données PostgreSQL
psql -U postgres -c "CREATE DATABASE ksa_db;"

# Lancer la migration (crée les tables + insère les matières + crée l'admin)
npm run db:migrate

# Démarrer le serveur de développement
npm run dev
# → Écoute sur http://localhost:3001
```

### 3. Frontend

Ouvre simplement `frontend/index.html` dans ton navigateur.

> Si tu héberges le frontend sur un autre port, mets à jour `API_URL` dans `frontend/index.html` :
> ```js
> const API_URL = 'http://localhost:3001/api';
> ```

---

## 🌐 Déploiement sur Render (gratuit)

### Étape 1 — Préparer le dépôt Git

```bash
git init
git add .
git commit -m "Initial commit — KSA"
# Crée un repo sur GitHub et pousse
git remote add origin https://github.com/TON_USER/ksa-project.git
git push -u origin main
```

### Étape 2 — Créer les services sur Render

1. Va sur [render.com](https://render.com) → **New → Blueprint**
2. Connecte ton repo GitHub
3. Render détecte automatiquement le fichier `render.yaml`
4. Il crée : **PostgreSQL** + **Backend Web Service** + **Frontend Static Site**

### Étape 3 — Variables d'environnement à renseigner manuellement

Dans le dashboard Render, pour le service `ksa-backend`, ajoute :

| Variable | Valeur |
|----------|--------|
| `ANTHROPIC_API_KEY` | Ta clé API Anthropic |
| `ALLOWED_ORIGINS` | URL de ton frontend Render (ex: `https://ksa-frontend.onrender.com`) |
| `ADMIN_PASSWORD` | Mot de passe admin de ton choix |

### Étape 4 — Lancer la migration

Dans le shell Render du service `ksa-backend` :
```bash
npm run db:migrate
```

### Étape 5 — Configurer le frontend

Dans `frontend/index.html`, remplace la valeur de `API_URL` :
```js
const API_URL = 'https://ksa-backend.onrender.com/api';
```
Puis redéploie.

---

## 🔌 Routes API

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/register` | Créer un compte |
| POST | `/api/auth/login` | Se connecter |
| GET | `/api/auth/me` | Profil utilisateur |
| PUT | `/api/auth/profil` | Modifier le profil |

### Chat IA
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/chat` | Envoyer un message |
| GET | `/api/chat/history` | Historique du chat |
| DELETE | `/api/chat/history` | Effacer l'historique |

### Fiches
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/fiches` | Mes fiches |
| GET | `/api/fiches/:id` | Une fiche |
| POST | `/api/fiches/generate` | Générer une fiche (IA) |
| DELETE | `/api/fiches/:id` | Supprimer une fiche |

### Exercices
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/exercices` | Liste des exercices |
| POST | `/api/exercices/generate` | Générer des exercices (IA) |
| POST | `/api/exercices/:id/repondre` | Soumettre une réponse |

### Cours du jour
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/soumissions` | Soumettre les cours du jour |
| GET | `/api/soumissions/:id/statut` | Statut de la génération |

### Admin (réservé)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/stats` | Statistiques globales |
| GET | `/api/admin/users` | Liste des étudiants |
| DELETE | `/api/admin/users/:id` | Supprimer un compte |
| GET | `/api/admin/matieres` | Liste des matières |
| PUT | `/api/admin/matieres/:id` | Modifier une matière |

---

## 🔐 Sécurité

- **JWT** : tokens 7 jours, signés avec secret fort
- **bcrypt** : mots de passe hashés (coût 12)
- **Helmet** : headers HTTP sécurisés
- **Rate limiting** : 100 req/15 min (API), 20 msg/min (chat)
- **CORS** : origines autorisées uniquement
- **Validation** : inputs validés côté serveur

---

## 🗄️ Schéma base de données

```
users ─────────────────────────────────────────────────┐
  ├── fiches                                            │
  ├── exercices                                         │
  ├── resultats_exercices                               │
  ├── soumissions ──► fichiers_cours ──► fiches         │
  ├── chat_messages                                     │
  ├── programme                                         │
  └── progression (user × matiere)                     │
                                                        │
matieres ◄─────────────────────────────────────────────┘
```

---

## 📱 Fonctionnalités implémentées

- [x] Inscription / Connexion avec JWT
- [x] Dashboard étudiant avec stats réelles
- [x] Discussion IA réelle (Claude API) avec historique BDD
- [x] Génération de fiches par IA
- [x] Génération d'exercices QCM par IA
- [x] Soumission des cours du jour (PDF/vidéo)
- [x] Suivi de progression par matière
- [x] Dashboard administrateur
- [x] Personnalisation du profil
- [x] Déploiement Render prêt

## 🚧 À faire (prochaines étapes)

- [ ] Extraction de texte des PDFs soumis (pdfjs ou API)
- [ ] Génération de programme de révision intelligent
- [ ] Notifications push
- [ ] Mode hors-ligne (PWA)
- [ ] Application mobile (React Native)
