const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const regex = require("../../data/regex");
const { sanitizeNameForURL } = require("../../methods");
const { default: consolaGlobalInstance } = require("consola");

module.exports = ({ io }) => {
  const {
    verifyUserToken,
    verifyPodcastExists,
    verifyUserIsHostOfPodcast
  } = require("../middleware")({ io });

  return {
    /**
     * Create a new user account and user profile
     * @param {string} username
     * @param {array} hosts
     */
    create: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          name: {
            type: "string",
            required: true,
            maxLength: 64
          },
          hosts: {
            type: "array",
            required: true
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        const { name, hosts } = req.body;

        const hostIds = [];
        const hostProfiles = [];

        // Verify hosts are legit hosts
        for (const host of hosts.filter(hosts => hosts.type === "user")) {
          const [
            selectedHosts
          ] = await mysql.getUserProfiles(
            "SELECT * FROM user_profiles WHERE username = ? LIMIT 1",
            [host.username]
          );
          if (!selectedHosts.length) {
            return {
              error: `One of the hosts, ${host.fullUsername}, was not found in the database`,
              status: 400
            };
          }

          hostProfiles.push(selectedHosts[0]);
          hostIds.push(selectedHosts[0].id);
        }

        // TODO add invited hosts to podcast

        // Check if podcast with name already exists
        const [
          podcasts
        ] = await mysql.exec("SELECT * FROM podcasts WHERE name = ? LIMIT 1", [
          name
        ]);
        if (podcasts.length) {
          return {
            error: `A podcast with the name ${name} already exists`,
            status: 400
          };
        }

        // Create the podcast
        const [result] = await mysql.exec(
          `INSERT INTO podcasts (
          name, urlName, hosts
        ) VALUES (?, ?, ?)`,
          [name, sanitizeNameForURL(name), hostIds.toString()]
        );
        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this podcast",
            status: 500
          };
        }

        // Add podcast to hosts podcasts array
        for (const hostProfile of hostProfiles) {
          console.log(hostProfile);
          hostProfile.podcasts.push(result.insertId);

          const [
            result2
          ] = await mysql.exec(
            `UPDATE user_profiles SET podcasts = ? WHERE id = ?`,
            [hostProfile.podcasts.toString(), hostProfile.id]
          );
          if (!result2) {
            return {
              error: "An error occurred adding this podcast to host user",
              status: 500
            };
          }
        }

        // Create table for episodes
        const [
          result2
        ] = await mysql.exec(`CREATE TABLE IF NOT EXISTS podcast_${result.insertId}_episodes (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          podcastId INTEGER NOT NULL,
          name VARCHAR(64) NOT NULL,
          urlName VARCHAR(64) UNIQUE NOT NULL,
          hosts TEXT,
          guests TEXT,
          description VARCHAR(1024),
          visibility TINYINT,
          startTime INTEGER NOT NULL,
          isLive BOOL NOT NULL
        )`);

        if (!result2) {
          consola.error(
            "There was an error creating the podcast_episodes table"
          );
        }

        // TODO (waiting for recording and clip support) Create table for clips

        // Respond
        return {
          ok: true,
          data: {
            id: result.insertId,
            name,
            hostIds
          }
        };
      }
    }),

    /**
     * Get all podcasts
     */
    getAll: new ExpressRoute({
      type: "GET",

      model: {
        query: {
          startingId: {
            type: "number"
          }
        }
      },

      middleware: [],

      async function(req, res) {
        const startingId = req.query.startingId || 1;

        const [
          podcasts
        ] = await mysql.exec("SELECT * FROM podcasts WHERE id >= ? LIMIT 100", [
          startingId
        ]);

        return { ok: true, data: podcasts };
      }
    }),

    /**
     * Schedule a new podcast episode
     * @param {string} name
     * @param {number} podcastId
     * @param {date} startTime
     * @param {date} endTime
     * @param {array} guests
     * @param {string} description
     * @param {string} visibility
     * @param {number} timeToAlert Time in minutes before start time to send alerts to hosts and co-hosts that scheduled podcast will begin at startTime
     */
    createScheduledEpisode: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          name: {
            type: "string",
            required: true,
            maxLength: 64
          },
          podcastId: {
            type: "number",
            required: true
          },
          startTime: {
            type: "string",
            required: true
          },
          endTime: {
            type: "string",
            required: true
          },
          guests: {
            type: "array",
            required: true
          },
          description: {
            type: "string",
            required: true,
            maxLength: 1024
          },
          visibility: {
            type: "number",
            required: true,
            validator: visibility => ({
              isValid: visibility >= 0 && visibility <= 1,
              error: `${visibility} is not a valid type of visibility`
            })
          },
          timeToAlert: {
            type: "number",
            required: true
          }
        }
      },

      middleware: [
        verifyUserToken,
        verifyPodcastExists,
        verifyUserIsHostOfPodcast
      ],

      async function(req, res) {
        const {
          name,
          podcastId,
          startTime,
          endTime,
          timeToAlert,
          guests,
          description,
          visibility
        } = req.body;

        const guestIds = [];

        // Check if hosts and guests exist in database
        for (const guest of guests.filter(guest => guest.type === "user")) {
          const [
            userProfiles
          ] = await mysql.exec(
            "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
            [guest.id]
          );
          if (!userProfiles.length) {
            return {
              error: `No user found by username ${guest.fullUsername}`,
              status: 400
            };
          }

          guestIds.push(userProfiles[0].id);
        }

        // TODO handle guest email types

        // Verify startTime and endTime are ahead of eachother
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        if (startDate == "Invalid Date" || endDate == "Invalid Date") {
          return {
            error: "Start time or end time were invalid dates",
            status: 400
          };
        }

        if (startDate > endDate) {
          return {
            error: "Start date needs to be before the end date",
            status: 400
          };
        }

        // Get hosts from podcast in db
        const [
          podcasts
        ] = await mysql.exec("SELECT * FROM podcasts WHERE id = ? LIMIT 1", [
          podcastId
        ]);
        if (!podcasts.length) {
          return {
            error: `No podcast found by podcast id ${podcastId}`,
            status: 400
          };
        }

        console.log(name);

        // Add to the db
        const [result] = await mysql.exec(
          `INSERT INTO scheduled_podcast (
            podcastId,
            name,
            urlName,
            screenshotUrl,
            hosts,
            guests,
            description,
            visibility,
            startTime,
            endTime,
            timeToAlert
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            podcastId,
            name,
            sanitizeNameForURL(name),
            "",
            podcasts[0].hosts,
            guests.toString(),
            description,
            visibility,
            startDate.getTime(),
            endDate.getTime(),
            timeToAlert
          ]
        );

        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred while scheduling your podcast",
            status: 500
          };
        }

        // Select the newly created podcast
        const [
          episodes
        ] = await mysql.exec(
          "SELECT * FROM scheduled_podcast WHERE id = ? LIMIT 1",
          [result.insertId]
        );
        if (!episodes.length) {
          return {
            error:
              "Somehow the podcast was created but not found in the database",
            status: 500
          };
        }

        return {
          ok: true,
          data: episodes[0]
        };
      }
    }),

    /**
     * Get all scheduled podcasts by req.user
     */
    getAllScheduledEpisodes: new ExpressRoute({
      type: "GET",

      model: {},

      middleware: [verifyUserToken],

      async function(req, res) {
        const id = req.user.userAccount.profileId;

        const [
          userProfiles
        ] = await mysql.getUserProfiles(
          "SELECT podcasts FROM user_profiles WHERE id = ? LIMIT 1",
          [id]
        );
        if (!userProfiles.length) {
          return { error: `No user profile found by id ${id}`, status: 500 };
        }

        // If user has no podcasts
        const podcastIds = userProfiles[0].podcasts.map(p => p.id);
        if (!podcastIds.length) {
          return { ok: true, data: [] };
        }

        const [episodes] = await mysql.exec(
          "SELECT * FROM scheduled_podcast WHERE podcastId IN (?)",
          podcastIds
        );

        return {
          ok: true,
          data: episodes
        };
      }
    })
  };
};
