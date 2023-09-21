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
      console.log(`Received message: ${receivedMessage}`);
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

// Function to broadcast a message to all connected clients
function broadcastMessage(message) {
  for (const client of clients) {
    client.send(message);
  }
  console.log("Broadcast Compleated")
}

// As an example, let's broadcast a message to all clients after 10 seconds
setTimeout(() => {
  broadcastMessage("Hello to all connected clients!");
}, 10000);
