module.exports = async () => {
  await mysql.exec(`CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(20) UNIQUE NOT NULL,
    fullUsername VARCHAR(20) NOT NULL,
    avatarUrl TEXT,
    firstName VARCHAR(20) NOT NULL,
    lastName VARCHAR(20) NOT NULL,
    bio VARCHAR(128),
    socials TEXT,
    podcasts TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
    dob DATE
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS user_accounts (
    profileId INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR(32) UNIQUE NOT NULL,
    password VARCHAR(64) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    receiveEmails BOOLEAN NOT NULL,
    isEmailVerified BOOL
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS user_account_email_validations (
    profileId INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR(64) NOT NULL,
    id VARCHAR(16) NOT NULL
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS podcasts (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) UNIQUE NOT NULL,
    description VARCHAR(128) NOT NULL,
    urlName VARCHAR(64) UNIQUE NOT NULL,
    iconUrl TEXT,
    hosts TEXT
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS scheduled_podcast (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    podcastId INTEGER NOT NULL,
    name VARCHAR(64) NOT NULL,
    urlName VARCHAR(64) UNIQUE NOT NULL,
    screenshotUrl TEXT,
    hosts TEXT,
    guests TEXT,
    description VARCHAR(1024),
    visibility TINYINT,
    startTime BIGINT NOT NULL,
    endTime BIGINT NOT NULL,
    timeToAlert SMALLINT
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS email_list (
    email VARCHAR(32) PRIMARY KEY,
    timestamp INTEGER NOT NULL
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tableName VARCHAR(16) NOT NULL,
    itemId INTEGER UNIQUE NOT NULL,
    toUserEmail VARCHAR(32) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS general_notifications (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    text TEXT NOT NULL,
    unread BOOL NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    fromUserId INTEGER NOT NULL,
    role VARCHAR(8) NOT NULL,
    podcastId INTEGER,
    episodeId INTEGER,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
};
