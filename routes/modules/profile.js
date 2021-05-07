const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const regex = require("../../data/regex");

module.exports = ({ io }) => {
  const { verifyUserToken } = require("../middleware")({ io });

  return {
    /**
     * Verify user token is still valid (usually used when user comes back to app intially)
     */
    update: new ExpressRoute({
      type: "PUT",

      model: {
        body: {
          firstName: {
            type: "string"
          },
          lastName: {
            type: "string"
          },
          bio: {
            type: "string",
            maxLength: 128
          },
          socials: {
            type: "object",
            model: {
              instagram: {
                type: "string",
                required: true,
                maxLength: 32
              },
              twitter: {
                type: "string",
                required: true,
                maxLength: 15
              }
            }
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        // Get from the request body, only the data from the model
        const keysToLookFor = Object.keys(this.model);

        let updates = {};

        // Get only the keys you can update to filter out any junk
        for (const key of Object.keys(req.body)) {
          // If we are cool with accepting this updated value
          if (keysToLookFor.includes(key)) {
            updates[key] = req.body[key];
          }
        }

        // Get the user profile
        const [
          users
        ] = await mysql.exec(
          "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
          [req.user.userAccount.profileId]
        );
        if (!users.length) {
          return {
            error: `No user_profile found by account profileId ${req.user.userAccount.profileId}`,
            status: 500
          };
        }

        // Combine old and new values to get new user profile data
        updates = {
          ...users[0],
          ...updates
        };

        // Create sql update string
        const update = Object.keys(updates)
          .map(k => `${k} = ${updates[k]}`)
          .join(", ");
        console.log(update);

        const [
          result
        ] = await mysql.exec(
          `UPDATE user_profiles SET ${update} WHERE id = ?`,
          [req.user.userAccount.profileId]
        );

        console.log(result);

        return { ok: true };
      }
    })
  };
};
