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
            maxLength: 64,
            validator: name => ({
              isValid: regex.nameWithSpaces.test(name),
              error: "That podcast name cannot be used"
            })
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
          ] = await mysql.execute(
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
        ] = await mysql.execute(
          "SELECT * FROM podcasts WHERE name = ? LIMIT 1",
          [name]
        );
        if (podcasts.length) {
          return {
            error: `A podcast with the name ${name} already exists`,
            status: 400
          };
        }

        // Create the podcast
        const [result] = await mysql.execute(
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
        // await mysql.execute(`CREATE TABLE IF NOT EXISTS podcast_${result.insertId}_episodes (
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
     * Schedule a new podcast episode
     * @param {string} name
     * @param {date} startTime
     * @param {date} endTime
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
            maxLength: 64,
            validator: name => ({
              isValid: regex.nameWithSpaces.test(name),
              error: "That podcast name cannot be used"
            })
          },
          podcastId: {
            type: "number",
            required: true
          },
          startTime: {
            type: "date",
            required: true
          },
          endTime: {
            type: "date",
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
            type: "string",
            required: true,
            validator: visibility => ({
              isValid: ["private", "public"].contains(visibility),
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
          hosts,
          guests,
          description,
          visibility
        } = req.body;

        // Check if
      }
    })
  };
};
