module.exports = () => {
  mysql.query(`CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(20) UNIQUE NOT NULL,
    avatarUrl TEXT,
    firstName VARCHAR(20) NOT NULL,
    lastName VARCHAR(20) NOT NULL,
    bio VARCHAR(128),
    socials TEXT,
    createdAt DATE default(CURRENT_DATE)
  )`);

  mysql.query(`CREATE TABLE IF NOT EXISTS user_accounts (
    profileId INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR(32) UNIQUE NOT NULL,
    receiveNotifications BOOLEAN NOT NULL
  )`);

  mysql.query(`CREATE TABLE IF NOT EXISTS podcasts (
    name VARCHAR(64) PRIMARY KEY NOT NULL,
    iconUrl TEXT,
    hosts TEXT
  )`);

  // TODO create unique tables for podcast_mypodcast_clips and podcast_mypodcast_episodes

  // TODO for each podcast create a seperate table for the corresponding comments

  // mysql.query(`CREATE TABLE IF NOT EXISTS comments (
  //   id INTEGER PRIMARY KEY AUTO_INCREMENT,
  //   text VARCHAR(256) NOT NULL,
  //   profileId INTEGER NOT NULL,
  //   createdAt DATE default(CURRENT_DATE)
  //   timestamp INTEGER
  // )`)

  mysql.query(`CREATE TABLE IF NOT EXISTS scheduled_podcast (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) NOT NULL,
    screenshotUrl TEXT,
    hosts TEXT,
    guests TEXT,
    description VARCHAR(1024),
    visibility TINYINT,
    timeToAlert SMALLINT
  )`);
};
