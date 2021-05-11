const AWS = require("aws-sdk");

module.exports = class {
  io = null;

  constructor({ io }) {
    this.io = io;
  }

  /**
   * Send a notification to a user ID
   * @param {*} userId User profile id
   * @param {*} type Type of notification
   * @param {*} payload Notification payload
   */
  async sendNotification(userId, type, payload) {
    const socketId = this.io.users.get(userId);
    if (!socketId) return;
    io.to(socketId).emit(`notification/${type}`, payload);
  }

  async inviteUserAsRoleOnPodcast({
    fromUser,
    toUser,
    toEmail,
    role,
    podcast
  }) {
    // Check if toUser is undefined
    if (!toUser) {
      // Send email to users email inviting them to the platform and to the podcast

      return { ok: true };
    }

    // Get user account
    const [users] = await mysql.exec(
      "SELECT * FROM user_accounts WHERE profile_id = ? LIMIT 1",
      [toUser.id]
    );
    if (!users.length) {
      return {
        error: `No user account found by profile_id ${toUser.id}`,
        status: 500
      };
    }

    // Add notification to database
    const [result] = await mysql.exec(
      `INSERT INTO invites (
      fromUserId,
      toEmail,
      role,
      podcastId
    ) VALUES (?, ?, ?, ?, ?)`,
      [fromUser.id, toEmail, role, podcast.id]
    );
    if (!result || !result.insertId) {
      return {
        error: "There was an error adding your notification to the database",
        status: 500
      };
    }

    // Check if user accepts emails
    if (users[0].receiveEmails) {
      // Send the user an email that they were invited as a role
    }

    // Send them a notification
    this.sendNotification(toUser.id, "podcastInvite", {
      id: result.insertId,
      fromName: `${fromUser.firstName} ${fromUser.lastName}`,
      podcastName: podcast.name,
      role
    });
  }

  async inviteUserAsRoleOnEpisode({
    fromUser,
    toUser,
    toEmail,
    role,
    podcast,
    episode
  }) {
    // Check if toUser is undefined
    if (!toUser) {
      // Send email to users email inviting them to the platform and to the podcast episode

      return { ok: true };
    }

    // Get user account
    const [users] = await mysql.exec(
      "SELECT * FROM user_accounts WHERE profile_id = ? LIMIT 1",
      [toUser.id]
    );
    if (!users.length) {
      return {
        error: `No user account found by profile_id ${toUser.id}`,
        status: 500
      };
    }

    // Add notification to database
    const [result] = await mysql.exec(
      `INSERT INTO invites (
      fromUserId,
      toEmail,
      role,
      episodeId
    ) VALUES (?, ?, ?, ?, ?)`,
      [fromUser.id, toEmail, role, episode.id]
    );
    if (!result || !result.insertId) {
      return {
        error: "There was an error adding your notification to the database",
        status: 500
      };
    }

    // Check if user accepts emails
    if (users[0].receiveEmails) {
      // Send the user an email that they were invited as a role
    }

    // Send them a notification
    this.sendNotification(toUser.id, "episodeInvite", {
      id: result.insertId,
      fromName: `${fromUser.firstName} ${fromUser.lastName}`,
      podcastName: podcast.name,
      episodeName: episode.name,
      role
    });
  }

  async sendTextNotification(user, text) {
    const [result] = await mysql.exec(
      `INSERT INTO notifications (
      toUserId,
      text,
      unread
    ) VALUES (?, ?, ?)`,
      [user.id, text, true]
    );
    if (!result || !result.insertId) {
      return {
        error: "There was an error adding your notification to the database",
        status: 500
      };
    }

    this.sendNotification(user.id, "text", { text });
  }
};
