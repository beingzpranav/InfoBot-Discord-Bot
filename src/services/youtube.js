import axios from 'axios'
import { config } from '../config/config.js'
import { createServiceLogger } from '../utils/logger.js'
import { database } from '../database/database.js'

const logger = createServiceLogger('youtube')

/**
 * YouTube service for fetching latest videos
 */
class YouTubeService {
	constructor() {
		this.apiKey = config.socialMedia.youtube.apiKey
		this.channelId = config.socialMedia.youtube.channelId
		this.channelHandle = config.socialMedia.youtube.channelHandle
		this.baseUrl = 'https://www.googleapis.com/youtube/v3'
	}

	/**
	 * Check if YouTube service is configured
	 * @returns {boolean} True if configured
	 */
	isConfigured() {
		return !!(this.apiKey && (this.channelId || this.channelHandle))
	}

	/**
	 * Get channel ID from handle if not provided
	 * @returns {Promise<string>} Channel ID
	 */
	async getChannelId() {
		if (this.channelId) {
			return this.channelId
		}

		if (!this.channelHandle) {
			throw new Error('Neither channel ID nor handle provided')
		}

		try {
			const handle = this.channelHandle.startsWith('@') 
				? this.channelHandle.slice(1) 
				: this.channelHandle

			const response = await axios.get(`${this.baseUrl}/search`, {
				params: {
					key: this.apiKey,
					q: handle,
					type: 'channel',
					part: 'snippet',
					maxResults: 1
				}
			})

			if (response.data.items && response.data.items.length > 0) {
				const channelId = response.data.items[0].snippet.channelId
				logger.info(`Found channel ID for handle ${this.channelHandle}: ${channelId}`)
				return channelId
			}

			throw new Error(`Channel not found for handle: ${this.channelHandle}`)
		} catch (error) {
			logger.error(`Failed to get channel ID from handle: ${error.message}`)
			throw error
		}
	}

	/**
	 * Fetch latest videos from the YouTube channel
	 * @param {number} maxResults - Maximum number of videos to fetch
	 * @returns {Promise<Object>} Result object with success status and videos
	 */
	async getLatestVideos(maxResults = 5) {
		try {
			if (!this.isConfigured()) {
				throw new Error('YouTube service not configured')
			}

			const channelId = await this.getChannelId()

			// Get the uploads playlist ID (it's usually UC + channel ID with UC replaced by UU)
			const uploadsPlaylistId = channelId.replace('UC', 'UU')

			const response = await axios.get(`${this.baseUrl}/playlistItems`, {
				params: {
					key: this.apiKey,
					playlistId: uploadsPlaylistId,
					part: 'snippet,contentDetails',
					maxResults: maxResults,
					order: 'date'
				}
			})

			const videos = response.data.items.map(item => ({
				id: item.contentDetails.videoId,
				title: item.snippet.title,
				description: item.snippet.description,
				thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
				publishedAt: new Date(item.snippet.publishedAt),
				url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
				channelTitle: item.snippet.channelTitle,
				platform: 'youtube'
			}))

			logger.info(`Fetched ${videos.length} videos from YouTube`)
			return {
				success: true,
				videos: videos,
				count: videos.length
			}

		} catch (error) {
			logger.error(`Failed to fetch YouTube videos: ${error.message}`)
			return {
				success: false,
				error: error.message,
				videos: []
			}
		}
	}

	/**
	 * Check for new videos since last check
	 * @returns {Promise<Object>} Result with new videos
	 */
	async checkForNewVideos() {
		try {
			if (!this.isConfigured()) {
				return {
					success: false,
					error: 'YouTube service not configured',
					newContent: []
				}
			}

			// Get last update info
			const lastUpdate = await database.getLastUpdate('youtube')
			const lastCheckTime = lastUpdate?.last_content_timestamp 
				? new Date(lastUpdate.last_content_timestamp)
				: new Date(Date.now() - 24 * 60 * 60 * 1000) // Default to 24 hours ago

			// Fetch latest videos
			const result = await this.getLatestVideos(10)
			
			if (!result.success) {
				return result
			}

			// Filter for new videos
			const newVideos = result.videos.filter(video => {
				return video.publishedAt > lastCheckTime
			})

			// Filter out already sent notifications
			const unseenVideos = []
			for (const video of newVideos) {
				const alreadySent = await database.isNotificationSent('youtube', video.id)
				if (!alreadySent) {
					unseenVideos.push(video)
				}
			}

			// Update last check time
			const latestVideo = result.videos[0]
			if (latestVideo) {
				await database.updateLastCheck(
					'youtube',
					latestVideo.id,
					latestVideo.publishedAt.toISOString()
				)
			}

			logger.info(`Found ${unseenVideos.length} new YouTube videos`)
			
			return {
				success: true,
				newContent: unseenVideos,
				totalChecked: result.videos.length,
				platform: 'youtube'
			}

		} catch (error) {
			logger.error(`Error checking for new YouTube videos: ${error.message}`)
			return {
				success: false,
				error: error.message,
				newContent: []
			}
		}
	}

	/**
	 * Get video statistics (views, likes, comments)
	 * @param {string} videoId - YouTube video ID
	 * @returns {Promise<Object>} Video statistics
	 */
	async getVideoStats(videoId) {
		try {
			const response = await axios.get(`${this.baseUrl}/videos`, {
				params: {
					key: this.apiKey,
					id: videoId,
					part: 'statistics'
				}
			})

			if (response.data.items && response.data.items.length > 0) {
				const stats = response.data.items[0].statistics
				return {
					success: true,
					stats: {
						viewCount: parseInt(stats.viewCount) || 0,
						likeCount: parseInt(stats.likeCount) || 0,
						commentCount: parseInt(stats.commentCount) || 0
					}
				}
			}

			return {
				success: false,
				error: 'Video not found'
			}

		} catch (error) {
			logger.error(`Failed to get video stats: ${error.message}`)
			return {
				success: false,
				error: error.message
			}
		}
	}

	/**
	 * Format video data for Discord embed
	 * @param {Object} video - Video object
	 * @returns {Object} Discord embed object
	 */
	formatForDiscord(video) {
		const embed = {
			author: {
				name: video.channelTitle,
				icon_url: 'https://www.youtube.com/s/desktop/f506bd45/img/favicon_32.png'
			},
			title: video.title,
			description: `${video.channelTitle} published a video on YouTube!\n\n**Description**\n${this.truncateDescription(video.description, 150)}`,
			url: video.url,
			color: 0xFF0000, // YouTube red
			image: {
				url: video.thumbnail
			},
			footer: {
				text: `YouTube • ${new Date(video.publishedAt).toLocaleDateString('en-US', { 
					month: 'numeric', 
					day: 'numeric', 
					year: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				})}`,
				icon_url: 'https://www.youtube.com/s/desktop/f506bd45/img/favicon_32.png'
			},
			timestamp: video.publishedAt.toISOString()
		}

		return embed
	}

	/**
	 * Truncate description to specified length
	 * @param {string} description - Video description
	 * @param {number} maxLength - Maximum length
	 * @returns {string} Truncated description
	 */
	truncateDescription(description, maxLength = 200) {
		if (!description) return 'No description available'
		
		if (description.length <= maxLength) {
			return description
		}

		return description.substring(0, maxLength).trim() + '...'
	}

	/**
	 * Get channel information
	 * @returns {Promise<Object>} Channel information
	 */
	async getChannelInfo() {
		try {
			const channelId = await this.getChannelId()

			const response = await axios.get(`${this.baseUrl}/channels`, {
				params: {
					key: this.apiKey,
					id: channelId,
					part: 'snippet,statistics'
				}
			})

			if (response.data.items && response.data.items.length > 0) {
				const channel = response.data.items[0]
				return {
					success: true,
					channel: {
						id: channel.id,
						title: channel.snippet.title,
						description: channel.snippet.description,
						thumbnail: channel.snippet.thumbnails.high?.url,
						subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
						videoCount: parseInt(channel.statistics.videoCount) || 0,
						viewCount: parseInt(channel.statistics.viewCount) || 0
					}
				}
			}

			return {
				success: false,
				error: 'Channel not found'
			}

		} catch (error) {
			logger.error(`Failed to get channel info: ${error.message}`)
			return {
				success: false,
				error: error.message
			}
		}
	}
}

// Create and export singleton instance
const youtubeService = new YouTubeService()

export { youtubeService, YouTubeService } 