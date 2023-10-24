const express = require('express');
const http = require('http');
const passport = require('passport');
const expressSession = require('express-session');
const routes = require('./routes');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
require('./passport-setup');

const port = process.env.PORT || 3333;

// ... [other initializations]

app.use(expressSession({
  secret: 'some-random-secret',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');

app.use(passport.initialize());
app.use(passport.session());

app.use(routes);
app.use(cors());

// Initialize websockets
require('./websockets')(server);

server.listen(port, "0.0.0.0", () => {
    console.log(`Server started on: http://0.0.0.0:${port}/`);
});

// TODO: add a timeout to clients in the rooms
