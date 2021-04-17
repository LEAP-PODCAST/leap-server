const ExpressRoute = require("../ExpressRoute.js");

const regex = require("../../data/regex");

module.exports = ({ io }) => {
  const { verifyAdminPassword } = require("../middleware")({ io });

  return {
    /**
     * Get all emails on email list
     * @param {string} password
     */
    getEmailList: new ExpressRoute({
      type: "GET",

      model: {
        body: {}
      },

      middleware: [verifyAdminPassword],

      async function(req, res) {
        const [emails] = await mysql.exec("SELECT * FROM email_list");

        return { ok: true, data: emails };
      }
    }),

    /**
     * Add email to email list
     * @param {string} email
     */
    emailList: new ExpressRoute({
      type: "POST",

      model: {
        body: {
          email: {
            type: "string",
            required: true,
            maxLength: 32,
            validator: email => ({
              isValid: regex.email.test(email),
              error: "That email is invalid"
            })
          }
        }
      },

      middleware: [],

      async function(req, res) {
        const { email } = req.body;

        const lowerEmail = email.toLowerCase();

        // Check if email does not already exist
        const [
          emails
        ] = await mysql.exec("SELECT * FROM email_list WHERE email = ?", [
          lowerEmail
        ]);
        if (emails.length) {
          return { error: "That email is already signed up", status: 400 };
        }

        // Add to the DB
        await mysql.exec(
          `INSERT INTO email_list (
          email,
          timestamp
        ) VALUES (?, ?)`,
          [lowerEmail, Math.floor(Date.now() / 1000)]
        );

        // Post email in discord
        await fetch(
          "https://discord.com/api/webhooks/833068991332221009/4XSW5oX1dYWKovfLO7FemHaETX-vtA9VPZC5ZAeUAqdbNrkqXdUYyiITp8iJRSFVrOyD",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: `${email} requested access`
            })
          }
        );

        return { ok: true };
      }
    })
  };
};
