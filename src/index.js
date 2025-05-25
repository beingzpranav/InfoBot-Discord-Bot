import { config, validateConfig } from './config/config.js'
import { 
	logger, 
	logBotStartup, 
	logConfigValidation 
} from './utils/logger.js'
import { database } from './database/database.js'
import { discordService } from './services/discord.js'
import { scheduler } from './utils/scheduler.js'

/**
 * Main application class for the Discord Social Media Bot
 */
class SocialMediaBot {
	constructor() {
		this.isShuttingDown = false
		this.services = {
			database,
			discordService,
			scheduler
		}
	}

	/**
	 * Initialize and start the bot
	 * @returns {Promise<void>}
	 */
	async start() {
		try {
			// Log startup information
			logBotStartup()

			// Validate configuration
			const validation = validateConfig()
			logConfigValidation(validation)

			if (!validation.isValid) {
				logger.error('❌ Configuration validation failed. Please check your environment variables.')
				logger.error('Missing configuration:', validation.missing)
				process.exit(1)
			}

			logger.info('✅ Configuration validation passed')

			// Initialize database
			logger.info('🗄️ Initializing database...')
			await database.initialize()
			logger.info('✅ Database initialized successfully')

			// Initialize Discord service
			logger.info('🤖 Initializing Discord bot...')
			await discordService.initialize()
			
			// Wait for Discord bot to be ready
			await this.waitForDiscordReady()
			logger.info('✅ Discord bot initialized and ready')

			// Start scheduler
			logger.info('⏰ Starting scheduler...')
			await scheduler.start()
			logger.info('✅ Scheduler started successfully')

			// Send startup notification
			await this.sendStartupNotification()

			logger.info('🚀 Social Media Discord Bot is now running!')
			logger.info(`📊 Check interval: ${config.bot.checkIntervalMinutes} minutes`)
			logger.info(`📢 Announcement channel: ${config.discord.announcementChannelId}`)

			// Log configured platforms
			this.logConfiguredPlatforms()

		} catch (error) {
			logger.error(`❌ Failed to start bot: ${error.message}`)
			await this.shutdown()
			process.exit(1)
		}
	}

	/**
	 * Wait for Discord bot to be ready
	 * @returns {Promise<void>}
	 */
	async waitForDiscordReady() {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Discord bot failed to become ready within 30 seconds'))
			}, 30000)

			const checkReady = () => {
				if (discordService.isReady) {
					clearTimeout(timeout)
					resolve()
				} else {
					setTimeout(checkReady, 1000)
				}
			}

			checkReady()
		})
	}

	/**
	 * Send startup notification to Discord
	 * @returns {Promise<void>}
	 */
	async sendStartupNotification() {
		try {
			const embed = {
				title: '🚀 Bot Started',
				description: 'Social Media Discord Bot is now online and monitoring for updates!',
				color: 0x00FF00,
				fields: [
					{
						name: '⏰ Check Interval',
						value: `${config.bot.checkIntervalMinutes} minutes`,
						inline: true
					},
					{
						name: '🔗 Platforms',
						value: this.getConfiguredPlatformsList(),
						inline: true
					},
					{
						name: '📊 Status',
						value: 'All systems operational',
						inline: true
					}
				],
				timestamp: new Date().toISOString(),
				footer: {
					text: 'Use /status to check bot status anytime'
				}
			}

			await discordService.sendMessage('', embed)
			logger.info('📢 Startup notification sent to Discord')

		} catch (error) {
			logger.warn(`Failed to send startup notification: ${error.message}`)
		}
	}

	/**
	 * Get list of configured platforms
	 * @returns {string} Formatted platform list
	 */
	getConfiguredPlatformsList() {
		const platforms = []
		
		if (config.socialMedia.youtube.apiKey && config.socialMedia.youtube.channelId) {
			platforms.push('📺 YouTube')
		}
		
		if (config.socialMedia.instagram.username) {
			platforms.push('📸 Instagram')
		}
		
		if (config.socialMedia.linkedin.profileUrl) {
			platforms.push('💼 LinkedIn')
		}

		return platforms.length > 0 ? platforms.join('\n') : 'None configured'
	}

	/**
	 * Log configured platforms information
	 */
	logConfiguredPlatforms() {
		const platforms = []

		if (config.socialMedia.youtube.apiKey && config.socialMedia.youtube.channelId) {
			platforms.push(`YouTube (Channel: ${config.socialMedia.youtube.channelId})`)
		}

		if (config.socialMedia.instagram.username) {
			platforms.push(`Instagram (@${config.socialMedia.instagram.username})`)
		}

		if (config.socialMedia.linkedin.profileUrl) {
			platforms.push(`LinkedIn (${config.socialMedia.linkedin.profileUrl})`)
		}

		if (platforms.length > 0) {
			logger.info('🔗 Configured platforms:')
			platforms.forEach(platform => logger.info(`  - ${platform}`))
		} else {
			logger.warn('⚠️ No social media platforms configured')
		}
	}

	/**
	 * Setup graceful shutdown handlers
	 */
	setupShutdownHandlers() {
		const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT']
		
		shutdownSignals.forEach(signal => {
			process.on(signal, async () => {
				logger.info(`📥 Received ${signal}, initiating graceful shutdown...`)
				await this.shutdown()
				process.exit(0)
			})
		})

		// Handle uncaught exceptions
		process.on('uncaughtException', async (error) => {
			logger.error('💥 Uncaught Exception:', error)
			await this.shutdown()
			process.exit(1)
		})

		// Handle unhandled promise rejections
		process.on('unhandledRejection', async (reason, promise) => {
			logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
			await this.shutdown()
			process.exit(1)
		})
	}

	/**
	 * Gracefully shutdown the bot
	 * @returns {Promise<void>}
	 */
	async shutdown() {
		if (this.isShuttingDown) {
			logger.warn('Shutdown already in progress...')
			return
		}

		this.isShuttingDown = true
		logger.info('🛑 Shutting down Social Media Discord Bot...')

		try {
			// Send shutdown notification
			await this.sendShutdownNotification()

			// Stop scheduler
			if (scheduler.isRunning) {
				logger.info('⏰ Stopping scheduler...')
				await scheduler.stop()
				logger.info('✅ Scheduler stopped')
			}

			// Shutdown Discord service
			logger.info('🤖 Shutting down Discord bot...')
			await discordService.shutdown()
			logger.info('✅ Discord bot shutdown complete')

			// Close database connection
			logger.info('🗄️ Closing database connection...')
			await database.close()
			logger.info('✅ Database connection closed')

			logger.info('✅ Graceful shutdown completed')

		} catch (error) {
			logger.error(`❌ Error during shutdown: ${error.message}`)
		}
	}

	/**
	 * Send shutdown notification to Discord
	 * @returns {Promise<void>}
	 */
	async sendShutdownNotification() {
		try {
			const embed = {
				title: '🛑 Bot Shutting Down',
				description: 'Social Media Discord Bot is going offline.',
				color: 0xFF0000,
				timestamp: new Date().toISOString(),
				footer: {
					text: 'Bot will resume monitoring when restarted'
				}
			}

			await discordService.sendMessage('', embed)
			logger.info('📢 Shutdown notification sent to Discord')

			// Give a moment for the message to send
			await new Promise(resolve => setTimeout(resolve, 2000))

		} catch (error) {
			logger.warn(`Failed to send shutdown notification: ${error.message}`)
		}
	}

	/**
	 * Get bot status information
	 * @returns {Object} Status information
	 */
	getStatus() {
		return {
			isRunning: !this.isShuttingDown,
			uptime: process.uptime(),
			memoryUsage: process.memoryUsage(),
			discord: {
				ready: discordService.isReady
			},
			scheduler: scheduler.getStatus(),
			config: {
				checkInterval: config.bot.checkIntervalMinutes,
				platforms: {
					youtube: !!config.socialMedia.youtube.apiKey,
					instagram: !!config.socialMedia.instagram.username,
					linkedin: !!config.socialMedia.linkedin.profileUrl
				}
			}
		}
	}
}

// Create bot instance
const bot = new SocialMediaBot()

// Setup shutdown handlers
bot.setupShutdownHandlers()

// Start the bot
bot.start().catch(error => {
	logger.error(`💥 Fatal error starting bot: ${error.message}`)
	process.exit(1)
})

// Export for testing purposes
export { bot, SocialMediaBot } 