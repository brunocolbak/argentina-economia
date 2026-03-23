# Argentina — Radiografía Económica

Análisis independiente de la economía argentina. Datos oficiales (INDEC, BCRA, FMI), sin afiliación política.

## 🌐 Site

- **Hub** : `index.html` — page d'accueil avec indicateurs, 5 questions, 3 niveaux de lecture
- **Rapport** : `pages/radiografia.html` — analyse complète avec 21 graphiques
- **Simulateur** : `pages/escenarios.html` — scénarios interactifs (5 paramètres, 4 scénarios)
- **Données** : `data/data.json` — source unique de vérité, toutes les séries

## 🚀 Déploiement

### Cloudflare Pages (recommandé)
1. Fork ce repo
2. Connecter sur [Cloudflare Pages](https://pages.cloudflare.com)
3. Build command: (laisser vide — site statique)
4. Output directory: `/`
5. Déploiement automatique à chaque push

### GitHub Pages
1. Settings → Pages → Source: main branch, / (root)
2. URL: `username.github.io/argentina-economia`

### Local
```bash
# N'importe quel serveur statique
npx serve .
# ou
python3 -m http.server 8000
```

## 📊 Mise à jour des données

Le fichier `data/data.json` centralise toutes les séries. Pour mettre à jour :

### Manuel
Modifier `data/data.json` et push. Le site se redéploie automatiquement.

### Automatique (GitHub Action)
Le workflow `.github/workflows/update-data.yml` exécute `scripts/update_data.py` chaque lundi.
Il scrape les API publiques INDEC/BCRA et met à jour le JSON.

## 📁 Structure
```
├── index.html              # Hub / page d'accueil
├── pages/
│   ├── radiografia.html    # Rapport complet
│   └── escenarios.html     # Simulateur de scénarios
├── data/
│   └── data.json           # Toutes les séries (source unique)
├── scripts/
│   └── update_data.py      # Script de mise à jour automatique
├── .github/
│   └── workflows/
│       └── update-data.yml # GitHub Action hebdomadaire
└── README.md
```

## 📝 Licence

Contenu sous [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Données : sources officielles publiques.
