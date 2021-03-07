# Doice Node.js Server

## Install

Note: This only runs on UNIX systems like Linux. It cannot run on Windows currently. To run on Windows 10, you will need to install WSL (Windows Subsystem for Linux).

Install dependences

- node version >= v10.0.0
- python version 2 or 3
- make
- gcc and g++ >= 4.9 or clang (with C++11 support)
- cc and c++ commands (symlinks) pointing to the corresponding gcc/g++ or clang/clang++ executables.

If you are on Ubuntu, run this command to install all requried dependenceies
`sudo apt-get install -y \ curl \ git \ python \ clang \ build-essential`

Install all packages
`npm i`

Install nodemon globally (if not installed)
`npm i -g nodemon`

Copy the `template.env` file and fill the .env with your info:
`cp template.env .env`

Run a MySQL instance locally

- Follow this tutorial for help[https://www.digitalocean.com/community/tutorials/how-to-install-mysql-on-ubuntu-20-04](https://www.digitalocean.com/community/tutorials/how-to-install-mysql-on-ubuntu-20-04)

Once the server is running and has been configured, add the MySQL instance information to the .env file.

To start the server, run:
`node app.js` or `nodemon app.js`

## Making changes

Make sure you have Prettier installed and configured properly so when you make changes to the code it auto-formats on save correctly according to the settings set in .prettierrc file

##
