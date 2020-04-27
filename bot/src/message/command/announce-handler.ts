import { Message } from 'discord.js';
import DB from '../../util/db';
import MsgHelper from '../msg-helper';
import logger from '../../util/logger';
import { getEmoji } from '../../static/MsgEmojis';
import Commands from '../../static/Commands';
import CronParser from 'cron-parser';

/**
 * !tb announce -create [name] [description]
 * !tb announce -delete [name]
 * !tb announce -goal [name] -[date] [date-pattern]
 * !tb announce -goal [name] -[tally] [tally_name] [amount]
 * !tb announce -enable [name]
 * !tb announce -disable [name]
 */
const db = new DB();

enum AnnounceTypes {
    D = '-d',
    DATE = '-date',
    T = '-t',
    TALLY = '-tally',
}

enum SubCommands {
    CREATE = '-create',
    C = '-c',
    DELETE = '-delete',
    D = '-d',
    GOAL = '-goal',
    G = '-g',
    ENABLE = '-enable',
    DISABLE = '-disable'
}

export default class AnnounceHandler {
    static async runAnnounce(message: Message) {
        try {
            const subcommand = AnnounceHandler.getSubcommand(message);
            switch (subcommand) {
                case SubCommands.C:
                case SubCommands.CREATE:
                    return await AnnounceHandler.runCreateAnnouncement(message);
                case SubCommands.D:
                case SubCommands.DELETE:
                    return await AnnounceHandler.runDeleteAnnouncement(message);
                case SubCommands.G:
                case SubCommands.GOAL:
                    return await AnnounceHandler.runSetAnnouncementGoal(message);
                case SubCommands.ENABLE:
                    return await AnnounceHandler.runEnableAnnouncement(message);
                case SubCommands.DISABLE:
                    return await AnnounceHandler.runDisableAnnouncement(message);
                default:
                    AnnounceHandler.raiseInvalidSubcommand();
            }
        } catch (e) {
            MsgHelper.handleError(`An error occured while running an announcement command.`, e, message);
        }
    }

    static getSubcommand(message: Message) {
        const split = message.content.split(' ');
        const subcommand = split[2];
        if (!subcommand || !Object.values(SubCommands).includes(subcommand as any)) AnnounceHandler.raiseInvalidSubcommand();
        return subcommand;
    }

    static raiseInvalidSubcommand() {
        throw new Error(`A valid subcommand is required. Valid subcommands are ${Object.values(SubCommands).join(', ')}`);
    }

    static raiseInvalidType() {
        throw new Error(`A valid type is required. Valid types are ${Object.values(AnnounceTypes).join(', ')}`);
    }

    static async runCreateAnnouncement(message: Message) {
        try {
            const { name, description, command } = AnnounceHandler.unmarshallCreateMessage(message);
            await db.upsertAnnouncement(message.channel.id, name, description);
            const announcement = await db.getAnnouncement(message.channel.id, name);
            if (!announcement) throw new Error('Announcement was not created successfully. Please try again.');
            const richEmbed = MsgHelper.getRichEmbed(message.author.username)
                .setTitle(`:trumpet: ${command}`)
                .setDescription(
                    `Announcement has been created.\n\n**name:** ${name}\n**description:** ${
                        description || 'no description'
                    }\n\nDon't forget to set goal with \`!tb announce -goal\`. Syntax [here](https://github.com/ryanpag3/discord-tally-bot#set-announcement-tally-goal)`
                );
            logger.info(`Announcement created [${name}] for user [${message.author.id}]`);
            MsgHelper.sendMessage(message, richEmbed);
        } catch (e) {
            MsgHelper.handleError(`An error occured while creating announcement.`, e, message);
        }
    }

    private static unmarshallCreateMessage(
        message: Message
    ): {
        name: string;
        description: string;
        command: string;
    } {
        const split = message.content.split(' ');
        const command = [split[0], split[1], split[2]].join(' ');
        const name = split[3];
        if (!name)
            throw new Error(
                `Please provide a valid unique name for this announcement. See [here](https://github.com/ryanpag3/discord-tally-bot#create-an-announcement) for syntax.`
            );
        const description = split.slice(4, split.length).join(' ');
        return {
            name,
            description,
            command,
        };
    }

    static async runDeleteAnnouncement(message: Message) {
        try {
            const { name, command } = AnnounceHandler.unmarshallDeleteMessage(message);
            const resultCode = await db.deleteAnnounce(message.channel.id, name);
            if (resultCode === 0)
                throw new Error(`No announcement found with name [${name}] to delete.`)
            const richEmbed = MsgHelper.getRichEmbed(message.author.username)
                .setTitle(`:x: ${command}`)
                .setDescription(
                    `Announcement with name **${name}** has been deleted.`
                );
            logger.info(`Deleted announcement with name [${name}] and author id [${message.author.id}]`);
            MsgHelper.sendMessage(message, richEmbed);
        } catch (e) {
            MsgHelper.handleError(`An error occured while deleting announcement.`, e, message);
        }
    }

    static unmarshallDeleteMessage(message: Message): {
        name: string,
        command: string
    } {
        const split = message.content.split(' ');
        const command = [split[0], split[1], split[2]].join(' ');
        if (!split[3])
            throw new Error(`Name is required for announcement deletion.`);
        return {
            name: split[3],
            command
        }
    }

    static async runSetAnnouncementGoal(message: Message) {
        try {
            const { type } = AnnounceHandler.unmarshallAnnouncementGoalMessage(message);
            switch (type) {
                case AnnounceTypes.T:
                case AnnounceTypes.TALLY:
                    return await AnnounceHandler.setAnnouncementTallyGoal(message);
                case AnnounceTypes.D:
                case AnnounceTypes.DATE:
                    return await AnnounceHandler.setAnnouncementDateGoal(message);
                default:
                    AnnounceHandler.raiseInvalidType();
            }
        } catch (e) {
            MsgHelper.handleError(`An error occured while setting announcement goal.`, e, message);
        }
    }

    /**
     * !tb announce -goal [name] -[date] [date-pattern]
     * !tb announce -goal [name] -[tally] [tally_name] [amount]
     * @param message 
     */
    static unmarshallAnnouncementGoalMessage(message: Message): {
        type: string
    } {
        const split = message.content.split(' ');
        const type = split[4];
        if (!type) AnnounceHandler.raiseInvalidType();
        return {
            type
        };
    }

    static async setAnnouncementTallyGoal(message: Message) {
        const { name, tallyName, count, command } = AnnounceHandler.unmarshallTallyGoalMessage(message);
        await db.setAnnounceTallyGoal(message.channel.id, name, tallyName, count);
        const richEmbed = MsgHelper.getRichEmbed(message.author.username)
            .setTitle(`:trumpet: ${command}`)
            .setDescription(`Announcement **${name}** has been set to alert when tally **${tallyName}** reaches ${count}.`);
        logger.info(`announcement [${name}] has been set to trigger when [${tallyName}] reaches [${count}] by user [${message.author.id}] for channel [${message.channel.id}]`);
        MsgHelper.sendMessage(message, richEmbed);
    }

    static unmarshallTallyGoalMessage(message: Message): {
        command: string,
        name: string,
        tallyName: string,
        count: number
    } {
        const split = message.content.split(' ');
        const command = [split[0], split[1], split[2]].join(' ');
        const name = split[3], tallyName = split[5], count = Number.parseInt(split[6]);
        if (!name) throw new Error(`A valid announcement name is required. For more info click [here](https://github.com/ryanpag3/discord-tally-bot#set-announcement-tally-goal)`);
        if (!tallyName) throw new Error(`A valid tally name is required. For more info click [here](https://github.com/ryanpag3/discord-tally-bot#set-announcement-tally-goal)`);
        if (!count || Number.isNaN(count)) throw new Error('A valid count is required. For more info click [here](https://github.com/ryanpag3/discord-tally-bot#set-announcement-tally-goal)');
        return {
            command,
            name,
            tallyName,
            count
        }
    }

    static async setAnnouncementDateGoal(message: Message) {

    }

    static unmarshallDataGoalMessage(message: Message): {
        command: string,
        datePattern: string
    } {
        const { isValidDate, isValidCron } = AnnounceHandler;
        const split = message.content.split(' ');
        const command = [split[0], split[1], split[2]].join(' ');
        const datePattern = split.slice(4, split.length).join(' ');
        if (!isValidDate(datePattern) && !isValidCron(datePattern)) {
            throw new Error(`Invalid date pattern provided.\n` +
            `If your event fires once, please use a valid date. If it repeats, please make sure it is a valid CRON pattern.\n` +
            `You can refer here for help: https://crontab.guru/`);
        }
        return {
            command,
            datePattern
        }
    }

    static isValidDate(d: string) {
        const parsed = Date.parse(d);
        return isNaN(parsed) === false;
    }

    static isValidCron(cron: string)

    static async runEnableAnnouncement(message: Message) {

    }

    static async runDisableAnnouncement(message: Message) {

    }
}
