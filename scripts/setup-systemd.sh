#!/bin/bash

SERVICE_NAME="triathlon-dashboard"
PROJECT_DIR="$HOME/triathlon-dashboard"
USER=$USER

echo "🔧 Configuration du service systemd..."

# Créer le fichier service
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << EOF
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
sudo systemctl enable $SERVICE_NAME

echo "✅ Service systemd configuré"
echo ""
echo "Commandes disponibles:"
echo "  Démarrer:  sudo systemctl start $SERVICE_NAME"
echo "  Arrêter:   sudo systemctl stop $SERVICE_NAME"
echo "  Status:    sudo systemctl status $SERVICE_NAME"
echo "  Logs:      sudo journalctl -u $SERVICE_NAME -f"