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

        const hostIds = [req.user.userAccount.profileId];
        const hostProfiles = [];

        // Get the creators user profile
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

        // Add creator to hosts array
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
            [
              result.insertId,
              ...hostProfiles[0].podcasts.map(({ id }) => id)
            ].toString(),
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

          // Get host account email
          const [userAccounts] = await mysql.exec(
            "SELECT email FROM user_accounts WHERE profileId = ? LIMIT 1",
            [hostProfile.id]
          );

          NotificationService.inviteUserAsRoleOnPodcast({
            fromUser: userProfiles[0],
            toUser: hostProfile,
            toEmail: userAccounts[0].email,
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

          await mysql.exec(
            `INSERT INTO email_invites (
            email,
            podcastId
          ) VALUES (?, ?)`,
            [lowerEmail, result.insertId]
          );
        }

        // Create table for episodes
        const [result3] =
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

        if (!result3) {
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
            hosts: [...hostProfiles[0]],
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
     * Get podcast update form data
     */
    getUpdateForm: new ExpressRoute({
      type: "GET",

      model: {
        query: {
          podcastId: {
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
        const { podcastId } = req.query;

        const hosts = [];

        // Loop through podcast users and add them to the editable hosts array
        for (const profileId of req.podcast.hosts.split(",")) {
          const [userProfiles] = await mysql.exec(
            "SELECT username, fullUsername, avatarUrl, id FROM user_profiles WHERE id = ?",
            [profileId]
          );
          if (!userProfiles.length) {
            consola.error(`No user profile found by id ${profileId}`);
            continue;
          }

          hosts.push({
            type: "user",
            ...userProfiles[0]
          });
        }

        // Get users invited by podcastId
        const [invites] = await mysql.exec(
          "SELECT * FROM invites WHERE podcastId = ?",
          [podcastId]
        );

        // Look through each invite to get corresponding notification
        for (let i = 0; i < invites.length; i++) {
          const invite = invites[i];

          const [notifications] = await mysql.exec(
            "SELECT id, toEmail FROM notifications WHERE tableName = 'invites' AND itemId = ?",
            [invite.id]
          );

          // Select user object if user exists (if not, this may be an invite for a user who
          // has not signed up for leap yet)
          const [userAccounts] = await mysql.exec(
            "SELECT * FROM user_accounts WHERE email = ?",
            [notifications[0].toEmail]
          );

          // If a user account belongs to this notifications (user is signed up)
          let userProfile = {
            email: notifications[0].toEmail
          };

          if (userAccounts.length) {
            const [userProfiles] = await mysql.exec(
              "SELECT id, firstName, lastName, username, fullUsername, avatarUrl FROM user_profiles WHERE id = ?",
              [userAccounts[0].profileId]
            );

            if (userProfiles.length) {
              userProfile = {
                ...userProfile,
                ...userProfiles[0]
              };
            }
          }

          invites[i].userProfile = userProfile;
        }

        return {
          ok: true,
          data: {
            ...req.podcast,
            hosts,
            invites
          }
        };
      }
    }),

    /**
     * Update a podcasts info
     */
    update: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
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

        // Get only the keys you can update to filter out any junk
        for (const key of Object.keys(req.body)) {
          // If we are cool with accepting this updated value
          if (keysToLookFor.includes(key)) {
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

    inviteUser: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          invitedEmail: {
            type: "string",
            validator: email => ({
              isValid: regex.email.test(email),
              error: "The invitedEmail is not a valid email"
            })
          },
          invitedId: {
            type: "number"
          }
        }
      },

      middleware: [
        verifyUserToken,
        verifyPodcastExists,
        verifyUserIsHostOfPodcast
      ],

      async function(req, res) {
        let { invitedEmail, invitedId } = req.body;
        invitedEmail = invitedEmail.toLowerCase();

        const params = {};

        // If inviting by email
        if (invitedEmail) {
          // Check if a user exists by that email
          const [userAccounts] = await mysql.exec(
            "SELECT * FROM user_accounts WHERE email = ?",
            [invitedEmail]
          );

          const user = userAccounts[0];

          // If on Leap
          if (!user) {
            const [userProfiles] = await mysql.exec(
              "SELECT * FROM user_profiles WHERE id = ?",
              [user.profileId]
            );
            if (!userProfiles.length) {
              return {
                error: `No user profile found by id ${user.profileId}`,
                status: 500
              };
            }

            params.toUser = userProfiles[0];
          }

          params.toEmail = invitedEmail;
        }

        // If inviting by user id
        else if (invitedId) {
          const [userProfiles] = await mysql.exec(
            "SELECT * FROM user_profiles WHERE id = ?",
            [invitedId]
          );
          if (!userProfiles.length) {
            return {
              error: `No user profile found by id ${invitedId}`,
              status: 400
            };
          }

          params.toUser = userProfiles[0];
        }

        // If user passed neither email or id
        else {
          return {
            error: "No body.invitedEmail or body.invitedId provided",
            status: 400
          };
        }

        // Get inviter profile (requester)
        const [userProfiles] = await mysql.exec(
          "SELECT * FROM user_profiles WHERE id = ?",
          [req.user.userAccount.profileId]
        );
        if (!userProfiles.length) {
          return {
            error: `No user profile found for user id ${req.user.userAccount.profileId}`,
            status: 500
          };
        }

        params.fromUser = userProfiles[0];
        params.role = "host";
        params.podcast = req.podcast;

        const { ok, error, status } =
          NotificationService.inviteUserAsRoleOnPodcast(params);
        if (!ok) {
          return { error, status };
        }

        return {
          ok: true
        };
      }
    }),

    cancelInvite: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          inviteId: {
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
        const { inviteId } = req.body;

        // Check if an invite exists by that ID and podcast ID
        const [invites] = await mysql.exec(
          "SELECT * FROM invites WHERE id = ? AND podcastId = ?",
          [inviteId, req.podcast.id]
        );
        if (!invites.length) {
          return {
            error: `No invite found by id ${inviteId} and for podcast ${req.podcast.id}`
          };
        }

        // Delete the notification by itemId
        await mysql.exec(
          "DELETE FROM notifications WHERE tableName = 'invites' AND itemId = ?",
          [inviteId]
        );

        // Delete the invite by id
        await mysql.exec("DELETE FROM invites WHERE id = ?", [inviteId]);

        return {
          ok: true.
        };
      }
    }),

    removeHost: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          hostId: {
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
        const { hostId } = req.body;

        // Check if user profile exists by id
        const [userProfiles] = await mysql.exec(
          "SELECT * FROM user_profiles WHERE id = ?",
          [hostId]
        );
        if (!userProfiles.length) {
          return {
            error: `Could not find user profile by host id ${hostId}`,
            status: 400
          };
        }

        const hostProfile = userProfiles[0];

        // Check if user is in podcast
        const { podcast } = req;
        podcast.hosts = podcast.hosts.split(",");
        const index = podcast.hosts.indexOf(`${hostId}`);
        if (index === -1) {
          return {
            error: `${hostProfile.fullUsername} is not a host of podcast ${podcast.name}`,
            status: 400
          };
        }

        // Remove from podcast
        podcast.hosts.splice(index, 1);
        const [result] = await mysql.exec(
          "UPDATE podcasts SET hosts = ? WHERE id = ?",
          [podcast.hosts.toString(), podcast.id]
        );

        // Remove podcast from users profile
        hostProfile.podcasts = hostProfile.podcasts.split(",");
        const index2 = hostProfile.podcasts.indexOf(`${podcast.id}`);
        if (index2 === -1) {
          consola.error(
            `${podcast.id} was not found on users profile podcasts array`
          );
        } else {
          hostProfile.podcasts.splice(index2);
          const [result2] = await mysql.exec(
            "UPDATE user_profiles SET podcasts = ? WHERE id = ?",
            [hostProfile.podcasts.toString(), hostId]
          );
        }

        // TODO Fire an event that user was revoked access (in case of live episode, kick them from room)

        return {
          ok: true
        };
      }
    }),

    /**
     * // Custom handler for social
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
     */

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
