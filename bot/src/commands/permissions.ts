import { Message } from "discord.js";
import helper from '../message/msg-helper';
import Permissions from '../util/permissions';
import logger from "../util/logger";

export default async (message: Message) => {
    logger.info(`Displaying permissions for ${message.guild.id}`);
    try {
        const permissions: any = await Permissions.getServerPermissions(message.guild.id);
        let richEmbed = { description: `Current Server Permissions\n` };
        for (let permission of permissions) {
            richEmbed.description += `${permission.roleName} | **!tb ${permission.command}**\n`
        }
        if (permissions.length == 0) richEmbed = { description: `**No Server Permissions Set.**\nSet with \`!tb -role [Your Role]\` to set all initial permissions.` };
        message.channel.send(helper.buildRichMsg(richEmbed));
    } catch (e) {
        const richEmbed = {
            description: `There was an error displaying permissions. Reason: ${e.toString()}`
        };
        message.channel.send(helper.buildRichMsg(richEmbed));
    }
}