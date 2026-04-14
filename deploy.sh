#!/bin/bash

# --- Konfigurasi ---
APP_NAME="dompis_app"
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_NC='\033[0m' # No Color

echo -e "${COLOR_BLUE}===> Memulai Proses Deployment <===${COLOR_NC}"

# 1. Tarik kode terbaru dari GitHub
echo -e "${COLOR_GREEN}--> Menarik kode terbaru dari GitHub...${COLOR_NC}"
git pull origin main

# 2. Rebuild image (hanya servis app)
# --no-cache opsional, gunakan jika ingin benar-benar bersih
echo -e "${COLOR_GREEN}--> Membangun image Docker (ini mungkin memakan waktu)...${COLOR_NC}"
docker compose build app

# 3. Update container tanpa downtime
# Docker akan menjalankan container baru, dan setelah siap, mematikan yang lama.
echo -e "${COLOR_GREEN}--> Melakukan Rolling Update container...${COLOR_NC}"
docker compose up -d --build --remove-orphans

# 4. Migrasi Database (Opsional - Jika menggunakan Prisma)
echo -e "${COLOR_GREEN}--> Menjalankan migrasi database...${COLOR_NC}"
docker exec $APP_NAME npx prisma migrate deploy

# 5. Pembersihan
echo -e "${COLOR_GREEN}--> Menghapus image lama yang tidak terpakai (pruning)...${COLOR_NC}"
docker image prune -f

echo -e "${COLOR_BLUE}===> Deployment Selesai dengan Sukses! <===${COLOR_NC}"