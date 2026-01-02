#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <backup_file.tar.gz>"
    echo "Backups disponibles:"
    ls -lh ~/triathlon-backups/
    exit 1
fi

echo "⚠️  Attention: Cela va remplacer les données actuelles"
read -p "Continuer ? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    tar -xzf "$1" -C ~/triathlon-dashboard/
    echo "✅ Données restaurées"
    echo "🔄 Redémarrez le serveur: sudo systemctl restart triathlon-dashboard"
fi