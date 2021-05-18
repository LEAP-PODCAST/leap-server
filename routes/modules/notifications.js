const ExpressRoute = require("../ExpressRoute.js");

module.exports = ({ io }) => {
  const { verifyUserToken } = require("../middleware")({ io });

  return {
    /**
     * Get all notifcations of all types
     */
    getAll: new ExpressRoute({
      type: "GET",

      model: {
        query: {
          lastId: {
            type: "number"
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        // 999999 because thats assuming no more than 999999 elements in notifications array
        const lastId = req.query.lastId || 999999;

        const [notifications] = await mysql.exec(
          `SELECT * FROM notifications WHERE id < ? AND toEmail = ? ORDER BY createdAt DESC LIMIT 10`,
          [lastId, req.user.userAccount.email]
        );

        const items = [];
        for (const notification of notifications) {
          const { tableName, itemId } = notification;
          const [i] = await mysql.exec(
            `SELECT * FROM ${tableName} WHERE id = ?`,
            [itemId]
          );
          if (!i.length) {
            consola.error(
              `No ${tableName} item found corresponding to notification id ${notification.id}`
            );
            continue;
          }

          const item = {
            ...i[0]
          };

          if (item.podcastId) {
            const [podcasts] = await mysql.exec(
              "SELECT * FROM podcasts WHERE id = ?",
              [item.podcastId]
            );
            if (!podcasts.length) {
              consola.error(
                `No podcast found by id ${item.podcastId} corresponding to invite id ${itemId}`
              );
              continue;
            }

            item.podcast = podcasts[0];
          }

          items.push({
            type: tableName,
            value: item
          });
        }

        return {
          ok: true,
          data: items
        };
      }
    }),

    /**
     * Respond to invitation to podcast or episode
     */
    respondToInvite: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          id: {
            type: "number",
            required: true
          },
          accept: {
            type: "boolean",
            required: true
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        const { id, accept } = req.body;

        // Check if notification exists by id
        const [notifications] = await mysql.exec(
          "SELECT * FROM notifications WHERE id = ?",
          [id]
        );
        if (!notifications.length) {
          return { error: `No notification found by id ${id}`, status: 400 };
        }

        const notification = notifications[0];
        const inviteId = notification.itemId;

        // Get the invite
        const [invites] = await mysql.exec(
          "SELECT * FROM invites WHERE id = ?",
          [inviteId]
        );
        if (!invites.length) {
          return { error: `No invite found by id ${inviteId}`, status: 500 };
        }

        const invite = invites[0];

        // Check if invite belongs to this user
        if (notification.toEmail !== req.user.userAccount.email) {
          return { error: "This invite does not belong to you", status: 401 };
        }

        // Get inviter user
        const [userAccounts] = await mysql.exec(
          "SELECT email FROM user_accounts WHERE profileId = ?",
          [invite.fromUserId]
        );
        if (!userAccounts.length) {
          return {
            error: `No user account found by profile id ${invite.fromUserId}`,
            status: 500
          };
        }

        const inviterEmail = userAccounts[0].email;

        // Get user profile
        const [userProfiles] = await mysql.exec(
          "SELECT * FROM user_profiles WHERE id = ? OR id = ?",
          [req.user.userAccount.profileId, invite.fromUserId]
        );
        if (userProfiles.length !== 2) {
          return {
            error: `Unable to find both user profiles by ids ${req.user.userAccount.profileId},${invite.fromUserId}`,
            status: 500
          };
        }

        const invitedProfile = userProfiles.find(
          ({ id }) => id === req.user.userAccount.profileId
        );
        const inviterProfile = userProfiles.find(
          ({ id }) => id === invite.fromUserId
        );

        const [podcasts] = await mysql.exec(
          "SELECT * FROM podcasts WHERE id = ?",
          [invite.podcastId]
        );
        if (!podcasts.length) {
          return {
            error: `No podcast found by invite podcast id ${invite.podcastId}`,
            status: 500
          };
        }

        const podcast = podcasts[0];

        // If accepted
        if (accept) {
          // Verify podcasts string has a length, otherwise if you split an empty string by comma, you
          // will get an array equal to [""]. This could bug the podcasts array later on.
          let podcastIds = invitedProfile.podcasts.length
            ? invitedProfile.podcasts.split(",")
            : [];

          // Add podcast to user id array
          podcastIds.unshift(invite.podcastId);
          const [result] = await mysql.exec(
            "UPDATE user_profiles SET podcasts = ? WHERE id = ?",
            [podcastIds.toString(), invitedProfile.id]
          );
          if (!result) {
            return {
              error: `An error occurred when adding podcast to user profile ${invitedProfile.id}`,
              status: 500
            };
          }

          // Tell inviter user, this user accepted the invitation
          NotificationService.sendTextNotification(
            {
              ...inviterProfile,
              email: inviterEmail
            },
            `${invitedProfile.firstName} has accepted your invite as a ${invite.role} on ${podcast.name}`
          );
        }

        // If not accepted
        else {
          // Tell inviter user, this user declined the invitation
          NotificationService.sendTextNotification(
            {
              ...inviterProfile,
              email: inviterEmail
            },
            `${invitedProfile.firstName} has declined your invite as a ${invite.role} on ${podcast.name}`
          );
        }

        // Delete notification
        await mysql.exec("DELETE FROM notifications WHERE id = ?", [
          notification.id
        ]);

        // Delete invitation
        await mysql.exec("DELETE FROM invites WHERE id = ?", [invite.id]);

        return {
          ok: true
        };
      }
    })
  };
};
