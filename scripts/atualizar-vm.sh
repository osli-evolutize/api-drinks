#!/bin/bash
set -e

APP_DIR="/opt/sistema/apps/api-drinks"
APP_NAME="api-drinks"

cd "$APP_DIR"

echo "Atualizando codigo..."
git pull

echo "Instalando dependencias..."
npm install

echo "Reiniciando aplicacao..."
pm2 restart "$APP_NAME" --update-env
pm2 save

echo "Testando saude local..."
curl -fsS "http://127.0.0.1:3002/api/saude" > /dev/null

echo "Atualizacao concluida."
