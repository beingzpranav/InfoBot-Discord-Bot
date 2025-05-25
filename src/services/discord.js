import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } from 'discord.js'
import { config } from '../config/config.js'
import { createServiceLogger, logDiscordMessage } from '../utils/logger.js'
import { database } from '../database/database.js'

const logger = createServiceLogger('discord')

/**
 * Discord service for bot management and message sending
 */
class DiscordService {
	constructor() {
		this.client = null
		this.isReady = false
		this.announcementChannel = null
	}

	/**
	 * Initialize the Discord bot
	 * @returns {Promise<void>}
	 */
	async initialize() {
		try {
					// Create Discord client with necessary intents
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages
			]
		})

			// Set up event listeners
			this.setupEventListeners()

			// Login to Discord
			await this.client.login(config.discord.token)

			logger.info('Discord bot initialization started')

		} catch (error) {
			logger.error(`Failed to initialize Discord bot: ${error.message}`)
			throw error
		}
	}

	/**
	 * Set up Discord client event listeners
	 */
	setupEventListeners() {
		this.client.once('ready', async () => {
			logger.info(`Discord bot logged in as ${this.client.user.tag}`)
			
			try {
				// Get announcement channel
				await this.getAnnouncementChannel()
				
				// Try to register slash commands (optional)
				try {
					await this.registerSlashCommands()
				} catch (cmdError) {
					logger.warn(`Slash commands failed to register: ${cmdError.message}`)
					logger.info('Bot will continue without slash commands')
				}
				
				this.isReady = true
				logger.info('Discord bot is ready and operational')

			} catch (error) {
				logger.error(`Error during bot ready setup: ${error.message}`)
			}
		})

		this.client.on('interactionCreate', async (interaction) => {
			if (!interaction.isChatInputCommand()) return

			try {
				await this.handleSlashCommand(interaction)
			} catch (error) {
				logger.error(`Error handling slash command: ${error.message}`)
				
				const errorMessage = 'There was an error while executing this command!'
				
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: errorMessage, ephemeral: true })
				} else {
					await interaction.reply({ content: errorMessage, ephemeral: true })
				}
			}
		})

		this.client.on('error', (error) => {
			logger.error(`Discord client error: ${error.message}`)
		})

		this.client.on('warn', (warning) => {
			logger.warn(`Discord client warning: ${warning}`)
		})

		this.client.on('disconnect', () => {
			logger.warn('Discord bot disconnected')
			this.isReady = false
		})

		this.client.on('reconnecting', () => {
			logger.info('Discord bot reconnecting...')
		})
	}

	/**
	 * Get the announcement channel
	 * @returns {Promise<void>}
	 */
	async getAnnouncementChannel() {
		try {
			const channelId = config.discord.announcementChannelId
			this.announcementChannel = await this.client.channels.fetch(channelId)
			
			if (!this.announcementChannel) {
				throw new Error(`Announcement channel not found: ${channelId}`)
			}

			logger.info(`Connected to announcement channel: ${this.announcementChannel.name}`)

		} catch (error) {
			logger.error(`Failed to get announcement channel: ${error.message}`)
			throw error
		}
	}

	/**
	 * Register slash commands
	 * @returns {Promise<void>}
	 */
	async registerSlashCommands() {
		const commands = [
			new SlashCommandBuilder()
				.setName('status')
				.setDescription('Check bot status and last update times'),
			
			new SlashCommandBuilder()
				.setName('check-now')
				.setDescription('Manually trigger a check for new content'),
			
			new SlashCommandBuilder()
				.setName('config')
				.setDescription('View current bot configuration'),

			new SlashCommandBuilder()
				.setName('stats')
				.setDescription('View bot statistics and activity'),

			new SlashCommandBuilder()
				.setName('reset-platforms')
				.setDescription('Reset platform database and force fresh checks (Admin only)')
		].map(command => command.toJSON())

		const rest = new REST({ version: '10' }).setToken(config.discord.token)

		try {
			logger.info('Started refreshing application (/) commands')

			// Check if CLIENT_ID is configured properly
			if (!config.discord.clientId || 
				config.discord.clientId === 'your_discord_client_id_here' ||
				config.discord.clientId.length < 15) {
				logger.warn('DISCORD_CLIENT_ID not configured properly, skipping slash commands')
				logger.info('To enable slash commands:')
				logger.info('1. Go to Discord Developer Portal')
				logger.info('2. Select your bot application')
				logger.info('3. Copy the Application ID from General Information')
				logger.info('4. Add it to .env as DISCORD_CLIENT_ID=your_application_id')
				return
			}

			// Register commands for your specific guild (instant)
			if (config.discord.guildId) {
				await rest.put(
					Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
					{ body: commands }
				)
				logger.info('Successfully reloaded guild-specific application (/) commands')
				logger.info('Commands should appear immediately in your Discord server')
			} else {
				// Fallback to global commands
				await rest.put(
					Routes.applicationCommands(config.discord.clientId),
					{ body: commands }
				)
				logger.info('Successfully reloaded global application (/) commands')
				logger.info('Note: Global commands may take up to 1 hour to appear in Discord')
			}

		} catch (error) {
			logger.error(`Failed to register slash commands: ${error.message}`)
			logger.warn('Bot will continue without slash commands')
			// Don't throw error - let bot continue without slash commands
		}
	}

	/**
	 * Handle slash command interactions
	 * @param {Object} interaction - Discord interaction object
	 * @returns {Promise<void>}
	 */
	async handleSlashCommand(interaction) {
		const { commandName } = interaction

		switch (commandName) {
			case 'status':
				await this.handleStatusCommand(interaction)
				break
			
			case 'check-now':
				await this.handleCheckNowCommand(interaction)
				break
			
			case 'config':
				await this.handleConfigCommand(interaction)
				break

			case 'stats':
				await this.handleStatsCommand(interaction)
				break

			case 'reset-platforms':
				await this.handleResetPlatformsCommand(interaction)
				break
			
			default:
				await interaction.reply({ content: 'Unknown command!', ephemeral: true })
		}
	}

	/**
	 * Handle status command
	 * @param {Object} interaction - Discord interaction
	 */
	async handleStatusCommand(interaction) {
		await interaction.deferReply({ ephemeral: true })

		try {
			const stats = await database.getBotStats()
			
			const embed = new EmbedBuilder()
				.setTitle('🤖 Bot Status')
				.setColor(0x00FF00)
				.addFields(
					{ name: '🟢 Status', value: 'Online and Running', inline: true },
					{ name: '📊 Total Notifications', value: stats.total_notifications?.toString() || '0', inline: true },
					{ name: '📅 Last Check', value: stats.last_global_check ? `<t:${Math.floor(new Date(stats.last_global_check).getTime() / 1000)}:R>` : 'Never', inline: true },
					{ name: '🔄 Active Platforms', value: stats.active_platforms?.toString() || '0', inline: true },
					{ name: '📈 24h Notifications', value: stats.notifications_24h?.toString() || '0', inline: true },
					{ name: '📊 7d Notifications', value: stats.notifications_7d?.toString() || '0', inline: true }
				)
				.setTimestamp()

			await interaction.editReply({ embeds: [embed] })

		} catch (error) {
			logger.error(`Error in status command: ${error.message}`)
			await interaction.editReply({ content: 'Failed to get bot status.' })
		}
	}

	/**
	 * Handle check-now command
	 * @param {Object} interaction - Discord interaction
	 */
	async handleCheckNowCommand(interaction) {
		await interaction.deferReply({ ephemeral: true })

		try {
			await interaction.editReply({ content: '🔄 Checking for new content...' })

			// Import social media services dynamically to avoid circular imports
			const { youtubeService } = await import('./youtube.js')
			const { instagramService } = await import('./instagram.js')
			const { linkedinService } = await import('./linkedin.js')

			const results = []

			// Check YouTube
			if (youtubeService.isConfigured()) {
				const result = await youtubeService.checkForNewVideos()
				results.push({ platform: 'YouTube', ...result })
			}

			// Check Instagram
			if (instagramService.isConfigured()) {
				const result = await instagramService.checkForNewPosts()
				results.push({ platform: 'Instagram', ...result })
			}

			// Check LinkedIn
			if (linkedinService.isConfigured()) {
				const result = await linkedinService.checkForNewPosts()
				results.push({ platform: 'LinkedIn', ...result })
			}

			// Send notifications for new content
			let totalNewContent = 0
			for (const result of results) {
				if (result.success && result.newContent?.length > 0) {
					totalNewContent += result.newContent.length
					
					for (const content of result.newContent) {
						await this.sendSocialMediaUpdate(content, result.platform.toLowerCase())
					}
				}
			}

			const embed = new EmbedBuilder()
				.setTitle('✅ Manual Check Complete')
				.setColor(0x00FF00)
				.setDescription(`Found ${totalNewContent} new posts across all platforms`)
				.addFields(
					...results.map(result => ({
						name: `${result.platform}`,
						value: result.success 
							? `✅ ${result.newContent?.length || 0} new posts`
							: `❌ ${result.error}`,
						inline: true
					}))
				)
				.setTimestamp()

			await interaction.editReply({ content: '', embeds: [embed] })

		} catch (error) {
			logger.error(`Error in check-now command: ${error.message}`)
			await interaction.editReply({ content: 'Failed to check for new content.' })
		}
	}

	/**
	 * Handle config command
	 * @param {Object} interaction - Discord interaction
	 */
	async handleConfigCommand(interaction) {
		await interaction.deferReply({ ephemeral: true })

		try {
			const embed = new EmbedBuilder()
				.setTitle('⚙️ Bot Configuration')
				.setColor(0x0099FF)
				.addFields(
					{ name: '📺 YouTube', value: config.socialMedia.youtube.apiKey ? '✅ Configured' : '❌ Not configured', inline: true },
					{ name: '📸 Instagram', value: config.socialMedia.instagram.username ? '✅ Configured' : '❌ Not configured', inline: true },
					{ name: '💼 LinkedIn', value: config.socialMedia.linkedin.profileUrl ? '✅ Configured' : '❌ Not configured', inline: true },
					{ name: '🔄 Check Interval', value: `${config.bot.checkIntervalMinutes} minutes`, inline: true },
					{ name: '📢 Channel', value: `<#${config.discord.announcementChannelId}>`, inline: true },
					{ name: '📊 Log Level', value: config.bot.logLevel, inline: true },
					{ name: '🔔 @everyone Mentions', value: config.bot.mentionEveryone ? '✅ Enabled' : '❌ Disabled', inline: true }
				)
				.setTimestamp()

			await interaction.editReply({ embeds: [embed] })

		} catch (error) {
			logger.error(`Error in config command: ${error.message}`)
			await interaction.editReply({ content: 'Failed to get configuration.' })
		}
	}

	/**
	 * Handle stats command
	 * @param {Object} interaction - Discord interaction
	 */
	async handleStatsCommand(interaction) {
		await interaction.deferReply({ ephemeral: true })

		try {
			const stats = await database.getBotStats()
			
			const embed = new EmbedBuilder()
				.setTitle('📊 Bot Statistics')
				.setColor(0xFF9900)
				.addFields(
					{ name: '📈 Total Notifications Sent', value: stats.total_notifications?.toString() || '0', inline: true },
					{ name: '🕐 Last 24 Hours', value: stats.notifications_24h?.toString() || '0', inline: true },
					{ name: '📅 Last 7 Days', value: stats.notifications_7d?.toString() || '0', inline: true },
					{ name: '🔗 Active Platforms', value: stats.active_platforms?.toString() || '0', inline: true },
					{ name: '⏰ Last Global Check', value: stats.last_global_check ? `<t:${Math.floor(new Date(stats.last_global_check).getTime() / 1000)}:R>` : 'Never', inline: true },
					{ name: '🤖 Bot Uptime', value: `<t:${Math.floor(this.client.readyTimestamp / 1000)}:R>`, inline: true }
				)
				.setTimestamp()

			await interaction.editReply({ embeds: [embed] })

		} catch (error) {
			logger.error(`Error in stats command: ${error.message}`)
			await interaction.editReply({ content: 'Failed to get statistics.' })
		}
	}

	/**
	 * Handle reset-platforms command
	 * @param {Object} interaction - Discord interaction
	 */
	async handleResetPlatformsCommand(interaction) {
		await interaction.deferReply({ ephemeral: true })

		try {
			await interaction.editReply({ content: '🔄 Resetting platform database and running fresh checks...' })

			// Clear existing platform data
			await new Promise((resolve, reject) => {
				database.db.run('DELETE FROM last_updates', [], (err) => {
					if (err) reject(err)
					else resolve()
				})
			})

			// Import social media services
			const { youtubeService } = await import('./youtube.js')
			const { instagramService } = await import('./instagram.js')

			const results = []

			// Force fresh checks
			if (youtubeService.isConfigured()) {
				const result = await youtubeService.checkForNewVideos()
				results.push({ platform: 'YouTube', ...result })
			}

			if (instagramService.isConfigured()) {
				const result = await instagramService.checkForNewPosts()
				results.push({ platform: 'Instagram', ...result })
			}

			// Get updated stats
			const stats = await database.getBotStats()

			const embed = new EmbedBuilder()
				.setTitle('🔄 Platform Reset Complete')
				.setColor(0x00FF00)
				.setDescription(`Platform database reset and fresh checks completed`)
				.addFields(
					{ name: '🔗 Active Platforms', value: stats.active_platforms?.toString() || '0', inline: true },
					{ name: '📊 Total Notifications', value: stats.total_notifications?.toString() || '0', inline: true },
					{ name: '⏰ Last Check', value: 'Just now', inline: true },
					...results.map(result => ({
						name: `${result.platform}`,
						value: result.success 
							? `✅ Successfully checked`
							: `❌ ${result.error}`,
						inline: true
					}))
				)
				.setTimestamp()

			await interaction.editReply({ content: '', embeds: [embed] })

		} catch (error) {
			logger.error(`Error in reset-platforms command: ${error.message}`)
			await interaction.editReply({ content: 'Failed to reset platforms.' })
		}
	}

	/**
	 * Send a social media update to the announcement channel
	 * @param {Object} content - Content object (video, post, etc.)
	 * @param {string} platform - Platform name
	 * @returns {Promise<Object>} Send result
	 */
	async sendSocialMediaUpdate(content, platform) {
		try {
			if (!this.isReady || !this.announcementChannel) {
				throw new Error('Discord bot not ready or announcement channel not available')
			}

			// Import the appropriate service to format the content
			let embed
			switch (platform) {
				case 'youtube':
					const { youtubeService } = await import('./youtube.js')
					embed = youtubeService.formatForDiscord(content)
					break
				case 'instagram':
					const { instagramService } = await import('./instagram.js')
					embed = instagramService.formatForDiscord(content)
					break
				case 'linkedin':
					const { linkedinService } = await import('./linkedin.js')
					embed = linkedinService.formatForDiscord(content)
					break
				default:
					throw new Error(`Unknown platform: ${platform}`)
			}

			// Send the message with optional @everyone mention
			const messageOptions = { embeds: [embed] }
			
			// Add @everyone mention if enabled in config
			if (config.bot.mentionEveryone) {
				messageOptions.content = '@everyone'
			}
			
			const message = await this.announcementChannel.send(messageOptions)

			// Record the sent notification in database
			await database.recordSentNotification(
				platform,
				content.id,
				content.url,
				message.id
			)

			const result = {
				success: true,
				messageId: message.id,
				channelId: this.announcementChannel.id,
				platform
			}

			logDiscordMessage(result)
			return result

		} catch (error) {
			const result = {
				success: false,
				error: error.message,
				platform,
				channelId: this.announcementChannel?.id
			}

			logDiscordMessage(result)
			throw error
		}
	}

	/**
	 * Send a custom message to the announcement channel
	 * @param {string} content - Message content
	 * @param {Object} embed - Optional embed object
	 * @returns {Promise<Object>} Send result
	 */
	async sendMessage(content, embed = null) {
		try {
			if (!this.isReady || !this.announcementChannel) {
				throw new Error('Discord bot not ready or announcement channel not available')
			}

			const messageOptions = { content }
			if (embed) {
				messageOptions.embeds = [embed]
			}

			const message = await this.announcementChannel.send(messageOptions)

			return {
				success: true,
				messageId: message.id,
				channelId: this.announcementChannel.id
			}

		} catch (error) {
			logger.error(`Failed to send message: ${error.message}`)
			throw error
		}
	}

	/**
	 * Check if bot is ready
	 * @returns {boolean} Ready status
	 */
	isReady() {
		return this.isReady && this.client?.isReady()
	}

	/**
	 * Gracefully shutdown the Discord bot
	 * @returns {Promise<void>}
	 */
	async shutdown() {
		try {
			if (this.client) {
				logger.info('Shutting down Discord bot...')
				await this.client.destroy()
				this.isReady = false
				logger.info('Discord bot shutdown complete')
			}
		} catch (error) {
			logger.error(`Error during Discord bot shutdown: ${error.message}`)
		}
	}
}

// Create and export singleton instance
const discordService = new DiscordService()

export { discordService, DiscordService } 