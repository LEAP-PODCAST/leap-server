require("dotenv").config();
const fs = require("fs");
const express = require("./express.js");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const Worker = require("./mediasoup/worker");
const http = require("http");
global.fetch = require("node-fetch");
const consola = require("consola");
const { runAtEveryMSInterval } = require("./methods");

global.SES = new (require("./classes/SESClient"))();

// Create http server if not https
let server;
let io;

// All workers representing CPU vCores
global.workers = [];

// All routers representing rooms
global.routers = new Map();

// All live episodes
global.liveEpisodes = new Map();

// All rooms
global.rooms = new Map();

// All transports representing streamer sending data
global.sendTransports = new Map();

// All transports representing viewer receiving data
global.recvTransports = new Map();

// All producers
global.producers = new Map();

// All consumers
global.consumers = new Map();

// Define MySQL tables
(async () => {
  global.mysql = await require("mysql2/promise").createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT)
  });

  global.mysql.exec = async (query, params) => {
    try {
      const res = await global.mysql.execute(query, params);
      return res;
    } catch (err) {
      // TODO error logging service
      consola.error(err);
      return [[], []];
    }
  };

  global.mysql.getUserProfiles = async (query, params) => {
    const res = await global.mysql.exec(query, params);
    for (let i = 0; i < res[0].length; i++) {
      const p = res[0][i];
      p.socials = !p.socials ? {} : JSON.parse(p.socials);

      if (p.podcasts.length) {
        const [podcasts] = await mysql.getPodcasts(
          `SELECT * FROM podcasts WHERE id IN (${p.podcasts})`
        );
        p.podcasts = podcasts;
      } else p.podcasts = [];
    }
    return res;
  };

  global.mysql.getPodcasts = async (query, params) => {
    const res = await global.mysql.exec(query, params);
    for (let i = 0; i < res[0].length; i++) {
      const p = res[0][i];

      if (p.hosts.length) {
        const [hosts] = await mysql.exec(
          `SELECT * FROM user_profiles WHERE id IN (${p.hosts})`
        );
        p.hosts = hosts;
      } else p.hosts = [];
    }
    return res;
  };

  global.mysql.getScheduledPodcast = async (query, params) => {
    const res = await global.mysql.exec(query, params);
    for (let i = 0; i < res[0].length; i++) {
      const p = res[0][i];

      if (p.hosts.length) {
        const [hosts] = await mysql.exec(
          `SELECT * FROM user_profiles WHERE id IN (${p.hosts})`
        );
        p.hosts = hosts;
      } else p.hosts = [];

      if (p.guests.length) {
        const [guests] = await mysql.exec(
          `SELECT * FROM user_profiles WHERE id IN (${p.guests})`
        );
        p.guests = guests;
      } else p.guests = [];
    }
    return res;
  };

  global.mysql.getEpisodes = async (query, params) => {
    const res = await global.mysql.exec(query, params);
    for (let i = 0; i < res[0].length; i++) {
      const p = res[0][i];

      if (p.hosts.length) {
        const [hosts] = await mysql.exec(
          `SELECT * FROM user_profiles WHERE id IN (${p.hosts})`
        );
        p.hosts = hosts;
      } else p.hosts = [];

      if (p.guests.length) {
        const [guests] = await mysql.exec(
          `SELECT * FROM user_profiles WHERE id IN (${p.guests})`
        );
        p.guests = guests;
      } else p.guests = [];
    }
    return res;
  };

  await require("./create_sql_tables.js")();

  const runScheduledCheckOnScheduledEpisodes = async () => {
    const [episodes] = await mysql.exec("SELECT * FROM scheduled_podcast");

    if (episodes.length) {
      for (const episode of episodes) {
        const timeToAlert = episode.timeToAlert * 1000 * 60;

        // If episode startTime - timeToAlert has passed, alert users that episode begins soon
        if (episode.startTime - timeToAlert <= Date.now()) {
          // Get all hosts and guests
          const users = [...episode.hosts.split(",").map(u => parseInt(u))];

          if (episode.guests.length) {
            users.push(...episode.guests.split(",").map(u => parseInt(u)));
          }

          const emails = [];
          for (const user of users) {
            const [e] = await mysql.exec(
              "SELECT email FROM user_accounts WHERE profileId = ?",
              [user]
            );
            emails.push(e[0].email);
          }

          // Get the corresponding podcast
          const [podcasts] = await mysql.exec(
            "SELECT * FROM podcasts WHERE id = ? LIMIT 1",
            [episode.podcastId]
          );
          if (!podcasts.length) {
            console.error(
              `Could not find a podcast corresponding to podcastId ${episode.podcastId}`
            );
            continue;
          }

          const podcast = podcasts[0];

          // Email each of them that episode will start soon
          for (const email of emails) {
            await SES.sendEmail({
              to: email,
              subject: `Leap - ${episode.name} is starting in ${episode.timeToAlert} minutes`,
              message: `
                <body>
                  <h1>Leap - ${episode.name} is starting in ${episode.timeToAlert} minutes</h1>
                </body>
              `,
              from: "support@joinleap.co"
            });
          }
        }

        // If episode is still scheduled but over 24 hours late, remove it from the DB
        const _24hours = 1000 * 60 * 60 * 24;
        if (episode.startTime <= Date.now() + _24hours) {
          const [result] = await mysql.exec(
            "DELETE FROM scheduled_podcast WHERE id = ?",
            [episode.id]
          );

          if (!result) {
            consola.error(
              `Failed to delete scheduled episode id: ${episode.id}`
            );
          }
        }
      }
    }
  };
  // Check scheduled episodes every 1 minute
  runAtEveryMSInterval(runScheduledCheckOnScheduledEpisodes, 1000 * 60);
})();

main();

async function main() {
  global.SERVER_IP = process.env.SERVER_IP;

  await Worker.createWorkers();

  // Create http or https server depending on NODE_ENV
  // if (process.env.NODE_ENV === "development") {
  server = http.createServer(app);

  server.listen(process.env.PORT, () => {
    consola.success(
      `Leap server listening on ${global.SERVER_IP}:${process.env.PORT}`
    );
  });
  // }

  // else if (process.env.NODE_ENV === "production") {
  //   server = require("greenlock-express")
  //     .init({
  //       packageRoot: __dirname,
  //       configDir: "./greenlock.d",
  //       cluster: false,
  //       maintainerEmail: "trystonmperry@gmail.com"
  //     })
  //     .serve(app);

  //   consola.success(`Leap server listening on ${global.SERVER_IP}`);
  // } else {
  //   consola.error(
  //     `${process.env.NODE_ENV} is not a valid NODE_ENV env variable`
  //   );
  // }

  // Attack Socket.IO to express server
  io = require("socket.io")(server);
  createSocketApp();

  createExpressApp();
}

function createExpressApp() {
  console.log("****CREATING EXPRESS APP****");

  app.use(cors());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json({ extended: true }));
  app.use(express.static("views"));
  app.use((req, res, next) => {
    // If API method
    if (/^\/api/.test(req.path)) {
      next();
      return;
    }

    // Check if static file matches path url
    const path = `${__dirname}/public/${req.path}`;

    // If static file exists, send it
    if (fs.existsSync(path)) {
      res.sendFile(path);
    }

    // If static file doesn't exist, assume it's a SPA url
    else {
      res.sendFile(`${__dirname}/public/index.html`);
    }
  });

  // Generate routes from /routes/index.js and /rotues/modules
  require("./routes/index.js")({ app, io });

  console.log("****CREATED EXPRESS APP****");
}

function createSocketApp() {
  console.log("****CREATING SOCKET APP****");

  const socketEvents = require("./sockets/sockets.js");
  socketEvents({ io });

  console.log("****CREATED SOCKET APP****");
}
