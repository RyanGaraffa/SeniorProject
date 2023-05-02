require('dotenv').config();
const express = require('express');

const bcrypt = require('bcryptjs');
const session = require('express-session');

const Database = require('dbcmps369');
const db = new Database();

const app = express();
app.use(express.urlencoded({ extended: true }));

//session stuff
app.use(session({
    secret: "cmps369",
    resave: false,
    saveUninitialized: true,
    cooke: { secure: false }
}))
app.use((req, res, next) => {
    if (req.session.user) {
        res.locals.user = {
            ID: req.session.user.ID,
            username: req.session.user.Username,
            FirstName: req.session.user.FirstName,
            LastName: req.session.user.LastName,
            Role: req.session.user.Role
        }
    }
    next()
})


app.set('view engine', 'pug');

/**/
/*
aysnc startup()

NAME

        async startup() - starts our app up.

SYNOPSIS

        async startup();
            No Params

DESCRIPTION

        This function will first initialize the database tables if they have not been 
        initalized already. It will then create an admin user if its not already there.
        Finally it will do ZGrade Calculations for all climbers and climbs in database
        (Makes sure we begin in a stable state).

RETURNS

        Returns nothing

*/
/**/
const startup = async () => {
    await db.connect();

    //USing below
    await db.schema('User', [
        { name: 'ID', type: 'INTEGER' },
        { name: 'FirstName', type: 'TEXT' },
        { name: 'LastName', type: 'TEXT' },
        { name: 'Bio', type: 'TEXT' },
        { name: 'Location', type: 'TEXT' },
        { name: 'ProfilePicture', type: 'TEXT' },
        { name: 'Username', type: 'TEXT' },
        { name: 'Password', type: 'TEXT' },
        { name: 'Height', type: 'INTEGER' },
        { name: 'Graded', type: 'INTEGER' }, //Will calculate a grade for climber
        { name: 'Role', tpye: 'TEXT' }
    ], 'id')

    //Problems
    await db.schema('Climb', [
        { name: 'ID', type: 'INTEGER' },
        { name: 'Name', type: 'TEXT' },
        { name: 'Grade', type: 'INTEGER' },
        { name: 'GradeCalculated', type: 'INTEGER' }, // Determine Soft or Stiff
        { name: 'LocationID', type: 'INTEGER' },
        { name: 'HeightAdv', type: 'INTEGER' },
        { name: 'Gimic', type: 'INTEGER' },
        { name: 'Quality', type: 'INTEGER' },
        { name: 'NumAscents', type: 'INTEGER' },
        { name: 'RecAscentID', type: 'INTEGER' },
    ], 'id')

    //Ascents of Problems
    await db.schema('Ascent', [
        { name: 'ID', type: 'INTEGER' },
        { name: 'ClimberID', type: 'INTEGER' },
        { name: 'ClimbID', type: 'INTEGER' },
        { name: 'NumAttempts', type: 'INTEGER' },
        { name: 'NumSessions', type: 'INTEGER' },
        { name: 'Notes', type: 'TEXT' },
        { name: 'Quality', type: 'INTEGER' },
        { name: 'GradeTaken', type: 'INTEGER' },
        { name: 'Date', type: 'BLOB' },
    ], 'id')

    //Climbing Locations
    await db.schema('Location', [
        { name: 'ID', type: 'INTEGER' },
        { name: 'Name', type: 'TEXT' },
        { name: 'Country', type: 'TEXT' },
        { name: 'AvgGrade', type: 'INTEGER' },
        { name: 'AvgQuality', type: 'INTEGER' },
        { name: 'NumClimbs', type: 'INTEGER' },
        { name: 'BestClimbID', type: 'INTEGER' },
        { name: 'Notes', type: 'TEXT' },
    ], 'id')    

    await db.schema('Attempt', [
        { name: 'ID', type: 'INTEGER' },
        { name: 'ClimberID', type: 'TEXT' },
        { name: 'ClimbID', type: 'TEXT' },
        { name: 'NumAttempts', type: 'INTEGER' },
        { name: 'Notes', type: 'TEXT' },
        { name: 'Date', type: 'BLOB' },
        { name: 'Quality', type: 'INTEGER' },
    ], 'id')    

    createAdmin();
    createData();
    await ZGradeCalcs();
}

/**/
/*
aysnc createAdmin()

NAME

        async createAdmin() - Creates admin User -> Chossman.

SYNOPSIS

        async createAdmin();
            no Params

DESCRIPTION

        This function will first check if our admin is al;ready in the database,
        then we if it is not, we shall then add admin to database

RETURNS

        Returns nothing

*/
/**/
const createAdmin = async () => {
    const admin = await user_lookup("chossman");

    //Hash password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('choss', salt);

    //Makes sure that we always start w admin choss user
    //If no user w proper username exists
    if (admin === undefined) {
        await db.create('User',
            [
                { column: 'id', value: -1 },
                { column: 'FirstName', value: "The" },
                { column: 'LastName', value: "Chossman" },
                { column: 'Username', value: "chossman" },
                { column: 'Password', value: hash },
                { column: 'Bio', value: "Chossy Bio Here" },
                { column: 'Location', value: "Northeast USA" },
                { column: 'ProfilePicture', value: "File path here, No implemented yet" },
                { column: 'Height', value: 179 },
                { column: 'Graded', value: 9 },
                { column: 'Role', value: 'ADMIN' },
            ]
        );
    }
    //if we have proper username but improper password at startup
    else if (bcrypt.compareSync(admin.Password, "choss") === 0) {
        await db.update('User',
            [{ column: 'Password', value: hash }],
            [{ column: 'Username', value: "chossman" }]
        );
    }
} 

//Will Initialize with a chunk of data
const createData = async () => {

}

/**/
/*
aysnc ZGradeCalcs()

NAME

        async ZGradeCalcs() - Does ZGrade Calculations on startup.

SYNOPSIS

        async ZGradeCalcs();
            no Params

DESCRIPTION

        This function will first read all of the climbs currently in the database,
        and then it will call appropriate function to calculate a zgrade for it.
        We will then update our databse with this information and then repeat
        for climbers. Run into some bugs here but should be fixed. everything is 
        in a try catch which is sometimes caught and then barely handled.

RETURNS

        Returns nothing

*/
/**/
const ZGradeCalcs = async () => {
    try {
        let climbs = await db.read('Climb', []);
        for (climb of climbs) {
            const ZG = await calculateZGradeClimb(climb);
            console.log("About to Update climb: " + climb.ID + " with ZGrade: " + ZG.ZGrade);
            /*await db.update('Climb',
                [{ column: 'GradeCalculated', value: ZG.ZGrade }],
                [{ column: 'ID', value: climb.ID }]
            );*/
            console.log("Updated climb: " + climb.ID);
        }
    }
    catch {
        console.log("Error in Startup, issue calculating ZGrades for Climbs");
    }

    try {
        let climbers = await db.read('User', []);
        for (climber of climbers) {
            const ZG = await calculateZGradeClimber(climber);
            console.log("About to Update user: " + climber.ID + " with ZGrade: " + ZG.ZGrade);
            await db.update('User',
                [{ column: 'Graded', value: ZG.ZGrade }],
                [{ column: 'ID', value: climber.ID }]
            ); 
            console.log("Updated user: " + climber.ID);
        }
    }
    catch {
        console.log("Error in Startup, issue calculating ZGrades for Climbers");
    }

}

startup();

/**/
/*
aysnc start()

NAME

        async start() - Renders Homepage

SYNOPSIS

        async start(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will first read ascents from the database. We will
        then read specific information about the ascent such as the connected
        climb, climber, and location. We will update each ascent to hold extra
        information in a temporary way (Ascent info is not updated in DB but
        buil onto to be passed to pug). We then Render the home page with the 
        read ascents.

RETURNS

        Returns nothing

*/
/**/
const start = async (req, res) => {

    let ascents = await db.read('Ascent', []);
    //Subsitute some data to display home easily
    for (let ascent of ascents) {
        const climb = await db.read('Climb', [{ column: 'ID', value: ascent.ClimbID }]);
        const climber = await db.read('User', [{ column: 'ID', value: ascent.ClimberID }]);
        const loc = await db.read('Location', [{ column: 'ID', value: climb[0].LocationID }]);

        //Error Check
        if (climb.length < 1) {
            console.log("Error in Home -> no Climb ID Found for Ascent: " + ascent.ID);
            console.log("Will not display Ascent: " + ascent.ID);
            continue;
        }
        if (climber.length < 1) {
            console.log("Error in Home -> no Climber ID Found for Ascent: " + ascent.ID);
            console.log("Will not display Ascent: " + ascent.ID);
            continue;
        }
        if (loc.length < 1) {
            console.log("Error in Home -> no Location ID Found for Ascent: " + ascent.ID);
            console.log("Will not display Ascent: " + ascent.ID);
            continue;
        }

        ascent.Grade = climb[0].Grade;
        ascent.Location = loc[0].Name;
        ascent.LocationID = loc[0].ID;
        ascent.ClimbName = climb[0].Name;
        ascent.ClimberID = climber[0].FirstName + " " + climber[0].LastName;
    }

    res.render('home', { ascents: ascents }); 
    return;

}


/**/
/*
aysnc signout()

NAME

        async signout() - signs a user out

SYNOPSIS

        async signout(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will reset the session user and then redirect home

RETURNS

        Returns nothing

*/
/**/
const signout = async (req, res) => {
    req.session.user = undefined;
    res.redirect('/');
}

/**/
/*
aysnc login()

NAME

        async login() - Handles users trying to log in

SYNOPSIS

        async login(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will first determine if we are trying to render our login
        page or attempt to login. If we are trying to log in, we will first see
        if the username given is in our database, if not we will return 'invalid
        username' response. If it is, we will then check the password for given 
        username and determine validity. If everything checks out, our user will
        be logged in and redirected to the home page

RETURNS

        Returns nothing

*/
/**/
const login = async (req, res) => {

    //Should show page on page load
    if (req.body.username === undefined) {
        res.render('login', {});
        return;
    }

    const curr_user = await user_lookup(req.body.username);
    

    if (!curr_user) {
        res.render('login', { msg: "Invalid username" }); 
        return;
    }

    //checks password
    if (bcrypt.compareSync(req.body.password.trim(), curr_user.Password)) {
        //Valid User
        req.session.user = curr_user; // new
        console.log("session username: " + req.session.user.username);
        res.redirect('/');
        return;
    }

    //Invalid login
    else {
        res.render('login', { msg: "Incorrect Password" });
    }
}

/**/
/*
aysnc login()

NAME

        async user_lookup() - Looks up a user by username

SYNOPSIS

        async user_lookup(username);
            username - username of desired account 

DESCRIPTION

        This function will act as a cleaner line of code to 
        look up a user by their username

RETURNS

        Returns undefined if invalid username,
        Returns the user if valid.

*/
/**/
const user_lookup = async (username) => {
    const users = await db.read('User', [{ column: 'Username', value: username }]);
    if (users.length > 0) return users[0];
    else {
        return undefined;
    }
}

/**/
/*
aysnc login()

NAME

        async climbLookup() - Looks up a climb by its name

SYNOPSIS

        async climbLookup(climbName);
            climbName - name of desired Climb 

DESCRIPTION

        This function will act as a cleaner line of code to 
        look up a climb by its name

RETURNS

        Returns undefined if invalid name,
        Returns the climb if valid.

*/
/**/
const climbLookup = async (climbName) => {
    const climbs = await db.read('Climb', [{ column: 'Name', value: climbName }]);
    if (climbs.length > 0) return climbs[0];
    else {
        return undefined;
    }
}

/**/
/*
aysnc signup()

NAME

        async signup() - Handles Sign up functioanlity

SYNOPSIS

        async signup(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle all sign up functionality. First it will
        see if someone if trying to access the page, in which is will render 
        the appropriate page. Then, if someone fills out our signup form, we
        can then read their information from there and create a new user.
        We also do some password checking and form data checking. Upon signing
        up, we redirect to login page

RETURNS

        Returns nothing

*/
/**/
const signup = async (req, res) => {

    //Should show page on page load
    if (req.body.firstName === undefined) {
        res.render('signup', {countries: await countries()});
        return;
    }

    //Make sure unique username
    if (await user_lookup(req.body.username)) {
        res.render('signup', { countries: await countries() , msg: "Username already taken"});
        return;
    }

    //Make sure passwords match
    if (req.body.password !== req.body.password2) {
        res.render('signup', { countries: await countries(), msg: "Passwords do not Match" });
        return;
    }

    //Make Sure Country Was Selected
    if (req.body.country == "Select Country") {
        res.render('signup', { countries: await countries(), msg: "Please Select a Country" });
        return;
    }

    //hash password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(req.body.password, salt);

    //Bio is not required so we will fill NULL value
    let bio;
    if (req.body.bio == undefined) {
        bio = "N/A";
    }
    else {
        bio = req.body.bio;
    }

    //Will run if form is submitted
    await db.create('User',
        [
            { column: 'id', value: req.body.id },
            { column: 'FirstName', value: req.body.firstName },
            { column: 'LastName', value: req.body.lastName },
            { column: 'Height', value: req.body.height },
            { column: 'Location', value: req.body.country },
            { column: 'Bio', value: bio },
            { column: 'Username', value: req.body.username },
            { column: 'Password', value: hash },
            { column: 'Role', value: "Member" },
        ]
    );

    console.log(req.body.firstName);

    res.redirect('/login');
}

/**/
/*
aysnc profile()

NAME

        async profile() - Loads up page with profile info

SYNOPSIS

        async profile(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will render the profile page for a user or redirect
        to the profileUpdate function if we have a post request.

RETURNS

        Returns nothing

*/
/**/
const profile = async (req, res) => {
    const c = await countries();

    //Submitting to profile
    if (req.method == "POST") {
        await profileUpdate(req, res);
        return;
    }

    if (req.session.user) {
        const currUser = await db.read('User', [{ column: 'ID', value: req.session.user.ID }]);
        res.render('profile', { user: currUser[0], countries: c });
        return;
    }
    else {
        res.render('profile', { countries: c });
        return;
    }
}

/**/
/*
aysnc profileUpdate()

NAME

        async profileUpdate() - Updates profile info for User

SYNOPSIS

        async profileUpdate(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will update the info for a user in the database
        and then redirect back to the profile page, if something goes
        wrong, we redirect home

RETURNS

        Returns nothing

*/
/**/
const profileUpdate = async (req, res) => {
    
    if (req.session.user) {
        let currUser = await db.read('User', [{ column: 'ID', value: req.session.user.ID }]);

        //Do the Updating of INFO
        await db.update('User',
            [{ column: 'FirstName', value: req.body.firstName }],
            [{ column: 'ID', value: req.session.user.ID }]
        );
        await db.update('User',
            [{ column: 'LastName', value: req.body.lastName }],
            [{ column: 'ID', value: req.session.user.ID }]
        );
        await db.update('User',
            [{ column: 'Bio', value: req.body.bio }],
            [{ column: 'ID', value: req.session.user.ID }]
        );

        if (req.body.country != "Select Country") {
            await db.update('User',
                [{ column: 'Location', value: req.body.country }],
                [{ column: 'ID', value: req.session.user.ID }]
            );
        }
        /*
        await db.update('User',
            [{ column: 'ProfilePicture', value: req.body.picture }],
            [{ column: 'ID', value: req.session.user.ID }]
        );
        */
        await db.update('User',
            [{ column: 'Height', value: req.body.height }],
            [{ column: 'ID', value: req.session.user.ID }]
        );
        await db.update('User',
            [{ column: 'Username', value: req.body.username }],
            [{ column: 'ID', value: req.session.user.ID }]
        );


        const c = await countries();
        currUser = await db.read('User', [{ column: 'ID', value: req.session.user.ID }]);
        req.session.user = currUser[0];
        res.render('profile', { user: currUser[0], countries: c, msg: "Profile info has been updated"});
        return;
    }
    else {
        res.redirect('/');
        return;
    }

}

/**/
/*
aysnc logAscent()

NAME

        async logAscent() - Logs an Ascent to the Database

SYNOPSIS

        async logAscent(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the log Ascent page. First we Error
        check to see if we made it to this page in some strange way.
        We make sure we have a valid climb Id in URL and a valid user
        Next, we determine if someone is coming to the page, in which 
        we just render the page. Finally if someone is trying to log an
        Ascent, we do that for them. Logging an Ascent will get rid of
        other ascents of the same user on the same climb, and attempts
        of the same climb by the same user.

    Note: This Should Probably be broken down into a few seperate functions.
    Note: Weird bug where if I did not pass an ascent, the program would find 
    an ascent of the climb from a different user. or just make one up?

RETURNS

        Returns nothing

*/
/**/
const logAscent = async (req, res) => {

    //Error
    if (req.params.ClimbID === undefined) {
        console.log("No Climb to Log");
        res.redirect('/locations');
        return;
    }

    //Error Check for no User -> On refresh
    if (req.session.user == undefined) {
        console.log("Error in Log Ascent, no User");
        res.redirect('/locations');
        return;
    }

    //Check if Climb is Valid
    const currClimb = await db.read('Climb', [{ column: 'ID', value: req.params.ClimbID }]);
    if (currClimb === undefined) {
        //Could pass more data back here to user doesnt have to retype all data
        res.render('/', { msg: "Climb not recognized in Log Ascent, Redirected Home" });
        return;
    }

    //Make sure users cannot log ascents in future
    const today = await getToday();

    //On load up
    if (req.body.numAttempts === undefined) {
        console.log("Rendering Log Ascent");

        //Check if User already has a logged ascent
        const ascents = await db.read('Ascent', [{ column: 'ClimberID', value: req.session.user.ID}]);
        for (a of ascents) {
            /*Debugging
            console.log(a);
            console.log(req.params.ClimbID);
            */
            if(a.ClimbID == req.params.ClimbID) { //Updated
                //This Climber has logged an Ascent of this climb already
                res.render('logAscent', {
                    climb: currClimb[0],
                    ascent: a,
                    today: today
                });
                return;
            }
        }

        res.render('logAscent', {
            climb: currClimb[0],
            today: today,
            ascent: null
        });
        return;
    }

    //Code Below runs when we have a post Request and we are logging an ascent

    //Check for Attempt Object! If so Delete it
    try {
        //Gather all attempts logged from climber
        const attempts = await db.read('Attempt', [{ column: 'ClimberID', value: req.session.user.ID }]);
        //Sort through attempts to see if for same climb
        for (a of attempts) {
            console.log(a.ID);
            //If we are logging an ascent for an attempted climb, We will delete our attempt object
            if (a.ClimbID == currClimb[0].ID) {
                
                await db.delete('Attempt',
                    [{ column: 'ID', value: a.ID }]
                );
            }
        }
        console.log("Should have deleted any attempts if they existed for climb: " + currClimb[0].ID);
    }
    catch {
        console.log("Error Trying to search and destroy attempts for this climb: " + currClimb[0].ID);
    }

    //Check for Ascent Object! If so Delete it
    try {
        //Gather all attempts logged from climber
        const ascents = await db.read('Ascent', [{ column: 'ClimberID', value: req.session.user.ID }]);
        //Sort through ascents to see if for same climb
        for (a of ascents) {
            console.log("Ascent ID: " + a.ID);
            //If we are logging repeated ascent
            if (a.ClimbID == currClimb[0].ID) {
                await db.delete('Ascent',
                    [{ column: 'ID', value: a.ID }]
                );
            }
        }
        console.log("Should have deleted any ascents if they existed for climb: " + currClimb[0].ID);

        await fixClimb(currClimb[0].ID);
    }
    catch {
        console.log("Error Trying to search and destroy attempts for this climb: " + currClimb[0].ID);
    }

    const aID = await db.create('Ascent',
        [
            { column: 'ID', value: req.body.id },
            { column: 'ClimberID', value: req.session.user.ID },
            { column: 'ClimbID', value: currClimb[0].ID },
            { column: 'NumAttempts', value: req.body.numAttempts },
            { column: 'NumSessions', value: req.body.numSessions },
            { column: 'Notes', value: req.body.notes },
            { column: 'Quality', value: req.body.quality },
            { column: 'GradeTaken', value: req.body.gradeTaken },
            { column: 'Date', value: req.body.date },
        ]
    );

    //Call some async functions to update climb info
    await updateClimb(currClimb[0].ID, aID);

    res.render('logAscent', {
        climb: currClimb[0],
        ascent: null,
        msg: "Ascent of: " + currClimb[0].Name + " was added successfully",
        today: today
    });
    return;
}

/**/
/*
aysnc logAttempt()

NAME

        async logAttempt() - Logs an Attempt to the Database

SYNOPSIS

        async logAttempt(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the log Attempt page. First we Error
        check to see if we made it to this page in some strange way.
        We make sure we have a valid climb Id in URL and a valid user
        Next, we determine if someone is coming to the page, in which 
        we just render the page. Finally if someone is trying to log an
        Attempt, we do that for them. Logging an Attempt will not get
        rid of other attempt objects. But will be invalidated if you 
        have an ascent logged for the same climb

    Note: This Should Probably be broken down into a few seperate functions.

RETURNS

        Returns nothing

*/
/**/
const logAttempt = async (req, res) => {

    //Error
    if (req.params.ClimbID === undefined) {
        console.log("No Climb to Log");
        res.redirect('/locations');
        return;
    }

    //Error Check for no User -> On refresh
    if (req.session.user == undefined) {
        console.log("Error in Log Attempt, no User");
        res.redirect('/locations');
        return;
    }

    //Check if Climb is Valid
    const currClimb = await db.read('Climb', [{ column: 'ID', value: req.params.ClimbID }]);
    if (currClimb === undefined) {
        //Could pass more data back here to user doesnt have to retype all data
        res.render('logAttempt', { climb: currClimb[0], msg: "Climb not recognized" });
        return;
    }

    //On load up
    if (req.body.numAttempts === undefined) {
        console.log("Rendering Log Ascent");
        res.render('logAttempt', { climb: currClimb[0] });
        return;
    }

    //Check for repeated Ascent object?
    const ascents = await db.read('Ascent', [{ column: 'ClimbID', value: req.params.ClimbID }]);
    for (ascent of ascents) {
        if (ascent.ClimberID == req.session.user.ID) {
            //Invalid Attempt Log
            console.log("User:  " + req.session.user.ID + "  cannot log an attempt for a climb they have an ascent logged for...");
            res.render('logAttempt', { climb: currClimb[0], msg: "Attempt of: " + currClimb[0].Name + " Failed: Previous ascent found" });
            return;

        }
    }


    const aID = await db.create('Attempt',
        [
            { column: 'ID', value: req.body.id },
            { column: 'ClimberID', value: req.session.user.ID },
            { column: 'ClimbID', value: currClimb[0].ID },
            { column: 'NumAttempts', value: req.body.numAttempts },
            { column: 'Notes', value: req.body.notes },
            { column: 'Quality', value: req.body.quality },
            { column: 'Date', value: req.body.date },
        ]
    );

    //Call some async functions to update climb info

    res.render('logAttempt', { climb: currClimb[0], msg: "Attempt of: " + currClimb[0].Name + " was added successfully" });
    return;
}

/**/
/*
aysnc addClimb()

NAME

        async addClimb() - Adds a Brand New Climb to Database

SYNOPSIS

        async addClimb(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add Climb page. First We must have
        a location ID in our URL to properly work so we check for that. 
        Then, we collect our location info from database and pass that to
        our page if we are handling a GET. Else, we are handling a POST and
        We will add a climb to the Database.

RETURNS

        Returns nothing

*/
/**/
const addClimb = async (req, res) => {

    //Should show page on page load
    if (req.body.climbName === undefined) {
        if (req.params.ID === undefined) {
            res.render('addClimb', {});
            return;
        } 
        //If coming from locationPage

        else {
            const location = await db.read('Location', [{ column: 'ID', value: req.params.ID }]);
            res.render('addClimb', {location: location[0] });
            return;
        }

    }

    //Check for Duplicate Climbs


    //Add climb data to database
    await db.create('Climb',
        [
            { column: 'ID', value: req.body.id },
            { column: 'Name', value: req.body.climbName },
            { column: 'LocationID', value: req.body.locationID },
            { column: 'Grade', value: req.body.grade },
            { column: 'HeightAdv', value: 0 },
            { column: 'Gimic', value: 0 },
            { column: 'Quality', value: 0 },
            { column: 'GradeCalculated', value: 0 },
        ]
    );

    res.redirect('/locations/'+req.params.ID);
    return;
}

/**/
/*
aysnc addLocation()

NAME

        async addLocation() - Adds a Brand New Location to Database

SYNOPSIS

        async addLocation(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add Location page. First We must collect 
        the country information to pass along. Then for GET req, we load the
        page passing the country information through. For POST req, we first
        check for a duplicate name in the same Country. We will not allow 
        duplicates. Otherwise we add our location to the database based off
        the post req data and redirect back to the empty page with a success
        message

RETURNS

        Returns nothing

*/
/**/
const addLocation = async (req, res) => {

    //Initialize countries
    const c = await countries();

    //On Page Load
    if (req.body.locationName === undefined) {
        res.render('addLocation', { countries: c });
        return;
    }

    //Check for duplicate
    try {
        const loc = await db.read('Location', [{ column: 'Name', value: req.body.locationName }]);

        if (loc) {
            if (loc[0].Country === req.body.country) {
                res.render('addLocation', { countries: c, msg: 'Failed to add location, already exists' });
                return;
            }
        }
    }
    catch {
        console.log("Error in Add Location");
    }

    //Add climb data to database
    await db.create('Location',
        [
            { column: 'ID', value: req.body.id },
            { column: 'Name', value: req.body.locationName },
            { column: 'Country', value: req.body.country },
            { column: 'Notes', value: req.body.notes },
        ]
    );

    res.render('addLocation', { countries: c, msg: "Location: " + req.body.locationName + " was added successfully" });
    return;
}

/**/
/*
aysnc updateClimb()

NAME

        async updateClimb() - Updates a climb with Number of Ascents and RecAscentID

SYNOPSIS

        async updateClimb(climbID, ascentID);
            climbID - holds the climbID of the climb we want to update
            ascentID - holds the ascent ID of the ascent just logged
                (Goal with ascent ID is to just compare current info
                to most recent ascent logged to save computation)

DESCRIPTION

        This function will first do some Error Checking making sure IDs are
        valid. Then we will update the NumAscents on the climb. We then do
        some comparisions to retrieve the most recAscent information and then
        we update the database. We have lots of try catches to find the most
        recent ascent but the code works and catches errors that prevent us
        from crashing!

RETURNS

        Returns nothing

*/
/**/
const updateClimb = async (climbID, ascentID) => {

    console.log("Update Climb func -> climbID: " + climbID + "      AscentID: " + ascentID);
    const ascents = await db.read('Ascent', [{ column: 'ClimbID', value: climbID }]);
    const climb = await db.read('Climb', [{ column: 'ID', value: climbID }]);

    //Error Check
    if (ascents.length < 1) {
        console.log("Update Climb: " + climbID + " Failed, unable to read ascents");
        return;
    }
    if (climb.length < 1) {
        console.log("Update Climb: " + climbID + " Failed, unable to read climb");
        return;
    }

    console.log("Ascents.length: "+ ascents.length);

    //Updates number of ascents on a climb
    await db.update('Climb',
        [{ column: 'NumAscents', value: ascents.length }],
        [{ column: 'ID', value: climbID }]
    );

    //Finds the most recent ascent and updates it
    //Check if only a single ascent
    if (Number(ascents.length) === 1) {
        await db.update('Climb',
            [{ column: 'RecAscentID', value: ascents[0].ID }],
            [{ column: 'ID', value: climbID }]
        );

        console.log("Climb: " + climb[0].Name + " is updated properly");
        return;
    }

    //Error Check
    console.log("RecAsc: " + climb[0].RecAscentID);
    if (ascents.length > 1 && (climb[0].RecAscentID === undefined || climb[0].RecAscentID === null)) {
        console.log("Error in Data -> invalid RecAscent State");
        //Add function to find the most recent Ascent
        console.log("Function to fix error will be added, for now, logged ascent will be the data");
        const currAscent = await db.read('Ascent', [{ column: 'ID', value: ascentID }]);
        await db.update('Climb',
            [{ column: 'RecAscentID', value: currAscent[0].ID }],
            [{ column: 'ID', value: climbID }]
        );
        return;
    }

    let currAscent;
    let currAscentDate;
    try {
        currAscent = await db.read('Ascent', [{ column: 'ID', value: ascentID }]);
        currAscentDate = await readDate(currAscent[0].Date);
    }
    catch {
        console.log("Error Reading the current recent ascent of climb: " + climb[0].ID);
        return;
    }

    let recAscent;
    let recAscentDate;
    try {
        recAscent = await db.read('Ascent', [{ column: 'ID', value: climb[0].RecAscentID }]);
        recAscentDate = await readDate(recAscent[0].Date);
    }
    catch {
        console.log("Error Reading the most recent ascent of climb: " + climb[0].ID + "   ->    Ascent was probably overwritten");
        recAscentDate = "0001-01-01";
    }

    console.log("currAD: " + currAscentDate.month + "/" + currAscentDate.day + "/" + currAscentDate.year);
    console.log("recAD: " + recAscentDate.month + "/" + recAscentDate.day + "/" + recAscentDate.year);

    //Compares most recent input with current most recent
    //updated w seperate function have to test
    if (await findRecentAscent(currAscentDate, recAscentDate)) {
        console.log("updating climb's recAscentID");
        await db.update('Climb',
            [{ column: 'RecAscentID', value: ascentID }],
            [{ column: 'ID', value: climbID }]
        );
    }

    console.log("Climb: " + climb[0].Name + " is updated properly");
    return;
}

/**/
/*
aysnc fixClimb()

NAME

        async fixClimb() - This function will only be called after deleting ascents

SYNOPSIS

        async fixClimb(climbID);
            climbID - holds the climbID of the climb we want to fix


DESCRIPTION

        This function will only be called after deleting ascents.
        it will make sure NumAscents and RecAscentID are in check. 
        First fixing NumAscents is easy, and then we go through 
        and compare recent ascent date to find the most recent
        ascent. Finally we update the database. This is also
        checked again after this function is called.

RETURNS

        Returns nothing

*/
/**/
const fixClimb = async (climbID) => {
    //Num Ascents will be fixed in update climb
    //We only need to provide a valid ascent ID to our climb here
    //This avoids a climb holding an invalid ascentID

    const currClimb = await db.read('Climb', [{ column: 'ID', value: climbID }]);    
    const ascents = await db.read('Ascent', [{ column: 'ClimbID', value: climbID }]);

    let recAscentDate = await readDate("0001-01-01")
    let recAscentID = -1;
    for (a of ascents) {
        let currDate = await readDate(a.Date);
        if ( await findRecentAscent(currDate, recAscentDate) ) {
            recAscentDate = currDate;
            recAscentID = a.ID;
        }
    }

    await db.update('Climb',
        [{ column: 'RecAscentID', value: recAscentID }],
        [{ column: 'ID', value: climbID }]
    );

}

/**/
/*
aysnc findRecentAscent()

NAME

        async findRecentAscent() - Compares Ascents to find most recent

SYNOPSIS

        async findRecentAscent(a, b);
            a - first ascent date  (In Date object Form)
            b - second ascent date (In Date object Form)


DESCRIPTION

        This function will compare two dates, and return true if a
        is the most recent of the two. Our date Objects here have 
        the form {year: 12, month: 4, day: 21}

RETURNS

        True if a is more recent
        False if b is more recent

*/
/**/
const findRecentAscent = async (a, b) => {
    if (Number(a.year) >= Number(b.year)) {
        if (Number(a.year) > Number(b.year)) {
            return true;
        }    
        else if (Number(a.month) >= Number(b.month)) {
            if (Number(a.month) > Number(b.month)) {
                return true;
            }
            else if (Number(a.day) > Number(b.day)) {
                return true;
            }
        }
    }
    return false;
}

/**/
/*
aysnc updateLocation()

NAME

        async updateLocation() - Will update a location

SYNOPSIS

        async updateLocation(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle our update location page. Here we just
        keep track of the notes for each location. Here people can put
        information on things like guidebooks, directions, and parking.

RETURNS

        Returns nothing

*/
/**/
const updateLocation = async (req, res) => {
    let location = await db.read('Location', [{ column: 'ID', value: req.params.ID }]);
    if (location.length != 1) {
        console.log("Error Reading Current Location in UpdateLocation, Redirecting Home");
        res.redirect('/');
        return;
    }

    if (req.method == "POST") {
        //We are trying to update the notes

        //take note of the user
        const notes = req.body.notes;

        try {
            await db.update('Location',
                [{ column: 'Notes', value: notes }],
                [{ column: 'ID', value: req.params.ID }]
            );
            await db.update('Location',
                [{ column: 'LastEditor', value: req.session.user.ID }],
                [{ column: 'ID', value: req.params.ID }]
            );
            const lastEditor = await db.read('User', [{ column: 'ID', value: location[0].LastEditor }]);
            //const lastEditor = { FirstName: req.session.user.FirstName, LastName: req.session.user.LastName };
            location = await db.read('Location', [{ column: 'ID', value: req.params.ID }]);
            res.render('updateLocation',
                {
                    location: location[0],
                    notes: location[0].Notes,
                    lastEditor: lastEditor[0],
                    msg: "Location notes updated successfully"
                });
            return;
        }
        catch {
            console.log("Error in Update Location -> might render incorrectly");
            const lastEditor = await db.read('User', [{ column: 'ID', value: location[0].LastEditor }]);
            res.render('updateLocation',
                {
                    location: location[0],
                    notes: location[0].Notes,
                    lastEditor: lastEditor[0],
                    msg: "Location notes update failed, reason unknown"
                });
            return;
        }
        
    }

    const lastEditor = await db.read('User', [{ column: 'ID', value: location[0].LastEditor }]);
    res.render('updateLocation',
        {
            location: location[0],
            notes: location[0].Notes,
            lastEditor: lastEditor[0],
            msg: "You will (hopefully) see a success message here after updating!"
        });
    return;
}

/**/
/*
aysnc getToday()

NAME

        async getToday() - returns a formatted version of the date

SYNOPSIS

        async getToday(date);
            no Params

DESCRIPTION

        This function will return the date in proper html format to set max
        date for log ascent calander.

RETURNS

        Returns yyy-mm-dd

*/
/**/
const getToday = async () => {
    var dtToday = new Date();
    var month = dtToday.getMonth() + 1;
    var day = dtToday.getDate();
    var year = dtToday.getFullYear();
    if (month < 10)
        month = '0' + month.toString();
    if (day < 10)
        day = '0' + day.toString();

    var maxDate = year + '-' + month + '-' + day;
    return maxDate;
}

/**/
/*
aysnc readDate()

NAME

        async readDate() - Interprets Date as read from date input txt box into object

SYNOPSIS

        async readDate(date);
            date - date to be interpreted

DESCRIPTION

        This function will read in a date string in the form yyy-mm-dd
        and return a date object in the form {year: 12, month: 4, day: 21}

RETURNS

        Returns date object

*/
/**/
const readDate = async (date) => {
    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const day = date.slice(8, 10);
    //console.log("Year: " + year + " Month: " + month + " Day: " + day);
    return { year: year, month: month, day: day };
}

/**/
/*
aysnc climbPage()

NAME

        async climbPage() - Handles Climb Page (specific climb)

SYNOPSIS

        async climbPage(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add Climb page. First we read
        in necessary info on the climb, ascents, climb, and location.
        Next, we do some calculations to determine things like average
        height of sender, average quality, most recent ascent, and then
        we will call the function to calculate the ZGrade. Finally, all
        this information is stored in our currclimb object which is then
        passed onto our climb page so that it can render properly.

RETURNS

        Returns nothing

*/
/**/
const climbPage = async (req, res) => {

    let currClimb;
    let loc;
    let ascents;

    try {
        currClimb = await db.read('Climb', [{ column: 'ID', value: req.params.ClimbID }]);
        loc = await db.read('Location', [{ column: 'ID', value: currClimb[0].LocationID }]);
        ascents = await db.read('Ascent', [{ column: 'ClimbID', value: currClimb[0].ID }]);
    }
    catch {
        console.log("Error Reading DataBase for ClimbPage... Redirecting Home");
        res.redirect('/');
        return;
    }
    try { 
        let avgHeight = 0;
        let Q = 0;
        for (a of ascents) {
            //Find Climber Name for each Ascent
            let climber = await db.read('User', [{ column: 'ID', value: a.ClimberID }]);
            a.ClimberName = climber[0].FirstName + climber[0].LastName;
            //Gather info on everyones height, will divide by total # of ascents
            avgHeight += climber[0].Height;
            //Collect Height from climber and hold in ascent object
            a.Height = climber[0].Height;
            //Gather info on Quality
            Q += a.Quality;
            //Find Most Recent Ascent
            if (a.ID == currClimb[0].RecAscentID) {
                currClimb[0].MostRecAscent = a.Date;
            }

        }
        currClimb[0].AvgHeight = Math.round(avgHeight / ascents.length);
        currClimb[0].Quality = Q / ascents.length;

        const ZG = await calculateZGradeClimb(currClimb[0]);
        currClimb[0].ZGrade = ZG.ZGrade;

        res.render('climb', { climb: currClimb[0], location: loc[0], ascents: ascents, reasoning: ZG.Reasoning});
        return;
    }
    catch {
        console.log("Error Reading Calculating info for ClimbPage");
        res.render('climb', { climb: currClimb[0], location: loc[0], ascents: ascents });
        res.redirect('/');
        return;
    }

}

/**/
/*
aysnc climbers()

NAME

        async climbers() - Handles Climbers page

SYNOPSIS

        async climbers(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add Climbers page. Here we
        can view all of the climbers in our database. We also do 
        some work here with getting information on their number 
        of ascents and their most recent ascents.

RETURNS

        Returns nothing

*/
/**/
//Loads up Climbers Page and displays Climbers
const climbers = async (req, res) => {
    const climbers = await db.read('User', []);

    //Troubleshot Log
    //console.log("# of climbers read in system: " + climbs.length);

    //Add Information on NumAscents and RecAscent
    for (climber of climbers) {
        //Gather Ascents of this Climber
        const Ascents = await db.read('Ascent', [{ column: 'ClimberID', value: climber.ID }]);
        //Climber has no ascents
        if (Ascents.length < 1) {
            console.log("Climber: " + climber.ID + " has no Ascents");
            climber.NumAscents = 0;
            climber.RecAscent = "None";
            continue;
        }
        //Update NumAscents
        climber.NumAscents = Ascents.length;

        //Figure our RecAscent
        let mostRecAscent = Ascents[0];
        for (a of Ascents) {
            if (await findRecentAscent(await readDate(a.Date), await readDate(mostRecAscent.Date))) {
                //Current Ascent is more recent than previous though most recent
                mostRecAscent = a;
            }
        }

        const recAscentName = await db.read('Climb', [{ column: 'ID', value: mostRecAscent.ClimbID }]);

        climber.RecAscent = recAscentName[0].Name;

        //Find ZGrade
        const Z = await calculateZGradeClimber(climber);
        climber.ZGrade = Z.ZGrade;
        if (climber.ZGrade != null) {
            await db.update('User',
                [{ column: 'Graded', value: climber.ZGrade }],
                [{ column: 'ID', value: climber.ID }]
            );
        }
        else {
            console.log("ZGrade determined to be null for climber: " + climber.ID);
        }

    }
    
    res.render('climbers', { climbers: climbers });
    return;
}

/**/
/*
aysnc climberPage()

NAME

        async climberPage() - Handles Climber Page (specific climber)

SYNOPSIS

        async climberPage(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add Climber page. First we read
        in necessary info on the climber, ascents, and attempts
        Next, we will get some further information on the ascents, 
        and attempts like location and Grade. We will also calculate
        the ZGrade for each ascent. All of the ascents, and attempts 
        are passed to pug along with the climber to have a nice display

RETURNS

        Returns nothing

*/
/**/
const climberPage = async (req, res) => {
    const currClimber = await db.read('User', [{ column: 'ID', value: req.params.ID }]);
    const ascents = await db.read('Ascent', [{ column: 'ClimberID', value: req.params.ID }]);
    const attempts = await db.read('Attempt', [{ column: 'ClimberID', value: req.params.ID }]);


    //Update our Ascent Object to pass it to Pug
    for (a of ascents) {
        const climb = await db.read('Climb', [{ column: 'ID', value: a.ClimbID }]);
        a.ClimbName = climb[0].Name; // Will display climb Name 
        const ZG = await calculateZGradeClimb(climb[0]);
        a.ZGrade = ZG.ZGrade;
        const loc = await db.read('Location', [{ column: 'ID', value: climb[0].LocationID }]);
        a.LocationID = loc[0].ID;
        a.Location = loc[0].Name;
        a.Grade = climb[0].Grade;
    }

    //Update Attempt Object to pass to pug
    for (a of attempts) {
        const climb = await db.read('Climb', [{ column: 'ID', value: a.ClimbID }]);
        a.ClimbName = climb[0].Name; // Will display climb Name 
        const ZG = await calculateZGradeClimb(climb[0]);
        a.ZGrade = ZG.ZGrade;
        const loc = await db.read('Location', [{ column: 'ID', value: climb[0].LocationID }]);
        a.LocationID = loc[0].ID;
        a.Location = loc[0].Name;
        a.Grade = climb[0].Grade;
        a.country = loc[0].Country;
    }


    res.render('climber', { climber: currClimber[0], ascents: ascents, attempts: attempts});
    return;
}

/**/
/*
aysnc updateQualityClimb()

NAME

        async updateQualityClimb() - Updates a climb's Quality in the Database

SYNOPSIS

        async updateQualityClimb(climb);
            climb - climb to be updated with quality

DESCRIPTION

        This function will read a climb, and collect enough info
        on the ascents and attempts of the climb to average out
        the quality given and then assign that quality to that
        climb in the database.

RETURNS

        Returns nothing

*/
/**/
const updateQualityClimb = async (climb) => {
    //Update Quality for Each Climb
    const ascents = await db.read('Ascent', [{ column: 'ClimbID', value: climb.ID }]);
    if (ascents.length > 0) {
        let quality = 0;

        const attempts = await db.read('Attempt', [{ column: 'ClimbID', value: climb.ID }]);
        if (attempts.length > 0) {
            for (attempt of attempts) {
                quality += attempt.Quality;
            }
        }
        else {
            attempts.length = 0;
        }

        
        for (ascent of ascents) {
            quality += ascent.Quality;
        }
        climb.Quality = (quality / (ascents.length + attempts.length));
        await db.update('Climb',
            [{ column: 'Quality', value: climb.Quality }],
            [{ column: 'ID', value: climb.ID }]
        );
    }
}

/**/
/*
aysnc locations()

NAME

        async locations() - Runs to Display all locations in Database

SYNOPSIS

        async locations(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add locations page. Here, we display
        all of the locations in our database along with some stats about 
        the location and the climbs there. We have to read in all the 
        climbs of each and then all of the ascents of each of the climbs
        to collect things like average quality, average grade, and best 
        climb info.

Note: This can probably be broken down into seperate functions

RETURNS

        Returns nothing

*/
/**/
const locations = async (req, res) => {
    let locs = await db.read('Location', []);

    //Update info for location
    for (loc of locs) {
        const climbs = await db.read('Climb', [{ column: 'LocationID', value: loc.ID }]);
        await db.update('Location',
            [{ column: 'NumClimbs', value: climbs.length }],
            [{ column: 'ID', value: loc.ID }]
        );

        if (climbs.length > 0) {

            //Variables for Avergaging
            let AvgGrade = 0;
            let AvgQuality = 0;
            let MaxQuality = 0
            let BestID = -1;
            let BestGrade = 0;
            let ascended = climbs.length;

            //Loop through climbs of location
            for (climb of climbs) {
                await updateQualityClimb(climb);
                AvgGrade += climb.Grade;
                if (climb.Quality != 0) {
                    AvgQuality += climb.Quality;
                }
                if (MaxQuality < climb.Quality) {
                    MaxQuality = climb.Quality;
                    BestID = climb.ID;
                    BestGrade = climb.Grade;
                    loc.BestClimb = climb.Name;
                    loc.BestGrade = climb.Grade;
                }
                if (climb.NumAscents < 1 || climb.NumAscents == null) {
                    ascended -= 1;
                }
            }

            //Update AvgGrade
            //Round to 100th while calulating average
            AvgGrade = Math.round(AvgGrade / climbs.length * 100) / 100;
            
            await db.update('Location',
                [{ column: 'AvgGrade', value: AvgGrade }],
                [{ column: 'ID', value: loc.ID }]
            );
            loc.AvgGrade = AvgGrade;

            //Update AvgQuality
            //Round to 100th while calulating average
            AvgQuality = Math.round(AvgQuality / ascended * 100) / 100;
            await db.update('Location',
                [{ column: 'AvgQuality', value: AvgQuality }],
                [{ column: 'ID', value: loc.ID }]
            );
            loc.AvgQuality = AvgQuality;

            //Update Best Climb ID
            if (BestID == -1) {
                console.log("No Valid Best Climb ID for Location: " + loc.Name);
                loc.BestClimb = "None";
                loc.BestGrade = "N/a";
            }
            else {
                await db.update('Location',
                    [{ column: 'BestClimbID', value: BestID }],
                    [{ column: 'ID', value: loc.ID }]
                );
            }

        }
    }

    res.render('locations', { locations: locs})
    return;
}

/**/
/*
aysnc location()

NAME

        async location() - Runs to Display info on a specific location

SYNOPSIS

        async location(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the add location page. Here users can
        view all of the climbs at a particular location. In this function,
        we fetch all of the climbs at this location, and then do a double
        check on the most recent ascent of these climbs, and then we 
        render our page.

Note: This can probably be broken down into seperate functions

RETURNS

        Returns nothing

*/
/**/
const location = async (req, res) => {
    const currLocation = await db.read('Location', [{ column: 'ID', value: req.params.ID }]);
    const climbs = await db.read('Climb', [{ column: 'LocationID', value: currLocation[0].ID }]);
    console.log("# of climbs read for current location: " + climbs.length);

    //To show Rec Ascent Accurately
    for (climb of climbs) {

        //Update RecAscent
        const recAscent = await db.read('Ascent', [{ column: 'ID', value: climb.RecAscentID }]);
        //Error Check
        if (recAscent.length < 1) {
            console.log("Error displaying rec Ascent Date, no Rec Ascent");
            continue;
        }
        const recAscentDate = await readDate(recAscent[0].Date);
        climb.RecAscentID = recAscentDate.year + "-" + recAscentDate.month + "-" + recAscentDate.day;
    }
    

    res.render('location', { climbs: climbs, location: currLocation[0] });
    return;
}

/**/
/*
aysnc calculateZGradeClimb()

NAME

        async calculateZGradeClimb() - Calculate ZGrade for particular climb

SYNOPSIS

        async calculateZGradeClimb(climb);
            climb - climb to be updated with ZGrade

DESCRIPTION

        This function will read a climb, and collect enough info
        on the ascents and attempts of the climb to then calculate
        a number which will represent a more accurate grade for the
        climb. We Try to take as much into account as possible, 
        climber height, climber strength/skill, numbers of attempts
        and sessions and more.

Note: This SHOULD be seperated into different functions

RETURNS

        Returns ZGrade object in the form {ZGrade: int, Reasoning: string} 

*/
/**/
const calculateZGradeClimb = async (climb) => {

    let toRETURN = {ZGrade: 0, Reasoning: "N/A"}
    let Reasoning = ['ZGrade Reasoning\n'];

    try {
        const Base = climb.Grade; //Origional Grade of the problem

        //Collect all data about grade taken
        const ascents = await db.read('Ascent', [{ column: 'ClimbID', value: climb.ID }]);

        //See if Not Enough Data, -> Gives god excuse for odd findings
        if (ascents.length < 1) {
            console.log("No Ascents of Climb: " + climb.ID + "    Unable to Calculate ZGrade");
            return toRETURN;
        }
        if (ascents.length < 3) {
            Reasoning.push('Very Few Ascents, Take Data with grain of salt');
        }

        let GT = 0; //GradeTakenTotal
        let NA = 0; //NumAttemptsTotal
        let NS = 0; //NumSessionsTotal
        let HV = 0; //heightTotal
        let tall = 0; //number of climbers taller than average ascender
        let short = 0; // number of climbers shorter than average ascender
        let stronger = 0; //number of climbers who are considered 'Strong' for this climb
        let weaker = 0; //number of climbers who are considered weak for this climb

        for (ascent of ascents) {
            //Tally up totals to later take average for some stats
            GT += ascent.GradeTaken;
            NA += ascent.NumAttempts;
            NS += ascent.NumSessions;

            try {
                const climber = await db.read('User', [{ column: 'ID', value: ascent.ClimberID }]);
                HV += climber[0].Height;
            }
            catch {
                console.log("Issue Reading the Climber of Ascent ID: " + ascent.ID);
            }
        }

        //Calculate Averages
        GT = GT / ascents.length * 100; // Now holds average Grade taken
        NA = NA / ascents.length;
        NS = NS / ascents.length;
        HV = HV / ascents.length; // Holds Average Height;


        //Base for ZGrade
        let ZGrade = GT;
        Reasoning.push("Starting with average Grade Taken: " + GT + "\n");

        //Second Pass through ascents interpret Height and Sandbaggers
        for (ascent of ascents) {
            try {
                const climber = await db.read('User', [{ column: 'ID', value: ascent.ClimberID }]);

               //See if climber is weak or strong for climb
                //Climber is signifigantly stronger than climb
                if (climber[0].Graded > Base + 1) {
                    stronger += 1;

                    //Check for Sandbaggers
                    if (ascent.GradeTaken < GT) {
                        ZGrade *= 1.02;
                        Reasoning.push("Sandbagger Found -> 1.02 multiplier\n");
                    }
                }
                //Climber is signifigantly weaker than climb
                else if (climber[0].Graded < Base - 1) {
                    weaker += 1;

                    //Check for Grade Chasers
                    if (ascent.GradeTaken > GT) {
                        ZGrade *= 0.98;
                        Reasoning.push("Grade Chaser Found -> 0.98 multiplier\n");
                    }
                }

               //See if climber is tall or short for climb
                //Climber is taller than avg ascender
                if (climber[0].Height > HV) {
                    tall += 1;

                    //Check for tall sandbagger
                    if (ascent.GradeTaken < GT) {
                        ZGrade *= 1.025;
                        Reasoning.push("Tall Sandbagger Found -> 1.025 multiplier\n");
                    }
                }
                //Climber is shorter than avg ascender
                else {
                    short += 1;

                    //Check for short grade chaser
                    if (ascent.GradeTaken > GT) {
                        ZGrade *= 0.99;
                        Reasoning.push("Short Grade Chaser Found -> 0.99 multiplier\n");
                    }
                }
            }
            catch {
                console.log("Error in ZGrade Calc Second Pass: Might Produce Invalid data");
            }
        }

        //Compare tall vs short
        if (tall > short) {
            //HeightValue
            await db.update('Climb',
                [{ column: 'HeightAdv', value: 1 }],
                [{ column: 'ID', value: climb.ID }]
            );
        }
        else if (short > tall) {
            await db.update('Climb',
                [{ column: 'HeightAdv', value: 0 }],
                [{ column: 'ID', value: climb.ID }]
            );
        }


       //Compare Avg Grade Taken to Base Grade
        //Most people call it soft
        if (GT < Base) {
            ZGrade *= 0.975;
            Reasoning.push("Most people call climb soft -> 0.975 multiplier\n");
        }
        //Either On Grade or Sandbagged
        else {
            ZGrade *= 1.025;
            Reasoning.push("Most people call climb sandbagged -> 1.025 multiplier\n");
        }

       //Interpret Average Attempts
        //The Climb is Probably hard or gimicy 25+ attempts avg
        if (NA > 25) { 
            ZGrade *= 1.10;
            Reasoning.push("Average Attempts exceeds 25 -> 1.10 multiplier\n");
        }
        //The Climb is still very hard 15-25 avg attempts
        else if (NA > 15) { 
            ZGrade *= 1.075;
            Reasoning.push("Average Attempts in range 15-25 -> 1.075 multiplier\n");
        }
        //Avg attempts between 10-15, Probably harder than average 
        else if (NA > 10) {
            ZGrade *= 1.05;
            Reasoning.push("Average Attempts in range 10-15 -> 1.05 multiplier\n");
        }
        //Avg attempts between 5-10, Probably slightly harder than average 
        else if (NA > 5) {
            ZGrade *= 1.025;
            Reasoning.push("Average Attempts in range 5-10 -> 1.025 multiplier\n");
        }
        //Average attempts 1-5
        else {
            ZGrade *= .95;
            Reasoning.push("Average Attempts in range 1-1.5 -> .95 multiplier\n");
        }

       //Interpret Average Sessions
        //Takes an Average of 5+ Session!!! Crazy hard!
        if (NS > 5) {
            ZGrade *= 1.075;
            Reasoning.push("Average Sessions exceeds 5 -> 1.075 multiplier\n");
        }
        //Avg of 3-5 sessions -> pretty hard
        else if (NS > 3) {
            ZGrade *= 1.05;
            Reasoning.push("Average Sessions in range 3-5 -> 1.05 multiplier\n");
        }
        //If it takes an average of more than 1.5 session (Most)
        else if (NS > 1.5) {
            ZGrade *= 1.025;
            Reasoning.push("Average Sessions in range 1.5-3 -> 1.025 multiplier\n");
        }
        //Climb Very One sessionable
        else {
            ZGrade *= .95;
            Reasoning.push("Average Sessions in range 1-1.5 -> .95 multiplier\n");
        }

        toRETURN.ZGrade = Math.round(ZGrade);
        toRETURN.Reasoning = Reasoning;

        //Update data in database
        await db.update('Climb',
            [{ column: 'GradeCalculated', value: toRETURN.ZGrade }],
            [{ column: 'ID', value: climb.ID }]
        );
    }
    catch {
        console.log("Error Calculating ZGrade for Climb ID: " + climb.ID);
        
    }
    return toRETURN;
}

/**/
/*
aysnc calculateZGradeClimber()

NAME

        async calculateZGradeClimber() - Calculate ZGrade for particular climber

SYNOPSIS

        async calculateZGradeClimber(climber);
            climber - climber to be updated with ZGrade

DESCRIPTION

        This function will read a climbers ascents and give them a
        ZGrade based off of this. We will find their hardest ascent
        in terms of given grade and zgrade and average these two out.
        We will also have a solidfy variable which will rewards 
        climbers for climbing multiple climbs of ther max grade, for
        example, a climber who has done 5 V9s will be rewarded more 
        than a climber who has climbed 2 V9s

Note: This can be seperated into different functions

RETURNS

        Returns ZGrade object in the form {ZGrade: int, Reasoning: string} 

*/
/**/
const calculateZGradeClimber = async (climber) => {
    let toRETURN = { ZGrade: 0, Reasoning: "N/A" }
    let Reasoning = ['ZGrade Reasoning\n'];

    //Find Climber's ascents
    try {
        const ascents = await db.read('Ascent', [{ column: 'ClimberID', value: climber.ID }]);
        
        if (ascents.length < 1) {
            console.log("Climber: " + climber.ID + " has no logged ascents");
            return toRETURN;
        }
        
        else {
            
            //Declare some variables to collect max
            let zGradeClimbMax = 0;
            let gradeClimbMax = 0;
            let solidify = 0; // If people sent multiple of max grade, they get solidified

            for (ascent of ascents) {
                //Filter out mega megas
                if (ascent.NumSessions > 10) {
                    continue;
                }
                
                try {
                    const climb = await db.read('Climb', [{ column: 'ID', value: ascent.ClimbID }]);

                    if (zGradeClimbMax < climb[0].GradeCalculated) {
                        zGradeClimbMax = climb[0].GradeCalculated;
                    }
                    if (gradeClimbMax < climb[0].Grade) {
                        gradeClimbMax = climb[0].Grade;
                        solidify = 0;
                    }
                    else if (gradeClimbMax = climb[0].Grade) {
                        solidify += 1;
                        if (ascent.NumAttempts <= 2 && ascent.NumSessions < 2) {
                            //Climber either flashed or 2nd goed a climb of their max grade
                            solidify += 14
                        } 
                        else if (ascent.NumAttempts < 10 && ascent.NumSessions < 2) {
                            //Climber did a climb of their max grade in a session in less than 10 attempts
                            solidify += 7;
                        }
                    }
                }

                catch {
                    console.log("Error Finding climb with ID: " + ascent.ClimbID);
                    continue;
                }

            }


            //calculate averages
            zGradeClimbMax = zGradeClimbMax / 2;
            gradeClimbMax = gradeClimbMax * (50 + (2 * solidify));

            console.log("zGradeClimbMax: " + zGradeClimbMax + "   gradeClimbMax: " + gradeClimbMax);
            console.log("ZGrade will be set to: " + Math.round(zGradeClimbMax + gradeClimbMax) + "  For Climber: " + climber.ID);

            //Average both of those stats
            toRETURN.ZGrade = Math.round(zGradeClimbMax + gradeClimbMax);

        }
    }
    catch {
        console.log("Error within ZGrade Calc for climber: " + climber.ID);
    }
    finally { return toRETURN; }
    
}

/**/
/*
aysnc reasoning()

NAME

        async reasoning() - Runs to Display info on a specific location

SYNOPSIS

        async reasoning(req, res);
            req - Request object holding info on http request
            res - response object holding info on our http response

DESCRIPTION

        This function will handle the reasoning page displaying the
        reasoning for a climb recieving the ZGrade that it has

RETURNS

        Returns nothing

*/
/**/
const reasoning = async (req, res) => {
    currClimb = await db.read('Climb', [{ column: 'ID', value: req.params.ClimbID }]);
    const ZG = await calculateZGradeClimb(currClimb[0]);

    res.render('reasoning', { ZGrade: ZG.ZGrade, reasoning: ZG.Reasoning });
    return;
}

//Reuseable Code for Country selection
const countries = async () => {
    const countries = [
        { "code": "AF", "code3": "AFG", "name": "Afghanistan", "number": "004" },
        { "code": "AL", "code3": "ALB", "name": "Albania", "number": "008" },
        { "code": "DZ", "code3": "DZA", "name": "Algeria", "number": "012" },
        { "code": "AS", "code3": "ASM", "name": "American Samoa", "number": "016" },
        { "code": "AD", "code3": "AND", "name": "Andorra", "number": "020" },
        { "code": "AO", "code3": "AGO", "name": "Angola", "number": "024" },
        { "code": "AI", "code3": "AIA", "name": "Anguilla", "number": "660" },
        { "code": "AQ", "code3": "ATA", "name": "Antarctica", "number": "010" },
        { "code": "AG", "code3": "ATG", "name": "Antigua and Barbuda", "number": "028" },
        { "code": "AR", "code3": "ARG", "name": "Argentina", "number": "032" },
        { "code": "AM", "code3": "ARM", "name": "Armenia", "number": "051" },
        { "code": "AW", "code3": "ABW", "name": "Aruba", "number": "533" },
        { "code": "AU", "code3": "AUS", "name": "Australia", "number": "036" },
        { "code": "AT", "code3": "AUT", "name": "Austria", "number": "040" },
        { "code": "AZ", "code3": "AZE", "name": "Azerbaijan", "number": "031" },
        { "code": "BS", "code3": "BHS", "name": "Bahamas (the)", "number": "044" },
        { "code": "BH", "code3": "BHR", "name": "Bahrain", "number": "048" },
        { "code": "BD", "code3": "BGD", "name": "Bangladesh", "number": "050" },
        { "code": "BB", "code3": "BRB", "name": "Barbados", "number": "052" },
        { "code": "BY", "code3": "BLR", "name": "Belarus", "number": "112" },
        { "code": "BE", "code3": "BEL", "name": "Belgium", "number": "056" },
        { "code": "BZ", "code3": "BLZ", "name": "Belize", "number": "084" },
        { "code": "BJ", "code3": "BEN", "name": "Benin", "number": "204" },
        { "code": "BM", "code3": "BMU", "name": "Bermuda", "number": "060" },
        { "code": "BT", "code3": "BTN", "name": "Bhutan", "number": "064" },
        { "code": "BO", "code3": "BOL", "name": "Bolivia (Plurinational State of)", "number": "068" },
        { "code": "BQ", "code3": "BES", "name": "Bonaire, Sint Eustatius and Saba", "number": "535" },
        { "code": "BA", "code3": "BIH", "name": "Bosnia and Herzegovina", "number": "070" },
        { "code": "BW", "code3": "BWA", "name": "Botswana", "number": "072" },
        { "code": "BV", "code3": "BVT", "name": "Bouvet Island", "number": "074" },
        { "code": "BR", "code3": "BRA", "name": "Brazil", "number": "076" },
        { "code": "IO", "code3": "IOT", "name": "British Indian Ocean Territory (the)", "number": "086" },
        { "code": "BN", "code3": "BRN", "name": "Brunei Darussalam", "number": "096" },
        { "code": "BG", "code3": "BGR", "name": "Bulgaria", "number": "100" },
        { "code": "BF", "code3": "BFA", "name": "Burkina Faso", "number": "854" },
        { "code": "BI", "code3": "BDI", "name": "Burundi", "number": "108" },
        { "code": "CV", "code3": "CPV", "name": "Cabo Verde", "number": "132" },
        { "code": "KH", "code3": "KHM", "name": "Cambodia", "number": "116" },
        { "code": "CM", "code3": "CMR", "name": "Cameroon", "number": "120" },
        { "code": "CA", "code3": "CAN", "name": "Canada", "number": "124" },
        { "code": "KY", "code3": "CYM", "name": "Cayman Islands (the)", "number": "136" },
        { "code": "CF", "code3": "CAF", "name": "Central African Republic (the)", "number": "140" },
        { "code": "TD", "code3": "TCD", "name": "Chad", "number": "148" },
        { "code": "CL", "code3": "CHL", "name": "Chile", "number": "152" },
        { "code": "CN", "code3": "CHN", "name": "China", "number": "156" },
        { "code": "CX", "code3": "CXR", "name": "Christmas Island", "number": "162" },
        { "code": "CC", "code3": "CCK", "name": "Cocos (Keeling) Islands (the)", "number": "166" },
        { "code": "CO", "code3": "COL", "name": "Colombia", "number": "170" },
        { "code": "KM", "code3": "COM", "name": "Comoros (the)", "number": "174" },
        { "code": "CD", "code3": "COD", "name": "Congo (the Democratic Republic of the)", "number": "180" },
        { "code": "CG", "code3": "COG", "name": "Congo (the)", "number": "178" },
        { "code": "CK", "code3": "COK", "name": "Cook Islands (the)", "number": "184" },
        { "code": "CR", "code3": "CRI", "name": "Costa Rica", "number": "188" },
        { "code": "HR", "code3": "HRV", "name": "Croatia", "number": "191" },
        { "code": "CU", "code3": "CUB", "name": "Cuba", "number": "192" },
        { "code": "CW", "code3": "CUW", "name": "Curacao", "number": "531" },
        { "code": "CY", "code3": "CYP", "name": "Cyprus", "number": "196" },
        { "code": "CZ", "code3": "CZE", "name": "Czechia", "number": "203" },
        { "code": "CI", "code3": "CIV", "name": "Cote d'Ivoire", "number": "384" },
        { "code": "DK", "code3": "DNK", "name": "Denmark", "number": "208" },
        { "code": "DJ", "code3": "DJI", "name": "Djibouti", "number": "262" },
        { "code": "DM", "code3": "DMA", "name": "Dominica", "number": "212" },
        { "code": "DO", "code3": "DOM", "name": "Dominican Republic (the)", "number": "214" },
        { "code": "EC", "code3": "ECU", "name": "Ecuador", "number": "218" },
        { "code": "EG", "code3": "EGY", "name": "Egypt", "number": "818" },
        { "code": "SV", "code3": "SLV", "name": "El Salvador", "number": "222" },
        { "code": "GQ", "code3": "GNQ", "name": "Equatorial Guinea", "number": "226" },
        { "code": "ER", "code3": "ERI", "name": "Eritrea", "number": "232" },
        { "code": "EE", "code3": "EST", "name": "Estonia", "number": "233" },
        { "code": "SZ", "code3": "SWZ", "name": "Eswatini", "number": "748" },
        { "code": "ET", "code3": "ETH", "name": "Ethiopia", "number": "231" },
        { "code": "FK", "code3": "FLK", "name": "Falkland Islands (the) [Malvinas]", "number": "238" },
        { "code": "FO", "code3": "FRO", "name": "Faroe Islands (the)", "number": "234" },
        { "code": "FJ", "code3": "FJI", "name": "Fiji", "number": "242" },
        { "code": "FI", "code3": "FIN", "name": "Finland", "number": "246" },
        { "code": "FR", "code3": "FRA", "name": "France", "number": "250" },
        { "code": "GF", "code3": "GUF", "name": "French Guiana", "number": "254" },
        { "code": "PF", "code3": "PYF", "name": "French Polynesia", "number": "258" },
        { "code": "TF", "code3": "ATF", "name": "French Southern Territories (the)", "number": "260" },
        { "code": "GA", "code3": "GAB", "name": "Gabon", "number": "266" },
        { "code": "GM", "code3": "GMB", "name": "Gambia (the)", "number": "270" },
        { "code": "GE", "code3": "GEO", "name": "Georgia", "number": "268" },
        { "code": "DE", "code3": "DEU", "name": "Germany", "number": "276" },
        { "code": "GH", "code3": "GHA", "name": "Ghana", "number": "288" },
        { "code": "GI", "code3": "GIB", "name": "Gibraltar", "number": "292" },
        { "code": "GR", "code3": "GRC", "name": "Greece", "number": "300" },
        { "code": "GL", "code3": "GRL", "name": "Greenland", "number": "304" },
        { "code": "GD", "code3": "GRD", "name": "Grenada", "number": "308" },
        { "code": "GP", "code3": "GLP", "name": "Guadeloupe", "number": "312" },
        { "code": "GU", "code3": "GUM", "name": "Guam", "number": "316" },
        { "code": "GT", "code3": "GTM", "name": "Guatemala", "number": "320" },
        { "code": "GG", "code3": "GGY", "name": "Guernsey", "number": "831" },
        { "code": "GN", "code3": "GIN", "name": "Guinea", "number": "324" },
        { "code": "GW", "code3": "GNB", "name": "Guinea-Bissau", "number": "624" },
        { "code": "GY", "code3": "GUY", "name": "Guyana", "number": "328" },
        { "code": "HT", "code3": "HTI", "name": "Haiti", "number": "332" },
        { "code": "HM", "code3": "HMD", "name": "Heard Island and McDonald Islands", "number": "334" },
        { "code": "VA", "code3": "VAT", "name": "Holy See (the)", "number": "336" },
        { "code": "HN", "code3": "HND", "name": "Honduras", "number": "340" },
        { "code": "HK", "code3": "HKG", "name": "Hong Kong", "number": "344" },
        { "code": "HU", "code3": "HUN", "name": "Hungary", "number": "348" },
        { "code": "IS", "code3": "ISL", "name": "Iceland", "number": "352" },
        { "code": "IN", "code3": "IND", "name": "India", "number": "356" },
        { "code": "ID", "code3": "IDN", "name": "Indonesia", "number": "360" },
        { "code": "IR", "code3": "IRN", "name": "Iran (Islamic Republic of)", "number": "364" },
        { "code": "IQ", "code3": "IRQ", "name": "Iraq", "number": "368" },
        { "code": "IE", "code3": "IRL", "name": "Ireland", "number": "372" },
        { "code": "IM", "code3": "IMN", "name": "Isle of Man", "number": "833" },
        { "code": "IL", "code3": "ISR", "name": "Israel", "number": "376" },
        { "code": "IT", "code3": "ITA", "name": "Italy", "number": "380" },
        { "code": "JM", "code3": "JAM", "name": "Jamaica", "number": "388" },
        { "code": "JP", "code3": "JPN", "name": "Japan", "number": "392" },
        { "code": "JE", "code3": "JEY", "name": "Jersey", "number": "832" },
        { "code": "JO", "code3": "JOR", "name": "Jordan", "number": "400" },
        { "code": "KZ", "code3": "KAZ", "name": "Kazakhstan", "number": "398" },
        { "code": "KE", "code3": "KEN", "name": "Kenya", "number": "404" },
        { "code": "KI", "code3": "KIR", "name": "Kiribati", "number": "296" },
        { "code": "KP", "code3": "PRK", "name": "Korea (the Democratic People's Republic of)", "number": "408" },
        { "code": "KR", "code3": "KOR", "name": "Korea (the Republic of)", "number": "410" },
        { "code": "KW", "code3": "KWT", "name": "Kuwait", "number": "414" },
        { "code": "KG", "code3": "KGZ", "name": "Kyrgyzstan", "number": "417" },
        { "code": "LA", "code3": "LAO", "name": "Lao People's Democratic Republic (the)", "number": "418" },
        { "code": "LV", "code3": "LVA", "name": "Latvia", "number": "428" },
        { "code": "LB", "code3": "LBN", "name": "Lebanon", "number": "422" },
        { "code": "LS", "code3": "LSO", "name": "Lesotho", "number": "426" },
        { "code": "LR", "code3": "LBR", "name": "Liberia", "number": "430" },
        { "code": "LY", "code3": "LBY", "name": "Libya", "number": "434" },
        { "code": "LI", "code3": "LIE", "name": "Liechtenstein", "number": "438" },
        { "code": "LT", "code3": "LTU", "name": "Lithuania", "number": "440" },
        { "code": "LU", "code3": "LUX", "name": "Luxembourg", "number": "442" },
        { "code": "MO", "code3": "MAC", "name": "Macao", "number": "446" },
        { "code": "MG", "code3": "MDG", "name": "Madagascar", "number": "450" },
        { "code": "MW", "code3": "MWI", "name": "Malawi", "number": "454" },
        { "code": "MY", "code3": "MYS", "name": "Malaysia", "number": "458" },
        { "code": "MV", "code3": "MDV", "name": "Maldives", "number": "462" },
        { "code": "ML", "code3": "MLI", "name": "Mali", "number": "466" },
        { "code": "MT", "code3": "MLT", "name": "Malta", "number": "470" },
        { "code": "MH", "code3": "MHL", "name": "Marshall Islands (the)", "number": "584" },
        { "code": "MQ", "code3": "MTQ", "name": "Martinique", "number": "474" },
        { "code": "MR", "code3": "MRT", "name": "Mauritania", "number": "478" },
        { "code": "MU", "code3": "MUS", "name": "Mauritius", "number": "480" },
        { "code": "YT", "code3": "MYT", "name": "Mayotte", "number": "175" },
        { "code": "MX", "code3": "MEX", "name": "Mexico", "number": "484" },
        { "code": "FM", "code3": "FSM", "name": "Micronesia (Federated States of)", "number": "583" },
        { "code": "MD", "code3": "MDA", "name": "Moldova (the Republic of)", "number": "498" },
        { "code": "MC", "code3": "MCO", "name": "Monaco", "number": "492" },
        { "code": "MN", "code3": "MNG", "name": "Mongolia", "number": "496" },
        { "code": "ME", "code3": "MNE", "name": "Montenegro", "number": "499" },
        { "code": "MS", "code3": "MSR", "name": "Montserrat", "number": "500" },
        { "code": "MA", "code3": "MAR", "name": "Morocco", "number": "504" },
        { "code": "MZ", "code3": "MOZ", "name": "Mozambique", "number": "508" },
        { "code": "MM", "code3": "MMR", "name": "Myanmar", "number": "104" },
        { "code": "NA", "code3": "NAM", "name": "Namibia", "number": "516" },
        { "code": "NR", "code3": "NRU", "name": "Nauru", "number": "520" },
        { "code": "NP", "code3": "NPL", "name": "Nepal", "number": "524" },
        { "code": "NL", "code3": "NLD", "name": "Netherlands (the)", "number": "528" },
        { "code": "NC", "code3": "NCL", "name": "New Caledonia", "number": "540" },
        { "code": "NZ", "code3": "NZL", "name": "New Zealand", "number": "554" },
        { "code": "NI", "code3": "NIC", "name": "Nicaragua", "number": "558" },
        { "code": "NE", "code3": "NER", "name": "Niger (the)", "number": "562" },
        { "code": "NG", "code3": "NGA", "name": "Nigeria", "number": "566" },
        { "code": "NU", "code3": "NIU", "name": "Niue", "number": "570" },
        { "code": "NF", "code3": "NFK", "name": "Norfolk Island", "number": "574" },
        { "code": "MP", "code3": "MNP", "name": "Northern Mariana Islands (the)", "number": "580" },
        { "code": "NO", "code3": "NOR", "name": "Norway", "number": "578" },
        { "code": "OM", "code3": "OMN", "name": "Oman", "number": "512" },
        { "code": "PK", "code3": "PAK", "name": "Pakistan", "number": "586" },
        { "code": "PW", "code3": "PLW", "name": "Palau", "number": "585" },
        { "code": "PS", "code3": "PSE", "name": "Palestine, State of", "number": "275" },
        { "code": "PA", "code3": "PAN", "name": "Panama", "number": "591" },
        { "code": "PG", "code3": "PNG", "name": "Papua New Guinea", "number": "598" },
        { "code": "PY", "code3": "PRY", "name": "Paraguay", "number": "600" },
        { "code": "PE", "code3": "PER", "name": "Peru", "number": "604" },
        { "code": "PH", "code3": "PHL", "name": "Philippines (the)", "number": "608" },
        { "code": "PN", "code3": "PCN", "name": "Pitcairn", "number": "612" },
        { "code": "PL", "code3": "POL", "name": "Poland", "number": "616" },
        { "code": "PT", "code3": "PRT", "name": "Portugal", "number": "620" },
        { "code": "PR", "code3": "PRI", "name": "Puerto Rico", "number": "630" },
        { "code": "QA", "code3": "QAT", "name": "Qatar", "number": "634" },
        { "code": "MK", "code3": "MKD", "name": "Republic of North Macedonia", "number": "807" },
        { "code": "RO", "code3": "ROU", "name": "Romania", "number": "642" },
        { "code": "RU", "code3": "RUS", "name": "Russian Federation (the)", "number": "643" },
        { "code": "RW", "code3": "RWA", "name": "Rwanda", "number": "646" },
        { "code": "RE", "code3": "REU", "name": "Reunion", "number": "638" },
        { "code": "BL", "code3": "BLM", "name": "Saint Barthelemy", "number": "652" },
        { "code": "SH", "code3": "SHN", "name": "Saint Helena, Ascension and Tristan da Cunha", "number": "654" },
        { "code": "KN", "code3": "KNA", "name": "Saint Kitts and Nevis", "number": "659" },
        { "code": "LC", "code3": "LCA", "name": "Saint Lucia", "number": "662" },
        { "code": "MF", "code3": "MAF", "name": "Saint Martin (French part)", "number": "663" },
        { "code": "PM", "code3": "SPM", "name": "Saint Pierre and Miquelon", "number": "666" },
        { "code": "VC", "code3": "VCT", "name": "Saint Vincent and the Grenadines", "number": "670" },
        { "code": "WS", "code3": "WSM", "name": "Samoa", "number": "882" },
        { "code": "SM", "code3": "SMR", "name": "San Marino", "number": "674" },
        { "code": "ST", "code3": "STP", "name": "Sao Tome and Principe", "number": "678" },
        { "code": "SA", "code3": "SAU", "name": "Saudi Arabia", "number": "682" },
        { "code": "SN", "code3": "SEN", "name": "Senegal", "number": "686" },
        { "code": "RS", "code3": "SRB", "name": "Serbia", "number": "688" },
        { "code": "SC", "code3": "SYC", "name": "Seychelles", "number": "690" },
        { "code": "SL", "code3": "SLE", "name": "Sierra Leone", "number": "694" },
        { "code": "SG", "code3": "SGP", "name": "Singapore", "number": "702" },
        { "code": "SX", "code3": "SXM", "name": "Sint Maarten (Dutch part)", "number": "534" },
        { "code": "SK", "code3": "SVK", "name": "Slovakia", "number": "703" },
        { "code": "SI", "code3": "SVN", "name": "Slovenia", "number": "705" },
        { "code": "SB", "code3": "SLB", "name": "Solomon Islands", "number": "090" },
        { "code": "SO", "code3": "SOM", "name": "Somalia", "number": "706" },
        { "code": "ZA", "code3": "ZAF", "name": "South Africa", "number": "710" },
        { "code": "GS", "code3": "SGS", "name": "South Georgia and the South Sandwich Islands", "number": "239" },
        { "code": "SS", "code3": "SSD", "name": "South Sudan", "number": "728" },
        { "code": "ES", "code3": "ESP", "name": "Spain", "number": "724" },
        { "code": "LK", "code3": "LKA", "name": "Sri Lanka", "number": "144" },
        { "code": "SD", "code3": "SDN", "name": "Sudan (the)", "number": "729" },
        { "code": "SR", "code3": "SUR", "name": "Suriname", "number": "740" },
        { "code": "SJ", "code3": "SJM", "name": "Svalbard and Jan Mayen", "number": "744" },
        { "code": "SE", "code3": "SWE", "name": "Sweden", "number": "752" },
        { "code": "CH", "code3": "CHE", "name": "Switzerland", "number": "756" },
        { "code": "SY", "code3": "SYR", "name": "Syrian Arab Republic", "number": "760" },
        { "code": "TW", "code3": "TWN", "name": "Taiwan", "number": "158" },
        { "code": "TJ", "code3": "TJK", "name": "Tajikistan", "number": "762" },
        { "code": "TZ", "code3": "TZA", "name": "Tanzania, United Republic of", "number": "834" },
        { "code": "TH", "code3": "THA", "name": "Thailand", "number": "764" },
        { "code": "TL", "code3": "TLS", "name": "Timor-Leste", "number": "626" },
        { "code": "TG", "code3": "TGO", "name": "Togo", "number": "768" },
        { "code": "TK", "code3": "TKL", "name": "Tokelau", "number": "772" },
        { "code": "TO", "code3": "TON", "name": "Tonga", "number": "776" },
        { "code": "TT", "code3": "TTO", "name": "Trinidad and Tobago", "number": "780" },
        { "code": "TN", "code3": "TUN", "name": "Tunisia", "number": "788" },
        { "code": "TR", "code3": "TUR", "name": "Turkey", "number": "792" },
        { "code": "TM", "code3": "TKM", "name": "Turkmenistan", "number": "795" },
        { "code": "TC", "code3": "TCA", "name": "Turks and Caicos Islands (the)", "number": "796" },
        { "code": "TV", "code3": "TUV", "name": "Tuvalu", "number": "798" },
        { "code": "UG", "code3": "UGA", "name": "Uganda", "number": "800" },
        { "code": "UA", "code3": "UKR", "name": "Ukraine", "number": "804" },
        { "code": "AE", "code3": "ARE", "name": "United Arab Emirates (the)", "number": "784" },
        { "code": "GB", "code3": "GBR", "name": "United Kingdom of Great Britain and Northern Ireland (the)", "number": "826" },
        { "code": "UM", "code3": "UMI", "name": "United States Minor Outlying Islands (the)", "number": "581" },
        { "code": "US", "code3": "USA", "name": "United States of America (the)", "number": "840" },
        { "code": "UY", "code3": "URY", "name": "Uruguay", "number": "858" },
        { "code": "UZ", "code3": "UZB", "name": "Uzbekistan", "number": "860" },
        { "code": "VU", "code3": "VUT", "name": "Vanuatu", "number": "548" },
        { "code": "VE", "code3": "VEN", "name": "Venezuela (Bolivarian Republic of)", "number": "862" },
        { "code": "VN", "code3": "VNM", "name": "Viet Nam", "number": "704" },
        { "code": "VG", "code3": "VGB", "name": "Virgin Islands (British)", "number": "092" },
        { "code": "VI", "code3": "VIR", "name": "Virgin Islands (U.S.)", "number": "850" },
        { "code": "WF", "code3": "WLF", "name": "Wallis and Futuna", "number": "876" },
        { "code": "EH", "code3": "ESH", "name": "Western Sahara", "number": "732" },
        { "code": "YE", "code3": "YEM", "name": "Yemen", "number": "887" },
        { "code": "ZM", "code3": "ZMB", "name": "Zambia", "number": "894" },
        { "code": "ZW", "code3": "ZWE", "name": "Zimbabwe", "number": "716" },
        { "code": "AX", "code3": "ALA", "name": "Aland Islands", "number": "248" }
    ];
    return countries;
}

/**/
/*
aysnc routing()

NAME

        async routing() - Initializes our routes

SYNOPSIS

        async routing();
            No Params

DESCRIPTION

        This function will initialize all of our routes. It is called
        Immedietly on program execution.

RETURNS

        Returns nothing

*/
/**/
const routing = async () => {
    app.get('/', start);
    app.get('/signout', signout);

    app.get('/login', login);
    app.post('/login', login);

    app.get('/signup', signup);
    app.post('/signup', signup);

    app.get('/profile/:username', profile);
    app.post('/profile/:username', profile);

    app.get('/locations', locations);
    app.post('/locations', locations);
    app.get('/locations/:ID', location);
    app.post('/locations/:ID', addClimb);
    app.get('/locations/:ID/editLocation', updateLocation);
    app.post('/locations/:ID/editLocation', updateLocation);
    app.get('/locations/:ID/Climb/:ClimbID', climbPage);
    app.post('/locations/:ID/Climb/:ClimbID', climbPage);

    app.get('/locations/:ID/Climb/:ClimbID/LogAscent', logAscent);
    app.post('/locations/:ID/Climb/:ClimbID/LogAscent', logAscent);
    app.get('/locations/:ID/Climb/:ClimbID/LogAttempt', logAttempt);
    app.post('/locations/:ID/Climb/:ClimbID/LogAttempt', logAttempt);
    app.get('/locations/:ID/Climb/:ClimbID/Reasoning', reasoning);
    app.post('/locations/:ID/Climb/:ClimbID/Reasoning', reasoning);

    app.get('/addLocation', addLocation);
    app.post('/addLocation', addLocation);

    app.get('/climbers', climbers);
    app.post('/climbers', climbers);

    app.get('/Climbers/:ID', climberPage);
    app.post('/Climbers/:ID', climberPage);

    app.get('/addClimb', addClimb);
    app.post('/addClimb', addClimb);
    app.get('/locations/:ID/addClimb/', addClimb);
    app.post('/locations/:ID/addClimb/', addClimb);
}
routing();

app.listen(8080, () => {
    console.log('Server is Running on port 8080');
});
