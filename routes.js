const express = require('express');
const router = express.Router();


const passport = require('passport');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // For generating UUID
const multer = require('multer');
const cron = require('node-cron');


const uploadDestination = './files/';
const watchedDir = path.join(__dirname, 'rooms');
const pdfTimeoutTime = 24 * 60 * 60 * 1000;


const upload = multer({ dest: uploadDestination }); 

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
    try {
        const usersDatabase = JSON.parse(await fs.readFile('./users.json', 'utf-8'));

        const { id, displayName, name, photos, provider } = user;

        if (!usersDatabase[id]) {
            usersDatabase[id] = {
                id,
                displayName,
                name,
                photos,
                provider,
                uuid: uuidv4()
            };
            await fs.writeFile('./users.json', JSON.stringify(usersDatabase));
        }

        return (mode === "uuid") ? usersDatabase[id].uuid : usersDatabase[id];

    } catch (error) {
        console.error("Error ensuring user has UUID:", error);
        throw error; 
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

router.get('/:filename', async (req, res) => {
    const { filename } = req.params;
    const filePath = path.join('rooms', `${filename}.json`);

    try {
        const usersDatabase = JSON.parse(await fs.readFile('./users.json', 'utf-8'));

        const roomData = await fs.readFile(filePath, 'utf-8'); 
        const arr = JSON.parse(roomData);

        await Promise.all(arr.map(async (element) => {
            element.name = await findUserByUuid(usersDatabase, element.name);
        }));

        const data = {
            title: filename,
            array: arr,
        };

        res.render('roomView', { data });

    } catch (error) {
        if (error.code === 'ENOENT') { 
            res.render('roomView', {
                title: 'File not found',
                array: [], 
            });
        } else {
            console.error(error);
            res.status(500).send('Error loading room data');
        }
    }
});


router.get('/file/:room/:pdf', (req, res) => {
    const room = req.params.room;
    const pdfFilename = req.params.pdf;

    const filePath = path.join(__dirname, 'files', room, pdfFilename);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
            res.status(404).send('File not found');
        } else {
            res.setHeader('Content-Type', 'application/pdf');
            res.send(data);
        }
    });
});

router.get('/files/:room', (req, res) => {
    const directoryPath = path.join(__dirname, 'files', req.params.room);
  
    fs.readdir(directoryPath, (err, files) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Error reading directory' }); 
      } else {
        const fileNames = files.filter(file => !file.startsWith('.'));
        res.json(fileNames); 
      }
    });
  });




router.post('/uploadpdf', upload.single('pdfFile'), async (req, res) => {
    console.log("file received");
    if (!req.file) {
        res.status(400).send('No file uploaded.');
    } else {
        const originalName = req.file.originalname;
        const referrerUrl = req.body.referrerUrl || req.headers.referer || '/f'
        let urlparts = referrerUrl.split('/')
        let filePath = `rooms/${urlparts[urlparts.length - 1]}.json`;

        try {
           if (referrerUrl !== '/f') {
                if (!await fs.exists(filePath)) {
                    res.status(500).send('something went wrong')
                } 
            }

            const newFilePath = `${uploadDestination}${urlparts[urlparts.length-1]}/${originalName}`;
            fs.ensureDir(path.dirname(newFilePath))
            .then(() => {
                fs.move(req.file.path, newFilePath, (err) => {
                if (err) return console.error(err);
                console.log('File moved successfully!');
                });
            })
            .catch(err => console.error(err));

            res.redirect(referrerUrl);

        } catch (error) {
            console.error(error);
            res.status(500).send('Error saving file.'); 
        }

    }
});

cron.schedule('0 0 * * *', async () => {
    try {
        const files = await fs.readdir(uploadDestination);

        for (const file of files) {
            const filePath = path.join(uploadDestination, file);
            const stats = await fs.stat(filePath);

            const fileAgeInMs = Date.now() - stats.mtimeMs;
            if (fileAgeInMs > pdfTimeoutTime) {
                await fs.unlink(filePath);
                console.log('Deleted file:', filePath);
            }
        }
    } catch (err) {
        console.error('Error reading directory or deleting files:', err);
    }
});

router.use((req, res) => {
    res.status(404).render('404', { root: __dirname });
});

module.exports = router;
