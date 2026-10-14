#!/usr/bin/env bash
set -euo pipefail

routing_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
map_dir="$routing_dir/data"
map_file="$map_dir/jakarta-latest.osm.pbf"
image='ghcr.io/project-osrm/osrm-backend:v5.27.1'
mkdir -p "$map_dir"

if [[ ! -s "$map_file" ]]; then
  curl --fail --location --retry 3 --show-error \
    'https://download.openstreetmap.fr/extracts/asia/indonesia/jakarta-latest.osm.pbf' \
    -o "$map_file"
fi

if [[ ! -s "$map_dir/jakarta-latest.osrm.cell_metrics" ]]; then
  docker run --rm -v "$map_dir:/data" "$image" \
    osrm-extract -p /opt/car.lua /data/jakarta-latest.osm.pbf
  docker run --rm -v "$map_dir:/data" "$image" \
    osrm-partition /data/jakarta-latest.osrm
  docker run --rm -v "$map_dir:/data" "$image" \
    osrm-customize /data/jakarta-latest.osrm
fi

if docker ps --format '{{.Names}}' | grep -qx 'anteraja-osrm'; then
  echo 'OSRM lokal sudah berjalan pada http://127.0.0.1:5000'
  exit 0
fi
if docker ps -a --format '{{.Names}}' | grep -qx 'anteraja-osrm'; then
  docker start anteraja-osrm
else
  docker run -d --name anteraja-osrm --restart unless-stopped \
    -p 127.0.0.1:5000:5000 -v "$map_dir:/data:ro" "$image" \
    osrm-routed --algorithm mld /data/jakarta-latest.osrm
fi
echo 'OSRM lokal siap pada http://127.0.0.1:5000'
