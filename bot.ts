import Discord, { Message } from 'discord.js';
import { EventEmitter } from 'events';
import { prefix } from './config.json';
import { token } from './config-private.json';
import db from './util/db';

const bot = new Discord.Client();
const emitter = new EventEmitter();

// init db
db.init();

// TODO: fix implementation
function getCommand(message: Message) {
    const mArr = message.content.split(' ');
    return mArr[0] + ' ' + mArr[1];
}

bot.on('ready', () => {
    console.log('Bot has been started successfully!');
});

bot.on('message', (message: Message) => {
    const isBot = message.author.bot;
    if (isBot) return;

    const startsWithPrefix = message.content.indexOf(prefix)
    if (startsWithPrefix) return;

    const command = getCommand(message);
    emitter.emit(command, message);
});

/**
 * COMMAND FUNCTIONS
 */
import test from './commands/test';
import show from './commands/show';
import create from './commands/create';
import del from './commands/delete';
import bump from './commands/bump';
import dump from './commands/dump';
import empty from './commands/empty';

/**
 * COMMANDS
 */
// test command functionality
emitter.on(prefix + 'test', test);
emitter.on(prefix + 't', test);

// show existing tallies
emitter.on(prefix + 'show', show);

// create new tally
emitter.on(prefix + 'create', create);
emitter.on(prefix + 'add', create);

// delete a tally
emitter.on(prefix + 'delete', del);
emitter.on(prefix + 'rm', del);

// bump a tally's count up
emitter.on(prefix + 'bump', bump);

// dump a tally's count down
emitter.on(prefix + 'dump', dump)

// set a tally to 0
emitter.on(prefix + 'empty', empty);

/**
 * INIT
 */
bot.login(token);
