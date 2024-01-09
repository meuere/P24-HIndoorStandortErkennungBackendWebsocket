const express = require('express');
const http = require('http');
const passport = require('passport');
const expressSession = require('express-session');
const routes = require('./routes');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
require('./passport-setup');

const port = process.env.PORT || 80;

// Set up express session
app.use(expressSession({
  secret: 'some-random-secret',
  resave: false,
  saveUninitialized: true
}));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Set up routes
app.use(routes);

// Enable CORS
app.use(cors({
  origin: '*'
}));

// Initialize websockets
require('./websockets')(server);

// Start the server
server.listen(port, "0.0.0.0", () => {
    console.log(`Server started on: http://0.0.0.0:${port}/`);
});

