#!/bin/bash

# Test Lavalink WebSocket Connection Script
# This script can be run inside the container to test WebSocket connectivity

set -e

LAVALINK_HOST=${LAVALINK_HOST:-localhost}
LAVALINK_PORT=${LAVALINK_PORT:-2333}
LAVALINK_PASSWORD=${LAVALINK_PASSWORD:-youshallnotpass}

echo "🔍 Testing Lavalink connectivity..."
echo "Host: $LAVALINK_HOST"
echo "Port: $LAVALINK_PORT"
echo "Password length: ${#LAVALINK_PASSWORD}"
echo ""

# Test 1: Basic network connectivity
echo "1️⃣ Testing basic network connectivity..."
if nc -z "$LAVALINK_HOST" "$LAVALINK_PORT"; then
    echo "✅ Port $LAVALINK_PORT is open on $LAVALINK_HOST"
else
    echo "❌ Port $LAVALINK_PORT is not accessible on $LAVALINK_HOST"
    exit 1
fi
echo ""

# Test 2: HTTP REST API connectivity
echo "2️⃣ Testing Lavalink REST API..."
HTTP_URL="http://$LAVALINK_HOST:$LAVALINK_PORT/version"
echo "Testing URL: $HTTP_URL"

if curl -s -f -H "Authorization: $LAVALINK_PASSWORD" "$HTTP_URL"; then
    echo ""
    echo "✅ Lavalink REST API is accessible"
else
    echo "❌ Lavalink REST API is not accessible"
    echo "Response details:"
    curl -v -H "Authorization: $LAVALINK_PASSWORD" "$HTTP_URL" || true
fi
echo ""

# Test 3: WebSocket endpoint test
echo "3️⃣ Testing WebSocket endpoint..."
WS_URL="http://$LAVALINK_HOST:$LAVALINK_PORT/v4/websocket"
echo "Testing WebSocket upgrade to: $WS_URL"

echo "Attempting WebSocket handshake..."
curl -i -N \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Authorization: $LAVALINK_PASSWORD" \
    -H "User-Id: 123456789" \
    -H "Client-Name: TimmyBot-Test" \
    --max-time 10 \
    "$WS_URL" || echo "WebSocket test completed (may show connection error - this is expected)"

echo ""
echo "4️⃣ Testing with Node.js WebSocket client..."

# Create a temporary Node.js script to test WebSocket connection
cat > /tmp/test-websocket.js << 'EOF'
const WebSocket = require('ws');

const LAVALINK_HOST = process.env.LAVALINK_HOST || 'localhost';
const LAVALINK_PORT = process.env.LAVALINK_PORT || '2333';
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

const wsUrl = `ws://${LAVALINK_HOST}:${LAVALINK_PORT}/v4/websocket`;

console.log(`🔌 Attempting WebSocket connection to: ${wsUrl}`);

const ws = new WebSocket(wsUrl, {
    headers: {
        'Authorization': LAVALINK_PASSWORD,
        'User-Id': '123456789',
        'Client-Name': 'TimmyBot-Test',
    }
});

ws.on('open', () => {
    console.log('✅ WebSocket connection opened successfully');
    ws.close();
});

ws.on('error', (error) => {
    console.error('❌ WebSocket connection error:', error.message);
    process.exit(1);
});

ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket connection closed: ${code} - ${reason}`);
    process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.error('❌ WebSocket connection timeout');
    ws.close();
    process.exit(1);
}, 10000);
EOF

if command -v node >/dev/null 2>&1; then
    node /tmp/test-websocket.js
else
    echo "Node.js not available for WebSocket test"
fi

echo ""
echo "🏁 Connection tests completed"