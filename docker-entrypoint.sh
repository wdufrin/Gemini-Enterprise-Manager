#!/bin/sh
# docker-entrypoint.sh

CONFIG_PATH="/usr/share/nginx/html/config.json"

# Construct JSON structure from environment variables
cat <<EOF > "$CONFIG_PATH"
{
  "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID:-}"
}
EOF

echo "Generated runtime config.json with GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-[Not Set]}"

# Execute the default container command (Nginx)
exec "$@"
