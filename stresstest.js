const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wsUrl = 'ws://127.0.0.1:3333/ws';
const totalConnections = 10;
let uuid = ""
let errors = 0;

for (let i = 0; i < totalConnections; i++) {
    const ws = new WebSocket(wsUrl);

    ws.on('open', function open() {
        ws.send('$$RID');
    });

    ws.on('message', function incoming(data) {
        uuid = data;
        ws.send("$"+uuid + "$ADD$"+ uuidv4());
    });

    ws.on('error', function error(error) {
        errors++;
        console.log(errors);
        console.error('WebSocket error:', error);
    });
}
