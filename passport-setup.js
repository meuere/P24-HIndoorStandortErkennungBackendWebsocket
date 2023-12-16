const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20');

passport.use(new GoogleStrategy({
    clientID: '1019647243767-o1clrpj0qch69isj5lbg170k34enp7kv.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: 'http://localhost:3333/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
    // You can use the profile info (contained in `profile` parameter) to store the user in your DB.
    return done(null, profile);
}));

// Serialize and deserialize user for session management
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});
