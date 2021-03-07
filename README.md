# Leap Node.js Server

## Install

Note: This only runs on UNIX systems like Linux. It cannot run natively on Windows currently. To run on Windows 10, you will need to install WSL (Windows Subsystem for Linux) from the Microsoft Store or another method.

Install dependences (see below for Ubuntu commands)

- node version >= v10.0.0
- python version 2 or 3
- make
- gcc and g++ >= 4.9 or clang (with C++11 support)
- cc and c++ commands (symlinks) pointing to the corresponding gcc/g++ or clang/clang++ executables.

If you are on Ubuntu, run this command to install all requried dependenceies
`sudo apt-get install -y \ curl \ git \ python \ clang \ build-essential`

Install all packages
`sudo npm i`

Install nodemon globally (if not installed)
`sudo npm i -g nodemon`

Copy the `template.env` file and fill the .env with your info:
`cp template.env .env`

###Run a MySQL instance locally

`sudo apt update`
`sudo apt upgrade`
`sudo apt install mysql-server`
`sudo service mysql start`

Now open MySQL terminal:
`sudo mysql`

And run the following sql commands to create a local user
`CREATE USER 'demo_user'@'localhost' IDENTIFIED BY 'password';`
`GRANT ALL PRIVILEGES ON * . * TO 'demo_user'@'localhost';`
`FLUSH PRIVILEGES;`

Then create a database for the project
`CREATE DATABASE leap_dev;`

Exit the shell by pressing Ctrl + Z or Cmd + Z

Verify this worked correctly by trying to access mysql with the new user account
`mysql -u demo_user -p`
Enter the password 'password' when prompted

Exit the MySQL terminal and head back to the .env file. Edit the MySQL server section to look like this:

```
MYSQL_HOST=127.0.0.1
MYSQL_USER=demo_user
MYSQL_PASSWORD=password
MYSQL_DATABASE=leap_dev
MYSQL_PORT=3306
```

**Please note that if on Windows using WSL, you may need to run `sudo service mysql start` every time you re-open linux terminal**

### Run the app

Once the MySQL server is running and has been configured, add the MySQL instance information to the .env file.

To start the server, run:
`npm run serve`
_this will run the server in NODE_ENV=development mode and enable Mediasoup console debugging_

## Making changes

Make sure you have Prettier installed and configured properly so when you make changes to the code it auto-formats on save correctly according to the settings set in .prettierrc file

## Docs
