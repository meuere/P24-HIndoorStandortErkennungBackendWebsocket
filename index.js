import { unlink } from "fs";

const port = process.PORT || 4001;

// List to store all active WebSocket connections
const clients = [];

const server = Bun.serve({
  port: port,
  websocket: {
    open(ws) {
      console.log('Client connected');
      clients.push(ws); // Add client to the list
    },

    message(ws, msg) {
      const receivedMessage = Buffer.from(msg).toString();
      if(msg[0] === "-"){
        processComand(msg)
      }
      ws.send("echo: "+ msg)
    },

    close(ws) {
      console.log('Client disconnected');
      // Remove the disconnected client from the list
      const index = clients.indexOf(ws);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    },

    perMessageDeflate: false,
  },

  fetch(req, server) {
    if (!server.upgrade(req)) {
      return new Response("Error");
    }
  },
});

console.log(`WebSocket server started on: http://${server.hostname}:${port}/`);

async function processComand(cmd){
//command -RoomID-CMD-DeviceID-
//                ADD
//                REM
let cmdparts = cmd.split("-")
cmdparts.forEach(part=>{
  console.log("part: "+part)
})
let change = {
  name: "",
  date: ""
}
change.name = cmdparts[3]
change.date = new Date().toISOString()    // get back with new Date(datestring)
if(cmdparts[2]==="ADD"){
await addToRoom(change, cmdparts[1])
}
else if(cmdparts[2]==="REM"){
  await remFromRoom(change, cmdparts[1])
}
}

async function addToRoom(change, room){
const roomname = "rooms/"+room + ".json"
let file = Bun.file(roomname)
let arr = []
console.log(file.size)
if(file.size == 0){
arr.push(change)
let jsonarr = JSON.stringify(arr)
Bun.write(roomname, jsonarr)
console.log(roomname + " has been created")
}
else{
  let oldfile = await file.text()
  arr = JSON.parse(oldfile)
  arr.push(change)
  let jsonarr = JSON.stringify(arr)
  Bun.write(roomname, jsonarr)
  console.log(roomname + " has been changed")
}
}

async function remFromRoom(change, room){
  const roomname = "rooms/"+room + ".json"
  let file = await Bun.file(roomname).text()
  let arr = JSON.parse(file)
  console.log(change)
  arr = arr.filter(obj => obj.name !== change.name)
  if(arr == []){
    await unlink(roomname)
  }
  else{
    console.log(arr)
    let jsonarr = JSON.stringify(arr)
    Bun.write(roomname, jsonarr)
    console.log(roomname + " has been changed")
  }
}