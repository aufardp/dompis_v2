#!/bin/bash
# Post-build script for standalone deployment
# Copies public assets and keyfiles into .next/standalone/

STANDALONE_DIR=".next/standalone"

if [ ! -d "$STANDALONE_DIR" ]; then
  echo "[postbuild] Standalone directory not found, skipping..."
  exit 0
fi

# Copy public assets
if [ -d "public" ]; then
  echo "[postbuild] Copying public/ assets..."
  cp -r public/* "$STANDALONE_DIR/public/" 2>/dev/null || mkdir -p "$STANDALONE_DIR/public" && cp -r public/* "$STANDALONE_DIR/public/"
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