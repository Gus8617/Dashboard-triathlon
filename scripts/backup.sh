#!/bin/bash

# Configuration
BACKUP_DIR="$HOME/triathlon-backups"
PROJECT_DIR="$HOME/triathlon-dashboard"
DATE=$(date +%Y%m%d_%H%M%S)

# Créer le dossier de backup
mkdir -p "$BACKUP_DIR"

# Backup de la base de données
echo "🔄 Backup en cours..."
tar -czf "$BACKUP_DIR/dashboard_$DATE.tar.gz" \
  -C "$PROJECT_DIR" \
  data/ \
  .env

# Nettoyer les backups de plus de 30 jours
find "$BACKUP_DIR" -name "dashboard_*.tar.gz" -mtime +30 -delete

echo "✅ Backup créé: dashboard_$DATE.tar.gz"
echo "📂 Localisation: $BACKUP_DIR"