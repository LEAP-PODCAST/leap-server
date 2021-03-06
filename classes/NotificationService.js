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
    this.io.to(socketId).emit(`notification/${type}`, payload);
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
      "SELECT * FROM user_accounts WHERE profileId = ? LIMIT 1",
      [toUser.id]
    );
    if (!users.length) {
      return {
        error: `No user account found by profileId ${toUser.id}`,
        status: 500
      };
    }

    // Add notification to database
    const [result] = await mysql.exec(
      `INSERT INTO invites (
      fromUserId,
      role,
      podcastId
    ) VALUES (?, ?, ?)`,
      [fromUser.id, role, podcast.id]
    );
    if (!result || !result.insertId) {
      return {
        error: "There was an error adding your notification to the database",
        status: 500
      };
    }

    const [result2] = await mysql.exec(
      `INSERT INTO notifications (
      tableName,
      itemId,
      toEmail
    ) VALUES (?, ?, ?)`,
      ["invites", result.insertId, toEmail]
    );

    // Check if user accepts emails
    if (users[0].receiveEmails) {
      // Send the user an email that they were invited as a role
    }

    // Send them a notification
    this.sendNotification(toUser.id, "podcastInvite", result2.insertId);
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
      "SELECT * FROM user_accounts WHERE profileId = ? LIMIT 1",
      [toUser.id]
    );
    if (!users.length) {
      return {
        error: `No user account found by profileId ${toUser.id}`,
        status: 500
      };
    }

    // Add notification to database
    const [result] = await mysql.exec(
      `INSERT INTO invites (
      fromUserId,
      role,
      episodeId
    ) VALUES (?, ?, ?)`,
      [fromUser.id, role, episode.id]
    );
    if (!result || !result.insertId) {
      return {
        error: "There was an error adding your notification to the database",
        status: 500
      };
    }

    const [result2] = await mysql.exec(
      `INSERT INTO notifications (
      tableName,
      itemId,
      toEmail
    ) VALUES (?, ?, ?)`,
      ["invites", result.insertId, toEmail]
    );

    // Check if user accepts emails
    if (users[0].receiveEmails) {
      // Send the user an email that they were invited as a role
    }

    // Send them a notification
    this.sendNotification(toUser.id, "episodeInvite", result2.insertId);
  }

  /**
   * Send a text notification to a user
   * @param {object} user User account object
   * @param {string} text Notification string
   * @returns
   */
  async sendTextNotification(user, text) {
    const [result] = await mysql.exec(
      `INSERT INTO general_notifications (
      text,
      unread
    ) VALUES (?, ?)`,
      [text, true]
    );
    if (!result || !result.insertId) {
      return {
        error: "There was an error adding your notification to the database",
        status: 500
      };
    }

    const [result2] = await mysql.exec(
      `INSERT INTO notifications (
        tableName,
        itemId,
        toEmail
      ) VALUES (?, ?, ?)`,
      ["general_notifications", result.insertId, user.email]
    );

    this.sendNotification(user.id, "text", result2.insertId);
  }
};
