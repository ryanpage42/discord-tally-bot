import {
    Message
} from "discord.js";
import helper from '../util/cmd-helper';
import DB from '../util/db';

const Tally = DB.Tally;

export default async (message: Message) => {
    const msg = message.content.split(' ');
    msg.shift(); // prefix
    msg.shift(); // command

    const tallyName = msg.shift();

    try {
        const exists = await channelTallyExists(tallyName, message.channel.id);
        if (exists) throw new Error(`A channel-specific tally with the name **${tallyName}** already exists. Consider using a different channel.`);

        const tally = await Tally.update({
            channelId: message.channel.id
        }, {
            where: {
                name: tallyName,
                serverId: message.guild.id
            }
        });
        console.log(tally);
    } catch (e) {
        const error = `There was an error while attempting to set tally to be channel specific. ${e}`;
        const rich = {
            description: error + `\n\nBlame ${message.author.toString()}`
        };
        message.channel.send(helper.buildRichMsg(rich));
    }
}

async function channelTallyExists(tallyName, channelId) {
    const tally = await Tally.findOne({
        where: {
            name: tallyName,
            channelId: channelId
        }
    });
    return tally != null; 
}