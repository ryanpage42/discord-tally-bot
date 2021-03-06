import dotenv from 'dotenv';
dotenv.config(); // this must be run first

import { CronJob } from 'cron';
import axios from 'axios';
import moment from 'moment';
import logger from './util/logger';
import AlertBot from './util/alert-bot';

const healthCheckPattern = process.env.HEALTHCHECK_CRON_PATTERN || '*/30 * * * * *';
const alertBot = new AlertBot(process.env.DISCORD_TOKEN);
const maxBackOffMins = 60;

let backoffMins = 5;
let timeToRunAlert = moment(); // now

const healthCheckJob = async () => {
    try {
        logger.debug('starting health check');
        const res = await axios.get('http://localhost/containers/json', {
            socketPath: '/var/run/docker.sock',
            params: {
                all: 1
            }
        });
        const announceContainer = getAnnouncerContainer(res.data);
        const tallyBotContainers = getTallyBotContainers(res.data);
        const all = [...announceContainer, ...tallyBotContainers];
        for (const container of all) {
            await alertIfInvalid(container);
        }
        logger.debug('health check done');
    } catch (e) {
        logger.error(`An error occured while running health check job.`, e);
    }
};

const getTallyBotContainers = (containers: any[]) => {
    const filtered = containers.filter((c) => {
        const label = c.Labels['com.docker.compose.service']
        return label && label.includes('tally-bot');
    });
    return filtered;
};

const getAnnouncerContainer = (containers: any[]) => {
    const filtered = containers.filter((c) => {
        const label = c.Labels['com.docker.compose.service']
        return label && label.includes('announcer');
    });
    return filtered;
};

const alertIfInvalid = async (tallyBotContainer: any) => {
    const pretext = `ALERT: `;
    let alertMsg = pretext;

    if (tallyBotContainer.State !== 'running') {
        alertMsg += 'Tally Bot container is not running.';
    } else if (!tallyBotContainer.Status.includes('healthy') && tallyBotContainer.Labels['com.docker.compose.service'] !== 'announcer') {
        alertMsg += 'Tally Bot container is not healthy!';
    } else {
        logger.debug(`container is in valid running state.`);
        return;
    }

    if (alertMsg !== pretext)
        logger.error(tallyBotContainer);
        logger.error(alertMsg);

    if (moment().isAfter(timeToRunAlert)) {
        await alertBot.sendAlert(alertMsg);
        backoff();
    } 
};

const backoff = () => {
    timeToRunAlert = timeToRunAlert.add(backoffMins, 'minutes');
    if (backoffMins < maxBackOffMins)
        backoffMins += backoffMins;
}

const run = async () => {
    try {
        await alertBot.login();

        const job = new CronJob(healthCheckPattern, healthCheckJob, null, false, 'America/Los_Angeles');
        setTimeout(() => job.start(), 30000);
        logger.info('Houston, we have lift off. Health check service started.');
    } catch (e) {
        logger.error(`Oh no, something went terribly wrong.`, e);
    }
};

run();
