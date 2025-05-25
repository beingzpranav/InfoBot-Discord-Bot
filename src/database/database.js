import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'
import { getDatabasePath } from '../config/config.js'
import { logDatabaseOperation } from '../utils/logger.js'

// Enable verbose mode for debugging
const sqlite = sqlite3.verbose()

/**
 * Database class for managing social media update tracking
 */
class Database {
	constructor() {
		this.db = null
		this.dbPath = getDatabasePath()
	}

	/**
	 * Initialize the database connection and create tables
	 * @returns {Promise<Object>} Success/error result
	 */
	async initialize() {
		try {
			// Ensure database directory exists
			const dbDir = path.dirname(this.dbPath)
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true })
			}

			// Create database connection
			this.db = new sqlite.Database(this.dbPath)

			// Create tables
			await this.createTables()

			const result = { success: true, message: 'Database initialized successfully' }
			logDatabaseOperation('initialize', result)
			return result
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('initialize', result)
			throw error
		}
	}

	/**
	 * Create necessary database tables
	 * @returns {Promise<void>}
	 */
	async createTables() {
		const createTablesSQL = `
			-- Table to track last update times for each platform
			CREATE TABLE IF NOT EXISTS last_updates (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				platform TEXT NOT NULL UNIQUE,
				last_check_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				last_content_id TEXT,
				last_content_timestamp DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			-- Table to track sent notifications to prevent duplicates
			CREATE TABLE IF NOT EXISTS sent_notifications (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				platform TEXT NOT NULL,
				content_id TEXT NOT NULL,
				content_url TEXT,
				discord_message_id TEXT,
				sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(platform, content_id)
			);

			-- Table to store bot configuration and stats
			CREATE TABLE IF NOT EXISTS bot_stats (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				stat_name TEXT NOT NULL UNIQUE,
				stat_value TEXT,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			-- Create indexes for better performance
			CREATE INDEX IF NOT EXISTS idx_last_updates_platform ON last_updates(platform);
			CREATE INDEX IF NOT EXISTS idx_sent_notifications_platform_content ON sent_notifications(platform, content_id);
			CREATE INDEX IF NOT EXISTS idx_sent_notifications_sent_at ON sent_notifications(sent_at);
			CREATE INDEX IF NOT EXISTS idx_bot_stats_name ON bot_stats(stat_name);
		`

		return new Promise((resolve, reject) => {
			this.db.exec(createTablesSQL, (error) => {
				if (error) {
					reject(error)
				} else {
					resolve()
				}
			})
		})
	}

	/**
	 * Get the last update information for a platform
	 * @param {string} platform - Platform name (instagram, linkedin, youtube)
	 * @returns {Promise<Object>} Last update data or null
	 */
	async getLastUpdate(platform) {
		try {
			const sql = 'SELECT * FROM last_updates WHERE platform = ?'
			
			return new Promise((resolve, reject) => {
				this.db.get(sql, [platform], (error, row) => {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('getLastUpdate', result)
						reject(error)
					} else {
						const result = { success: true, data: row }
						logDatabaseOperation('getLastUpdate', result)
						resolve(row)
					}
				})
			})
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('getLastUpdate', result)
			throw error
		}
	}

	/**
	 * Update the last check time and content info for a platform
	 * @param {string} platform - Platform name
	 * @param {string} lastContentId - ID of the last content item
	 * @param {Date} lastContentTimestamp - Timestamp of the last content
	 * @returns {Promise<Object>} Success/error result
	 */
	async updateLastCheck(platform, lastContentId = null, lastContentTimestamp = null) {
		try {
			const sql = `
				INSERT OR REPLACE INTO last_updates 
				(platform, last_check_time, last_content_id, last_content_timestamp, updated_at)
				VALUES (?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)
			`
			
			return new Promise((resolve, reject) => {
				this.db.run(sql, [platform, lastContentId, lastContentTimestamp], function(error) {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('updateLastCheck', result)
						reject(error)
					} else {
						const result = { success: true, affectedRows: this.changes }
						logDatabaseOperation('updateLastCheck', result)
						resolve(result)
					}
				})
			})
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('updateLastCheck', result)
			throw error
		}
	}

	/**
	 * Check if a notification has already been sent for specific content
	 * @param {string} platform - Platform name
	 * @param {string} contentId - Content ID to check
	 * @returns {Promise<boolean>} True if already sent, false otherwise
	 */
	async isNotificationSent(platform, contentId) {
		try {
			const sql = 'SELECT id FROM sent_notifications WHERE platform = ? AND content_id = ?'
			
			return new Promise((resolve, reject) => {
				this.db.get(sql, [platform, contentId], (error, row) => {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('isNotificationSent', result)
						reject(error)
					} else {
						const result = { success: true, data: !!row }
						logDatabaseOperation('isNotificationSent', result)
						resolve(!!row)
					}
				})
			})
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('isNotificationSent', result)
			throw error
		}
	}

	/**
	 * Record a sent notification
	 * @param {string} platform - Platform name
	 * @param {string} contentId - Content ID
	 * @param {string} contentUrl - Content URL
	 * @param {string} discordMessageId - Discord message ID
	 * @returns {Promise<Object>} Success/error result
	 */
	async recordSentNotification(platform, contentId, contentUrl, discordMessageId) {
		try {
			const sql = `
				INSERT OR REPLACE INTO sent_notifications 
				(platform, content_id, content_url, discord_message_id, sent_at)
				VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
			`
			
			return new Promise((resolve, reject) => {
				this.db.run(sql, [platform, contentId, contentUrl, discordMessageId], function(error) {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('recordSentNotification', result)
						reject(error)
					} else {
						const result = { success: true, affectedRows: this.changes }
						logDatabaseOperation('recordSentNotification', result)
						resolve(result)
					}
				})
			})
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('recordSentNotification', result)
			throw error
		}
	}

	/**
	 * Get bot statistics
	 * @returns {Promise<Object>} Bot statistics
	 */
	async getBotStats() {
		try {
			const sql = `
				SELECT 
					(SELECT COUNT(*) FROM sent_notifications) as total_notifications,
					(SELECT COUNT(*) FROM sent_notifications WHERE sent_at > datetime('now', '-24 hours')) as notifications_24h,
					(SELECT COUNT(*) FROM sent_notifications WHERE sent_at > datetime('now', '-7 days')) as notifications_7d,
					(SELECT COUNT(DISTINCT platform) FROM last_updates) as active_platforms,
					(SELECT MAX(last_check_time) FROM last_updates) as last_global_check
			`
			
			return new Promise((resolve, reject) => {
				this.db.get(sql, [], (error, row) => {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('getBotStats', result)
						reject(error)
					} else {
						const result = { success: true, data: row }
						logDatabaseOperation('getBotStats', result)
						resolve(row)
					}
				})
			})
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('getBotStats', result)
			throw error
		}
	}

	/**
	 * Clean up old notifications (older than 30 days)
	 * @returns {Promise<Object>} Cleanup result
	 */
	async cleanupOldNotifications() {
		try {
			const sql = "DELETE FROM sent_notifications WHERE sent_at < datetime('now', '-30 days')"
			
			return new Promise((resolve, reject) => {
				this.db.run(sql, [], function(error) {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('cleanupOldNotifications', result)
						reject(error)
					} else {
						const result = { success: true, affectedRows: this.changes }
						logDatabaseOperation('cleanupOldNotifications', result)
						resolve(result)
					}
				})
			})
		} catch (error) {
			const result = { success: false, error: error.message }
			logDatabaseOperation('cleanupOldNotifications', result)
			throw error
		}
	}

	/**
	 * Close the database connection
	 * @returns {Promise<void>}
	 */
	async close() {
		if (this.db) {
			return new Promise((resolve, reject) => {
				this.db.close((error) => {
					if (error) {
						const result = { success: false, error: error.message }
						logDatabaseOperation('close', result)
						reject(error)
					} else {
						const result = { success: true, message: 'Database connection closed' }
						logDatabaseOperation('close', result)
						resolve()
					}
				})
			})
		}
	}
}

// Create and export a singleton instance
const database = new Database()

export { database, Database } 