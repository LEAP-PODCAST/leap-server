const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const regex = require("../../data/regex");
const { sanitizeNameForURL } = require("../../methods");
const { default: consolaGlobalInstance } = require("consola");

module.exports = ({ io }) => {
  const { verifyUserToken, verifyPodcastExists, verifyUserIsHostOfPodcast } =
    require("../middleware")({ io });

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
          },
          description: {
            type: "string",
            required: true,
            maxLength: 128
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        const { name, hosts, description } = req.body;

        const hostIds = [];
        const hostProfiles = [];

        // Add creator to array
        const [userProfiles] = await mysql.getUserProfiles(
          "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
          [req.user.userAccount.profileId]
        );
        if (!userProfiles.length) {
          return {
            error: "Could not find your user profile in the database",
            status: 500
          };
        }

        hosts.unshift({
          type: "user",
          ...userProfiles[0]
        });

        // Verify hosts are legit hosts
        for (const host of hosts.filter(hosts => hosts.type === "user")) {
          const [selectedHosts] = await mysql.getUserProfiles(
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

        // Check if podcast with name already exists
        const [podcasts] = await mysql.exec(
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
        const [result] = await mysql.exec(
          `INSERT INTO podcasts (
          name,
          urlName,
          hosts,
          description
        ) VALUES (?, ?, ?, ?)`,
          [name, sanitizeNameForURL(name), hostIds.toString(), description]
        );
        if (!result || typeof result.insertId !== "number") {
          return {
            error: "An error occurred creating this podcast",
            status: 500
          };
        }

        // Add podcast to creators profile
        const [result2] = await mysql.exec(
          `UPDATE user_profiles SET podcasts = ? WHERE id = ?`,
          [
            [result.insertId, ...hostProfiles[0].podcasts].toString(),
            hostProfiles[0].id
          ]
        );
        if (!result2) {
          return {
            error: "An error occurred adding this podcast to host user",
            status: 500
          };
        }

        // Invite other users to host podcast
        for (let i = 1; i < hostProfiles.length; i++) {
          const hostProfile = hostProfiles[i];

          NotificationService.inviteUserAsRoleOnPodcast({
            fromUser: userProfiles[0],
            toUser: hostProfile,
            role: "host",
            podcast: {
              id: result.insertId,
              name,
              hostIds,
              description
            }
          });
        }

        // Email users who are not on leap to join with a temporary account
        for (const host of hosts.filter(host => host.type === "email")) {
          const lowerEmail = host.email.toLowerCase();

          await SES.sendEmail({
            to: lowerEmail,
            subject: "You were invited to join Leap",
            message: `
              <body>
                <h1>${userProfiles[0].firstName} ${userProfiles[0].lastName} has added you as a host for ${name}.</h1>
                <p>Click the link below to create an account and confirm your email.</p>
                <a href="https://staging.joinleap.co/signup?email=${lowerEmail}">Create my Account!</a>
              </body>
            `,
            from: "support@joinleap.co"
          });

          const [result2] = await mysql.exec(
            `INSERT INTO email_invites (
            email,
            podcastId
          ) VALUES (?, ?)`,
            [lowerEmail, result.insertId]
          );
        }

        // Create table for episodes
        const [result2] =
          await mysql.exec(`CREATE TABLE IF NOT EXISTS podcast_${result.insertId}_episodes (
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
            hostIds,
            description
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

        const [podcasts] = await mysql.getPodcasts(
          "SELECT * FROM podcasts WHERE id >= ? LIMIT 100",
          [startingId]
        );

        return { ok: true, data: podcasts };
      }
    }),

    /**
     * Update a podcasts info
     */
    update: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          hosts: {
            type: "array"
          },
          name: {
            type: "string",
            maxLength: 64
          },
          description: {
            type: "string",
            maxLength: 128
          }
        }
      },

      middleware: [
        verifyUserToken,
        verifyPodcastExists,
        verifyUserIsHostOfPodcast
      ],

      async function(req, res) {
        const { podcast } = req;

        // Get from the request body, only the data from the model
        const keysToLookFor = Object.keys(this.model.body);

        const updates = {};

        const hostIds = [];
        const hostProfiles = [];

        // Get only the keys you can update to filter out any junk
        for (const key of Object.keys(req.body)) {
          // If we are cool with accepting this updated value
          if (keysToLookFor.includes(key)) {
            // Custom handler for social
            if (key === "hosts") {
              const { hosts } = req.body;

              // Add creator to array
              const [userProfiles] = await mysql.getUserProfiles(
                "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
                [req.user.userAccount.profileId]
              );
              if (!userProfiles.length) {
                return {
                  error: "Could not find your user profile in the database",
                  status: 500
                };
              }

              hosts.unshift({
                type: "user",
                ...userProfiles[0]
              });

              // Verify hosts are legit hosts
              for (const host of hosts.filter(hosts => hosts.type === "user")) {
                const [selectedHosts] = await mysql.getUserProfiles(
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

              updates[key] = hostIds.toString();
              continue;
            }
            updates[key] = req.body[key];
          }
        }

        const keys = Object.keys(updates);
        if (!keys.length) {
          return { error: "No updates provided", status: 400 };
        }

        // Add podcast to hosts podcasts array
        for (const hostProfile of hostProfiles) {
          const podcastIds = hostProfile.podcasts.map(p => p.id);

          // Verify they don't already have that podcastId on their profile
          if (podcastIds.includes(req.podcast.id)) {
            continue;
          }
          podcastIds.push(req.podcast.id);

          const [result2] = await mysql.exec(
            `UPDATE user_profiles SET podcasts = ? WHERE id = ?`,
            [podcastIds.toString(), hostProfile.id]
          );
          if (!result2) {
            return {
              error: "An error occurred adding this podcast to host user",
              status: 500
            };
          }
        }

        // Get array of users who were in old but not new
        const removedIds = podcast.hosts
          .split(",")
          .map(v => parseInt(v))
          .filter(v => !hostIds.includes(v));

        // Remove podcast from hosts podcasts array if they were removed
        for (const id of removedIds) {
          // Get user object
          const [users] = await mysql.exec(
            "SELECT podcasts FROM user_profiles WHERE id = ? LIMIT 1",
            [id]
          );
          if (!users.length) {
            return { error: `No user profile found by id ${id}`, status: 500 };
          }

          const podcastIds = users[0].podcasts
            .split(",")
            .filter(v => v != podcast.id);

          const [result2] = await mysql.exec(
            `UPDATE user_profiles SET podcasts = ? WHERE id = ?`,
            [podcastIds.toString(), id]
          );
          if (!result2) {
            return {
              error:
                "An error occurred while removing this podcast from user profile",
              status: 500
            };
          }
        }

        // Create sql update string
        const update = keys.join(" = ?, ") + " = ?";
        const values = keys.map(k => updates[k]);

        const [result] = await mysql.exec(
          `UPDATE podcasts SET ${update} WHERE id = ?`,
          [...values, podcast.id]
        );
        // If did not update
        if (result.affectedRows < 1) {
          return {
            error: "An error occurred while updated your profile",
            status: 500
          };
        }

        // Get the podcast
        const [podcasts] = await mysql.getPodcasts(
          "SELECT * FROM podcasts WHERE id = ? LIMIT 1",
          [podcast.id]
        );
        if (!podcasts.length) {
          return {
            error: `No podcast found by id ${podcast.id}`,
            status: 500
          };
        }

        return {
          ok: true,
          data: podcasts[0]
        };
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

        const hostIds = [];
        const guestIds = [];

        // Check if hosts exist in the database
        // for (const user of hosts) {
        //   const [
        //     userProfiles
        //   ] = await mysql.exec(
        //     "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
        //     [user.id]
        //   );
        //   if (!userProfiles.length) {
        //     return {
        //       error: `No user found by userId ${user.id}`,
        //       status: 400
        //     };
        //   }

        //   hostIds.push(userProfiles[0].id);
        // }

        // Check if guests exist in database
        for (const user of guests.filter(guest => guest.type === "user")) {
          const [userProfiles] = await mysql.exec(
            "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
            [user.id]
          );
          if (!userProfiles.length) {
            return {
              error: `No user found by userId ${user.id}`,
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
        const [podcasts] = await mysql.exec(
          "SELECT * FROM podcasts WHERE id = ? LIMIT 1",
          [podcastId]
        );
        if (!podcasts.length) {
          return {
            error: `No podcast found by podcast id ${podcastId}`,
            status: 400
          };
        }

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
            guestIds.toString(),
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
        const [episodes] = await mysql.exec(
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

        const [userProfiles] = await mysql.exec(
          "SELECT podcasts FROM user_profiles WHERE id = ? LIMIT 1",
          [id]
        );
        if (!userProfiles.length) {
          return { error: `No user profile found by id ${id}`, status: 500 };
        }

        // If user has no podcasts
        const podcastIds = userProfiles[0].podcasts;
        if (!podcastIds.length) {
          return { ok: true, data: [] };
        }

        const [episodes] = await mysql.exec(
          `SELECT * FROM scheduled_podcast WHERE podcastId IN (${podcastIds})`
        );

        return {
          ok: true,
          data: episodes
        };
      }
    })
  };
};
