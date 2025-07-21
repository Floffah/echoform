#!/usr/bin/env bash

# LocalFly API Demo Script
# This script demonstrates the basic functionality of the LocalFly API

set -e

API_BASE="http://localhost:3000/v1"
APP_NAME="demo-app"
ORG_SLUG="demo-org"

echo "🚀 LocalFly API Demo"
echo "===================="

# Check if server is running
if ! curl -sf "$API_BASE/apps?org_slug=test" > /dev/null 2>&1; then
    echo "❌ LocalFly server is not running on localhost:3000"
    echo "   Start it with: bun run start"
    exit 1
fi

echo "✅ LocalFly server is running"

# 1. Create an app
echo
echo "📦 Creating app '$APP_NAME'..."
curl -sf -X POST "$API_BASE/apps" \
    -H "Content-Type: application/json" \
    -d "{\"app_name\":\"$APP_NAME\",\"org_slug\":\"$ORG_SLUG\"}" > /dev/null

echo "✅ App created successfully"

# 2. List apps
echo
echo "📋 Listing apps for org '$ORG_SLUG'..."
APPS=$(curl -sf "$API_BASE/apps?org_slug=$ORG_SLUG")
echo "$APPS" | jq .

# 3. Create a machine with nginx
echo
echo "🤖 Creating nginx machine..."
MACHINE_RESPONSE=$(curl -sf -X POST "$API_BASE/apps/$APP_NAME/machines" \
    -H "Content-Type: application/json" \
    -d '{"config":{"image":"nginx:alpine","env":{"NGINX_PORT":"80"}},"region":"local"}')

MACHINE_ID=$(echo "$MACHINE_RESPONSE" | jq -r .id)
echo "✅ Machine created with ID: $MACHINE_ID"

# 4. List machines
echo
echo "🤖 Listing machines for app '$APP_NAME'..."
curl -sf "$API_BASE/apps/$APP_NAME/machines" | jq .

# 5. Create a volume
echo
echo "💾 Creating volume..."
VOLUME_RESPONSE=$(curl -sf -X POST "$API_BASE/apps/$APP_NAME/volumes" \
    -H "Content-Type: application/json" \
    -d '{"name":"demo-volume","size_gb":1,"region":"local"}')

VOLUME_ID=$(echo "$VOLUME_RESPONSE" | jq -r .id)
echo "✅ Volume created with ID: $VOLUME_ID"

# 6. Set a secret
echo
echo "🔐 Setting a secret..."
curl -sf -X POST "$API_BASE/apps/$APP_NAME/secrets/API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"value":"super-secret-key-123"}' > /dev/null

echo "✅ Secret 'API_KEY' set successfully"

# 7. List secrets
echo
echo "🔐 Listing secrets..."
curl -sf "$API_BASE/apps/$APP_NAME/secrets" | jq .

# 8. Check Docker containers
echo
echo "🐳 Docker containers created by LocalFly:"
docker ps -a --filter "label=localfly.managed=true" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"

# 9. Check machine events
echo
echo "📊 Machine events:"
curl -sf "$API_BASE/apps/$APP_NAME/machines/$MACHINE_ID/events" | jq .

# 10. Cleanup
echo
echo "🧹 Cleaning up..."
curl -sf -X DELETE "$API_BASE/apps/$APP_NAME/machines/$MACHINE_ID" > /dev/null
curl -sf -X DELETE "$API_BASE/apps/$APP_NAME/volumes/$VOLUME_ID" > /dev/null
curl -sf -X DELETE "$API_BASE/apps/$APP_NAME" > /dev/null

echo "✅ Cleanup completed"

echo
echo "🎉 Demo completed successfully!"
echo "   LocalFly API is working correctly with Docker integration."