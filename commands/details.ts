// query for tally, print details
import {
    Message
} from "discord.js";
import { table } from 'table';
import { prefix } from '../config.json';
import DB from '../util/db';
import helper from '../util/cmd-helper';

const Tally = DB.tally;

export default (message: Message) => {
    let msg = message.content.split(' ');
    msg.shift(); // rm prefix
    msg.shift(); // rm 'details'
    const name = msg.shift();

    console.log(`Giving ${name} details for channel ${message.channel.id}`);

    Tally.findOne({
        where: {
            channelId: message.channel.id,
            name: name
        }
    })
        .then((record: any) => {
            const msg = {
                title: `**${record.name}**`,
                description: ``,
                color: '#42f4e2',
                fields: [
                    {
                        title: `Description`,
                        value: record.description == '' ? 'No description.' : record.description
                    },
                    {
                        title: `Count`,
                        value: `${record.count}`
                    }
                ]
            }
            message.channel.send(helper.buildRichMsg(msg));
        });
}