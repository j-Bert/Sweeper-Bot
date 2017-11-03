import { Collection, GuildMember, Guild, Invite, Message, RichEmbed, Role, User, TextChannel } from 'discord.js';
import { GuildStorage, Logger, logger } from 'yamdbf';
import { SweeperClient } from '../SweeperClient';
import Constants from '../../Constants';
import * as moment from 'moment';
import { MuteManager } from '../mod/managers/MuteManager';

export class Helpers
{
	@logger private readonly logger: Logger;
	private _client: SweeperClient;
	public constructor(client: SweeperClient)
	{
		this._client = client;
	}

	// Antispam - Discord Invite Links
	public async antispamDiscordInvites(message: Message, msgChannel: TextChannel): Promise<void>
	{
		const antispamType: string = 'Discord Invites Blacklisted';
		const regexMatch: string = Constants.discordInviteRegExp.exec(message.content)[0];
		const regexInviteCode: string = Constants.discordInviteCodeRegExp.exec(regexMatch)[1];
		let discordInvites: Collection<string, Invite> = await message.guild.fetchInvites().then(invites => invites);

		if (message.member.hasPermission('MANAGE_MESSAGES') || message.member.roles.exists('id', Constants.antispamBypassId)) return;
		if (regexInviteCode && discordInvites) {
			let inviteCodes = discordInvites.map(invite => invite.code);
			if (inviteCodes.includes(regexInviteCode))
				return;
		}

		message.delete();
		this.logMessage(message, regexMatch, antispamType);

		await message.member.user.send(`You have been warned on **${message.guild.name}**.\n\n**A message from the mods:**\n\n"Discord invite links are not permitted."`)
			.then((res) => {
				// Inform in chat that the warn was success, wait a few sec then delete that success msg
				this._client.database.commands.warn.addWarn(message.guild.id, this._client.user.id, message.member.user.id, `Warned: ${antispamType}`);
				this.logger.log('Helpers Warn', `Warned user (${antispamType}): '${message.member.user.tag}' in '${message.guild.name}'`);
			})
			.catch((err) => {
				const modChannel: TextChannel = <TextChannel> message.guild.channels.get(Constants.modChannelId);
				modChannel.send(`There was an error informing ${message.member.user.tag} (${message.member.user.id}) of their warning (automatically). This user posted a **Discord Invite Link**. Their DMs may be disabled.\n\n**Error:**\n${err}`);
				this.logger.log('Helpers Warn', `Unable to warn user: '${message.member.user.tag}' in '${message.guild.name}'`);
				throw new Error(err);
			});
	}

	// Antispam - Mass Mentions
	public async antispamMassMentions(message: Message, msgChannel: TextChannel): Promise<void>
	{
		if (message.member.hasPermission('MANAGE_MESSAGES') || message.member.roles.exists('id', Constants.antispamBypassId)) return;
		message.delete();
		const antispamType: string = 'Mass Mention Spam';

		const regexMatch: string = '6+ mentions';
		this.logMessage(message, regexMatch, antispamType);

		await message.member.user.send(`You have been warned on **${message.guild.name}**.\n\n**A message from the mods:**\n\n"Do not spam mentions. This includes mentioning a lot of users at once."`)
			.then((res) => {
				this._client.database.commands.warn.addWarn(message.guild.id, this._client.user.id, message.member.user.id, `Warned: ${antispamType}`);
				this.logger.log('Helpers Warn', `Warned user (${antispamType}): '${message.member.user.tag}' in '${message.guild.name}'`);
			})
			.catch((err) => {
				const modChannel: TextChannel = <TextChannel> message.guild.channels.get(Constants.modChannelId);
				modChannel.send(`There was an error informing ${message.member.user.tag} (${message.member.user.id}) of their warning (automatically). This user **spammed mentions**. Their DMs may be disabled.\n\n**Error:**\n${err}`);
				this.logger.log('Helpers Warn', `Unable to warn user: '${message.member.user.tag}' in '${message.guild.name}'`);
				throw new Error(err);
			});
	}
	// Antispam - repeating messages
	public async antispamRepeatingMessages(message: Message) {
		if (message.member.hasPermission('MANAGE_MESSAGES') || message.member.roles.exists('id', Constants.antispamBypassId) || message.author.bot) return;

		if (!message.member.spamContent) { // Initializes the spamcontent for bot restarts/new user.
			message.member.spamContent = message.cleanContent.toLowerCase();
			message.member.spamCounter = 0;
			message.member.spamTimer   = message.createdTimestamp;
		}
		if (message.cleanContent.toLowerCase() === message.member.spamContent || message.cleanContent.length < 2 || message.createdTimestamp - message.member.spamTimer < 1000) {
			message.member.spamCounter += 1;
		} else {
			message.member.spamContent = message.cleanContent.toLowerCase();
			message.member.spamCounter = 1;
		}
		message.member.spamTimer = message.createdTimestamp;
		if (message.member.spamCounter === 3) {
			message.delete();
			message.channel.send(`<@${message.member.id}>, You are sending too many messages too quickly. Please slow down or you will be muted.`).then(msg => {
				if (msg instanceof Message) {
					msg.delete(2000);
				}
			});
		}
		if (message.member.spamCounter > 3) {
			message.delete();
			if (await new MuteManager(this._client).isMuted(message.member)) return;
			this._client.commands.find('name', 'mute').action(message, [message.member.id, '20m', 'Repeating/quick message spam.']);
			message.member.spamCounter = 0;
			const modChannel: TextChannel = <TextChannel> message.guild.channels.get(Constants.modChannelId);
			const embed: RichEmbed = new RichEmbed()
				.setColor(Constants.muteEmbedColor)
				.setAuthor(this._client.user.tag, this._client.user.avatarURL)
				.setDescription(`**Member:** ${message.author.tag} (${message.author.id})\n`
					+ `**Action:** Mute\n`
					+ `**Length:** 20m\n`
					+ `**Reason:** Spamming.`)
				.setTimestamp();
			modChannel.send({ embed: embed });
		}
	}

	// Antispam - Twitch Links
	public async antispamTwitchLinks(message: Message, msgChannel: TextChannel): Promise<void>
	{
		if (message.member.hasPermission('MANAGE_MESSAGES') || message.member.roles.exists('id', Constants.antispamBypassId)) return;
		if (message.content.includes('twitch.tv/bungie') || message.content.includes('twitch.tv\\bungie') || message.content.includes('clips.twitch.tv')) return;
		message.delete();
		const antispamType: string = 'Twitch Links Blacklisted';

		const regexMatch: string = Constants.twitchRegExp.exec(message.content)[0];
		this.logMessage(message, regexMatch, antispamType);

		await message.member.user.send(`You have been warned on **${message.guild.name}**.\n\n**A message from the mods:**\n\n"Do not post twitch links without mod approval."`)
			.then((res) => {
				this._client.database.commands.warn.addWarn(message.guild.id, this._client.user.id, message.member.user.id, `Warned: ${antispamType}`);
				this.logger.log('Helpers Warn', `Warned user (${antispamType}): '${message.member.user.tag}' in '${message.guild.name}'`);
			})
			.catch((err) => {
				const modChannel: TextChannel = <TextChannel> message.guild.channels.get(Constants.modChannelId);
				modChannel.send(`There was an error informing ${message.member.user.tag} (${message.member.user.id}) of their warning (automatically). This user **posted a twitch link**. Their DMs may be disabled.\n\n**Error:**\n${err}`);
				this.logger.log('Helpers Warn', `Unable to warn user: '${message.member.user.tag}' in '${message.guild.name}'`);
				throw new Error(err);
			});
	}

	// Logs message in channel
	public async logMessage(message: Message, regexMatch: string, reason: string): Promise<void>
	{
		const logChannel: TextChannel = <TextChannel> message.guild.channels.get(Constants.logChannelId);
		const embed: RichEmbed = new RichEmbed()
			.setColor(Constants.warnEmbedColor)
			.setAuthor(`${message.member.user.tag} (${message.member.id})`, message.member.user.avatarURL)
			.setDescription(`**Action:** Message Deleted\n`
				+ `**Reason:** ${reason}\n`
				+ `**Match:** ${regexMatch}\n`
				+ `**Channel:** #${message.channel instanceof TextChannel ? message.channel.name : ''} (${message.channel.id})\n`
				+ `**Message:** (${message.id})\n\n`
				+ `${message.cleanContent}`)
			.setTimestamp();
		logChannel.send({ embed: embed });
		return;
	}

}
