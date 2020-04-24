import { Message } from 'discord.js';
import CmdHelper from '../cmd-helper';
import DB from '../../util/db';
import Counter from '../../util/counter';
import logger from '../../util/logger';
import TallyDmHandler from '../dm/tally-dm-handler';

export default class TallyHandler {
    static db = new DB();

    /**
     * Execute a bump command
     */
    static async runBump(message: Message, isDm: boolean = false) {
        return await TallyHandler.bumpOrDump(true, message, isDm);
    }

    /**
     * Execute a dump command
     */
    static async runDump(message: Message, isDm: boolean = false) {
        return await TallyHandler.bumpOrDump(false, message, isDm);
    }

    /**
     * Execute either a bump or dump depending on isBump
     * TODO: this is some old code that could use some TLC
     */
    static async bumpOrDump(isBump: boolean, message: Message, isDm: boolean = false) {
        let richEmbed;
        try {
            const { tallyName, command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
            const couldNotFindErrorMsg = `Could not find tally named **${tallyName}**`;
            richEmbed = CmdHelper.getRichEmbed(message.author.username).setTitle(`${isBump ? ':small_red_triangle:' : ':small_red_triangle_down:'} ${command}`);
            if (isDm) {
                const { amount }: any = TallyDmHandler.unMarshall(message);
                const tally = await TallyHandler.db.getDmTally(message.author.id, tallyName);
                if (!tally) throw new Error(couldNotFindErrorMsg);
                const previous = tally.count;
                await TallyHandler.db.updateDmTally(message.author.id, tallyName, {
                    count: isBump ? previous + amount : previous - amount
                });
                await tally.reload();
                logger.info(`
                ${TallyHandler.getBumpOrDump(isBump, 'ed')} ${tallyName}
                ------------------
                ${previous} >>> ${tally.count}
                user: ${message.author.tag}
                id: ${message.author.id}
                `);
                richEmbed.setDescription(`${tally.name} | **${previous}** >>> **${tally.count}** \n\n${TallyHandler.getTallyDescription(tally)}`);
            } else {
                const { isGlobal, tallyName, amount, channelId, serverId } = TallyHandler.unMarshall(message);
                const tally = await TallyHandler.db.getCmdTally(message.channel.id, message.guild.id, isGlobal, tallyName);
                if (!tally) throw new Error(couldNotFindErrorMsg);
                const previous = tally.count;
                await TallyHandler.updateCmdTallyByAmount(isBump, channelId, serverId, isGlobal, tallyName, previous, amount);
                await tally.reload();
                logger.info(`
                ${TallyHandler.getBumpOrDump(isBump, 'ed')} ${tallyName}
                ------------------
                ${previous} >>> ${tally.count}
                channel ID: ${channelId}
                server ID: ${serverId}    
                user: ${message.author.tag}
                `);
                richEmbed.setDescription(`${isGlobal ? '[G]' : '[C]'} ${tally.name} | **${previous}** >>> **${tally.count}** \n\n${TallyHandler.getTallyDescription(tally)}`);
            }

            if (isBump) await Counter.bumpTotalBumps();
            else await Counter.bumpTotalDumps();
        } catch (e) {
            logger.error(`Error while running bumpOrDump: ` + e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`I could not ${TallyHandler.getBumpOrDump(isBump)}.`)
                .setDescription(`${e.message}`);
        }
        const sentMsg: any = await message.channel.send(richEmbed);
        try {
            await sentMsg.react('🔼');
            await sentMsg.react('🔽')
        } catch (e) {
            logger.error(`error occured while attempting to react...`, e);
        }
        CmdHelper.finalize(message);
    }

    static async updateCmdTallyByAmount(isBump: boolean, channelId: string, serverId: string, isGlobal: boolean, tallyName: string, previousAmount: number, amount: number) {
        await TallyHandler.db.updateCmdTally(channelId, serverId, isGlobal, tallyName, {
            count: isBump ? previousAmount + amount : previousAmount - amount
        });
    }

    static getBumpOrDump(isBump: boolean, append?: string) {
        let action = isBump ? 'bump' : 'dump';
        if (append) action += append;
        return action;
    }

    static getIsGlobalIcon(isGlobal: boolean) {
        return `[${isGlobal ? 'G' : 'C'}]`;
    }

    static getIsGlobalKeyword(isGlobal: boolean) {
        return `${isGlobal ? 'Global' : 'Channel'}`;
    }

    /**
     * demarshall bump/dump command into object
     */
    static unMarshall(message: Message, amountRequired: boolean = false, tallyNameRequired: boolean = true) {
        const split = message.content.split(' ');
        const isGlobal = CmdHelper.isGlobalTallyMessage(message);
        const command = `${split[0]} ${split[1]}`;
        if (isGlobal) split.splice(2, 1);
        const tallyName = split[2];
        if (!tallyName && tallyNameRequired) throw new Error('Tally name is required.');
        const amount = split[3] ? Number.parseInt(split[3]) : 1;
        if (amountRequired === true && !split[3]) throw new Error(`Amount is required.`);
        return {
            isGlobal,
            command,
            tallyName,
            amount,
            channelId: message.channel.id,
            serverId: message.guild.id,
            description: split[3] ? split.slice(3, split.length).join(' ') : 'No description.'
        };
    }

    static getTallyDescription(tally: any) {
        return tally.description ? CmdHelper.truncate(Buffer.from(tally.description, 'base64'), 128) : 'No description.';
    }

    static async runSet(message: Message, isDm: boolean = false) {
        const { tallyName, command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
        let richEmbed = CmdHelper.getRichEmbed(message.author.username).setTitle(`:small_blue_diamond: ${command}`);
        const couldNotFindMsg = `Could not find tally with name **${tallyName}**.`;
        try {
            if (isDm) {
                const { amount } = TallyDmHandler.unMarshall(message, true);
                const tally = await TallyHandler.db.getDmTally(message.author.id, tallyName);
                if (!tally) throw new Error(couldNotFindMsg);
                const description = tally.description;
                tally.count = amount;
                await TallyHandler.db.saveTally(tally);
                logger.info(`
                ${tallyName} has been set.
                ------------
                previous: ${tally.count}
                new: ${amount}
                `);
                richEmbed.setDescription(`**${tallyName}** has been set to ${amount}.\n\n${description}`);
            } else {
                const { isGlobal, tallyName, amount, channelId, serverId } = TallyHandler.unMarshall(message, true);
                const tally = await TallyHandler.db.getCmdTally(channelId, serverId, isGlobal, tallyName);
                if (!tally) throw new Error(couldNotFindMsg);
                const description = tally.description;
                tally.count = amount;
                await TallyHandler.db.saveTally(tally);
                logger.info(`
                ${tallyName} has been set.
                ------------
                previous: ${tally.count}
                new: ${amount}
                `);
                richEmbed.setDescription(`${isGlobal ? '[G]' : '[C]'} **${tallyName}** has been set to ${amount}.\n\n${description}`);
            }
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:small_blue_diamond: ${command}`)
                .setDescription(`I could not set **${tallyName}**. Reason: ${e}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async runEmpty(message: Message, isDm: boolean = false) {
        const { tallyName, command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
        let richEmbed = CmdHelper.getRichEmbed(message.author.username)
            .setTitle(`:recycle: ${command}`);
        try {
            if (isDm) {
                const tally = await TallyHandler.db.getDmTally(message.author.id, tallyName);
                if (!tally) throw new Error(`Could not find tally with name **${tallyName}**.`);
                const description = tally.description;
                tally.count = 0;
                await TallyHandler.db.saveTally(tally);
                logger.info(`
                DM Tally ${tallyName} has been emptied.
                ------------
                previous: ${tally.count}
                new: 0
                userId: ${message.author.id}
                `);
                richEmbed.setDescription(`**${tallyName}** has been set to 0.\n\n${description}`);
            } else {
                const { isGlobal, tallyName, channelId, serverId } = TallyHandler.unMarshall(message);
                const tally = await TallyHandler.db.getCmdTally(channelId, serverId, isGlobal, tallyName);
                if (!tally) throw new Error(`Could not find tally with name **${tallyName}**.`);
                const description = tally.description;
                tally.count = 0;
                await TallyHandler.db.saveTally(tally);
                logger.info(`
                CMD Tally ${tallyName} has been emptied.
                ------------
                previous: ${tally.count}
                new: 0
                `);
                richEmbed.setDescription(`${isGlobal ? '[G]' : '[C]'} **${tallyName}** has been set to 0.\n\n${description}`);
            }
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:recycle: ${command}`)
                .setDescription(`I could not empty **${tallyName}**. Reason: ${e}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async runEmptyAll(message: Message, isDm: boolean = false) {
        const { command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
        let richEmbed = CmdHelper.getRichEmbed(message.author.username)
            .setTitle(`:boom: ${command}`);
        try {
            if (isDm) {
                await TallyHandler.db.updateDmTallies(message.author.id, { count: 0 });
                richEmbed.setDescription(`All tallies set to 0.`);
            } else {
                const { channelId, serverId, isGlobal } = TallyHandler.unMarshall(message, false, false);
                await TallyHandler.db.updateCmdTallies(serverId, channelId, isGlobal, { count: 0 });
                richEmbed.setDescription(`All ${TallyHandler.getIsGlobalIcon(isGlobal)} tallies set to 0.`);
            }
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:boom: ${command}`)
                .setDescription(`I could not empty all tallies. Reason: ${e}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async runCreate(message: Message, isDm: boolean = false) {
        let richEmbed;
        try {
            let tally;
            if (isDm) {
                tally = await TallyHandler.createDmTally(message);
            } else {
                tally = await TallyHandler.createCommandTally(message);
            }
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:bar_chart: ${tally.command}`)
                .setDescription(
                    `**name:** ${isDm ? '' : TallyHandler.getIsGlobalIcon(tally.isGlobal)} ${tally.name}\n\n**description:** ${
                        tally.description
                    }\n\nfor commands: [click here](https://github.com/ryanpag3/discord-tally-bot/blob/master/README.md)`
                );
        } catch (e) {
            if (
                e
                    .toString()
                    .toLowerCase()
                    .includes('validation error')
            )
                e = `Tally already exists.`;
            logger.error(e);
            const fields = TallyHandler.getFieldsByTallyType(message, isDm, ['command', 'tallyName']);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:bar_chart: ${fields.command}`)
                .setDescription(`I could not create **${fields.tallyName}**. Reason: ${e}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async createCommandTally(message: Message) {
        const { isGlobal, command, tallyName, channelId, serverId, description } = TallyHandler.unMarshall(message);
        let tally = await TallyHandler.db.createCmdTally(channelId, serverId, isGlobal, tallyName, description);
        tally.command = command;
        return tally;
    }

    static async createDmTally(message: Message) {
        const { command, tallyName, description } = TallyDmHandler.unMarshall(message);
        let tally = await TallyDmHandler.db.createDmTally(message.author.id, tallyName, description);
        tally.command = command;
        return tally;
    }

    static getFieldsByTallyType(message: Message, isDm: boolean, fields: string[]) {
        let o: any = {};
        if (isDm) {
            for (let field of fields) {
                o[field] = TallyDmHandler.unMarshall(message, false, false)[field];
            }
        } else {
            for (let field of fields) {
                o[field] = TallyHandler.unMarshall(message, false, false)[field];
            }
        }
        return o;
    }

    static async runDelete(message: Message, isDm: boolean = false) {
        const emoji = `:wastebasket:`;
        let richEmbed;
        const { tallyName, command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
        try {
            if (isDm) {
                await TallyHandler.db.deleteDmTally(message.author.id, tallyName);
                richEmbed = CmdHelper.getRichEmbed(message.author.username)
                    .setTitle(`${emoji} ${command}`)
                    .setDescription(getDestroyedMsg(`**${tallyName}**`));
            } else {
                const { isGlobal, command, channelId, serverId } = TallyHandler.unMarshall(message);
                await TallyHandler.db.deleteCmdTally(channelId, serverId, isGlobal, tallyName);
                richEmbed = CmdHelper.getRichEmbed(message.author.username)
                    .setTitle(`${emoji} ${command}`)
                    .setDescription(getDestroyedMsg(`${TallyHandler.getIsGlobalIcon(isGlobal)} **${tallyName}**`));
            }
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`${emoji} ${command}`)
                .setDescription(`I could not delete **${tallyName}**.`)
                .addField('Reason', e.message);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);

        function getDestroyedMsg(name: string) {
            return `Tally ${name} has been destroyed.`;
        }
    }

    static async runDescribe(message: Message, isDm: boolean = false) {
        let emoji = ':pencil2:';

        const { tallyName, command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
        let richEmbed = CmdHelper.getRichEmbed(message.author.username).setTitle(`${emoji} ${command}`);
        try {
            if (isDm) {
                const { description } = TallyDmHandler.unMarshall(message);
                await TallyHandler.db.setDmTallyDescription(message.author.id, tallyName, description);
                richEmbed.setDescription(`${getDescMsg(description)}`);
            } else {
                const { isGlobal, tallyName, channelId, serverId, description } = TallyHandler.unMarshall(message);
                await TallyHandler.db.setCmdTallyDescription(channelId, serverId, isGlobal, tallyName, description);
                richEmbed.setDescription(`${TallyHandler.getIsGlobalIcon(isGlobal)} ${getDescMsg(description)}`);
            }
        } catch (e) {
            logger.info(e);
            richEmbed.setDescription(`I could not describe **${tallyName}**. Reason: ${e.message}`);
        }
        message.channel.send(richEmbed);
        CmdHelper.finalize(message);

        function getDescMsg(description) {
            return `Tally **${tallyName}**'s description is now **_${description}_**`;
        }
    }

    static async runChannel(message: Message) {
        const { command, tallyName, channelId, serverId } = TallyHandler.unMarshall(message);
        let richEmbed;
        try {
            logger.debug(`setting cmd tally to be channel-scoped`);
            await TallyHandler.db.updateCmdTally(channelId, serverId, true, tallyName, {
                isGlobal: false,
                channelId: message.channel.id
            });
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:regional_indicator_c: ${command}`)
                .setDescription(`**${tallyName}** has been assigned to ${message.channel.toString()}`);
        } catch (e) {
            if (
                e
                    .toString()
                    .toLowerCase()
                    .includes('validation error')
            ) {
                e = new Error(`There is already a tally with name ${tallyName} set to be channel scoped.`);
            }
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:regional_indicator_c: ${command}`)
                .setDescription(`I could not assign **${tallyName}** to channel.\n\nReason: ${e.message}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async runGlobal(message: Message) {
        const { command, tallyName, channelId, serverId } = TallyHandler.unMarshall(message);
        let richEmbed;
        try {
            await TallyHandler.db.updateCmdTally(channelId, serverId, false, tallyName, {
                isGlobal: true
            });
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:regional_indicator_g: ${command}`)
                .setDescription(`**${tallyName}** has been changed to global tally.`);
        } catch (e) {
            if (
                e
                    .toString()
                    .toLowerCase()
                    .includes('validation error')
            ) {
                e = new Error(`There is already a tally with name ${tallyName} set to be global scoped.`);
            }
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:regional_indicator_g: ${command}`)
                .setDescription(`I could not assign **${tallyName}** to server.\n\nReason: ${e.message}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async runShow(message: Message, isDm: boolean = false) {
        const { command } = TallyHandler.getFieldsByTallyType(message, isDm, ['command']);
        let richEmbed;
        let tallies;
        try {
            const limit = 25;
            let offset = 0;
            let count = 0;
            if (isDm) {
                count = await TallyHandler.db.getDmTalliesCount(message.author.id);
                if (count < 0) count = 0;
                offset = TallyHandler.getDmShowOffset(message);
                if (offset < 0) offset = 0;
                tallies = await TallyHandler.db.getDmTallies(message.author.id, limit, offset * limit);
                richEmbed = CmdHelper.getRichEmbed(message.author.username).setTitle(`:abacus: ${command} • ${count} total`);
            } else {
                const { channelId, serverId, isGlobal } = TallyHandler.unMarshall(message, false, false);
                offset = TallyHandler.getShowOffset(message, isGlobal);
                if (offset < 0) offset = 0;
                count = await TallyHandler.db.getCmdTalliesCount(channelId, serverId, isGlobal);
                tallies = await TallyHandler.db.getCmdTallies(channelId, serverId, isGlobal, limit, offset * limit);
                richEmbed = CmdHelper.getRichEmbed(message.author.username).setTitle(`:abacus: ${command} • ${TallyHandler.getIsGlobalIcon(isGlobal)} ${count} total`);
            }
            tallies = TallyHandler.sortByCount(tallies);
            const page = offset + 1;
            let total = Math.ceil(count / limit);
            if (total === 0) total = 1;
            if (page > total) throw new Error(`Page number [${page}] is higher than total pages [${total}]`);
            let description = `${TallyHandler.buildTallyShowResults(tallies)}\n\n:notebook_with_decorative_cover: ${page} of ${total}`;
            if (page !== total) description += ` - \`${isDm ? '' : '!tb '}show ${page + 1}\` for next.`;
            description += `\n\`${isDm ? '' : '!tb '}get [tally name]\` for more info.`;
            richEmbed.setDescription(description);
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:abacus: ${command}`)
                .setDescription(`I could not show tallies.\n\nReason: ${e.message}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    private static getShowOffset(message: Message, isGlobal?: boolean) {
        const split: any[] = message.content.split(' ');
        let i = isGlobal ? 3 : 2;
        return split[i] ? split[i] - 1 : 0;
    }

    private static getDmShowOffset(message: Message) {
        const split: any[] = message.content.split(' ');
        return split[1] ? split[1] - 1 : 0;
    }

    private static sortByCount(tallies: any[]) {
        return tallies.sort((a, b) => {
            if (a.count > b.count) return -1;
            if (a.count < b.count) return 1;
            return 0;
        });
    }

    private static buildTallyShowResults(tallies: any[]) {
        let str = ``;
        tallies.map(t => {
            str += `**${t.name}** | ${t.count} | _${t.description ? CmdHelper.truncate(t.description, 24) : 'no description'}_\n`;
        });
        return str;
    }

    static async runGenerate(message: Message, isDm: boolean = false) {
        const randomstring = require('randomstring');
        const split = message.content.split(' ');
        const count: any = isDm ? split[1] : split[2];
        let j = 0;
        const promises = [];
        for (let i = 0; i < count; i++, j++) {
            promises.push(generateTally());
        }

        return Promise.all(promises);

        async function generateTally() {
            const name = randomstring.generate(16);
            const description = randomstring.generate(255);
            let tally;
            if (isDm) {
                tally = await TallyHandler.db.createDmTally(message.author.id, name, description);
            } else tally = await TallyHandler.db.createCmdTally(message.channel.id, message.guild.id, false, name, description);
            tally.description = Buffer.from(tally.description).toString('base64');
            tally.count = randomstring.generate({
                length: 5,
                charset: 'numeric'
            });
            await tally.save();
        }
    }

    static async runDetails(message: Message, isDm: boolean = false) {
        let richEmbed;
        const { tallyName, command } = TallyHandler.getFieldsByTallyType(message, isDm, ['tallyName', 'command']);
        try {
            let tally;
            richEmbed = CmdHelper.getRichEmbed(message.author.username).setTitle(`:printer: ${command}`);
            if (isDm) {
                tally = await TallyHandler.db.getDmTally(message.author.id, tallyName);
                if (!tally) throw new Error(`Tally ${tallyName}** does not exist.`);
            } else {
                const { isGlobal, tallyName, channelId, serverId } = TallyHandler.unMarshall(message);
                tally = await TallyHandler.db.getCmdTally(channelId, serverId, isGlobal, tallyName);
                if (!tally) throw new Error(`Tally **${TallyHandler.getIsGlobalIcon(isGlobal)} ${tallyName}** does not exist.`);
                richEmbed.addField(`Type`, `${TallyHandler.getIsGlobalKeyword(isGlobal)}`);
            }
            richEmbed
                .addField(`Name`, `${tallyName}`)
                .addField(`Count`, `${tally.count}`)
                .addField(`Description`, `${tally.description}`)
                .addField(`Created On`, `${tally.createdOn ? new Date(tally.createdOn).toLocaleDateString() : 'Not found.'}`);
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:printer: ${command}`)
                .setDescription(`I could not get tally info.\n\nReason: ${e.message}`);
        }
        message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }

    static async deleteAll(message: Message, isDm: boolean = false) {
        const { command } = TallyHandler.getFieldsByTallyType(message, isDm, ['command']);
        let richEmbed = CmdHelper.getRichEmbed(message.author.username)
            .setTitle(`:recycle: ${command}`);
        try {
            if (isDm) {
                let where = {
                    userId: message.author.id
                };
                const deletedCnt = await TallyHandler.db.deleteTallies(where);
                richEmbed.setDescription(`${deletedCnt} tallies deleted.`);
            } else {
                const { channelId, serverId, isGlobal } = TallyHandler.unMarshall(message, false, false);
                let where = {
                    serverId,
                    channelId,
                    isGlobal
                };
                if (!isGlobal) {
                    delete where.serverId;
                } else {
                    delete where.channelId;
                }
                const deletedCnt = await TallyHandler.db.deleteTallies(where);
                richEmbed.setDescription(`${deletedCnt} ${TallyHandler.getIsGlobalKeyword(isGlobal)} tallies deleted.`);
            }
        } catch (e) {
            logger.info(e);
            richEmbed = CmdHelper.getRichEmbed(message.author.username)
                .setTitle(`:recycle: ${command}`)
                .setDescription(`I could not delete tallies.\n\nReason: ${e.message}`);
        }
        if (richEmbed) message.channel.send(richEmbed);
        CmdHelper.finalize(message);
    }
}