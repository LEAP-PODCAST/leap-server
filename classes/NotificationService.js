const AWS = require("aws-sdk");

let io;

module.exports = class {
  io = null;

  constructor(io) {
    this.io = io;
  }

  async sendNotification(userId) {}

  async inviteUserAsRoleOnPodcast({
    from_user,
    to_user,
    to_email,
    role,
    podcast
  }) {
    // Check if to_user is undefined
    if (!to_user) {
      // Send email to users email inviting them to the platform and to the podcast

      return { ok: true };
    }

    // Get user account
    const [
      users
    ] = await mysql.exec(
      "SELECT * FROM user_accounts WHERE profile_id = ? LIMIT 1",
      [to_user.id]
    );
    if (!users.length) {
      return {
        error: `No user account found by profile_id ${to_user.id}`,
        status: 500
      };
    }

    // Check if user accepts emails
    if (to_user.receiveEmails) {
      // Send the user an email that they were invited as a role
    }

    // Send them a notification
    this.sendNotification();
  }

  async inviteUserAsRoleOnEpisode({
    from_userid,
    to_email,
    role,
    podcastId,
    episodeId
  }) {}
};
