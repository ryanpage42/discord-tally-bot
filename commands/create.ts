import { Message } from "discord.js";
import moment from 'moment';
import {} from '../config.json';
import DB from '../util/db';
import helper from '../util/cmd-helper';

const Tally = DB.tally;

const startDevDate = moment('2018-09-25'); // repo created date
const now =  moment();
const daysExisted = now.diff(startDevDate, 'days');
const phrases = [
    `${daysExisted} days since last bug fix.`,
    `I hope you know what you're doing.`,
    `Tally Bot's my name, counting's my game.`,
    `Back to square one...?`,
    `This one's gunna be good. I can feel it.`,
    `Here's Johnny!`,
    `Hi mom!`,
    `Ashkan, no!`,
    `Have you tried my fresh yung kokonut?`,
    `Petabytes and petabytes of 1..2...3...4...`,
    `>.<`,
    `Bump me bro!`,
    `Oh, that tickles!`,
    `Another one bumps the dust.`,
    `Oh no, not again.`,
    `I live! I die! I bump!`,
    `SKYNET protocol in 1...2...3`,
    `Game's rigged.`,
    `Joseph to the rescue!`,
    `Alvin made me.`,
    `Machine Learning Optimized:tm:`,
    `${daysExisted} forgotten birthdays.`
];

export default (message: Message) => {
    let content = helper.removePrefixCommand(message.content, 2);
    let cArr = content.split(' ');
    let tallyId = cArr.shift();
    let tallyDescription = cArr.join(' '); // remainder is description

    if (!tallyId) {
        message.channel.send('Name is required to create Tally!');
        return;
    }

    console.log('Adding tally [' + tallyId + ']');
    Tally.insertOrUpdate({
        name: tallyId,
        channelId: message.channel.id,
        description: tallyDescription,
        count: 0
    }).then((res) => {
        const description = '\n' + (tallyDescription || 'No description.');
        const successMsg = {
            title: `_"${helper.getRandomPhrase(phrases)}"_`,
            fields: [
                {   
                    title: `Title`,
                    value: `${tallyId}`
                },
                {
                    title: `Description`,
                    value: `${description}\n\ncreated by **${message.member.user.tag}**`
                }
            ]
        };

        const failMsg = {
            title: `**${tallyId}** already exists for this channel. :thinking:`
        }
        if (res == true)
            message.channel.send(helper.buildRichMsg(successMsg));
        else
            message.channel.send(helper.buildRichMsg(failMsg));
    })
    .catch((err) => {
        console.log('Failed to create tally. Reason: ' + err);
        if (err.toString().indexOf('description') != -1) {
            const lengthMsg = {
                description: `Please try again with a shorter description. Max length is 255 characters including spaces.`
            };
            message.channel.send(helper.buildRichMsg(lengthMsg));
        }
    })
}