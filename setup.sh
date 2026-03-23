#!/bin/bash
# Ejecutar una sola vez después de abrir Codespaces:
# bash setup.sh

echo "📦 Instalando dependencias del backend..."
cd backend && npm install && cd ..

echo "📦 Instalando dependencias del frontend..."
cd frontend-web && npm install && cd ..

echo "📋 Creando archivos .env de ejemplo..."
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "⚠️  Edita backend/.env con tus credenciales reales"
fi

if [ ! -f frontend-web/.env.local ]; then
  cp frontend-web/.env.example frontend-web/.env.local
  echo "⚠️  Edita frontend-web/.env.local con tus credenciales reales"
fi

echo "✅ Setup completo. Próximos pasos:"
echo "   1. Edita los archivos .env con tus credenciales"
echo "   2. cd backend && npm run dev    (Terminal 1)"
echo "   3. cd frontend-web && npm run dev  (Terminal 2)"