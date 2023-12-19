const express = require('express');
const router = express.Router();

// Assuming you'll need these imports for your route logic
const passport = require('passport');
const { existsSync, readFileSync } = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // For generating UUID
const { writeFile, readFile } = require('fs').promises; // For async operations with files


const watchedDir = path.join(__dirname, 'rooms');

router.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

function findUserByUuid(usersDatabase, uuid) {
    for (const id in usersDatabase) {
      if (usersDatabase[id].uuid === uuid) {
        return usersDatabase[id];
      }
    }
    return null; // or undefined, or however you want to handle a user not found
  }

async function ensureUserHasUUID(user, mode = "uuid") {
    let usersDatabase;

    try {
        const rawData = await readFile('./users.json', 'utf-8');
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
        await writeFile('./users.json', JSON.stringify(usersDatabase));
    }
    if (mode == "uuid"){
        return usersDatabase[id].uuid; // Return the UUID, either the new one or existing one
    }
    else{
        return usersDatabase[id];
    }
    
}




// Routes

router.get('/', (req, res) => {
    const data = {
        title: 'Home Page',
        message: 'Welcome to the Home Page!',
        user: req.user,
    };
    res.render('index', data);
});

router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile']
}));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/f' }),
async (req, res) => {
    if (req.user) {
        try {
            const userUUID = await ensureUserHasUUID(req.user);
            console.log(`UUID for user ${req.user.id} is ${userUUID}`);
        } catch (error) {
            console.error("Error ensuring user has UUID:", error);
        }
    }
    res.redirect('/f');
});


router.get('/f', (req, res) => {
    //console.log(watchedDir);
    const files = [];
    res.render('fileView', {files});
});

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Error during logout:", err);
            return res.redirect('/f');
        }
        req.session.destroy((err) => {
            if (err) {
                return res.redirect('/f');
            }
            res.redirect('/f');
        });
    });
});

router.get('/:filename', (req, res) => {
    let { filename } = req.params;
    const filePath = `rooms/${filename}.json`;

    let usersDatabase;

    try {
        const rawData = readFileSync('./users.json', 'utf-8');
        usersDatabase = JSON.parse(rawData);
    } catch (error) {
        usersDatabase = {}; // Start with an empty object if there's no file
    }

    let arr = [];

    if (!existsSync(filePath)) {
        filename = "file not found";
    } else {
        try {
            let oldfile = readFileSync(filePath, 'utf-8');
            arr = JSON.parse(oldfile);
        } catch (error) {
            // Handle JSON parsing error or other file-related errors here.
            console.error(error);
        }
    }
    arr.forEach(element => {
        element.name = findUserByUuid(usersDatabase, element.name);
        console.log(element.name);
    });

    const data = {
        title: filename,
        array: arr,
    }

    res.render('roomView', { data });
});

router.use((req, res) => {
    res.status(404).render('404', { root: __dirname });
});

module.exports = router;
