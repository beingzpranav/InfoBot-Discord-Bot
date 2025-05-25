import { Client, GatewayIntentBits } from 'discord.js'
import { config } from '../config/config.js'
import { database } from '../database/database.js'
import { logger } from './logger.js'

console.log('📊 InfoBot Status Check')
console.log('=======================')

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
})

client.once('ready', async () => {
	try {
		console.log(`✅ Bot Online: ${client.user.tag}`)
		console.log(`🏠 Connected Servers: ${client.guilds.cache.size}`)
		
		if (client.guilds.cache.size === 0) {
			console.log('❌ Bot not in any servers!')
			process.exit(1)
		}
		
		const guild = client.guilds.cache.get(config.discord.guildId)
		if (!guild) {
			console.log('❌ Bot not in configured server!')
			console.log(`Looking for server ID: ${config.discord.guildId}`)
			console.log('Available servers:')
			client.guilds.cache.forEach(g => {
				console.log(`   - ${g.name} (${g.id})`)
			})
			process.exit(1)
		}
		
		console.log(`🏠 Server: ${guild.name}`)
		console.log(`🆔 Server ID: ${guild.id}`)
		console.log(`👥 Members: ${guild.memberCount}`)
		
		const channel = guild.channels.cache.get(config.discord.announcementChannelId)
		if (!channel) {
			console.log('❌ Announcement channel not found!')
			console.log(`Looking for channel ID: ${config.discord.announcementChannelId}`)
			process.exit(1)
		}
		
		console.log(`📢 Channel: #${channel.name}`)
		console.log(`🆔 Channel ID: ${channel.id}`)
		
		// Check permissions
		const perms = channel.permissionsFor(client.user)
		const canSend = perms.has('SendMessages')
		const canEmbed = perms.has('EmbedLinks')
		const canMention = perms.has('MentionEveryone')
		
		console.log('\n🔑 Bot Permissions:')
		console.log(`   Send Messages: ${canSend ? '✅' : '❌'}`)
		console.log(`   Embed Links: ${canEmbed ? '✅' : '❌'}`)
		console.log(`   Mention Everyone: ${canMention ? '✅' : '❌'}`)
		
		// Check database
		console.log('\n💾 Database Status:')
		try {
			await database.initialize()
			const stats = await database.getBotStats()
			console.log(`   Active Platforms: ${stats.active_platforms || 0}`)
			console.log(`   Total Notifications: ${stats.total_notifications || 0}`)
			console.log(`   Last Check: ${stats.last_global_check || 'Never'}`)
			await database.close()
			console.log('   Database: ✅ Connected')
		} catch (dbError) {
			console.log('   Database: ❌ Error')
			console.log(`   Error: ${dbError.message}`)
		}
		
		// Check configuration
		console.log('\n⚙️ Configuration:')
		console.log(`   YouTube API Key: ${config.youtube.apiKey ? '✅ Set' : '❌ Missing'}`)
		console.log(`   YouTube Channel ID: ${config.youtube.channelId ? '✅ Set' : '❌ Missing'}`)
		console.log(`   Instagram Username: ${config.instagram.username ? '✅ Set' : '❌ Missing'}`)
		console.log(`   Check Interval: ${config.bot.checkIntervalMinutes} minutes`)
		console.log(`   Mention Everyone: ${config.bot.mentionEveryone ? 'Yes' : 'No'}`)
		console.log(`   Log Level: ${config.bot.logLevel}`)
		
		// Overall status
		console.log('\n🎯 Overall Status:')
		const configGood = guild.id === config.discord.guildId && !!channel
		const permsGood = canSend && canEmbed
		const apisGood = config.youtube.apiKey && config.youtube.channelId && config.instagram.username
		
		if (configGood && permsGood && apisGood) {
			console.log('🎉 FULLY OPERATIONAL!')
			console.log('✅ Ready to monitor social media and send notifications')
		} else {
			console.log('🟡 NEEDS ATTENTION')
			if (!configGood) console.log('❌ Discord configuration issues')
			if (!permsGood) console.log('❌ Missing Discord permissions')
			if (!apisGood) console.log('❌ Missing API configuration')
		}
		
		console.log('\n📋 Next Steps:')
		if (!permsGood) {
			console.log('   1. Fix Discord permissions in #' + channel.name)
		}
		if (!apisGood) {
			console.log('   2. Complete API configuration in .env file')
		}
		if (configGood && permsGood && apisGood) {
			console.log('   ✅ Bot is ready! Use /check-now to test manually')
		}
		
	} catch (error) {
		console.error('❌ Status check failed:', error.message)
		logger.error('Status check failed', { error: error.message })
		process.exit(1)
	} finally {
		client.destroy()
	}
})

client.login(config.discord.token) 