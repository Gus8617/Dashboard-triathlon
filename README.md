# 🏊🚴🏃 Dashboard Triathlon - Suivi d'Entraînement

Dashboard personnel pour suivre vos entraînements de triathlon avec intégration automatique **Strava** et **Garmin**. Optimisé pour **Raspberry Pi**.

![Dashboard Preview](https://via.placeholder.com/800x400/3b82f6/ffffff?text=Dashboard+Triathlon)

## ✨ Fonctionnalités

### 📊 Métriques de charge
- **ATL** (Acute Training Load) - Charge sur 7 jours
- **CTL** (Chronic Training Load) - Forme sur 42 jours  
- **TSB** (Training Stress Balance) - Niveau de fraîcheur/fatigue
- Calcul automatique du **TSS** (Training Stress Score)

### 🔄 Intégrations automatiques
- **Strava** : Synchronisation des activités (natation, vélo, course)
- **Garmin** : Import des données de sommeil (durée, qualité, HRV, FC repos)
- Pas de doublons, fusion intelligente des données

### 📈 Visualisations
- Graphique d'évolution de la charge (ATL/CTL/TSB)
- Volume d'entraînement par discipline
- Qualité du sommeil et corrélations
- Historique complet des activités

### 🤖 Automatisation
- Synchronisation Strava : toutes les heures
- Synchronisation Garmin : quotidienne (7h)
- Stockage persistant des données
- Refresh automatique des tokens OAuth

## 🚀 Installation rapide

### Prérequis
- Raspberry Pi 3B+ ou supérieur (recommandé: Pi 4 avec 4GB RAM)
- Raspberry Pi OS (Bullseye ou plus récent)
- Connexion Internet

### Installation en une commande

```bash
curl -sSL https://your-repo.com/install.sh | bash
```

### Installation manuelle

```bash
# 1. Cloner le projet
git clone https://github.com/your-username/triathlon-dashboard.git
cd triathlon-dashboard

# 2. Installer Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Installer les dépendances
npm install

# 4. Configurer les APIs
cp .env.example .env
nano .env  # Ajoutez vos clés API

# 5. Démarrer
npm start
```

Le dashboard sera accessible sur **http://your-raspberry-ip:3000**

## 🔑 Configuration des APIs

### Strava API

1. Allez sur [strava.com/settings/api](https://www.strava.com/settings/api)
2. Créez une application
3. Configurez :
   - **Authorization Callback Domain** : votre IP Raspberry
   - **Website** : `http://your-ip:3000`
4. Copiez **Client ID** et **Client Secret** dans `.env`

### Garmin Health API

1. Inscrivez-vous sur [developer.garmin.com](https://developer.garmin.com)
2. Créez une application Health API
3. Copiez **Consumer Key** et **Consumer Secret** dans `.env`

### Fichier .env

```bash
PORT=3000

# Strava
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123def456
STRAVA_REDIRECT_URI=http://192.168.1.100:3000/auth/strava/callback

# Garmin
GARMIN_CONSUMER_KEY=your_key
GARMIN_CONSUMER_SECRET=your_secret
```

## 📱 Utilisation

### Première connexion

1. Accédez à `http://your-raspberry-ip:3000`
2. Onglet **Strava** → "Se connecter avec Strava"
3. Autorisez l'accès sur Strava
4. Onglet **Garmin** → "Configurer Garmin"  
5. Autorisez l'accès sur Garmin
6. Synchronisez vos données !

### Navigation

- **Tableau de bord** : Vue d'ensemble (ATL/CTL/TSB, graphiques)
- **Activités** : Liste complète, import manuel, détails
- **Strava** : Connexion et synchronisation
- **Garmin** : Connexion et données de sommeil

### Synchronisation

**Manuelle** :
- Cliquez sur "Synchroniser" dans chaque onglet

**Automatique** :
- Strava : toutes les heures
- Garmin : tous les jours à 7h du matin

## 🔧 Administration

### Démarrage automatique (systemd)

```bash
# Créer le service
sudo nano /etc/systemd/system/triathlon-dashboard.service

# Activer
sudo systemctl enable triathlon-dashboard
sudo systemctl start triathlon-dashboard

# Vérifier le statut
sudo systemctl status triathlon-dashboard
```

### Commandes utiles

```bash
# Voir les logs en temps réel
sudo journalctl -u triathlon-dashboard -f

# Redémarrer le service
sudo systemctl restart triathlon-dashboard

# Arrêter le service
sudo systemctl stop triathlon-dashboard

# Backup de la base de données
./scripts/backup.sh

# Restaurer un backup
./scripts/restore.sh ~/triathlon-backups/dashboard_20250128_120000.tar.gz
```

### Accès depuis l'extérieur

**Option 1 - Port Forwarding** :
Configurez votre box pour rediriger le port 3000 vers votre Raspberry Pi

**Option 2 - Cloudflare Tunnel** (recommandé) :
```bash
# Installer cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared-linux-arm64.deb

# Créer un tunnel
cloudflared tunnel create triathlon-dashboard

# Exposer le service
cloudflared tunnel route dns triathlon-dashboard triathlon.yourdomain.com
```

## 📊 Structure des données

### Activités (db.json)

```json
{
  "id": 16741673049,
  "name": "Sortie vélo",
  "type": "bike",
  "date": "2025-12-14",
  "duration": 156,
  "distance": 68.11,
  "avgHR": 146.3,
  "maxHR": 167.0,
  "elevation": 903.0,
  "tss": 197,
  "source": "Strava"
}
```

### Sommeil (db.json)

```json
{
  "date": "2025-12-27",
  "duration": 450,
  "quality": 85,
  "deepSleep": 120,
  "lightSleep": 280,
  "remSleep": 50,
  "awake": 30,
  "hrv": 65,
  "restingHR": 48
}
```

## 🔐 Sécurité

- ✅ Tokens OAuth stockés localement
- ✅ Pas de transmission à des serveurs tiers
- ✅ Communications HTTPS avec les APIs
- ⚠️ Ne jamais exposer le port 3000 directement sur Internet
- ⚠️ Utilisez un reverse proxy ou Cloudflare Tunnel

## 🐛 Dépannage

### Le serveur ne démarre pas

```bash
# Vérifier Node.js
node --version  # Doit être >= 18.0.0

# Vérifier les dépendances
npm install

# Voir les erreurs
npm start
```

### Erreur de connexion Strava/Garmin

1. Vérifiez le fichier `.env`
2. Vérifiez les URLs de callback dans vos apps Strava/Garmin
3. Vérifiez que votre IP est correcte : `hostname -I`

### La synchronisation ne fonctionne pas

```bash
# Tester l'API manuellement
curl http://localhost:3000/api/status

# Vérifier les tokens
cat data/db.json | grep -A 5 '"tokens"'

# Forcer une synchronisation
curl -X POST http://localhost:3000/api/sync/strava
```

## 📈 Roadmap

### Version 1.1
- [ ] Analyse des zones cardiaques
- [ ] Corrélation sommeil/performance
- [ ] Export CSV/Excel
- [ ] Notifications mobile

### Version 2.0
- [ ] Planification d'entraînement
- [ ] Alertes de surcharge
- [ ] Prédiction de forme
- [ ] Comparaisons périodes

### Version 3.0
- [ ] Multi-utilisateurs
- [ ] Application mobile native
- [ ] IA pour recommandations

## 🤝 Contribution

Les contributions sont les bienvenues !

1. Fork le projet
2. Créez une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

MIT License - Voir [LICENSE](LICENSE)

## 🙏 Remerciements

- [Strava API](https://developers.strava.com/)
- [Garmin Health API](https://developer.garmin.com/)
- [Recharts](https://recharts.org/)
- Communauté triathlon 🏊🚴🏃

## 📞 Support

- 📧 Email : your-email@example.com
- 💬 Discord : [Lien vers serveur]
- 🐛 Issues : [GitHub Issues](https://github.com/your-username/triathlon-dashboard/issues)

---

**Fait avec ❤️ pour la communauté triathlon**

*"Train smart, not just hard"*