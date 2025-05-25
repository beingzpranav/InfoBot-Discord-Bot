# 🤖 InfoBot - Social Media Discord Notifications

A powerful Discord bot that automatically monitors your social media accounts and sends beautiful notifications to your Discord server when new content is posted.

## ✨ Features

- 🎬 **YouTube Integration** - Monitors for new videos using YouTube Data API v3
- 📸 **Instagram Monitoring** - Tracks new posts via web scraping
- 📢 **Rich Discord Embeds** - Beautiful, platform-specific notifications
- ⏰ **Automated Scheduling** - Checks every 30 minutes automatically
- 🗃️ **Duplicate Prevention** - SQLite database prevents repeat notifications
- 🔧 **Slash Commands** - Easy management with Discord slash commands
- 📊 **Statistics Tracking** - Monitor bot performance and activity
- 🚀 **Railway Ready** - Optimized for 24/7 cloud deployment

## 👨‍💻 About the Developer

Created by **Pranav Khandelwal** - Full Stack Developer & Tech Enthusiast

🌐 **Connect with me:**
- 🌍 Website: [pranavk.tech](https://pranavk.tech)
- 📸 Instagram: [@beingzpranav_](https://instagram.com/beingzpranav_)
- 🐦 Twitter/X: [@beingzpranav_](https://x.com/beingzpranav_)
- 💼 LinkedIn: [beingzpranav](https://linkedin.com/in/beingzpranav)

## 🎯 Live Demo

When new content is detected, InfoBot sends notifications like this:

### YouTube Notification
```
@everyone
🎬 New Video Posted!

[Rich Embed with video thumbnail, title, description, and YouTube branding]
```

### Instagram Notification
```
@everyone
📸 New Instagram Post!

[Rich Embed with post image, caption, and Instagram branding]
```

## 🛠️ Setup Guide

### Prerequisites

- Node.js 18+ installed
- Discord Bot Token
- YouTube Data API v3 Key
- Social media account usernames/URLs

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the bot token
4. Invite bot to your server with these permissions:
   - Send Messages
   - Embed Links
   - Use Slash Commands
   - Mention Everyone (optional)

### 2. YouTube API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable YouTube Data API v3
4. Create credentials (API Key)
5. Copy the API key

### 3. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd InfoBot

# Install dependencies
npm install

# Create environment file
cp env.example .env
```

### 4. Environment Configuration

Edit `.env` file with your credentials:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_server_id
ANNOUNCEMENT_CHANNEL_ID=your_channel_id

# YouTube Configuration
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=your_youtube_channel_id

# Instagram Configuration
INSTAGRAM_USERNAME=your_instagram_username

# Bot Configuration
CHECK_INTERVAL_MINUTES=30
MENTION_EVERYONE=true
LOG_LEVEL=info
```

### 5. Local Testing

```bash
# Start the bot
npm start

# Check bot status
npm run status

# Test notifications
npm run test
```

## 🚀 Railway Deployment

### Quick Deploy

1. Fork this repository
2. Connect to [Railway](https://railway.app)
3. Create new project from GitHub repo
4. Add environment variables in Railway dashboard
5. Deploy automatically

### Environment Variables for Railway

```
DISCORD_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_server_id
ANNOUNCEMENT_CHANNEL_ID=your_channel_id
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=your_youtube_channel_id
INSTAGRAM_USERNAME=your_instagram_username
CHECK_INTERVAL_MINUTES=30
MENTION_EVERYONE=true
LOG_LEVEL=info
```

### Railway Configuration Files

The project includes optimized Railway configuration:
- `railway.json` - Build and deployment settings
- `Dockerfile` - Container configuration (if needed)
- Automatic health checks and restarts

## 🎮 Discord Commands

InfoBot supports these slash commands:

### `/status`
Shows current bot status and configuration
```
✅ Bot Online: InfoBot#9724
🏠 Server: Your Server (99 members)
📊 Active Platforms: 2
📈 Total Notifications: 15
```

### `/check-now`
Manually trigger a check for new content
```
🔍 Checking all platforms for new content...
✅ Check completed! Found 1 new post.
```

### `/config`
Display current bot configuration
```
📋 Bot Configuration
🎬 YouTube: @YourChannel
📸 Instagram: @yourusername
⏰ Check Interval: 30 minutes
```

### `/stats`
Show detailed statistics
```
📊 Bot Statistics
📈 Total Notifications: 25
🎬 YouTube Posts: 15
📸 Instagram Posts: 10
🕐 Last Check: 2 minutes ago
```

### `/reset-platforms`
Reset platform tracking (admin only)
```
🔄 Platform tracking reset successfully!
All platforms will be re-scanned on next check.
```

## 📁 Project Structure

```
InfoBot/
├── src/
│   ├── config/
│   │   └── config.js          # Configuration management
│   ├── database/
│   │   └── database.js        # SQLite database operations
│   ├── services/
│   │   ├── discord.js         # Discord bot management
│   │   ├── youtube.js         # YouTube API integration
│   │   └── instagram.js       # Instagram web scraping
│   └── utils/
│       ├── logger.js          # Winston logging system
│       ├── scheduler.js       # Cron job scheduling
│       ├── test.js            # Test utilities
│       └── status.js          # Status checking
├── index.js                   # Main application entry
├── package.json              # Dependencies and scripts
├── env.example               # Environment template
├── railway.json              # Railway deployment config
├── Dockerfile                # Container configuration
└── README.md                 # This file
```

## 🔧 Configuration Options

### Check Intervals
- Minimum: 15 minutes (to respect API limits)
- Default: 30 minutes
- Maximum: 1440 minutes (24 hours)

### Notification Settings
- `MENTION_EVERYONE`: Enable @everyone mentions
- `LOG_LEVEL`: Set logging verbosity (error, warn, info, debug)

### Platform Settings
- YouTube: Requires API key and channel ID
- Instagram: Requires username only (web scraping)

## 📊 Monitoring & Logs

### Log Files
- `logs/combined.log` - All log entries
- `logs/error.log` - Error messages only
- `logs/discord.log` - Discord-specific logs
- `logs/youtube.log` - YouTube API logs
- `logs/instagram.log` - Instagram scraping logs

### Health Checks
The bot includes automatic health monitoring:
- Database connectivity
- Discord connection status
- API rate limit tracking
- Error rate monitoring

## 🛡️ Security & Privacy

### Data Protection
- No personal data stored beyond usernames
- Local SQLite database (not shared)
- Secure environment variable handling
- No sensitive data in logs

### Rate Limiting
- YouTube API: Respects Google's quotas
- Instagram: Built-in delays and retry logic
- Discord: Follows Discord's rate limits

### Error Handling
- Graceful failure recovery
- Automatic retry mechanisms
- Comprehensive error logging
- Service isolation (one failure doesn't break others)

## 🔍 Troubleshooting

### Common Issues

#### Bot Not Responding
```bash
# Check bot status
npm run status

# Verify environment variables
npm run config
```

#### No Notifications Received
1. Verify bot permissions in Discord channel
2. Check API keys and credentials
3. Ensure usernames/IDs are correct
4. Review logs for errors

#### YouTube API Errors
- Verify API key is valid
- Check quota usage in Google Cloud Console
- Ensure YouTube Data API v3 is enabled

#### Instagram Issues
- Verify username is correct and public
- Check for rate limiting (429 errors)
- Instagram may block automated access

### Debug Commands

```bash
# Check configuration
npm run config

# Test bot functionality
npm run test

# Check bot status
npm run status
```

## 📈 Performance

### Resource Usage
- Memory: ~50MB average
- CPU: Minimal (event-driven)
- Storage: <10MB (logs + database)
- Network: API calls only during checks

### Scalability
- Supports multiple social media accounts
- Handles high-frequency posting
- Efficient duplicate detection
- Optimized for 24/7 operation

## 🤝 Contributing

### Development Setup
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Check status
npm run status
```

### Code Style
- ES6+ JavaScript
- Functional programming patterns
- Comprehensive error handling
- Detailed logging
- Clean, readable code

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Discord.js](https://discord.js.org/) - Discord API wrapper
- [YouTube Data API](https://developers.google.com/youtube/v3) - YouTube integration
- [Railway](https://railway.app/) - Deployment platform
- [Winston](https://github.com/winstonjs/winston) - Logging library

## 📞 Support

### Getting Help
1. Check this README for common solutions
2. Review the troubleshooting section
3. Check logs for error messages
4. Verify all configuration settings

### Reporting Issues
When reporting issues, please include:
- Bot version and environment
- Error messages from logs
- Steps to reproduce
- Expected vs actual behavior

---

**Made with ❤️ by [Pranav Khandelwal](https://pranavk.tech)**

*InfoBot - Keeping your community updated automatically!* 
