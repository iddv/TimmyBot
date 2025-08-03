# Lavalink WebSocket Connection Debugging Guide

This guide provides comprehensive debugging steps for investigating Lavalink WebSocket connection issues in the TimmyBot Discord.js implementation.

## Overview

The TimmyBot Discord.js implementation uses Shoukaku to connect to a Lavalink sidecar container via WebSocket. Connection issues can cause the bot to restart repeatedly, leading to service instability.

## Enhanced Debugging Features

### 1. Comprehensive Logging

The LavalinkService now includes detailed logging for:
- Connection attempts with full configuration details
- WebSocket handshake success/failure
- Connection state changes with timestamps
- Raw WebSocket messages for protocol-level debugging
- Detailed error information including error codes and stack traces

### 2. Connection Testing Tools

#### Container-based Testing Script
```bash
# Inside the container
/app/scripts/test-lavalink-connection.sh
```

This script tests:
- Basic network connectivity (port accessibility)
- HTTP REST API connectivity
- WebSocket endpoint accessibility
- Node.js WebSocket client connection

#### Debugging Utility Class
The `LavalinkDebugger` class provides:
- Connection attempt logging
- WebSocket handshake analysis
- Node state analysis
- Diagnostic report generation
- Native WebSocket connectivity testing

## Debugging Steps

### Step 1: Check Container Status

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster timmybot-dev-cluster \
  --services timmybot-dev-service \
  --region eu-central-1

# Check running tasks
aws ecs list-tasks \
  --cluster timmybot-dev-cluster \
  --service-name timmybot-dev-service \
  --region eu-central-1
```

### Step 2: Examine Container Logs

```bash
# Check recent logs for Lavalink connection issues
aws logs filter-log-events \
  --log-group-name "/ecs/timmybot-dev" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "Lavalink" \
  --region eu-central-1
```

Look for these log patterns:
- `🔌 Attempting WebSocket connection to Lavalink`
- `❌ WebSocket connection failed`
- `⚠️ Lavalink node closed`
- `🎵 Lavalink node ready`

### Step 3: Access Container for Direct Testing

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster timmybot-dev-cluster \
  --service-name timmybot-dev-service \
  --region eu-central-1 \
  --query 'taskArns[0]' \
  --output text)

# Access container shell
aws ecs execute-command \
  --cluster timmybot-dev-cluster \
  --task $TASK_ARN \
  --container timmybot-container \
  --interactive \
  --command "/bin/bash" \
  --region eu-central-1
```

### Step 4: Run Connection Tests Inside Container

```bash
# Test basic connectivity
nc -z localhost 2333

# Test HTTP REST API
curl -H "Authorization: $LAVALINK_PASSWORD" http://localhost:2333/version

# Test WebSocket endpoint
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Authorization: $LAVALINK_PASSWORD" \
  -H "User-Id: 123456789" \
  -H "Client-Name: TimmyBot-Test" \
  http://localhost:2333/v4/websocket

# Run comprehensive test script
/app/scripts/test-lavalink-connection.sh
```

### Step 5: Analyze Shoukaku Configuration

Check the Shoukaku node configuration in logs:
```
🔧 Initializing Shoukaku with configuration: {
  "host": "localhost",
  "port": 2333,
  "secure": false,
  "passwordLength": 15,
  "nodeUrl": "http://localhost:2333"
}
```

Verify:
- Host is `localhost` (sidecar container)
- Port is `2333` (Lavalink default)
- Secure is `false` (HTTP connection)
- Password length matches expected value

### Step 6: Check WebSocket Handshake Details

Look for handshake logs:
```
✅ WebSocket handshake successful
❌ WebSocket handshake failed
```

Common handshake failure reasons:
- Authentication failure (wrong password)
- Missing required headers (User-Id, Client-Name)
- Network connectivity issues
- Lavalink server not ready

## Common Issues and Solutions

### Issue 1: Authentication Failed (4004)
**Symptoms:** WebSocket close code 4004
**Solution:** Verify LAVALINK_PASSWORD matches between containers

### Issue 2: Connection Timeout
**Symptoms:** Connection attempts timeout after 30 seconds
**Solution:** Check if Lavalink container is healthy and port 2333 is accessible

### Issue 3: Abnormal Closure (1006)
**Symptoms:** WebSocket close code 1006
**Solution:** Network connectivity issue between containers

### Issue 4: Protocol Error (1002)
**Symptoms:** WebSocket close code 1002
**Solution:** Check Shoukaku version compatibility with Lavalink v4

## Monitoring and Alerts

### CloudWatch Alarms

The deployment includes these alarms:
- **No Running Tasks**: Alerts when service scales to 0 due to failures
- **Task Failure Rate**: Alerts on frequent task restarts
- **Lavalink Errors**: Alerts on connection error patterns in logs

### SNS Notifications

Subscribe to the alert topic for notifications:
```bash
# Get the SNS topic ARN from CDK output
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-central-1:164859598862:timmybot-dev-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Configuration Changes to Prevent Restart Loops

### ECS Service Configuration
- **Circuit Breaker**: Disabled to prevent automatic rollbacks
- **Minimum Healthy Percent**: Set to 0 to allow complete shutdown on failure
- **Auto Scaling**: Minimum capacity set to 0

### Container Configuration
- **Essential**: Both containers marked as essential
- **Health Checks**: Configured with appropriate timeouts
- **Dependencies**: TimmyBot waits for Lavalink to be healthy

## Troubleshooting Checklist

- [ ] Verify both containers are running and healthy
- [ ] Check Lavalink container logs for startup errors
- [ ] Verify network connectivity between containers
- [ ] Confirm LAVALINK_PASSWORD matches in both containers
- [ ] Test WebSocket endpoint accessibility
- [ ] Check Shoukaku configuration parameters
- [ ] Verify Lavalink v4 compatibility
- [ ] Monitor CloudWatch logs for error patterns
- [ ] Test with manual WebSocket client

## Advanced Debugging

### Enable Debug Logging

Set environment variable in task definition:
```
LOG_LEVEL=debug
```

### Capture Network Traffic

Use tcpdump inside container:
```bash
# Install tcpdump (if needed)
apk add tcpdump

# Capture traffic on port 2333
tcpdump -i lo -p port 2333 -w lavalink-traffic.pcap
```

### Manual WebSocket Test

Create a test script to manually connect:
```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:2333/v4/websocket', {
  headers: {
    'Authorization': process.env.LAVALINK_PASSWORD,
    'User-Id': '123456789',
    'Client-Name': 'Manual-Test'
  }
});

ws.on('open', () => console.log('Connected'));
ws.on('error', (err) => console.error('Error:', err));
ws.on('close', (code, reason) => console.log('Closed:', code, reason));
```

## Next Steps

1. Deploy with enhanced debugging enabled
2. Monitor logs for detailed connection information
3. Use container testing tools to isolate issues
4. Adjust configuration based on findings
5. Set up monitoring alerts for proactive issue detection

## Support

For additional support:
1. Check CloudWatch logs: `/ecs/timmybot-dev`
2. Review ECS service events in AWS Console
3. Use ECS Exec to access running containers
4. Monitor SNS alerts for failure notifications