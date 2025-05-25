import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js'
import { config } from '../config/config.js'
import { logger } from './logger.js'

console.log('🧪 InfoBot Test Suite')
console.log('=====================')

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
})

client.once('ready', async () => {
	try {
		logger.info('Starting bot test suite')
		
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
		console.log(`👥 Members: ${guild.memberCount}`)
		
		const channel = guild.channels.cache.get(config.discord.announcementChannelId)
		if (!channel) {
			console.log('❌ Announcement channel not found!')
			console.log(`Looking for channel ID: ${config.discord.announcementChannelId}`)
			console.log('Available text channels:')
			guild.channels.cache
				.filter(ch => ch.type === 0)
				.forEach(ch => console.log(`   - #${ch.name} (${ch.id})`))
			process.exit(1)
		}
		
		console.log(`📢 Channel: #${channel.name}`)
		
		// Check permissions
		const perms = channel.permissionsFor(client.user)
		const canSend = perms.has('SendMessages')
		const canEmbed = perms.has('EmbedLinks')
		const canMention = perms.has('MentionEveryone')
		
		console.log('\n🔑 Bot Permissions:')
		console.log(`   Send Messages: ${canSend ? '✅' : '❌'}`)
		console.log(`   Embed Links: ${canEmbed ? '✅' : '❌'}`)
		console.log(`   Mention Everyone: ${canMention ? '✅' : '❌'}`)
		
		if (!canSend) {
			console.log('\n❌ Missing critical permissions!')
			process.exit(1)
		}
		
		// Send test message
		console.log('\n📤 Sending test notification...')
		
		const embed = new EmbedBuilder()
			.setAuthor({
				name: 'InfoBot Test',
				iconURL: client.user.displayAvatarURL()
			})
			.setTitle('🧪 Test Notification')
			.setDescription('This is a test message to verify InfoBot is working correctly!')
			.setColor('#00FF00')
			.setFooter({
				text: 'InfoBot • Test Mode',
				iconURL: client.user.displayAvatarURL()
			})
			.setTimestamp()
		
		await channel.send({
			content: '🧪 **InfoBot Test**',
			embeds: [embed]
		})
		
		console.log('✅ Test notification sent successfully!')
		console.log('\n🎉 All tests passed!')
		console.log('✅ Bot is configured correctly')
		console.log('✅ Permissions are working')
		console.log('✅ Can send notifications')
		
		logger.info('Bot test suite completed successfully')
		
	} catch (error) {
		console.error('❌ Test failed:', error.message)
		logger.error('Bot test failed', { error: error.message })
		
		if (error.code === 50013) {
			console.log('\n💡 This is a permissions error.')
			console.log('Please ensure the bot has these permissions in the channel:')
			console.log('   - Send Messages')
			console.log('   - Embed Links')
			console.log('   - Mention Everyone (optional)')
		}
		
		process.exit(1)
	} finally {
		client.destroy()
	}
})

client.login(config.discord.token) 