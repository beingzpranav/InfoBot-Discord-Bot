import axios from 'axios'
import * as cheerio from 'cheerio'
import { config } from '../config/config.js'
import { createServiceLogger } from '../utils/logger.js'
import { database } from '../database/database.js'

const logger = createServiceLogger('instagram')

/**
 * Instagram service for fetching latest posts
 * Uses web scraping as Instagram API requires business verification
 */
class InstagramService {
	constructor() {
		this.username = config.socialMedia.instagram.username
		this.accessToken = config.socialMedia.instagram.accessToken
		this.baseUrl = 'https://www.instagram.com'
		this.rateLimitDelay = 10000 // 10 seconds between requests (increased)
		this.lastRequestTime = 0
		this.failureCount = 0
		this.maxRetries = 3
	}

	/**
	 * Check if Instagram service is configured
	 * @returns {boolean} True if configured
	 */
	isConfigured() {
		return !!this.username
	}

	/**
	 * Rate limiting helper with exponential backoff
	 * @returns {Promise<void>}
	 */
	async respectRateLimit() {
		const now = Date.now()
		const timeSinceLastRequest = now - this.lastRequestTime
		
		// Exponential backoff based on failure count
		const backoffMultiplier = Math.pow(2, this.failureCount)
		const currentDelay = this.rateLimitDelay * backoffMultiplier
		
		if (timeSinceLastRequest < currentDelay) {
			const waitTime = currentDelay - timeSinceLastRequest
			logger.info(`Rate limiting: waiting ${Math.round(waitTime / 1000)}s before next request`)
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
	 * Fetch Instagram profile page and extract post data
	 * @returns {Promise<Object>} Result with posts data
	 */
	async scrapeProfile() {
		let attempt = 0
		
		while (attempt < this.maxRetries) {
			try {
				if (!this.isConfigured()) {
					throw new Error('Instagram service not configured')
				}

				await this.respectRateLimit()

				const profileUrl = `${this.baseUrl}/${this.username}/`
				
				const response = await axios.get(profileUrl, {
					headers: {
						'User-Agent': this.getUserAgent(),
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.5',
						'Accept-Encoding': 'gzip, deflate',
						'Connection': 'keep-alive',
						'Upgrade-Insecure-Requests': '1',
						'Cache-Control': 'no-cache',
						'Pragma': 'no-cache'
					},
					timeout: 15000
				})

				const $ = cheerio.load(response.data)
				
				// Try to extract JSON data from script tags
				let jsonData = null
				$('script[type="application/json"]').each((i, elem) => {
					try {
						const content = $(elem).html()
						if (content && content.includes('ProfilePage')) {
							jsonData = JSON.parse(content)
							return false // Break the loop
						}
					} catch (e) {
						// Continue to next script tag
					}
				})

				// Alternative: look for window._sharedData
				if (!jsonData) {
					$('script').each((i, elem) => {
						const content = $(elem).html()
						if (content && content.includes('window._sharedData')) {
							try {
								const match = content.match(/window\._sharedData\s*=\s*({.+?});/)
								if (match) {
									jsonData = JSON.parse(match[1])
									return false
								}
							} catch (e) {
								// Continue to next script tag
							}
						}
					})
				}

				if (!jsonData) {
					// Fallback: try to extract basic info from meta tags
					const result = this.extractBasicInfo($)
					this.failureCount = 0 // Reset on success
					return result
				}

				const result = this.parseInstagramData(jsonData)
				this.failureCount = 0 // Reset on success
				return result

			} catch (error) {
				attempt++
				this.failureCount++
				
				if (error.response?.status === 429) {
					logger.warn(`Instagram rate limit hit (429). Attempt ${attempt}/${this.maxRetries}`)
					if (attempt < this.maxRetries) {
						const waitTime = Math.pow(2, attempt) * 30000 // 30s, 60s, 120s
						logger.info(`Waiting ${waitTime / 1000}s before retry...`)
						await new Promise(resolve => setTimeout(resolve, waitTime))
						continue
					}
				}
				
				if (attempt >= this.maxRetries) {
					logger.error(`Failed to scrape Instagram profile after ${this.maxRetries} attempts: ${error.message}`)
					return {
						success: false,
						error: `Rate limited or blocked by Instagram. Last error: ${error.message}`,
						posts: []
					}
				}
			}
		}
		
		// This should never be reached, but just in case
		return {
			success: false,
			error: 'Maximum retries exceeded',
			posts: []
		}
	}

	/**
	 * Extract basic info from meta tags as fallback
	 * @param {Object} $ - Cheerio instance
	 * @returns {Object} Basic profile info
	 */
	extractBasicInfo($) {
		const profileImage = $('meta[property="og:image"]').attr('content')
		const description = $('meta[property="og:description"]').attr('content')
		
		logger.warn('Using fallback method for Instagram scraping - limited data available')
		
		return {
			success: true,
			posts: [],
			profile: {
				username: this.username,
				profileImage,
				description
			},
			message: 'Limited data available due to Instagram restrictions'
		}
	}

	/**
	 * Parse Instagram JSON data to extract posts
	 * @param {Object} data - Instagram JSON data
	 * @returns {Object} Parsed posts data
	 */
	parseInstagramData(data) {
		try {
			let posts = []
			let profile = {}

			// Navigate through the complex Instagram data structure
			const entryData = data.entry_data || data
			
			if (entryData.ProfilePage) {
				const profilePage = entryData.ProfilePage[0]
				const user = profilePage.graphql?.user || profilePage.user
				
				if (user) {
					profile = {
						username: user.username,
						fullName: user.full_name,
						biography: user.biography,
						profileImage: user.profile_pic_url_hd || user.profile_pic_url,
						followersCount: user.edge_followed_by?.count || 0,
						followingCount: user.edge_follow?.count || 0,
						postsCount: user.edge_owner_to_timeline_media?.count || 0
					}

					// Extract posts
					const timelineMedia = user.edge_owner_to_timeline_media?.edges || []
					
					posts = timelineMedia.map(edge => {
						const node = edge.node
						return {
							id: node.id,
							shortcode: node.shortcode,
							caption: node.edge_media_to_caption?.edges[0]?.node?.text || '',
							imageUrl: node.display_url,
							thumbnailUrl: node.thumbnail_src,
							isVideo: node.is_video,
							videoUrl: node.video_url,
							likesCount: node.edge_liked_by?.count || 0,
							commentsCount: node.edge_media_to_comment?.count || 0,
							timestamp: new Date(node.taken_at_timestamp * 1000),
							url: `${this.baseUrl}/p/${node.shortcode}/`,
							platform: 'instagram'
						}
					})
				}
			}

			logger.info(`Extracted ${posts.length} Instagram posts`)
			
			return {
				success: true,
				posts: posts.slice(0, 10), // Limit to 10 most recent
				profile,
				count: posts.length
			}

		} catch (error) {
			logger.error(`Failed to parse Instagram data: ${error.message}`)
			return {
				success: false,
				error: error.message,
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
					error: 'Instagram service not configured',
					newContent: []
				}
			}

			// Get last update info
			const lastUpdate = await database.getLastUpdate('instagram')
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
				const alreadySent = await database.isNotificationSent('instagram', post.id)
				if (!alreadySent) {
					unseenPosts.push(post)
				}
			}

			// Update last check time (always update, even if no posts found)
			const latestPost = result.posts[0]
			if (latestPost) {
				await database.updateLastCheck(
					'instagram',
					latestPost.id,
					latestPost.timestamp.toISOString()
				)
			} else {
				// Update check time even when no posts found to mark platform as active
				await database.updateLastCheck('instagram', null, null)
			}

			logger.info(`Found ${unseenPosts.length} new Instagram posts`)
			
			return {
				success: true,
				newContent: unseenPosts,
				totalChecked: result.posts.length,
				platform: 'instagram'
			}

		} catch (error) {
			logger.error(`Error checking for new Instagram posts: ${error.message}`)
			
			// Still update database to mark platform as checked, even on error
			try {
				await database.updateLastCheck('instagram', null, null)
			} catch (dbError) {
				logger.error(`Failed to update database after Instagram error: ${dbError.message}`)
			}
			
			return {
				success: false,
				error: error.message.includes('Rate limited') 
					? 'Instagram temporarily rate limited - will retry later'
					: error.message,
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
		const postType = post.isVideo ? 'video' : 'post'
		
		const embed = {
			author: {
				name: `@${this.username}`,
				icon_url: 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png'
			},
			title: `New Instagram ${postType}!`,
			description: `@${this.username} posted a new ${postType} on Instagram!\n\n**Caption**\n${this.truncateCaption(post.caption, 200)}`,
			url: post.url,
			color: 0xE4405F, // Instagram pink
			image: {
				url: post.imageUrl
			},
			footer: {
				text: `Instagram • ${new Date(post.timestamp).toLocaleDateString('en-US', { 
					month: 'numeric', 
					day: 'numeric', 
					year: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				})}`,
				icon_url: 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png'
			},
			timestamp: post.timestamp.toISOString()
		}

		// Add engagement stats in description if available
		if (post.likesCount || post.commentsCount) {
			embed.description += `\n\n**Engagement**\n❤️ ${post.likesCount || 0} likes • 💬 ${post.commentsCount || 0} comments`
		}

		return embed
	}

	/**
	 * Truncate caption to specified length
	 * @param {string} caption - Post caption
	 * @param {number} maxLength - Maximum length
	 * @returns {string} Truncated caption
	 */
	truncateCaption(caption, maxLength = 300) {
		if (!caption) return 'No caption'
		
		if (caption.length <= maxLength) {
			return caption
		}

		return caption.substring(0, maxLength).trim() + '...'
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
			logger.error(`Failed to get Instagram profile info: ${error.message}`)
			return {
				success: false,
				error: error.message
			}
		}
	}

	/**
	 * Alternative method using Instagram Basic Display API (if token is available)
	 * @returns {Promise<Object>} API result
	 */
	async fetchFromAPI() {
		if (!this.accessToken) {
			throw new Error('Instagram access token not configured')
		}

		try {
			const response = await axios.get('https://graph.instagram.com/me/media', {
				params: {
					fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
					access_token: this.accessToken
				}
			})

			const posts = response.data.data.map(item => ({
				id: item.id,
				caption: item.caption || '',
				imageUrl: item.media_url,
				thumbnailUrl: item.thumbnail_url,
				isVideo: item.media_type === 'VIDEO',
				timestamp: new Date(item.timestamp),
				url: item.permalink,
				platform: 'instagram'
			}))

			return {
				success: true,
				posts,
				count: posts.length
			}

		} catch (error) {
			logger.error(`Instagram API request failed: ${error.message}`)
			throw error
		}
	}
}

// Create and export singleton instance
const instagramService = new InstagramService()

export { instagramService, InstagramService } 