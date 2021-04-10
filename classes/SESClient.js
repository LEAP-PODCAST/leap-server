const AWS = require("aws-sdk");

module.exports = class {
  ses = null;

  constructor() {
    AWS.config.update({
      accessKeyId: process.env.AMAZON_SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.AMAZON_SES_SECRET_ACCESS_KEY,
      region: "us-east-2"
    });

    this.ses = new AWS.SES({ apiVersion: "2010-12-01" });
  }

  sendEmail({ to, subject, message, from }) {
    return new Promise(resolve => {
      const params = {
        Destination: {
          ToAddresses: [to]
        },
        Message: {
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: message
            }
            /* replace Html attribute with the following if you want to send plain text emails. 
                Text: {
                    Charset: "UTF-8",
                    Data: message
                }
             */
          },
          Subject: {
            Charset: "UTF-8",
            Data: subject
          }
        },
        ReturnPath: from,
        Source: from
      };

      this.ses.sendEmail(params, (err, data) => {
        if (err) {
          console.error(err);
          resolve({ error: err });
        } else {
          console.log("Email sent.", data);
          resolve({ ok: true });
        }
      });
    });
  }
};
