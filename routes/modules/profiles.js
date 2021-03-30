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
     */
    search: new ExpressRoute({
      type: "GET",

      model: {
        query: {
          username: {
            type: "string",
            required: true,
            maxLength: 20
          }
        }
      },

      middleware: [],

      async function(req, res) {
        const { username } = req.query;

        const [
          userProfiles
        ] = await mysql.exec(
          "SELECT username, fullUsername avatarUrl, id FROM user_profiles WHERE username LIKE ? LIMIT 10",
          [`%${username.toLowerCase()}%`]
        );

        return {
          ok: true,
          data: userProfiles
        };
      }
    })
  };
};
