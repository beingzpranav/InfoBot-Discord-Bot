import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') })

/**
 * Configuration object containing all environment variables and settings
 */
const config = {
	// Discord Configuration
	discord: {
		token: process.env.DISCORD_TOKEN,
		clientId: process.env.DISCORD_CLIENT_ID,
		guildId: process.env.DISCORD_GUILD_ID,
		announcementChannelId: process.env.ANNOUNCEMENT_CHANNEL_ID,
		webhookUrl: process.env.WEBHOOK_URL
	},

	// Social Media Configuration
	socialMedia: {
		instagram: {
			username: process.env.INSTAGRAM_USERNAME,
			accessToken: process.env.INSTAGRAM_ACCESS_TOKEN
		},
		linkedin: {
			profileUrl: process.env.LINKEDIN_PROFILE_URL,
			accessToken: process.env.LINKEDIN_ACCESS_TOKEN
		},
		youtube: {
			apiKey: process.env.YOUTUBE_API_KEY,
			channelId: process.env.YOUTUBE_CHANNEL_ID,
			channelHandle: process.env.YOUTUBE_CHANNEL_HANDLE
		}
	},

	// Bot Configuration
	bot: {
		checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 30,
		logLevel: process.env.LOG_LEVEL || 'info',
		databasePath: process.env.DATABASE_PATH || './data/bot.db',
		mentionEveryone: process.env.MENTION_EVERYONE === 'true' || true // Default to true
	},

	// Validation flags
	isProduction: process.env.NODE_ENV === 'production'
}

/**
 * Validates required configuration values
 * @returns {Object} Validation result with isValid flag and missing fields
 */
function validateConfig() {
	const required = [
		'discord.token',
		'discord.announcementChannelId'
	]

	const missing = []

	for (const field of required) {
		const value = field.split('.').reduce((obj, key) => obj?.[key], config)
		if (!value) {
			missing.push(field)
		}
	}

	// Check if at least one social media platform is configured
	const hasSocialMedia = 
		config.socialMedia.instagram.username ||
		config.socialMedia.linkedin.profileUrl ||
		(config.socialMedia.youtube.apiKey && config.socialMedia.youtube.channelId)

	if (!hasSocialMedia) {
		missing.push('At least one social media platform (Instagram username, LinkedIn profile URL, or YouTube API key + channel ID)')
	}

	return {
		isValid: missing.length === 0,
		missing
	}
}

/**
 * Gets the full database path
 * @returns {string} Absolute path to database file
 */
function getDatabasePath() {
	if (path.isAbsolute(config.bot.databasePath)) {
		return config.bot.databasePath
	}
	return path.join(__dirname, '../../', config.bot.databasePath)
}

/**
 * Gets the logs directory path
 * @returns {string} Absolute path to logs directory
 */
function getLogsPath() {
	return path.join(path.dirname(getDatabasePath()), 'logs')
}

export {
	config,
	validateConfig,
	getDatabasePath,
	getLogsPath
} 