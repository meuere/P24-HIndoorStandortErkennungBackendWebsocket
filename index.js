const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const { unlinkSync, readFileSync, writeFileSync, existsSync } = require('fs');

const port = process.env.PORT || 3333;

const watchedDir = path.join(__dirname, 'rooms');

// List to store all active WebSocket connections
const clients = [];

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const fs = require('fs');

const wss = new WebSocket.Server({ noServer: true });

app.set('view engine', 'ejs');

const activeViews = {};

// Router

app.get('/', (req, res) => {
  const data = {
    title: 'Home Page',
    message: 'Welcome to the Home Page!',
};
    res.render('index', data);
});

app.get('/f', (req, res)=>{
  console.log(watchedDir);
  const files = [];
  res.render('fileView', {files});
})

app.get('/:filename', (req, res) => {
  let { filename } = req.params;
  const filePath = `rooms/${filename}.json`;


  if (!existsSync(filename)) {
    filename = "file not found"
    let arr = [];
    return;
  }
  else{
    let oldfile = readFileSync(filename, 'utf-8');
    let arr = JSON.parse(oldfile);
  }
  


  activeViews[filename] = null;

  data = {
    title: filename,
    array: arr,
  }

  res.render('fileView', { data });
});

app.use((req, res) => {
    res.status(404).sendFile('views/404.html', { root: __dirname });
});


// Live Uptdates

function watchForDataChange(callback) {
  let path = "rooms/Room1.json"
  const watcher = chokidar.watch(path);

  watcher.on('change', (path) => {
      const updatedData = {
          message: 'The JSON file has been updated!',
      };
      callback(updatedData);
  });
}

io.on('connection', (socket) => {
  console.log('Client connected');

  const watcher = chokidar.watch(watchedDir);

  watcher.on('add', file => {
     console.log(`File added: ${file}`);
     io.emit('fileChanged', { type: 'add', file: path.basename(file) });
  });

  watcher.on('unlink', file => {
     console.log(`File removed: ${file}`);
     io.emit('fileChanged', { type: 'unlink', file: path.basename(file) });
  });

  watcher.on('change', file => {
     console.log(`File changed: ${file}`);
     io.emit('fileChanged', { type: 'change', file: path.basename(file) });
  });

  socket.on('disconnect', () => {
     console.log('Client disconnected');
     watcher.close();
  });
});


// Websocket

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.push(ws);

    ws.on('message', async (msg) => {
        const receivedMessage = msg.toString();
        console.log(receivedMessage);
        if (receivedMessage[0] === "-") {
            await processCommand(receivedMessage, ws);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
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


server.listen(port, "0.0.0.0", () => {
    console.log(`Server started on: http://0.0.0.0:${port}/`);
});
async function processCommand(cmd, ws){
  //command -RoomID-CMD-DeviceID-
  //                ADD
  //                REM
  let cmdparts = cmd.split("-");
  cmdparts.forEach((part) => {
    console.log("part: " + part);
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
  } else if (cmdparts[2] == "REQ") {
    await reqFromRoom(cmdparts[1], ws);
  }
}

async function addToRoom(change, room) {
  const roomname = "rooms/" + room + ".json";
  let arr = [];

  if (!existsSync(roomname)) {
      arr.push(change);
      writeFileSync(roomname, JSON.stringify(arr));
      console.log(roomname + " has been created");
  } else {
      let oldfile = readFileSync(roomname, 'utf-8');
      arr = JSON.parse(oldfile);
      arr.push(change);
      writeFileSync(roomname, JSON.stringify(arr));
      console.log(roomname + " has been changed");
  }
}

async function remFromRoom(change, room) {
  const roomname = "rooms/" + room + ".json";
  if (!existsSync(roomname)) {
      console.log("Trying to Delete from non existant Room");
      return;
  }
  let oldfile = readFileSync(roomname, 'utf-8');
  let arr = JSON.parse(oldfile);
  console.log(change);
  arr = arr.filter((obj) => obj.name !== change.name);
  if (arr.length === 0) {
      unlinkSync(roomname);
  } else {
      console.log(arr);
      writeFileSync(roomname, JSON.stringify(arr));
      console.log(roomname + " has been changed");
  }
}

async function reqFromRoom(room, ws) {
  const roomname = "rooms/" + room + ".json";
  if (!existsSync(roomname)) {
      console.log("Request for non existant Room");
      ws.send("E: 404");
      return;
  }
  let fileContent = readFileSync(roomname, 'utf-8');
  ws.send(fileContent);
  console.log(fileContent);
}
