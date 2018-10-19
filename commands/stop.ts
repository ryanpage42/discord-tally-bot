// stop a timer
import { Message } from "discord.js";
import moment from 'moment';
import db from '../util/db';
import helper from '../util/cmd-helper';

// create a timer
export default async (message: Message) => {
    let msg = message.content.split(' ');
    msg.shift(); // prefix
    msg.shift(); // command
    const timerName = msg.shift();
    const Timer = db.Timer;

    try {
        let timer: any = await Timer.find({where: {
            name: timerName,
            channelId: message.channel.id
        }});

        const format = "YYYY-MM-DD HH:mm:ss";
        const now = moment();
        const nowStr = now.format(format);
        const start = moment(timer.startTime);
        timer.stopTime = nowStr;
        await timer.save();
        
        const duration = moment.duration(now.diff(start));
        const hours = duration.get('hours');
        const minutes = duration.get('minutes');
        const seconds = duration.get('seconds');
        const msg = {
            description: `
            :clock: Timer **${timerName}** stopped.

            **${hours}h ${minutes}m ${seconds}s**

            Start again with \`!tb start <name>\`

            blame **${message.author.tag}**
            `
        }
        helper.finalize(message);
        message.channel.send(helper.buildRichMsg(msg));
    } catch (e) {
        console.log(e);
    }
}