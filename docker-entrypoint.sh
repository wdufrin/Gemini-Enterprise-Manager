#!/bin/sh
# docker-entrypoint.sh

CONFIG_PATH="/usr/share/nginx/html/config.json"

# Construct JSON structure from environment variables
cat <<EOF > "$CONFIG_PATH"
{
  "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID:-180054373655-2b600fnjissdmll4ipj2ndhr0i2h03fj.apps.googleusercontent.com}"
}
EOF

echo "Generated runtime config.json with GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-[Using DefaultFallback]}"

# Execute the default container command (Nginx)
exec "$@"
