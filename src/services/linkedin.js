import axios from 'axios'
import * as cheerio from 'cheerio'
import { config } from '../config/config.js'
import { createServiceLogger } from '../utils/logger.js'
import { database } from '../database/database.js'

const logger = createServiceLogger('linkedin')

/**
 * LinkedIn service for fetching latest posts
 * Uses web scraping as LinkedIn API has strict access requirements
 */
class LinkedInService {
	constructor() {
		this.profileUrl = config.socialMedia.linkedin.profileUrl
		this.accessToken = config.socialMedia.linkedin.accessToken
		this.rateLimitDelay = 3000 // 3 seconds between requests
		this.lastRequestTime = 0
	}

	/**
	 * Check if LinkedIn service is configured
	 * @returns {boolean} True if configured
	 */
	isConfigured() {
		return !!this.profileUrl
	}

	/**
	 * Rate limiting helper
	 * @returns {Promise<void>}
	 */
	async respectRateLimit() {
		const now = Date.now()
		const timeSinceLastRequest = now - this.lastRequestTime
		
		if (timeSinceLastRequest < this.rateLimitDelay) {
			const waitTime = this.rateLimitDelay - timeSinceLastRequest
			await new Promise(resolve => setTimeout(resolve, waitTime))
		}
		
		this.lastRequestTime = Date.now()
	}

	/**
	 * Get user agent string for requests
	 * @returns {string} User agent
	 */
	getUserAgent() {
		return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
	}

	/**
	 * Extract username from LinkedIn profile URL
	 * @returns {string} LinkedIn username
	 */
	getUsername() {
		if (!this.profileUrl) return null
		
		const match = this.profileUrl.match(/linkedin\.com\/in\/([^\/]+)/)
		return match ? match[1] : null
	}

	/**
	 * Scrape LinkedIn profile for recent activity
	 * @returns {Promise<Object>} Result with posts data
	 */
	async scrapeProfile() {
		try {
			if (!this.isConfigured()) {
				throw new Error('LinkedIn service not configured')
			}

			await this.respectRateLimit()

			// LinkedIn heavily restricts scraping, so we'll try a basic approach
			const response = await axios.get(this.profileUrl, {
				headers: {
					'User-Agent': this.getUserAgent(),
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
					'Accept-Language': 'en-US,en;q=0.5',
					'Accept-Encoding': 'gzip, deflate',
					'Connection': 'keep-alive',
					'Upgrade-Insecure-Requests': '1',
					'Cache-Control': 'no-cache'
				},
				timeout: 15000
			})

			const $ = cheerio.load(response.data)
			
			// Extract basic profile information
			const profile = this.extractProfileInfo($)
			
			// Try to extract recent activity (limited due to LinkedIn's restrictions)
			const posts = this.extractRecentActivity($)

			logger.info(`Extracted ${posts.length} LinkedIn posts`)
			
			return {
				success: true,
				posts,
				profile,
				count: posts.length,
				message: 'Limited data available due to LinkedIn restrictions'
			}

		} catch (error) {
			logger.error(`Failed to scrape LinkedIn profile: ${error.message}`)
			
			// If scraping fails, try RSS feed approach
			return this.tryRSSFeed()
		}
	}

	/**
	 * Extract profile information from LinkedIn page
	 * @param {Object} $ - Cheerio instance
	 * @returns {Object} Profile information
	 */
	extractProfileInfo($) {
		const name = $('h1').first().text().trim() || 
					 $('meta[property="og:title"]').attr('content') || 
					 'LinkedIn User'
		
		const headline = $('.text-body-medium').first().text().trim() ||
						$('meta[property="og:description"]').attr('content') ||
						''
		
		const profileImage = $('img[data-ghost-classes="profile-photo"]').attr('src') ||
							$('meta[property="og:image"]').attr('content') ||
							''

		return {
			name,
			headline,
			profileImage,
			profileUrl: this.profileUrl,
			username: this.getUsername()
		}
	}

	/**
	 * Extract recent activity from LinkedIn page (very limited)
	 * @param {Object} $ - Cheerio instance
	 * @returns {Array} Array of posts
	 */
	extractRecentActivity($) {
		const posts = []
		
		// LinkedIn's structure makes it very difficult to extract posts via scraping
		// This is a basic attempt that may not work consistently
		$('.feed-shared-update-v2').each((i, element) => {
			try {
				const $post = $(element)
				const text = $post.find('.feed-shared-text').text().trim()
				const timestamp = $post.find('time').attr('datetime')
				const postId = $post.attr('data-urn') || `linkedin-${Date.now()}-${i}`
				
				if (text) {
					posts.push({
						id: postId,
						content: text,
						timestamp: timestamp ? new Date(timestamp) : new Date(),
						url: this.profileUrl,
						platform: 'linkedin',
						type: 'post'
					})
				}
			} catch (e) {
				// Skip this post if parsing fails
			}
		})

		return posts
	}

	/**
	 * Try to get LinkedIn updates via RSS feed (if available)
	 * @returns {Promise<Object>} RSS feed result
	 */
	async tryRSSFeed() {
		try {
			// Some LinkedIn profiles have RSS feeds, but this is rare
			const username = this.getUsername()
			if (!username) {
				throw new Error('Cannot extract username from profile URL')
			}

			// This is a fallback that likely won't work for most profiles
			logger.warn('LinkedIn scraping failed, RSS feed approach also limited')
			
			return {
				success: false,
				error: 'LinkedIn data access is restricted. Consider using LinkedIn API with proper authentication.',
				posts: [],
				profile: {
					username: username,
					profileUrl: this.profileUrl
				}
			}

		} catch (error) {
			logger.error(`LinkedIn RSS feed attempt failed: ${error.message}`)
			return {
				success: false,
				error: 'LinkedIn access restricted',
				posts: []
			}
		}
	}

	/**
	 * Check for new posts since last check
	 * @returns {Promise<Object>} Result with new posts
	 */
	async checkForNewPosts() {
		try {
			if (!this.isConfigured()) {
				return {
					success: false,
					error: 'LinkedIn service not configured',
					newContent: []
				}
			}

			// Get last update info
			const lastUpdate = await database.getLastUpdate('linkedin')
			const lastCheckTime = lastUpdate?.last_content_timestamp 
				? new Date(lastUpdate.last_content_timestamp)
				: new Date(Date.now() - 24 * 60 * 60 * 1000) // Default to 24 hours ago

			// Scrape profile
			const result = await this.scrapeProfile()
			
			if (!result.success) {
				return {
					success: false,
					error: result.error,
					newContent: []
				}
			}

			// Filter for new posts
			const newPosts = result.posts.filter(post => {
				return post.timestamp > lastCheckTime
			})

			// Filter out already sent notifications
			const unseenPosts = []
			for (const post of newPosts) {
				const alreadySent = await database.isNotificationSent('linkedin', post.id)
				if (!alreadySent) {
					unseenPosts.push(post)
				}
			}

			// Update last check time
			const latestPost = result.posts[0]
			if (latestPost) {
				await database.updateLastCheck(
					'linkedin',
					latestPost.id,
					latestPost.timestamp.toISOString()
				)
			} else {
				// Update check time even if no posts found
				await database.updateLastCheck('linkedin')
			}

			logger.info(`Found ${unseenPosts.length} new LinkedIn posts`)
			
			return {
				success: true,
				newContent: unseenPosts,
				totalChecked: result.posts.length,
				platform: 'linkedin',
				message: result.message
			}

		} catch (error) {
			logger.error(`Error checking for new LinkedIn posts: ${error.message}`)
			return {
				success: false,
				error: error.message,
				newContent: []
			}
		}
	}

	/**
	 * Format post data for Discord embed
	 * @param {Object} post - Post object
	 * @returns {Object} Discord embed object
	 */
	formatForDiscord(post) {
		const embed = {
			title: `💼 New LinkedIn Post`,
			description: this.truncateContent(post.content, 400),
			url: post.url || this.profileUrl,
			color: 0x0077B5, // LinkedIn blue
			fields: [
				{
					name: '👤 Profile',
					value: `[${this.getUsername() || 'LinkedIn User'}](${this.profileUrl})`,
					inline: true
				},
				{
					name: '📅 Posted',
					value: `<t:${Math.floor(post.timestamp.getTime() / 1000)}:R>`,
					inline: true
				}
			],
			footer: {
				text: 'LinkedIn',
				icon_url: 'https://content.linkedin.com/content/dam/me/business/en-us/amp/brand-site/v2/bg/LI-Bug.svg.original.svg'
			},
			timestamp: post.timestamp.toISOString()
		}

		return embed
	}

	/**
	 * Truncate content to specified length
	 * @param {string} content - Post content
	 * @param {number} maxLength - Maximum length
	 * @returns {string} Truncated content
	 */
	truncateContent(content, maxLength = 400) {
		if (!content) return 'No content available'
		
		if (content.length <= maxLength) {
			return content
		}

		return content.substring(0, maxLength).trim() + '...'
	}

	/**
	 * Get profile information
	 * @returns {Promise<Object>} Profile information
	 */
	async getProfileInfo() {
		try {
			const result = await this.scrapeProfile()
			
			if (result.success && result.profile) {
				return {
					success: true,
					profile: result.profile
				}
			}

			return {
				success: false,
				error: result.error || 'Failed to get profile info'
			}

		} catch (error) {
			logger.error(`Failed to get LinkedIn profile info: ${error.message}`)
			return {
				success: false,
				error: error.message
			}
		}
	}

	/**
	 * Alternative method using LinkedIn API (if token is available)
	 * Note: LinkedIn API access is very restricted
	 * @returns {Promise<Object>} API result
	 */
	async fetchFromAPI() {
		if (!this.accessToken) {
			throw new Error('LinkedIn access token not configured')
		}

		try {
			// LinkedIn API v2 endpoint for posts (requires special permissions)
			const response = await axios.get('https://api.linkedin.com/v2/shares', {
				headers: {
					'Authorization': `Bearer ${this.accessToken}`,
					'X-Restli-Protocol-Version': '2.0.0'
				},
				params: {
					q: 'owners',
					owners: 'urn:li:person:YOUR_PERSON_ID', // Would need to be configured
					sortBy: 'LAST_MODIFIED'
				}
			})

			const posts = response.data.elements.map(item => ({
				id: item.id,
				content: item.text?.text || '',
				timestamp: new Date(item.lastModified),
				url: `https://www.linkedin.com/feed/update/${item.id}`,
				platform: 'linkedin'
			}))

			return {
				success: true,
				posts,
				count: posts.length
			}

		} catch (error) {
			logger.error(`LinkedIn API request failed: ${error.message}`)
			throw error
		}
	}

	/**
	 * Create a manual post notification (for when automatic detection fails)
	 * @param {string} content - Post content
	 * @param {string} postUrl - Direct URL to the post
	 * @returns {Object} Manual post object
	 */
	createManualPost(content, postUrl = null) {
		return {
			id: `manual-${Date.now()}`,
			content,
			timestamp: new Date(),
			url: postUrl || this.profileUrl,
			platform: 'linkedin',
			type: 'manual'
		}
	}
}

// Create and export singleton instance
const linkedinService = new LinkedInService()

export { linkedinService, LinkedInService } 