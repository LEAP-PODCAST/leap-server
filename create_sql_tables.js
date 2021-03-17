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
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS user_accounts (
    profileId INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR(32) UNIQUE NOT NULL,
    password VARCHAR(64) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    receiveNotifications BOOLEAN NOT NULL
  )`);

  await mysql.exec(`CREATE TABLE IF NOT EXISTS podcasts (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) UNIQUE NOT NULL,
    iconUrl TEXT,
    hosts TEXT
  )`);

  // TODO create unique tables for podcast_mypodcast_clips and podcast_mypodcast_episodes

  // TODO for each podcast create a seperate table for the corresponding comments

  // await mysql.exec(`CREATE TABLE IF NOT EXISTS comments (
  //   id INTEGER PRIMARY KEY AUTO_INCREMENT,
  //   text VARCHAR(256) NOT NULL,
  //   profileId INTEGER NOT NULL,
  //   createdAt TIMESTAMP NOT NULL DEFAULT NOW()
  //   timestamp INTEGER
  // )`)

  await mysql.exec(`CREATE TABLE IF NOT EXISTS scheduled_podcast (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    podcastId INTEGER NOT NULL,
    name VARCHAR(64) NOT NULL,
    screenshotUrl TEXT,
    hosts TEXT,
    guests TEXT,
    description VARCHAR(1024),
    visibility TINYINT,
    startTime BIGINT NOT NULL,
    endTime BIGINT NOT NULL,
    timeToAlert SMALLINT
  )`);
};
