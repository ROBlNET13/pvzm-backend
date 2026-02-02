import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, GatewayIntentBits, TextChannel } from "discord.js";
import { Buffer } from "node:buffer";

import type { LevelInfo, AdminLevelInfo, LoggingProvider, ReportInfo, AuditLogEntry } from "./types.ts";

export type DiscordProviderConfig = {
	enabled?: boolean;
	botToken: string;
	channelId: string;
	adminChannelId?: string;
	reportChannelId?: string;
	auditChannelId?: string;
};

export class DiscordLoggingProvider implements LoggingProvider {
	readonly name = "discord";

	private client: Client | null = null;
	private channel: TextChannel | null = null;
	private adminChannel: TextChannel | null = null;
	private reportChannel: TextChannel | null = null;
	private auditChannel: TextChannel | null = null;
	private config: DiscordProviderConfig;

	constructor(config: DiscordProviderConfig) {
		this.config = config;
	}

	async init(): Promise<boolean> {
		if (this.config.enabled === false) {
			console.log("Discord logging provider: disabled in config, skipping");
			return false;
		}

		if (!this.config.botToken) {
			console.log("Discord logging provider: missing bot token, skipping");
			return false;
		}

		if (!this.config.channelId && !this.config.reportChannelId) {
			console.log("Discord logging provider: no channels configured, skipping");
			return false;
		}

		try {
			this.client = new Client({
				intents: [GatewayIntentBits.Guilds],
			});

			await this.client.login(this.config.botToken);
			console.log("Discord logging provider: bot logged in");

			if (this.config.channelId) {
				const channel = await this.client.channels.fetch(this.config.channelId);
				if (channel?.isTextBased()) {
					this.channel = channel as TextChannel;
					console.log(`Discord logging provider: upload channel cached (#${this.channel.name})`);
				} else {
					console.error("Discord logging provider: upload channel not found or not a text channel");
				}
			}

			if (this.config.adminChannelId) {
				const adminChannel = await this.client.channels.fetch(this.config.adminChannelId);
				if (adminChannel?.isTextBased()) {
					this.adminChannel = adminChannel as TextChannel;
					console.log(`Discord logging provider: admin upload channel cached (#${this.adminChannel.name})`);
				} else {
					console.error("Discord logging provider: admin upload channel not found or not a text channel");
				}
			}

			if (this.config.reportChannelId) {
				const reportChannel = await this.client.channels.fetch(this.config.reportChannelId);
				if (reportChannel?.isTextBased()) {
					this.reportChannel = reportChannel as TextChannel;
					console.log(`Discord logging provider: report channel cached (#${this.reportChannel.name})`);
				} else {
					console.error("Discord logging provider: report channel not found or not a text channel");
				}
			}

			if (this.config.auditChannelId) {
				const auditChannel = await this.client.channels.fetch(this.config.auditChannelId);
				if (auditChannel?.isTextBased()) {
					this.auditChannel = auditChannel as TextChannel;
					console.log(`Discord logging provider: audit channel cached (#${this.auditChannel.name})`);
				} else {
					console.error("Discord logging provider: audit channel not found or not a text channel");
				}
			}

			return this.channel !== null || this.adminChannel !== null || this.reportChannel !== null || this.auditChannel !== null;
		} catch (error) {
			console.error("Discord logging provider: init failed:", error);
			return false;
		}
	}

	private buildEmbed(level: LevelInfo): EmbedBuilder {
		return new EmbedBuilder().setTitle(level.name).setDescription(`By **${level.author}**`).setAuthor({ name: "New level uploaded" });
	}

	private buildPublicUploadButtons(level: LevelInfo): ActionRowBuilder<ButtonBuilder> {
		const playButton = new ButtonBuilder().setLabel("Play").setStyle(ButtonStyle.Link).setURL(`${level.gameUrl}/?izl_id=${level.id}`);

		const downloadButton = new ButtonBuilder()
			.setLabel("Download")
			.setStyle(ButtonStyle.Link)
			.setURL(`${level.backendUrl}/api/levels/${level.id}/download`);

		return new ActionRowBuilder<ButtonBuilder>().addComponents(playButton, downloadButton);
	}

	private buildAdminUploadButtons(level: AdminLevelInfo): ActionRowBuilder<ButtonBuilder> {
		const playButton = new ButtonBuilder().setLabel("Play").setStyle(ButtonStyle.Link).setURL(`${level.gameUrl}/?izl_id=${level.id}`);

		const downloadButton = new ButtonBuilder()
			.setLabel("Download")
			.setStyle(ButtonStyle.Link)
			.setURL(`${level.backendUrl}/api/levels/${level.id}/download`);

		const editButton = new ButtonBuilder().setLabel("Edit Metadata").setStyle(ButtonStyle.Link).setURL(level.editUrl);

		const deleteButton = new ButtonBuilder().setLabel("Delete Level").setStyle(ButtonStyle.Link).setURL(level.deleteUrl);

		return new ActionRowBuilder<ButtonBuilder>().addComponents(playButton, downloadButton, editButton, deleteButton);
	}

	async sendLevelMessage(level: LevelInfo): Promise<string | null> {
		if (!this.channel) return null;

		try {
			const message = await this.channel.send({
				content: "",
				embeds: [this.buildEmbed(level)],
				components: [this.buildPublicUploadButtons(level)],
			});
			return message.id;
		} catch (error) {
			console.error("Discord logging provider: send failed:", error);
			return null;
		}
	}

	async sendAdminLevelMessage(level: AdminLevelInfo): Promise<string | null> {
		if (!this.adminChannel) return null;

		try {
			const message = await this.adminChannel.send({
				content: "",
				embeds: [this.buildEmbed(level)],
				components: [this.buildAdminUploadButtons(level)],
			});

			// send a link to the admin message in the audit channel
			if (this.auditChannel) {
				await this.auditChannel.send(`https://discord.com/channels/${this.adminChannel.guildId}/${this.adminChannel.id}/${message.id}`);
			}

			return message.id;
		} catch (error) {
			console.error("Discord logging provider: send failed:", error);
			return null;
		}
	}

	async editLevelMessage(messageId: string, level: LevelInfo): Promise<boolean> {
		if (!this.channel || !messageId) return false;

		try {
			const message = await this.channel.messages.fetch(messageId);
			await message.edit({
				content: "",
				embeds: [this.buildEmbed(level)],
				components: [this.buildPublicUploadButtons(level)],
			});
			return true;
		} catch (error) {
			console.error("Discord logging provider: edit failed:", error);
			return false;
		}
	}

	async editAdminLevelMessage(messageId: string, level: AdminLevelInfo): Promise<boolean> {
		if (!this.adminChannel || !messageId) return false;

		try {
			const message = await this.adminChannel.messages.fetch(messageId);
			await message.edit({
				content: "",
				embeds: [this.buildEmbed(level)],
				components: [this.buildAdminUploadButtons(level)],
			});
			return true;
		} catch (error) {
			console.error("Discord logging provider: edit failed:", error);
			return false;
		}
	}

	async deleteLevelMessage(messageId: string): Promise<boolean> {
		if (!this.channel || !messageId) return false;

		try {
			const message = await this.channel.messages.fetch(messageId);
			await message.delete();
			return true;
		} catch (error) {
			console.error("Discord logging provider: delete failed:", error);
			return false;
		}
	}

	async deleteAdminLevelMessage(messageId: string): Promise<boolean> {
		if (!this.adminChannel || !messageId) return false;

		try {
			const message = await this.adminChannel.messages.fetch(messageId);
			const existingEmbed = message.embeds[0];

			const deletedEmbed = new EmbedBuilder()
				.setTitle(`~~${existingEmbed?.title ?? "Unknown"}~~`)
				.setDescription(`~~${existingEmbed?.description ?? ""}~~`)
				.setAuthor({ name: "Level deleted" })
				.setColor(0xff0000);

			await message.edit({
				content: "",
				embeds: [deletedEmbed],
				components: [],
			});
			return true;
		} catch (error) {
			console.error("Discord logging provider: delete failed:", error);
			return false;
		}
	}

	async sendReportMessage(report: ReportInfo): Promise<boolean> {
		if (!this.reportChannel) return false;

		try {
			const mentionString = report.mentionUserIds.length > 0 ? report.mentionUserIds.map((id) => `<@${id}>`).join(" ") + " " : "";

			const content =
				`${mentionString}**New level report received:**\n` +
				`Level ID: ${report.levelId}\n` +
				`Level Name: ${report.levelName}\n` +
				`Author: ${report.author}\n` +
				`Reason: ${report.reason}\n` +
				`Reported from IP: ${report.reporterIp}\n` +
				`**[Edit level metadata](<${report.editUrl}>)** | ` +
				`**[Delete level](<${report.deleteUrl}>)** | ` +
				`**[View level](<${report.viewUrl}>)**` +
				(report.fileAttachment ? "" : "\n\n(Attachment missing: level file not found)");

			const files = report.fileAttachment
				? [new AttachmentBuilder(Buffer.from(report.fileAttachment.content), { name: report.fileAttachment.fileName })]
				: [];

			await this.reportChannel.send({ content, files });
			return true;
		} catch (error) {
			console.error("Discord logging provider: report send failed:", error);
			return false;
		}
	}

	async sendAuditLog(entry: AuditLogEntry): Promise<boolean> {
		if (!this.auditChannel) return false;

		try {
			const actionLabels: Record<AuditLogEntry["action"], string> = {
				edit: "✏️ Level Edited",
				delete: "🗑️ Level Deleted",
				feature: "⭐ Level Featured",
				unfeature: "❌ Level Unfeatured",
			};

			const embed = new EmbedBuilder()
				.setTitle(actionLabels[entry.action])
				.setDescription(
					`**Level:** ${entry.levelName} (ID: ${entry.levelId})\n` +
						`**Author:** ${entry.author}` +
						(entry.changes ? `\n\n**Changes:**\n${entry.changes}` : "")
				)
				.setTimestamp()
				.setColor(entry.action === "delete" ? 0xff0000 : entry.action === "feature" ? 0xffd700 : 0x3498db);

			await this.auditChannel.send({ embeds: [embed] });
			return true;
		} catch (error) {
			console.error("Discord logging provider: audit log failed:", error);
			return false;
		}
	}
}
