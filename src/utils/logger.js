import winston from 'winston'
import path from 'path'
import fs from 'fs'
import { config, getLogsPath } from '../config/config.js'

// Ensure logs directory exists
const logsDir = getLogsPath()
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true })
}

/**
 * Custom log format for better readability
 */
const logFormat = winston.format.combine(
	winston.format.timestamp({
		format: 'YYYY-MM-DD HH:mm:ss'
	}),
	winston.format.errors({ stack: true }),
	winston.format.printf(({ timestamp, level, message, stack, service, ...meta }) => {
		const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
		const stackStr = stack ? `\n${stack}` : ''
		const serviceStr = service ? `[${service}] ` : ''
		
		return `${timestamp} [${level.toUpperCase()}] ${serviceStr}${message}${stackStr}${metaStr ? `\n${metaStr}` : ''}`
	})
)

/**
 * Main logger instance
 */
const logger = winston.createLogger({
	level: config.bot.logLevel,
	format: logFormat,
	defaultMeta: { service: 'discord-bot' },
	transports: [
		// Console transport for development
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				logFormat
			)
		}),
		
		// File transport for all logs
		new winston.transports.File({
			filename: path.join(logsDir, 'bot.log'),
			maxsize: 5242880, // 5MB
			maxFiles: 5
		}),
		
		// Separate file for errors
		new winston.transports.File({
			filename: path.join(logsDir, 'error.log'),
			level: 'error',
			maxsize: 5242880, // 5MB
			maxFiles: 5
		})
	],
	
	// Handle uncaught exceptions
	exceptionHandlers: [
		new winston.transports.File({
			filename: path.join(logsDir, 'exceptions.log')
		})
	],
	
	// Handle unhandled promise rejections
	rejectionHandlers: [
		new winston.transports.File({
			filename: path.join(logsDir, 'rejections.log')
		})
	]
})

/**
 * Creates a child logger with a specific service name
 * @param {string} serviceName - Name of the service for logging context
 * @returns {winston.Logger} Child logger instance
 */
function createServiceLogger(serviceName) {
	return logger.child({ service: serviceName })
}

/**
 * Logs social media check results
 * @param {string} platform - Social media platform name
 * @param {Object} result - Check result object
 */
function logSocialMediaCheck(platform, result) {
	const serviceLogger = createServiceLogger(platform)
	
	if (result.success) {
		if (result.newContent && result.newContent.length > 0) {
			serviceLogger.info(`Found ${result.newContent.length} new post(s)`, {
				newContentCount: result.newContent.length,
				contentIds: result.newContent.map(content => content.id)
			})
		} else {
			serviceLogger.info('No new content found')
		}
	} else {
		serviceLogger.error(`Check failed: ${result.error}`, {
			error: result.error,
			details: result.details
		})
	}
}

/**
 * Logs Discord message sending results
 * @param {Object} result - Message sending result
 */
function logDiscordMessage(result) {
	const discordLogger = createServiceLogger('discord')
	
	if (result.success) {
		discordLogger.info(`Message sent successfully`, {
			messageId: result.messageId,
			channelId: result.channelId,
			platform: result.platform
		})
	} else {
		discordLogger.error(`Failed to send message: ${result.error}`, {
			error: result.error,
			platform: result.platform,
			channelId: result.channelId
		})
	}
}

/**
 * Logs database operations
 * @param {string} operation - Database operation name
 * @param {Object} result - Operation result
 */
function logDatabaseOperation(operation, result) {
	const dbLogger = createServiceLogger('database')
	
	if (result.success) {
		dbLogger.debug(`Database operation successful: ${operation}`, {
			operation,
			affectedRows: result.affectedRows,
			data: result.data
		})
	} else {
		dbLogger.error(`Database operation failed: ${operation}`, {
			operation,
			error: result.error
		})
	}
}

/**
 * Logs bot startup information
 */
function logBotStartup() {
	logger.info('🤖 Discord Bot Starting Up', {
		nodeVersion: process.version,
		platform: process.platform,
		environment: config.isProduction ? 'production' : 'development',
		checkInterval: config.bot.checkIntervalMinutes,
		logLevel: config.bot.logLevel
	})
}

/**
 * Logs configuration validation results
 * @param {Object} validation - Validation result from config
 */
function logConfigValidation(validation) {
	if (validation.isValid) {
		logger.info('✅ Configuration validation passed')
	} else {
		logger.error('❌ Configuration validation failed', {
			missingFields: validation.missing
		})
	}
}

export {
	logger,
	createServiceLogger,
	logSocialMediaCheck,
	logDiscordMessage,
	logDatabaseOperation,
	logBotStartup,
	logConfigValidation
} 