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
                maxLength: 32
              },
              twitter: {
                type: "string",
                maxLength: 15
              }
            }
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        // Get from the request body, only the data from the model
        const keysToLookFor = Object.keys(this.model.body);

        const updates = {};

        // Get only the keys you can update to filter out any junk
        for (const key of Object.keys(req.body)) {
          // If we are cool with accepting this updated value
          if (keysToLookFor.includes(key)) {
            // Custom handler for social
            if (key === "socials") {
              // Get only the socials we support. This way the user cannot add custom data
              // to the database
              const socials = {};
              const socialKeys = Object.keys(this.model.body.socials.model);
              for (const socialKey of socialKeys) {
                const newValue = req.body.socials[socialKey];
                if (newValue && newValue.length) socials[socialKey] = newValue;
              }
              updates.socials = JSON.stringify(socials);
              continue;
            }
            updates[key] = req.body[key];
          }
        }

        const keys = Object.keys(updates);
        if (!keys.length) {
          return { error: "No updates provided", status: 400 };
        }

        // Create sql update string
        const update = keys.join(" = ?, ") + " = ?";
        const values = keys.map(k => updates[k]);

        const [
          result
        ] = await mysql.exec(
          `UPDATE user_profiles SET ${update} WHERE id = ?`,
          [...values, req.user.userAccount.profileId]
        );
        // If did not update
        if (result.affectedRows < 1) {
          return {
            error: "An error occurred while updated your profile",
            status: 500
          };
        }

        // Get the user profile
        const [
          users
        ] = await mysql.getUserProfiles(
          "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
          [req.user.userAccount.profileId]
        );
        if (!users.length) {
          return {
            error: `No user_profile found by account profileId ${req.user.userAccount.profileId}`,
            status: 500
          };
        }

        return {
          ok: true,
          data: users[0]
        };
      }
    })
  };
};
