const { Server } = require('socket.io');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { readFileSync, writeFileSync, existsSync, unlinkSync } = require('fs');

const watchedDir = path.join(__dirname, 'rooms');
const clients = [];

const fs = require('fs');

module.exports = function (server) {
    const io = new Server(server);
    const wss = new WebSocket.Server({ noServer: true });

    // Live Updates with Socket.io
    io.on('connection', (socket) => {
        console.log('Client connected');

        const watcher = chokidar.watch(watchedDir);

        socket.on('viewFile', (filename) => {
            //console.log("fn:" +filename);
            socket.join(filename);
        });

        watcher.on('add', file => {
            //console.log(`File added: ${file}`);
            io.emit('fileChanged', { type: 'add', file: path.basename(file) });
        });

        watcher.on('unlink', file => {
            //console.log(`File removed: ${file}`);
            io.emit('fileChanged', { type: 'unlink', file: path.basename(file) });
        });

        watcher.on('change', file => {
            //console.log(`File changed: ${file}`);
            const filename = path.basename(file);
            let fileContent = [];
            try {
                fileContent = JSON.parse(fs.readFileSync(file, 'utf-8'));
                //console.log(fileContent);
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
            }
            //console.log("fn2:" + filename)
            io.to(filename).emit('fileChanged', { type: 'change', file: path.basename(file), content: fileContent });
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            watcher.close();
  });});

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
            //console.log('Client disconnected');
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
        } else {
            // If none matched, destroy the socket to prevent hanging
            socket.destroy();
        }
    });

    async function processCommand(cmd, ws){
        //command $RoomID$CMD$DeviceID$
        //                ADD
        //                REM
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
        }
      }
      
      async function addToRoom(change, room) {
        const roomname = "rooms/" + room + ".json";
        let arr = [];
      
        if (!existsSync(roomname)) {
            arr.push(change);
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
        if (arr.length === 0) {
            unlinkSync(roomname);
        } else {
            //console.log(arr);
            writeFileSync(roomname, JSON.stringify(arr));
            //console.log(roomname + " has been changed");
        }
      }
      
      function reqidforRoom(ws){
        const uuid = uuidv4();
        ws.send(uuid);
        return;
      }
      
      async function reqFromRoom(room, ws) {
        const roomname = "rooms/" + room + ".json";
        if (!existsSync(roomname)) {
            //console.log("Request for non existant Room");
            ws.send("E: 404");
            return;
        }
        let fileContent = readFileSync(roomname, 'utf-8');
        ws.send(fileContent);
        //console.log(fileContent);
      }
      
      const directoryPath = 'rooms/';
      const cutoffMilliseconds = 20 * 1000; 
      
      function isDateOlderThanCutoff(date) {
        const currentTime = new Date();
        return currentTime - date > cutoffMilliseconds;
      }
      
      function processJsonFile(filePath) {
        try {
          let fileData = readFileSync(filePath, 'utf8');
          let jsonArray = JSON.parse(fileData);
      
          jsonArray = jsonArray.filter(item => {
            const date = new Date(item.date);
            return !isDateOlderThanCutoff(date);
          });
      
          if(jsonArray.length == 0){
            unlinkSync(filePath);
          }
          else{
            writeFileSync(filePath, JSON.stringify(jsonArray, null, 2));
          }
        } catch (error) {
          console.error(`Error processing file ${filePath}: ${error.message}`);
        }
      }
      
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
      
      // Run the processing function every 30 seconds
      setInterval(processJsonFilesInDirectory, 10 * 1000);
}

// All utility functions related to WebSocket such as processCommand, addToRoom, etc. stay in this file.
