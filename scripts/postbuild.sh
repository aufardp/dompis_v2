#!/bin/bash
# Post-build script for standalone deployment
# Copies public assets and keyfiles into .next/standalone/

STANDALONE_DIR=".next/standalone"

if [ ! -d "$STANDALONE_DIR" ]; then
  echo "[postbuild] Standalone directory not found, skipping..."
  exit 0
fi

# Copy public assets (kecuali uploads/ — lihat blok symlink di bawah).
# uploads/ dikecualikan di sini karena isinya data upload pengguna (bukti
# tiket) yang bisa puluhan GB dan terus tumbuh — men-copy-nya tiap build
# menduplikasi seluruh isinya tanpa perlu dan pernah bikin disk penuh
# (ENOSPC) di tengah build.
if [ -d "public" ]; then
  echo "[postbuild] Copying public/ assets..."
  mkdir -p "$STANDALONE_DIR/public"
  for item in public/*; do
    name="$(basename "$item")"
    if [ "$name" = "uploads" ]; then
      continue
    fi
    cp -r "$item" "$STANDALONE_DIR/public/"
  done
fi

# uploads/ di-symlink, bukan disalin, supaya standalone server baca/tulis
# langsung ke public/uploads yang asli (server dijalankan dengan cwd di
# STANDALONE_DIR, jadi path public/uploads di situ perlu ada dalam bentuk
# apa pun — symlink cukup, tanpa duplikasi disk).
if [ -d "public/uploads" ]; then
  echo "[postbuild] Symlinking public/uploads (bukan copy, hindari duplikasi puluhan GB)..."
  rm -rf "$STANDALONE_DIR/public/uploads"
  ln -s "$(pwd)/public/uploads" "$STANDALONE_DIR/public/uploads"
fi

# Copy Google Sheets keyfiles
for f in dompis-*.json; do
  if [ -f "$f" ]; then
    echo "[postbuild] Copying $f..."
    cp "$f" "$STANDALONE_DIR/"
  fi
done

# Ensure .env is correct
if [ -f ".env" ] && [ ! -f "$STANDALONE_DIR/.env" ]; then
  echo "[postbuild] Copying .env..."
  cp .env "$STANDALONE_DIR/.env"
fi

echo "[postbuild] Done!"
