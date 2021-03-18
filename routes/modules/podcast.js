const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const regex = require("../../data/regex");

module.exports = ({ io }) => {
  const {
    verifyUserToken,
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
        console.log(name, hosts);

        // Verify hosts are legit hosts
        for (const host of hosts) {
          if (typeof host !== "number") {
            return {
              error: `One of the hosts, ${host}, was not type number`,
              error: 400
            };
          }

          const [
            selectedHosts
          ] = await mysql.exec(
            "SELECT id FROM user_profiles WHERE id = ? LIMIT 1",
            [host]
          );
          if (!selectedHosts.length) {
            return {
              error: `One of the hosts, ${host}, was not found in the database`,
              status: 400
            };
          }
        }

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
          name, hosts
        ) VALUES (?, ?)`,
          [name, hosts.toString()]
        );
        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this podcast",
            status: 500
          };
        }

        // TODO (waiting for recording support) Create table for episodes
        // await mysql.exec(`CREATE TABLE IF NOT EXISTS podcast_${result.insertId}_episodes (
        //   id INTEGER PRIMARY KEY AUTO_INCREMENT,

        // )`)

        // TODO (waiting for recording and clip support) Create table for clips

        // Respond
        return {
          ok: true,
          data: {
            id: result.insertId,
            name,
            hosts
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
     * @param {number} timeToAlert
     * @param {array} hosts
     * @param {array} guests
     * @param {string} description
     * @param {string} visibility
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
          timeToAlert: {
            type: "number",
            required: true
          },
          hosts: {
            type: "array",
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
          }
        }
      },

      middleware: [verifyUserToken, verifyUserIsHostOfPodcast],

      async function(req, res) {
        const {
          name,
          podcastId,
          startTime,
          endTime,
          timeToAlert,
          hosts,
          guests,
          description,
          visibility
        } = req.body;

        // Check if hosts and guests exist in database
        for (const user of [...hosts, ...guests]) {
          console.log(user);
          const [
            userProfiles
          ] = await mysql.exec(
            "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
            [user]
          );
          if (!userProfiles.length) {
            return { error: `No user found by id ${user}`, status: 400 };
          }
        }

        // Verify startTime and endTime are ahead of eachother
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        if (startDate == "Invalid Date" || endDate == "Invalid Date") {
          return {
            error: "Start time or end time were invalid dates",
            error: 400
          };
        }

        if (startDate > endDate) {
          return {
            error: "Start date needs to be before the end date",
            status: 400
          };
        }

        // Add to the db
        const [result] = await mysql.exec(
          `INSERT INTO scheduled_podcast (
            podcastId,
            name,
            screenshotUrl,
            hosts,
            guests,
            description,
            visibility,
            startTime,
            endTime,
            timeToAlert
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            podcastId,
            name,
            "",
            hosts.toString(),
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
          podcasts
        ] = await mysql.exec(
          "SELECT * FROM scheduled_podcast WHERE id = ? LIMIT 1",
          [result.insertId]
        );
        if (!podcasts.length) {
          return {
            error:
              "Somehow the podcast was created but not found in the database",
            status: 500
          };
        }

        return {
          ok: true,
          data: podcasts[0]
        };
      }
    })
  };
};
