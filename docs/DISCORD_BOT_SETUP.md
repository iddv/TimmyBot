# 🤖 Discord Bot Setup Guide

Complete guide to create your Discord bot, get the token, and generate invite links.

## 🚀 **Step 1: Create Discord Application**

### **Go to Discord Developer Portal**
1. Visit: **https://discord.com/developers/applications**
2. Click **"New Application"**
3. Name it: **"TimmyBot"** (or your preferred name)
4. Click **"Create"**

### **Configure Application Settings**
1. **General Information**:
   - **Name**: TimmyBot
   - **Description**: "AWS-powered Discord music bot with guild isolation and premium streaming support"
   - **Tags**: `music`, `entertainment`, `utility`
   - **Avatar**: Upload a music-themed icon (optional)

2. **Application ID**: Copy this - you'll need it for the invite link

## 🤖 **Step 2: Create Bot User**

### **Navigate to Bot Section**
1. Click **"Bot"** in the left sidebar
2. Click **"Add Bot"** → **"Yes, do it!"**

### **Configure Bot Settings**
```
✅ Bot Name: TimmyBot
✅ Username: timmybot (or available variant)
✅ Avatar: Upload music-themed image
✅ Public Bot: YES (so others can invite it)
✅ Require OAuth2 Code Grant: NO
```

### **Bot Permissions (Important!)**
Under **"Privileged Gateway Intents"**:
```
✅ Presence Intent: NO (not needed)
✅ Server Members Intent: NO (not needed) 
✅ Message Content Intent: YES (REQUIRED - to read ?play commands)
```

## 🔑 **Step 3: Get Bot Token**

### **Copy the Bot Token**
1. In the **"Bot"** section, under **"Token"**
2. Click **"Reset Token"** → **"Yes, do it!"**
3. **IMMEDIATELY COPY** the new token
4. **⚠️ NEVER SHARE THIS TOKEN PUBLICLY**

The token looks like:
```
YOUR_BOT_TOKEN_HERE.EXAMPLE.TOKEN_REPLACE_WITH_REAL_ONE
```

### **Store Token in AWS Secrets Manager**
```bash
# Replace YOUR_ACTUAL_BOT_TOKEN_HERE with the token you just copied
aws secretsmanager update-secret \
  --secret-id "timmybot/dev/discord-bot-token" \
  --secret-string '{"token":"YOUR_ACTUAL_BOT_TOKEN_HERE"}' \
  --region eu-central-1
```

## 🔗 **Step 4: Generate Bot Invite Link**

### **Navigate to OAuth2 → URL Generator**
1. Click **"OAuth2"** in left sidebar
2. Click **"URL Generator"**

### **Select Scopes**
Check these boxes:
```
✅ bot              (Required - adds bot to server)
✅ applications.commands  (Optional - for future slash commands)
```

### **Select Bot Permissions**
Check these permissions:
```
General Permissions:
✅ View Channels
✅ Send Messages  
✅ Send Messages in Threads
✅ Embed Links
✅ Attach Files
✅ Read Message History
✅ Use External Emojis
✅ Add Reactions

Voice Permissions:
✅ Connect          (Join voice channels)
✅ Speak           (Play audio)
✅ Use Voice Activity  (For better audio quality)
```

### **Copy Generated Invite URL**
The URL will look like:
```
https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=3145728&scope=bot%20applications.commands
```

## 🎉 **Step 5: Test Bot Invitation**

### **Invite to Your Test Server**
1. **Click the generated invite link**
2. **Select a Discord server** you own/admin
3. **Authorize** the bot
4. **Verify** TimmyBot appears in your server member list

### **Test Basic Functionality**
In a text channel, try:
```
?ping
```
Expected response: `Pong!` (once the ECS service restarts with real token)

## 🚀 **Step 6: Deploy with Real Token**

### **Option A: Manual Deployment (Immediate)**
```bash
# Update the secret with your real token
aws secretsmanager update-secret \
  --secret-id "timmybot/dev/discord-bot-token" \
  --secret-string '{"token":"YOUR_ACTUAL_BOT_TOKEN_HERE"}' \
  --region eu-central-1

# Restart ECS service to pick up new token
aws ecs update-service \
  --cluster timmybot-dev-cluster \
  --service timmybot-dev-service \
  --force-new-deployment \
  --region eu-central-1
```

### **Option B: Automated Deployment (Recommended)**
After setting up GitHub Actions (see `docs/GITHUB_ACTIONS_SETUP.md`):
```bash
# Just push any small change to trigger automated deployment
git commit --allow-empty -m "🤖 Trigger deployment with real Discord bot token"
git push origin main
```

## 📋 **Sharing Your Bot**

### **Public Invite Link**
Share this link with Discord server admins:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3145728&scope=bot%20applications.commands
```

### **Bot Features to Highlight**
When sharing your bot:

**🎵 Guild-Isolated Music Queues**
- Each Discord server gets its own independent music queue
- No interference between different communities

**☁️ Cloud-Native & Reliable**  
- Runs on AWS ECS Fargate with auto-scaling
- 99.9% uptime with automatic restarts

**🔒 Server Allowlist (Optional)**
- Control which servers can use the bot
- Prevent unauthorized usage and cost control

**🎯 Planned Features**
- "Bring Your Own Premium" - use your YouTube Premium, Spotify Premium, etc.
- Slash commands for modern Discord experience
- Advanced queue management and playlists

## 🛡️ **Security Best Practices**

### **Token Security**
- ✅ Store in AWS Secrets Manager (encrypted)
- ❌ Never commit tokens to git
- ❌ Never share tokens in Discord/chat
- ✅ Use environment variables for local development

### **Bot Permissions**
- ✅ Only grant necessary permissions
- ✅ Review permissions regularly  
- ✅ Use principle of least privilege

### **Server Allowlist** (Optional)
To prevent unauthorized usage:
```bash
# Add your server to the allowlist
aws dynamodb put-item \
  --table-name timmybot-dev-server-allowlist \
  --item '{
    "guild_id": {"S": "YOUR_DISCORD_SERVER_ID"},
    "server_name": {"S": "Your Server Name"},
    "approved": {"BOOL": true},
    "approved_date": {"S": "2025-08-01"}
  }' \
  --region eu-central-1
```

## 🔍 **Troubleshooting**

### **Bot Not Responding**
1. **Check ECS logs**: `aws logs get-log-events --log-group-name /ecs/timmybot-dev`
2. **Verify token**: Make sure it's valid and stored correctly
3. **Check permissions**: Bot needs "Message Content Intent" enabled
4. **Server allowlist**: If enabled, make sure your server is approved

### **Invite Link Not Working**
1. **Check Application ID**: Make sure it matches your Discord application
2. **Verify permissions**: Ensure you selected the right bot permissions
3. **Bot public**: Make sure "Public Bot" is enabled in bot settings

### **Permission Errors**
1. **Voice channel**: Bot needs "Connect" and "Speak" permissions
2. **Text channel**: Bot needs "Send Messages" and "Embed Links"
3. **Server admin**: Make sure you have admin rights to invite bots

---

## 🎯 **Quick Summary**

1. **Create Discord app** at https://discord.com/developers/applications
2. **Add bot user** and copy the token
3. **Store token** in AWS Secrets Manager
4. **Generate invite link** with proper permissions
5. **Test invitation** on your Discord server
6. **Deploy with real token** (manual or automated)
7. **Share invite link** with other server admins

Your bot will be live and ready to play music in guild-isolated queues! 🎵