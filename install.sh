#!/bin/bash

# Script d'installation automatique du Dashboard Triathlon sur Raspberry Pi
# Usage: curl -sSL https://your-repo/install.sh | bash

set -e  # Arrêter en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions utilitaires
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  $1"
    echo "═══════════════════════════════════════════════════════"
    echo ""
}

# Vérifier si on est sur Raspberry Pi
check_raspberry_pi() {
    if [[ ! -f /proc/device-tree/model ]] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
        print_warning "Ce script est optimisé pour Raspberry Pi"
        read -p "Voulez-vous continuer quand même ? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Vérifier les prérequis
check_prerequisites() {
    print_header "Vérification des prérequis"
    
    # Vérifier la connexion Internet
    if ! ping -c 1 google.com &> /dev/null; then
        print_error "Pas de connexion Internet"
        exit 1
    fi
    print_success "Connexion Internet OK"
    
    # Vérifier l'espace disque (minimum 1GB)
    available_space=$(df / | tail -1 | awk '{print $4}')
    if [ "$available_space" -lt 1048576 ]; then
        print_error "Espace disque insuffisant (minimum 1GB requis)"
        exit 1
    fi
    print_success "Espace disque suffisant"
}

# Mettre à jour le système
update_system() {
    print_header "Mise à jour du système"
    
    print_info "Mise à jour des paquets..."
    sudo apt update -qq
    
    read -p "Voulez-vous upgrader le système ? (Recommandé mais peut prendre du temps) (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt upgrade -y
        print_success "Système mis à jour"
    else
        print_info "Mise à jour système ignorée"
    fi
}

# Installer Node.js
install_nodejs() {
    print_header "Installation de Node.js"
    
    if command -v node &> /dev/null; then
        current_version=$(node -v | cut -d'v' -f2)
        print_info "Node.js $current_version déjà installé"
        
        # Vérifier la version (minimum 18.x)
        major_version=$(echo $current_version | cut -d'.' -f1)
        if [ "$major_version" -lt 18 ]; then
            print_warning "Version de Node.js trop ancienne (minimum 18.x requis)"
            read -p "Mettre à jour Node.js ? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                return
            fi
        else
            print_success "Version de Node.js OK"
            return
        fi
    fi
    
    print_info "Installation de Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    
    print_success "Node.js $(node -v) installé"
    print_success "npm $(npm -v) installé"
}

# Créer la structure du projet
setup_project() {
    print_header "Configuration du projet"
    
    PROJECT_DIR="$HOME/triathlon-dashboard"
    
    if [ -d "$PROJECT_DIR" ]; then
        print_warning "Le dossier $PROJECT_DIR existe déjà"
        read -p "Voulez-vous le supprimer et réinstaller ? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Sauvegarder la base de données si elle existe
            if [ -f "$PROJECT_DIR/data/db.json" ]; then
                print_info "Sauvegarde de la base de données..."
                cp "$PROJECT_DIR/data/db.json" "$HOME/db_backup_$(date +%Y%m%d_%H%M%S).json"
                print_success "Base de données sauvegardée"
            fi
            rm -rf "$PROJECT_DIR"
        else
            print_info "Installation annulée"
            exit 0
        fi
    fi
    
    print_info "Création du dossier projet..."
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    # Créer la structure
    mkdir -p data logs public scripts
    
    print_success "Structure du projet créée"
}

# Configurer les fichiers
configure_files() {
    print_header "Configuration des fichiers"
    
    # Créer package.json
    print_info "Création de package.json..."
    cat > package.json << 'EOF'
{
  "name": "triathlon-dashboard",
  "version": "1.0.0",
  "description": "Dashboard de suivi d'entraînement triathlon",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "oauth-1.0a": "^2.2.6",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF
    
    # Créer .gitignore
    print_info "Création de .gitignore..."
    cat > .gitignore << 'EOF'
node_modules/
.env
data/db.json
logs/*.log
*.backup
.DS_Store
EOF
    
    # Créer le fichier .env avec des valeurs par défaut
    print_info "Création du fichier .env..."
    
    # Obtenir l'IP locale
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    cat > .env << EOF
# Configuration du Dashboard Triathlon
PORT=3000

# Strava API
# Obtenez vos clés sur: https://www.strava.com/settings/api
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://${LOCAL_IP}:3000/auth/strava/callback

# Garmin API
# Obtenez vos clés sur: https://developer.garmin.com
GARMIN_CONSUMER_KEY=
GARMIN_CONSUMER_SECRET=

# Configuration
STRAVA_SYNC_INTERVAL=1
GARMIN_SYNC_TIME=07:00
DATA_FETCH_DAYS=90
DEBUG_MODE=false
EOF
    
    print_success "Fichiers de configuration créés"
    print_warning "N'oubliez pas de configurer le fichier .env avec vos clés API !"
}

# Installer les dépendances
install_dependencies() {
    print_header "Installation des dépendances"
    
    print_info "Installation des modules npm..."
    npm install --production
    
    print_success "Dépendances installées"
}

# Télécharger les fichiers du projet
download_project_files() {
    print_header "Téléchargement des fichiers du projet"
    
    print_warning "Cette étape nécessite que vous ayez le fichier server.js"
    print_info "Placez server.js dans le dossier $PROJECT_DIR"
    
    read -p "Avez-vous le fichier server.js prêt ? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Vous devrez copier manuellement server.js dans $PROJECT_DIR"
    fi
}

# Configurer le service systemd
setup_systemd_service() {
    print_header "Configuration du service systemd"
    
    read -p "Voulez-vous configurer le démarrage automatique ? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Configuration du service ignorée"
        return
    fi
    
    print_info "Création du service systemd..."
    
    sudo tee /etc/systemd/system/triathlon-dashboard.service > /dev/null << EOF
[Unit]
Description=Triathlon Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which node) server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    # Recharger systemd
    sudo systemctl daemon-reload
    
    # Activer le service
    sudo systemctl enable triathlon-dashboard
    
    print_success "Service systemd configuré"
    print_info "Le service démarrera automatiquement au boot"
}

# Créer les scripts utilitaires
create_utility_scripts() {
    print_header "Création des scripts utilitaires"
    
    # Script de backup
    cat > scripts/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/triathlon-backups"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/dashboard_$DATE.tar.gz" data/
find "$BACKUP_DIR" -name "dashboard_*.tar.gz" -mtime +30 -delete
echo "Backup créé: dashboard_$DATE.tar.gz"
EOF
    chmod +x scripts/backup.sh
    
    # Script de restauration
    cat > scripts/restore.sh << 'EOF'
#!/bin/bash
if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <backup_file.tar.gz>"
    exit 1
fi
tar -xzf "$1" -C ./
echo "Données restaurées"
EOF
    chmod +x scripts/restore.sh
    
    # Script de mise à jour
    cat > scripts/update.sh << 'EOF'
#!/bin/bash
echo "Mise à jour du dashboard..."
npm install
sudo systemctl restart triathlon-dashboard
echo "Dashboard mis à jour et redémarré"
EOF
    chmod +x scripts/update.sh
    
    print_success "Scripts utilitaires créés dans scripts/"
}

# Afficher les instructions finales
show_final_instructions() {
    print_header "Installation terminée !"
    
    echo ""
    print_success "Le Dashboard Triathlon est installé dans: $PROJECT_DIR"
    echo ""
    
    print_info "Prochaines étapes:"
    echo ""
    echo "1. Configurer vos clés API:"
    echo "   ${BLUE}nano $PROJECT_DIR/.env${NC}"
    echo ""
    echo "2. Copier le fichier server.js dans:"
    echo "   ${BLUE}$PROJECT_DIR/${NC}"
    echo ""
    echo "3. Démarrer le serveur:"
    echo "   ${BLUE}cd $PROJECT_DIR${NC}"
    echo "   ${BLUE}npm start${NC}"
    echo ""
    echo "   Ou avec systemd:"
    echo "   ${BLUE}sudo systemctl start triathlon-dashboard${NC}"
    echo ""
    echo "4. Accéder au dashboard:"
    echo "   ${GREEN}http://$LOCAL_IP:3000${NC}"
    echo ""
    
    print_info "Commandes utiles:"
    echo ""
    echo "  • Voir les logs:     ${BLUE}sudo journalctl -u triathlon-dashboard -f${NC}"
    echo "  • Redémarrer:        ${BLUE}sudo systemctl restart triathlon-dashboard${NC}"
    echo "  • Arrêter:           ${BLUE}sudo systemctl stop triathlon-dashboard${NC}"
    echo "  • Backup:            ${BLUE}./scripts/backup.sh${NC}"
    echo "  • Mise à jour:       ${BLUE}./scripts/update.sh${NC}"
    echo ""
    
    print_warning "N'oubliez pas de configurer vos clés API Strava et Garmin dans .env !"
    echo ""
}

# Programme principal
main() {
    clear
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║        🏊 🚴 🏃  TRIATHLON DASHBOARD INSTALLER  🏃 🚴 🏊       ║"
    echo "║                                                           ║"
    echo "║              Installation sur Raspberry Pi                ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    check_raspberry_pi
    check_prerequisites
    update_system
    install_nodejs
    setup_project
    configure_files
    install_dependencies
    download_project_files
    setup_systemd_service
    create_utility_scripts
    show_final_instructions
    
    print_success "Installation terminée avec succès !"
}

# Exécuter le programme principal
main