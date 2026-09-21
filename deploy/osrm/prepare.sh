#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DATA_DIR="$SCRIPT_DIR/data"
PBF_FILE="$DATA_DIR/merauke.osm.pbf"
IMAGE="ghcr.io/project-osrm/osrm-backend:latest"

if [ ! -f "$PBF_FILE" ]; then
  echo "File $PBF_FILE belum tersedia. Letakkan ekstrak OSM Merauke dengan nama merauke.osm.pbf." >&2
  exit 1
fi

docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" \
  osrm-extract -p /opt/car.lua /data/merauke.osm.pbf
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" \
  osrm-partition /data/merauke.osrm
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" \
  osrm-customize /data/merauke.osrm

echo "Data OSRM siap. Jalankan: docker compose -f $SCRIPT_DIR/compose.yaml up -d"
