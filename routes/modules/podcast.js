const ExpressRoute = require("../ExpressRoute.js");
const consola = require("consola");
const regex = require("../../data/regex");

const { verifyUserToken } = require("../middleware.js");

module.exports = ({ io }) => {
  return {
    /**
     * Create a new user account and user profile
     * @param {string} username
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
              isValid: regex.name.test(name),
              error: "That podcast name cannot be used"
            }),
            hosts: {
              type: "object",
              required: true
            }
          }
        }
      },

      middleware: [verifyUserToken],

      async function(req, res) {
        //

        // Respond
        return {
          ok: true,
          data
        };
      }
    })
  };
};
