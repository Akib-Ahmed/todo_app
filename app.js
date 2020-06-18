const express = require('express');
const path = require('path');
const mysql = require('mysql');
const app = express();
const { check, validationResult, body } = require('express-validator');
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { connect } = require('http2');

//
////// Setting up middlewares
/////////////
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

// Express Session
app.use(session({
  secret: 'secret',
  saveUninitialized: true,
  resave: true
}));

// Passport middlewares
app.use(passport.initialize());
app.use(passport.session());

// Express messages
app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.username_exists = req.flash('username_exists');
  res.locals.email_exists = req.flash('email_exists');
  res.locals.user = req.user || null;
  next();
});


// Setting up database connectoin
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'google1234',
    database: 'todo_app'
});

// Connecting to database
connection.connect(function (err) {
    if (err) {
        console.log("did not connect");
        throw err;
    }
    console.log('You are now connected with mysql database...')
})


passport.serializeUser((user, done) =>{
  console.log('serializing user:', user);
  done(null, user);
});

passport.deserializeUser((username, done) =>{
  console.log('deserializing user:', username);
  done(null,username);
});
//
//////Taking care of the login
//////////
passport.use('local-login', new LocalStrategy({
  passReqToCallback : true
},
  (req, username, password, done) => { // callback with email and password from our form

  connection.query("SELECT * FROM `users` WHERE `username` = '" + username + "'", (err, rows) => {
    if (err)
      return done(err);
    if (!rows.length) {
      return done(null, false, req.flash('error_msg', 'No user found.')); // req.flash is the way to set flashdata using connect-flash
    } 

// if the user is found but the password is wrong
    if (rows.length) {
      bcrypt.compare(password, rows[0].password, (err, result) => {
        if (err)
          throw err;
        if (result) {
          return done(null, rows[0], req.flash('success_msg', 'You are logged in'));
        } else
            return done(null, false, req.flash('error_msg', 'Oops! Wrong password.')); // create the loginMessage and save it to session as flashdata
          })
        }
      // // all is well, return successful user
      // return done(null, rows[0]);			
});



}));

//
////// Starting with routes
//////////

// Login route
app.get('/login', (req,res)=>{
  res.render('login');
})

// Login post
app.post('/login', (req,res, next)=>{
  passport.authenticate('local-login', {
    successRedirect:'/',
    failureRedirect:'/login',
    failureFlash: true
  })(req, res, next);
})

// Register route
app.get('/register', (req,res)=>{
  res.render('register');
})

// Register post request
app.post('/register',[
  // name can not be empty
  check('name', 'name is required').not().isEmpty(),
  // username can not be empty
  check('username', 'name is required').not().isEmpty(),
  // email can not be empty
  check('email', 'email is required').not().isEmpty(),
  // email must be email
  check('email', 'has to be valid email').isEmail(),
  // both password should match
  check('password', 'password can not be empty').not().isEmpty(),
  // both password should match
  check('password_confirm', 'the passwords do not match')
    .not()
    .isEmpty()
    .custom((value, {req})=>{
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      } else {
        return value;
      }
    })
], (req, res)=> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log(errors);
      return res.json({ errors: errors.array() });
      // return res.render('register', {errors:})
      // return res.render('/register',{errors: errors.array()});
      // res.render('/register', {error: errors})
      }
    const name = req.body.name;
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const password_confirm = req.body.password_confirm;

    // check for existing username
    connection.query(`SELECT * from users WHERE username = '${username}'`, (err, data)=>{
      if(err)
        throw err;
      if(data.length){
        console.log(data.length);
        req.flash('username_exists', 'username already exists');
        return res.redirect('/register');
      }
      // check for existing email
        else {
          connection.query(`SELECT * from users WHERE email= '${email}'`, (err, data)=>{
          if(err)
            throw err;
          if(data.length){
            req.flash('email_exists', 'email already exists');
            return res.redirect('/register');
            } else {
                bcrypt.genSalt(10, function(err, salt) {
                  bcrypt.hash(password, salt, function(err, hash) {
                    // Store hash in your password DB.
                    const hashed_password = hash;
                    console.log('hashed password - ' + hashed_password);
                    // inserting user infor to database
                    connection.query(`INSERT INTO users (name, username, email, password)
                                      VALUES ('${name}', '${username}', '${email}', '${hashed_password}')`, 
                                      (err,data)=>{
                                        if (err) {
                                          req.flash('error_msg', 'user not created due to and expected error. Please try again');
                                          console.log('failed and redirecting to register page')
                                          console.log(err);
                                          return res.redirect('/register');
                                        }
                                        console.log('user data inserted');
                                        req.flash('success_msg', 'Registration successful');
                                        res.redirect('/login');
                                      })
          
                });
              });
          }
        })
       }
    })
})

// The main landing with add option
app.get('/', isAuthenticated, (req, res)=>{
  const userId = req.user.userId;
  connection.query(`SELECT * FROM todo_app WHERE userId=${userId}`, (err,data)=>{
    if (err) {
      throw err;
    } else {
        res.render('main', {todoData: data});
      }
  })
})

// Posting from '/ to add a todo
app.post('/add', (req,res)=>{
  console.log(req.body);
  const name = req.body.name;
  const description = req.body.description;
  const userId = req.user.userId;
  var sql = `INSERT INTO todo_app (name, description, userId) VALUES ('${name}', '${description}', '${userId}')`;
  connection.query(sql,function (err, data) {
    if (err) console.log("not inserted");
    console.log("record inserted");
    console.log(req.user.userId);
    });
  res.redirect('/');
})

// The todo view page with update and delete option
// app.get('/main', (req, res)=>{
  
// })

// Todo update post on 'view page'
app.post('/update', (req,res)=>{
  const id = req.body.todoid;
  const name = req.body.name;
  const description = req.body.description;
  connection.query(`UPDATE todo_app SET name='${name}', description='${description}' WHERE id='${id}'`, (err, data)=>{
    if(err) {
      console.log("Could not update");
    } else {
      console.log("Record updated");
    }
  })
  res.redirect('/');
})

// Todo delete post on 'view page'
app.post('/delete', (req, res)=>{
  const todoid = req.body.todoid;
  connection.query(`DELETE FROM todo_app Where id='${todoid}'`, (err, data)=>{
    if(err) {
      console.log("Could not delete");
    } else {
      console.log("Entry deleted");
    }
  })
  res.redirect('/');
})

app.get('/logout', (req, res, next) => {
  req.logout();
  req.flash('success_msg', 'You are logged out');
  res.redirect('/login');
});

// Access Control
function isAuthenticated(req, res, next){
  if(req.isAuthenticated()){
    return next();
  } else {
    req.flash('error_msg', 'You are not logged in');
    res.redirect('/login');
  }
}

//
////// Starting server
//////////
app.listen(3838, ()=>{
  console.log("running on 3838");
})