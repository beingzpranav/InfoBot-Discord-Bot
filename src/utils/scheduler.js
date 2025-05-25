import cron from 'node-cron'
import { config } from '../config/config.js'
import { createServiceLogger, logSocialMediaCheck } from './logger.js'
import { discordService } from '../services/discord.js'
import { youtubeService } from '../services/youtube.js'
import { instagramService } from '../services/instagram.js'
import { linkedinService } from '../services/linkedin.js'
import { database } from '../database/database.js'

const logger = createServiceLogger('scheduler')

/**
 * Scheduler class for managing periodic social media checks
 */
class Scheduler {
	constructor() {
		this.tasks = new Map()
		this.isRunning = false
	}

	/**
	 * Start the scheduler with configured intervals
	 * @returns {Promise<void>}
	 */
	async start() {
		try {
			if (this.isRunning) {
				logger.warn('Scheduler is already running')
				return
			}

			// Create cron expression for the check interval
			const intervalMinutes = config.bot.checkIntervalMinutes
			const cronExpression = `*/${intervalMinutes} * * * *`

			logger.info(`Starting scheduler with ${intervalMinutes} minute intervals`)

			// Schedule the main check task
			const mainTask = cron.schedule(cronExpression, async () => {
				await this.performScheduledCheck()
			}, {
				scheduled: false,
				timezone: 'UTC'
			})

			this.tasks.set('main-check', mainTask)

			// Schedule daily cleanup task (runs at 2 AM UTC)
			const cleanupTask = cron.schedule('0 2 * * *', async () => {
				await this.performDailyCleanup()
			}, {
				scheduled: false,
				timezone: 'UTC'
			})

			this.tasks.set('daily-cleanup', cleanupTask)

			// Start all tasks
			for (const [name, task] of this.tasks) {
				task.start()
				logger.info(`Started scheduled task: ${name}`)
			}

			this.isRunning = true
			logger.info('Scheduler started successfully')

			// Perform an initial check after a short delay
			setTimeout(() => {
				this.performScheduledCheck()
			}, 5000) // 5 second delay

		} catch (error) {
			logger.error(`Failed to start scheduler: ${error.message}`)
			throw error
		}
	}

	/**
	 * Stop the scheduler and all tasks
	 * @returns {Promise<void>}
	 */
	async stop() {
		try {
			if (!this.isRunning) {
				logger.warn('Scheduler is not running')
				return
			}

			// Stop all tasks
			for (const [name, task] of this.tasks) {
				task.stop()
				logger.info(`Stopped scheduled task: ${name}`)
			}

			this.tasks.clear()
			this.isRunning = false
			logger.info('Scheduler stopped successfully')

		} catch (error) {
			logger.error(`Error stopping scheduler: ${error.message}`)
		}
	}

	/**
	 * Perform the main scheduled check for all platforms
	 * @returns {Promise<void>}
	 */
	async performScheduledCheck() {
		try {
			logger.info('🔄 Starting scheduled social media check')

			const results = []
			let totalNewContent = 0

			// Check YouTube
			if (youtubeService.isConfigured()) {
				try {
					const result = await youtubeService.checkForNewVideos()
					results.push({ platform: 'YouTube', ...result })
					logSocialMediaCheck('youtube', result)

					if (result.success && result.newContent?.length > 0) {
						totalNewContent += result.newContent.length
						await this.sendNotifications(result.newContent, 'youtube')
					}
				} catch (error) {
					logger.error(`YouTube check failed: ${error.message}`)
					results.push({ platform: 'YouTube', success: false, error: error.message })
				}
			}

			// Check Instagram
			if (instagramService.isConfigured()) {
				try {
					const result = await instagramService.checkForNewPosts()
					results.push({ platform: 'Instagram', ...result })
					logSocialMediaCheck('instagram', result)

					if (result.success && result.newContent?.length > 0) {
						totalNewContent += result.newContent.length
						await this.sendNotifications(result.newContent, 'instagram')
					}
				} catch (error) {
					logger.error(`Instagram check failed: ${error.message}`)
					results.push({ platform: 'Instagram', success: false, error: error.message })
				}
			}

			// Check LinkedIn
			if (linkedinService.isConfigured()) {
				try {
					const result = await linkedinService.checkForNewPosts()
					results.push({ platform: 'LinkedIn', ...result })
					logSocialMediaCheck('linkedin', result)

					if (result.success && result.newContent?.length > 0) {
						totalNewContent += result.newContent.length
						await this.sendNotifications(result.newContent, 'linkedin')
					}
				} catch (error) {
					logger.error(`LinkedIn check failed: ${error.message}`)
					results.push({ platform: 'LinkedIn', success: false, error: error.message })
				}
			}

			// Log summary
			const successfulChecks = results.filter(r => r.success).length
			const totalChecks = results.length

			logger.info(`✅ Scheduled check complete: ${successfulChecks}/${totalChecks} platforms successful, ${totalNewContent} new posts found`)

			// Send summary to Discord if there were any issues
			if (successfulChecks < totalChecks) {
				await this.sendErrorSummary(results)
			}

		} catch (error) {
			logger.error(`Error during scheduled check: ${error.message}`)
		}
	}

	/**
	 * Send notifications for new content
	 * @param {Array} content - Array of content items
	 * @param {string} platform - Platform name
	 * @returns {Promise<void>}
	 */
	async sendNotifications(content, platform) {
		try {
			for (const item of content) {
				try {
					await discordService.sendSocialMediaUpdate(item, platform)
					
					// Add a small delay between messages to avoid rate limiting
					if (content.length > 1) {
						await new Promise(resolve => setTimeout(resolve, 1000))
					}
				} catch (error) {
					logger.error(`Failed to send notification for ${platform} content ${item.id}: ${error.message}`)
				}
			}
		} catch (error) {
			logger.error(`Error sending notifications for ${platform}: ${error.message}`)
		}
	}

	/**
	 * Send error summary to Discord if there were check failures
	 * @param {Array} results - Check results
	 * @returns {Promise<void>}
	 */
	async sendErrorSummary(results) {
		try {
			const failedChecks = results.filter(r => !r.success)
			
			if (failedChecks.length === 0) return

			const errorMessage = `⚠️ **Social Media Check Issues**\n\n${
				failedChecks.map(check => 
					`**${check.platform}**: ${check.error}`
				).join('\n')
			}\n\n*Check logs for more details*`

			// Only send error summary if it's been a while since the last one
			// to avoid spamming the channel
			const lastErrorTime = this.lastErrorSummaryTime || 0
			const now = Date.now()
			const oneHour = 60 * 60 * 1000

			if (now - lastErrorTime > oneHour) {
				await discordService.sendMessage(errorMessage)
				this.lastErrorSummaryTime = now
			}

		} catch (error) {
			logger.error(`Failed to send error summary: ${error.message}`)
		}
	}

	/**
	 * Perform daily cleanup tasks
	 * @returns {Promise<void>}
	 */
	async performDailyCleanup() {
		try {
			logger.info('🧹 Starting daily cleanup tasks')

			// Clean up old notifications from database
			const cleanupResult = await database.cleanupOldNotifications()
			
			if (cleanupResult.success) {
				logger.info(`Cleaned up ${cleanupResult.affectedRows} old notification records`)
			} else {
				logger.error(`Database cleanup failed: ${cleanupResult.error}`)
			}

			// Log daily statistics
			const stats = await database.getBotStats()
			logger.info('📊 Daily Stats:', {
				totalNotifications: stats.total_notifications,
				notifications24h: stats.notifications_24h,
				notifications7d: stats.notifications_7d,
				activePlatforms: stats.active_platforms
			})

			logger.info('✅ Daily cleanup completed')

		} catch (error) {
			logger.error(`Error during daily cleanup: ${error.message}`)
		}
	}

	/**
	 * Manually trigger a check for all platforms
	 * @returns {Promise<Object>} Check results
	 */
	async triggerManualCheck() {
		try {
			logger.info('🔄 Manual check triggered')
			await this.performScheduledCheck()
			
			return {
				success: true,
				message: 'Manual check completed'
			}
		} catch (error) {
			logger.error(`Manual check failed: ${error.message}`)
			return {
				success: false,
				error: error.message
			}
		}
	}

	/**
	 * Get scheduler status
	 * @returns {Object} Scheduler status
	 */
	getStatus() {
		return {
			isRunning: this.isRunning,
			activeTasks: Array.from(this.tasks.keys()),
			checkInterval: config.bot.checkIntervalMinutes,
			nextCheck: this.getNextCheckTime()
		}
	}

	/**
	 * Get the next scheduled check time
	 * @returns {Date|null} Next check time
	 */
	getNextCheckTime() {
		const mainTask = this.tasks.get('main-check')
		if (!mainTask) return null

		// Calculate next check time based on interval
		const now = new Date()
		const intervalMs = config.bot.checkIntervalMinutes * 60 * 1000
		const nextCheck = new Date(Math.ceil(now.getTime() / intervalMs) * intervalMs)
		
		return nextCheck
	}

	/**
	 * Update check interval (requires restart)
	 * @param {number} minutes - New interval in minutes
	 * @returns {Promise<void>}
	 */
	async updateCheckInterval(minutes) {
		try {
			if (minutes < 5 || minutes > 1440) { // 5 minutes to 24 hours
				throw new Error('Check interval must be between 5 and 1440 minutes')
			}

			logger.info(`Updating check interval to ${minutes} minutes`)
			
			// Update config (this would require a restart to take effect)
			config.bot.checkIntervalMinutes = minutes
			
			// Restart scheduler with new interval
			await this.stop()
			await this.start()

			logger.info(`Check interval updated to ${minutes} minutes`)

		} catch (error) {
			logger.error(`Failed to update check interval: ${error.message}`)
			throw error
		}
	}
}

// Create and export singleton instance
const scheduler = new Scheduler()

export { scheduler, Scheduler } 