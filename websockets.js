const { Server } = require('socket.io');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { readFileSync, writeFileSync, existsSync, unlinkSync } = require('fs');

const watchedDir = path.join(__dirname, 'rooms');
const clients = [];
let phones = {};

const fs = require('fs');

/**
 * Ensures that a user has a UUID assigned in the users database.
 * If the user does not exist in the database, a new UUID is assigned and saved.
 * @param {Object} user - The user object containing id, displayName, name, photos, and provider.
 * @returns {string} - The UUID of the user.
 */
function ensureUserHasUUID(user) {
  let usersDatabase;
  try {
    const rawData = readFileSync('./users.json', 'utf-8');
    usersDatabase = JSON.parse(rawData);
  } catch (error) {
    usersDatabase = {}; // Start with an empty object if there's no file
  }

  // Extracting the necessary fields
  const { id, displayName, name, photos, provider } = user;

  // If the user is not in our "database", assign a UUID
  if (!usersDatabase[id]) {
    usersDatabase[id] = {
      id,
      displayName,
      name,
      photos,
      provider,
      uuid: uuidv4() // Assign a UUID
    };

    // Save the updated data back
    writeFileSync('./users.json', JSON.stringify(usersDatabase));
  }

  return usersDatabase[id].uuid; // Return the UUID, either the new one or existing one
}

/**
 * Finds a user in the users database by their UUID.
 * @param {Object} usersDatabase - The users database object.
 * @param {string} uuid - The UUID of the user to find.
 * @returns {Object|null} - The user object if found, null otherwise.
 */
function findUserByUuid(usersDatabase, uuid) {
  let foundUser = null;
  Object.values(usersDatabase).forEach(user => {
    if (user.uuid === uuid) {
      foundUser = user;
    }
  });
  return foundUser;
}

/**
 * Initializes the WebSocket and Socket.io servers.
 * @param {http.Server} server - The HTTP server instance.
 */
module.exports = function (server) {
  const io = new Server(server);
  const wss = new WebSocket.Server({ noServer: true });

  // Live Updates with Socket.io
  io.on('connection', (socket) => {
    console.log('Client connected');

    const watcher = chokidar.watch(watchedDir);

    /**
     * Joins a room based on the filename.
     * @param {string} filename - The name of the file representing the room.
     */
    socket.on('viewFile', (filename) => {
      socket.join(filename);
    });

    socket.on('changeMode', (mode, filename) => {
      if(fs.existsSync("rooms/"+filename)){
      let fileContent =  JSON.parse(fs.readFileSync("rooms/"+filename, 'utf-8'));
      fileContent[fileContent.length-1].mode = mode;
      console.log("change mode to " + fileContent[fileContent.length-1].mode);
      writeFileSync("rooms/"+filename, JSON.stringify(fileContent));
    }
    });

    watcher.on('add', file => {
      io.emit('fileChanged', { type: 'add', file: path.basename(file) });
    });

    watcher.on('unlink', file => {
      io.emit('fileChanged', { type: 'unlink', file: path.basename(file) });
    });

    watcher.on('change', file => {
      const filename = path.basename(file);
      let usersDatabase;

      try {
        const rawData = readFileSync('./users.json', 'utf-8');
        usersDatabase = JSON.parse(rawData);
      } catch (error) {
        console.error(`Error reading users database:`, error);
        usersDatabase = {}; // Start with an empty object if there's an error
      }
      let fileContent = [];

      try {
        fileContent = JSON.parse(fs.readFileSync(file, 'utf-8'));
        // Map each content to include displayName if the user is found
        fileContent = fileContent.map(content => {
          const user = findUserByUuid(usersDatabase, content.name);
          if (user && user.name) {
            if (user.name.givenName) {
              user.name = user.name.givenName + " " + user.name.familyName;
            }
            return { ...content, displayName: user.name };
          }
          return null;
        }).filter(content => content !== null); // Remove the null entries, keep only those with displayName

      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }

      io.to(filename).emit('fileChanged', {
        type: 'change',
        file: filename,
        content: fileContent // Now only contains elements with displayName
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
      watcher.close();
    });
  });

  // WebSocket
  wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.push(ws);

    ws.on('message', async (msg) => {
      const receivedMessage = msg.toString();
      console.log(receivedMessage);
      if (receivedMessage[0] === "$") {
        await processCommand(receivedMessage, ws);
      }
    });

    ws.on('close', () => {
      const index = clients.indexOf(ws);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    // Check which WebSocket service the request is intended for based on the URL
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (request.url.startsWith('/socket.io')) {
      // Handle Socket.io upgrade
    } else {
      // If none matched, destroy the socket to prevent hanging
      socket.destroy();
    }
  });

  /**
   * Processes a command received from a WebSocket client.
   * @param {string} cmd - The command string.
   * @param {WebSocket} ws - The WebSocket instance.
   */
  async function processCommand(cmd, ws) {
    let cmdparts = cmd.split("$");
    cmdparts.forEach((part) => {
      //console.log("part: " + part);
    });
    let change = {
      name: "",
      date: "",
    };
    change.name = cmdparts[3];
        change.date = new Date().toISOString(); // get back with new Date(datestring)
        if (cmdparts[2] === "ADD") {
          await addToRoom(change, cmdparts[1]);
        } else if (cmdparts[2] === "REM") {
          await remFromRoom(change, cmdparts[1]);
        } else if (cmdparts[2] === "REQ") {
          await reqFromRoom(cmdparts[1], ws);
        } else if (cmdparts[2] === "RID"){
          reqidforRoom(ws);
        } else if (cmdparts[2] == "LOGIN"){
          loginfromphone(ws, cmdparts[3]);
        }
    }
      
    /**
     * Adds a change object to a specified room.
     * If the room file does not exist, it creates a new file and adds the change object.
     * If the room file exists, it updates the change object if it already exists in the array, or adds it to the array.
     * @param {Object} change - The change object to be added or updated.
     * @param {string} room - The name of the room.
     * @returns {void}
     */
    async function addToRoom(change, room) {
        const roomname = "rooms/" + room + ".json";
        let arr = [];
      
        if (!existsSync(roomname)) {
            arr.push(change);
            arr.push(mode = {mode: "loud"})
            console.log(arr);
            writeFileSync(roomname, JSON.stringify(arr));
            //console.log(roomname + " has been created");
        } else {
            let oldfile = readFileSync(roomname, 'utf-8');
            arr = JSON.parse(oldfile);
            const index = arr.findIndex(item => item.name === change.name)
      
            if(index !== -1){
              arr[index].date = change.date;
            }
            else{
              arr.push(change);
            }
            writeFileSync(roomname, JSON.stringify(arr));
            //console.log(roomname + " has been changed");
        }
    }
      
    /**
     * Removes an object from a room.
     * @param {Object} change - The object to be removed from the room.
     * @param {string} room - The name of the room.
     * @returns {Promise<void>} - A promise that resolves when the object is removed from the room.
     */
    async function remFromRoom(change, room) {
        const roomname = "rooms/" + room + ".json";
        if (!existsSync(roomname)) {
            //console.log("Trying to Delete from non existant Room");
            return;
        }
        let oldfile = readFileSync(roomname, 'utf-8');
        let arr = JSON.parse(oldfile);
        //console.log(change);
        arr = arr.filter((obj) => obj.name !== change.name);
        if (arr.length === 1) {
            unlinkSync(roomname);
        } else {
            //console.log(arr);
            writeFileSync(roomname, JSON.stringify(arr));
            //console.log(roomname + " has been changed");
        }
    }
      
      /**
       * Generates a unique request ID for a WebSocket connection and sends it to the client.
       * @param {WebSocket} ws - The WebSocket connection.
       * @returns {void}
       */
      function reqidforRoom(ws){
        const uuid = uuidv4();
        ws.send(uuid);
        return;
      }
      
      /**
       * Reads the users database and retrieves the content of a specific room.
       * If the user is found in the database, their display name is included in the content.
       * Sends the size of the content to the WebSocket connection.
       * 
       * @param {string} room - The name of the room.
       * @param {WebSocket} ws - The WebSocket connection.
       */
      async function reqFromRoom(room, ws) {
        try {
          const rawData = readFileSync('./users.json', 'utf-8');
          usersDatabase = JSON.parse(rawData);
        } catch (error) {
          console.error(`Error reading users database:`, error);
          usersDatabase = {}; // Start with an empty object if there's an error
        }
        const roomname = "rooms/" + room + ".json";
        try {
              fileContent = JSON.parse(fs.readFileSync(roomname, 'utf-8'));
              // Map each content to include displayName if the user is found
              fileContent = fileContent.map(content => {
                  const user = findUserByUuid(usersDatabase, content.name);
                  if (user && user.name) {
                      if(user.name.givenName){
                        user.name = user.name.givenName + " " + user.name.familyName;
                      }
                      return { ...content, displayName: user.name };
                  }
                  return null;
              }).filter(content => content !== null); // Remove the null entries, keep only those with displayName
            ws.send("SIZE:"+fileContent.length)
            console.log(fileContent.length);
          } catch (error) {
            ws.send("SIZE:0")
          }
      }
      
      const directoryPath = 'rooms/';
      const cutoffMilliseconds = 30 * 1000; 
      
      /**
       * Checks if a given date is older than the cutoff time.
       * @param {Date} date - The date to compare.
       * @returns {boolean} - Returns true if the date is older than the cutoff time, otherwise false.
       */
      function isDateOlderThanCutoff(date) {
        const currentTime = new Date();
        return currentTime - date > cutoffMilliseconds;
      }
      
      /**
       * Process a JSON file by filtering out old dates and updating the file accordingly.
       * @param {string} filePath - The path to the JSON file.
       */
      function processJsonFile(filePath) {
        try {
            const fileData = readFileSync(filePath, 'utf8');
            let jsonArray = JSON.parse(fileData);
    
            jsonArray = jsonArray.filter(item => !isDateOlderThanCutoff(new Date(item.date)));
    
            const mode = jsonArray[jsonArray.length - 1]?.mode || 'loud';

    
            jsonArray.forEach(element => {
              console.log("phone:"+element.name)
                if (phones.hasOwnProperty(element.name)) {
                    console.log(element.name + `mode:${mode}`)
                    phones[element.name].send(`mode:${mode}`);
                }
            });
    
            if (jsonArray.length === 1) {
                unlinkSync(filePath);
            } else {
                writeFileSync(filePath, JSON.stringify(jsonArray, null, 2));
            }
        } catch (error) {
            console.error(`Error processing file ${filePath}: ${error.message}`);
        }
    }
      
      /**
       * Processes JSON files in a directory.
       */
      function processJsonFilesInDirectory() {
        fs.readdir(directoryPath, (err, files) => {
          if (err) {
            console.error(`Error reading directory: ${err}`);
            return;
          }
      
          files.forEach(file => {
            if (path.extname(file).toLowerCase() === '.json') {
              const filePath = path.join(directoryPath, file);
              processJsonFile(filePath);
            }
          });
        });
      }

      /**
       * Logs in a user from a phone and sends back a UUID.
       * @param {WebSocket} ws - The WebSocket connection.
       * @param {string} json - The JSON string containing user information.
       */
      function loginfromphone(ws, json){
        // check if ws is already in phones
        // if not, add it in cobmbination with uuid
          console.log(json);
          let user = JSON.parse(json);
          const uuid = ensureUserHasUUID(user);
          if(!phones.hasOwnProperty(uuid)){
            phones[uuid] = ws;
          }
          ws.send("uuid:"+uuid);
      }
      
      // Run the processing function every 10 seconds
      setInterval(processJsonFilesInDirectory, 10 * 1000);
}

// All utility functions related to WebSocket such as processCommand, addToRoom, etc. stay in this file.
